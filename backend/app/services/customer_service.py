"""Customer CRUD, ledger, and due collection."""

from __future__ import annotations

from datetime import datetime, timezone

from app.models.base import parse_iso_dt

from fastapi import HTTPException
from sqlalchemy import or_
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.models.operations import Refund, SalesReturn
from app.models.product import Customer, CustomerBalance, CustomerLoyaltyLedger
from app.models.sales import Payment, SalesInvoice

# Store-policy keys (same mechanism as pos.cashier_max_discount_pct etc.)
LOYALTY_EARN_RATE_KEY = "pos.loyalty_earn_rate"  # points earned per 100 currency units spent
LOYALTY_POINT_VALUE_KEY = "pos.loyalty_point_value"  # currency value of 1 point when redeemed


def _get_customer(session: Session, company_id: str, customer_id: str) -> Customer:
    c = session.get(Customer, customer_id)
    if not c or c.company_id != company_id:
        raise HTTPException(status_code=404, detail="Customer not found")
    return c


def _validate_customer(session: Session, company_id: str, customer_id: str) -> Customer:
    c = _get_customer(session, company_id, customer_id)
    if not c.is_active:
        raise HTTPException(status_code=400, detail="Customer is inactive")
    return c


def _balance_row(session: Session, company_id: str, customer_id: str) -> CustomerBalance:
    bal = session.exec(
        select(CustomerBalance).where(
            CustomerBalance.company_id == company_id,
            CustomerBalance.customer_id == customer_id,
        )
    ).first()
    if not bal:
        bal = CustomerBalance(company_id=company_id, customer_id=customer_id, outstanding=0)
        session.add(bal)
        session.flush()
    return bal


def create_customer(session: Session, auth: AuthContext, body: dict) -> dict:
    code = (body.get("code") or "").strip()
    name = (body.get("name") or "").strip()
    if not code or not name:
        raise HTTPException(status_code=400, detail="Code and name are required")
    existing = session.exec(
        select(Customer).where(Customer.company_id == auth.company_id, Customer.code == code)
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Customer code already exists")
    phone = (body.get("phone") or "").strip() or None
    if phone:
        dup = session.exec(
            select(Customer).where(Customer.company_id == auth.company_id, Customer.phone == phone)
        ).first()
        if dup:
            raise HTTPException(status_code=409, detail="Mobile number already used by another customer")
    cust_type = (body.get("customer_type") or body.get("customer_group") or "general").strip().lower()
    custom_disc = body.get("custom_discount_pct")
    customer = Customer(
        company_id=auth.company_id,
        code=code,
        name=name,
        phone=phone,
        email=body.get("email"),
        credit_limit=body.get("credit_limit"),
        customer_group=body.get("customer_group") or cust_type,
        customer_type=cust_type,
        custom_discount_pct=float(custom_disc) if custom_disc is not None else None,
        preferred_size=(body.get("preferred_size") or "").strip() or None,
        is_active=True,
    )
    session.add(customer)
    session.flush()
    _balance_row(session, auth.company_id, customer.id)
    write_audit(session, auth, "customer_create", "customer", customer.id)
    session.flush()

    ref_code = body.get("referral_code")
    if ref_code:
        try:
            from app.integrations.referral import referral_service
            referral_service.attribute_customer(
                customer_id=customer.id,
                referral_code=ref_code,
                email=customer.email,
                phone=customer.phone,
            )
        except Exception:
            pass

    return customer_out(session, auth.company_id, customer)


def update_customer(session: Session, auth: AuthContext, customer_id: str, body: dict) -> dict:
    customer = _get_customer(session, auth.company_id, customer_id)
    if body.get("name") is not None:
        customer.name = body["name"]
    if body.get("phone") is not None:
        phone = (body["phone"] or "").strip() or None
        if phone:
            dup = session.exec(
                select(Customer).where(
                    Customer.company_id == auth.company_id,
                    Customer.phone == phone,
                    Customer.id != customer_id,
                )
            ).first()
            if dup:
                raise HTTPException(status_code=409, detail="Mobile number already used by another customer")
        customer.phone = phone
    if body.get("email") is not None:
        customer.email = body["email"]
    if body.get("credit_limit") is not None:
        customer.credit_limit = body["credit_limit"]
    if body.get("customer_type") is not None:
        customer.customer_type = (body["customer_type"] or "general").strip().lower()
    if body.get("customer_group") is not None:
        customer.customer_group = body["customer_group"] or customer.customer_type or None
    if "custom_discount_pct" in body:
        cd = body.get("custom_discount_pct")
        customer.custom_discount_pct = float(cd) if cd is not None and cd != "" else None
    if body.get("preferred_size") is not None:
        customer.preferred_size = (body["preferred_size"] or "").strip() or None
    if body.get("is_active") is not None:
        customer.is_active = bool(body["is_active"])
    session.add(customer)
    write_audit(session, auth, "customer_update", "customer", customer.id)
    session.flush()
    return customer_out(session, auth.company_id, customer)


def get_customer(session: Session, company_id: str, customer_id: str) -> dict:
    customer = _get_customer(session, company_id, customer_id)
    return customer_out(session, company_id, customer)


def customer_out(session: Session, company_id: str, customer: Customer) -> dict:
    bal = session.exec(
        select(CustomerBalance).where(
            CustomerBalance.company_id == company_id,
            CustomerBalance.customer_id == customer.id,
        )
    ).first()
    raw_bal = float(bal.outstanding) if bal and bal.outstanding else 0.0
    clean_outstanding = round(raw_bal) if raw_bal >= 1.0 else 0
    return {
        "id": customer.id,
        "code": customer.code,
        "name": customer.name,
        "phone": customer.phone,
        "email": customer.email,
        "credit_limit": customer.credit_limit,
        "customer_group": customer.customer_group,
        "customer_type": getattr(customer, "customer_type", None) or customer.customer_group or "general",
        "custom_discount_pct": getattr(customer, "custom_discount_pct", None),
        "preferred_size": customer.preferred_size,
        "loyalty_points": customer.loyalty_points,
        "is_active": customer.is_active,
        "outstanding": clean_outstanding,
    }


def list_customers(session: Session, company_id: str, q: str | None = None, customer_type: str | None = None) -> list[dict]:
    query = select(Customer).where(Customer.company_id == company_id)
    if customer_type:
        query = query.where(Customer.customer_type == customer_type.strip().lower())
    rows = session.exec(query).all()
    if q:
        ql = q.lower()
        rows = [
            c for c in rows
            if ql in c.name.lower() or ql in c.code.lower()
            or (c.phone and ql in c.phone)
            or (c.email and ql in c.email.lower())
            or (getattr(c, "customer_type", None) and ql in c.customer_type.lower())
        ]
    return [customer_out(session, company_id, c) for c in rows]


def get_customer_ledger(
    session: Session,
    company_id: str,
    customer_id: str,
    from_date: str | None = None,
    to_date: str | None = None,
) -> dict:
    _validate_customer(session, company_id, customer_id)
    entries: list[dict] = []

    invoices = session.exec(
        select(SalesInvoice).where(
            SalesInvoice.company_id == company_id,
            SalesInvoice.customer_id == customer_id,
            or_(SalesInvoice.status == "completed", SalesInvoice.status == "returned"),
        )
    ).all()
    for inv in invoices:
        entries.append({
            "at": inv.completed_at.isoformat() if inv.completed_at else inv.created_at.isoformat(),
            "type": "sale",
            "ref": inv.invoice_number,
            "debit": inv.total,
            "credit": inv.paid_amount or 0,
            "entity_id": inv.id,
        })

    payments = session.exec(
        select(Payment).where(
            Payment.company_id == company_id,
            Payment.customer_id == customer_id,
            Payment.payment_type == "collection",
        )
    ).all()
    for pay in payments:
        entries.append({
            "at": pay.created_at.isoformat() if pay.created_at else "",
            "type": "due_collection",
            "ref": pay.reference or pay.id[:8],
            "debit": 0.0,
            "credit": pay.amount,
            "entity_id": pay.id,
        })

    returns = session.exec(
        select(SalesReturn).where(SalesReturn.company_id == company_id)
    ).all()
    inv_ids = {i.id for i in invoices}
    for ret in returns:
        if ret.invoice_id not in inv_ids:
            continue
        entries.append({
            "at": ret.returned_at.isoformat() if ret.returned_at else ret.created_at.isoformat(),
            "type": "sales_return",
            "ref": ret.return_no,
            "debit": 0.0,
            "credit": ret.total_amount,
            "entity_id": ret.id,
        })

    refunds = session.exec(
        select(Refund).where(Refund.company_id == company_id)
    ).all()
    for ref in refunds:
        if ref.invoice_id not in inv_ids:
            continue
        entries.append({
            "at": ref.refunded_at.isoformat() if ref.refunded_at else ref.created_at.isoformat(),
            "type": "refund",
            "ref": ref.refund_no,
            "debit": 0.0,
            "credit": ref.amount,
            "entity_id": ref.id,
        })

    if from_date:
        start = parse_iso_dt(from_date)
        if start:
            entries = [
                e for e in entries
                if e["at"] and (parsed := parse_iso_dt(e["at"])) and parsed >= start
            ]
    if to_date:
        end = parse_iso_dt(to_date)
        if end:
            entries = [
                e for e in entries
                if e["at"] and (parsed := parse_iso_dt(e["at"])) and parsed <= end
            ]

    entries.sort(key=lambda e: e["at"] or "")
    running = 0.0
    ledger_rows = []
    for e in entries:
        running += e["debit"] - e["credit"]
        ledger_rows.append({**e, "balance": round(running, 2)})

    bal = _balance_row(session, company_id, customer_id)
    return {
        "customer_id": customer_id,
        "opening_balance": 0.0,
        "closing_balance": round(running, 2),
        "current_outstanding": bal.outstanding,
        "entries": ledger_rows,
    }


def collect_due(session: Session, auth: AuthContext, body: dict) -> dict:
    customer_id = body["customer_id"]
    amount = float(body["amount"])
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Collection amount must be greater than zero")
    customer = _validate_customer(session, auth.company_id, customer_id)
    bal = _balance_row(session, auth.company_id, customer_id)

    invoice_id = body.get("invoice_id")
    if invoice_id:
        inv = session.get(SalesInvoice, invoice_id)
        if not inv or inv.company_id != auth.company_id or inv.customer_id != customer_id:
            raise HTTPException(status_code=400, detail="Invalid invoice for customer")
        if amount > (inv.due_amount or 0) + 0.01:
            raise HTTPException(status_code=400, detail="Collection exceeds invoice due")
        inv.paid_amount = (inv.paid_amount or 0) + amount
        inv.due_amount = max(0, (inv.due_amount or 0) - amount)
        session.add(inv)
    elif amount > bal.outstanding + 0.01:
        raise HTTPException(status_code=400, detail="Collection exceeds customer outstanding")

    payment = Payment(
        company_id=auth.company_id,
        invoice_id=invoice_id,
        customer_id=customer_id,
        payment_type="collection",
        direction="in",
        store_id=body.get("store_id") or auth.store_id,
        cashier_id=auth.user_id,
        method=body.get("method", "cash"),
        amount=amount,
        reference=body.get("reference"),
        status="completed",
    )
    session.add(payment)
    bal.outstanding = max(0, bal.outstanding - amount)
    session.add(bal)
    write_audit(session, auth, "due_collection", "customer_payment", payment.id, {"amount": amount, "customer_id": customer_id})
    session.flush()

    from app.services.accounting_service import get_account_by_code, get_linked_account_id, post_journal_entry

    cash_account_id = get_linked_account_id(session, auth.company_id, payment.method)
    ar_account = get_account_by_code(session, auth.company_id, "1200")
    post_journal_entry(
        session,
        company_id=auth.company_id,
        created_by=auth.user_id,
        entry_date=datetime.now(timezone.utc),
        source_type="due_collection",
        source_id=payment.id,
        lines=[
            {"account_id": cash_account_id, "debit": amount, "store_id": payment.store_id},
            {"account_id": ar_account.id, "credit": amount, "store_id": payment.store_id},
        ],
        memo=f"Due collection: {customer.name}",
    )

    return {"id": payment.id, "amount": amount, "outstanding": bal.outstanding, "customer_name": customer.name}


def _loyalty_earn_rate(session: Session, company_id: str, store_id: str | None) -> float:
    from app.services.sales_policy_service import _get_store_policy

    return float(_get_store_policy(session, company_id, store_id, LOYALTY_EARN_RATE_KEY, "1"))


def _loyalty_point_value(session: Session, company_id: str, store_id: str | None) -> float:
    from app.services.sales_policy_service import _get_store_policy

    return float(_get_store_policy(session, company_id, store_id, LOYALTY_POINT_VALUE_KEY, "1"))


def get_loyalty_summary(session: Session, company_id: str, store_id: str | None, customer_id: str) -> dict:
    customer = _get_customer(session, company_id, customer_id)
    return {
        "customer_id": customer.id,
        "points_balance": customer.loyalty_points or 0,
        "point_value": _loyalty_point_value(session, company_id, store_id),
        "earn_rate": _loyalty_earn_rate(session, company_id, store_id),
    }


def loyalty_redeem_preview(
    session: Session, company_id: str, store_id: str | None, customer_id: str, points: float
) -> dict:
    customer = _get_customer(session, company_id, customer_id)
    if points <= 0:
        raise HTTPException(status_code=400, detail="points must be greater than zero")
    if points > (customer.loyalty_points or 0) + 1e-6:
        raise HTTPException(status_code=400, detail="Insufficient loyalty points")
    value = _loyalty_point_value(session, company_id, store_id)
    return {"points": points, "discount_amount": round(points * value, 2)}


def earn_loyalty_points(
    session: Session,
    auth: AuthContext,
    store_id: str | None,
    customer_id: str,
    sale_total: float,
    invoice_id: str,
) -> float:
    """Award points for a completed sale. Silently no-ops for an unknown/foreign
    customer id rather than failing the sale — earning is a bonus, not a gate."""
    customer = session.get(Customer, customer_id)
    if not customer or customer.company_id != auth.company_id or sale_total <= 0:
        return 0.0
    rate = _loyalty_earn_rate(session, auth.company_id, store_id)
    points = round((sale_total / 100.0) * rate, 2)
    if points <= 0:
        return 0.0
    customer.loyalty_points = round((customer.loyalty_points or 0) + points, 2)
    session.add(customer)
    session.add(
        CustomerLoyaltyLedger(
            company_id=auth.company_id,
            customer_id=customer_id,
            delta=points,
            reason="earn_sale",
            reference_type="sales_invoice",
            reference_id=invoice_id,
            created_by=auth.user_id,
        )
    )
    return points


def redeem_loyalty_points(
    session: Session,
    auth: AuthContext,
    store_id: str | None,
    customer_id: str,
    points: float,
    invoice_id: str,
) -> float:
    """Deduct points at sale-completion time (re-validating the balance here —
    not just trusting the earlier client-side preview — prevents double-spend
    across two sales redeeming the same points before either commits)."""
    customer = _get_customer(session, auth.company_id, customer_id)
    if points <= 0:
        raise HTTPException(status_code=400, detail="loyalty_redeem_points must be greater than zero")
    if points > (customer.loyalty_points or 0) + 1e-6:
        raise HTTPException(status_code=400, detail="Insufficient loyalty points")
    value = _loyalty_point_value(session, auth.company_id, store_id)
    customer.loyalty_points = round((customer.loyalty_points or 0) - points, 2)
    session.add(customer)
    session.add(
        CustomerLoyaltyLedger(
            company_id=auth.company_id,
            customer_id=customer_id,
            delta=-points,
            reason="redeem",
            reference_type="sales_invoice",
            reference_id=invoice_id,
            created_by=auth.user_id,
        )
    )
    return round(points * value, 2)

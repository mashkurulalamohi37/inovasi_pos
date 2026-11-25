"""Canonical inventory movement types."""

from __future__ import annotations

# Receipt / issue
OPENING = "opening"
PURCHASE_RECEIVE = "purchase_receive"
PURCHASE_RETURN = "purchase_return"
SALE = "sale"
SALES_RETURN = "sales_return"
TRANSFER_IN = "transfer_in"
TRANSFER_OUT = "transfer_out"
ADJUSTMENT_PLUS = "adjustment_plus"
ADJUSTMENT_MINUS = "adjustment_minus"
PRODUCTION_ISSUE = "production_issue"
PRODUCTION_RECEIPT = "production_receipt"
STOCK_COUNT_VARIANCE = "stock_count_variance"
DAMAGE = "damage"
EXPIRY_WRITEOFF = "expiry_writeoff"
MANUAL_CORRECTION = "manual_correction"
RESERVATION_HOLD = "reservation_hold"
RESERVATION_RELEASE = "reservation_release"
# Cosmetics: sellable → tester (outbound); dispose tester stock (outbound)
SELLABLE_TO_TESTER = "sellable_to_tester"
TESTER_DISPOSE = "tester_dispose"

ALL_MOVEMENT_TYPES = frozenset({
    OPENING,
    PURCHASE_RECEIVE,
    PURCHASE_RETURN,
    SALE,
    SALES_RETURN,
    TRANSFER_IN,
    TRANSFER_OUT,
    ADJUSTMENT_PLUS,
    ADJUSTMENT_MINUS,
    PRODUCTION_ISSUE,
    PRODUCTION_RECEIPT,
    STOCK_COUNT_VARIANCE,
    DAMAGE,
    EXPIRY_WRITEOFF,
    MANUAL_CORRECTION,
    RESERVATION_HOLD,
    RESERVATION_RELEASE,
    SELLABLE_TO_TESTER,
    TESTER_DISPOSE,
    # legacy aliases still accepted on read
    "adjustment",
    "transfer",
    "grn",
})

_LEGACY_ALIASES: dict[str, str] = {
    "adjustment": ADJUSTMENT_PLUS,
    "transfer": TRANSFER_OUT,
    "grn": PURCHASE_RECEIVE,
}


def normalize_movement_type(value: str | None) -> str | None:
    if not value:
        return None
    key = value.strip().lower()
    return _LEGACY_ALIASES.get(key, key)


def is_inbound(movement_type: str) -> bool:
    return movement_type in {
        OPENING,
        PURCHASE_RECEIVE,
        SALES_RETURN,
        TRANSFER_IN,
        ADJUSTMENT_PLUS,
        PRODUCTION_RECEIPT,
        RESERVATION_RELEASE,
    }

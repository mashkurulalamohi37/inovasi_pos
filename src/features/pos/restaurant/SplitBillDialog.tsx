import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Check,
  CreditCard,
  Download,
  Minus,
  Plus,
  Printer,
  Smartphone,
  Split,
  User,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomerPicker, type CustomerSelection } from "@/features/sales/CustomerPicker";
import { useReceiptBrand } from "@/hooks/use-receipt-brand";
import { ThermalReceipt, buildReceiptPdf, tryPrint, type ReceiptData } from "@/lib/receipt";
import { fmtBDT } from "@/lib/pos-data";
import { cn } from "@/lib/utils";
import type { CartLine } from "@/lib/app-store";
import { round2, splitBillEqually } from "../restaurant-billing";
import type { RestaurantBill } from "../restaurant-billing";

export type SplitMethod = "Cash" | "Card" | "Mobile";

export type SplitPayment = { method: string; amount: number; reference?: string };

type SplitPart = {
  id: string;
  label: string;
  amount: number;
  method: SplitMethod;
  /** Card approval code / mobile txn id. Optional, printed on the guest slip. */
  reference: string;
  /** Cash handed over, used only to quote change back. Never sent to the server. */
  received: string;
  paid: boolean;
};

const METHODS: Array<{ id: SplitMethod; icon: typeof Banknote }> = [
  { id: "Cash", icon: Banknote },
  { id: "Card", icon: CreditCard },
  { id: "Mobile", icon: Smartphone },
];

const SLIP_ID = "pulse-split-slips";
const RECEIPT_ID = "pulse-split-receipt";

function buildParts(total: number, n: number, prev: SplitPart[] = []): SplitPart[] {
  const amounts = splitBillEqually(total, n);
  return amounts.map((amount, i) => ({
    id: prev[i]?.id ?? `guest-${i + 1}-${Math.random().toString(36).slice(2, 8)}`,
    label: prev[i]?.label ?? `Guest ${i + 1}`,
    amount,
    method: prev[i]?.method ?? "Cash",
    reference: "",
    received: "",
    paid: false,
  }));
}

/**
 * Split bill: collect each guest's share, then settle and print.
 *
 * The old dialog asked for a guest count and immediately posted the whole bill as
 * N identical cash payments — no customer, no tender choice, no record of who had
 * actually handed money over. Settlement is irreversible, so the cashier now
 * collects share by share and the Confirm button stays disabled until the
 * collected amounts add up to the bill.
 */
export function SplitBillDialog({
  open,
  onOpenChange,
  orderLabel,
  bill,
  guestCount = 2,
  lines,
  receiptNote,
  onSettle,
  isSettling = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Order number or table label, shown in the header and on the guest slips. */
  orderLabel: string;
  bill: RestaurantBill;
  guestCount?: number;
  /** Cart lines as billed, snapshotted for the receipt before the cart is cleared. */
  lines: CartLine[];
  receiptNote?: string;
  onSettle: (args: {
    tender: string;
    payments: SplitPayment[];
    customer?: CustomerSelection;
  }) => Promise<{ id: string } | null>;
  isSettling?: boolean;
}) {
  const brand = useReceiptBrand("restaurant");
  const [parts, setParts] = useState<SplitPart[]>(() => buildParts(bill.total, 2));
  const [customer, setCustomer] = useState<CustomerSelection | undefined>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settled, setSettled] = useState<null | {
    id: string;
    ts: number;
    lines: CartLine[];
    bill: RestaurantBill;
    parts: SplitPart[];
    customer?: string;
  }>(null);

  const initialGuests = Math.min(12, Math.max(2, Math.round(guestCount) || 2));

  // Reopening starts a fresh split — carrying the previous bill's shares over
  // would let a stale "paid" tick settle an order nobody has paid for.
  useEffect(() => {
    if (!open) return;
    setParts(buildParts(bill.total, initialGuests));
    setCustomer(undefined);
    setSettled(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const collected = round2(parts.filter((p) => p.paid).reduce((s, p) => s + p.amount, 0));
  const assigned = round2(parts.reduce((s, p) => s + p.amount, 0));
  const outstanding = round2(bill.total - collected);
  const unassigned = round2(bill.total - assigned);
  const balanced = Math.abs(unassigned) <= 0.01;
  // A guest whose share was edited down to zero owes nothing: they neither block
  // the settlement nor get a zero-value payment row posted against the invoice.
  const payable = parts.filter((p) => p.amount > 0);
  const allPaid = payable.length > 0 && payable.every((p) => p.paid);

  // The order can still change under the dialog (a runner fires another dish).
  // Re-splitting is safe while nothing has been collected; once a guest has paid,
  // their share is fixed and the cashier is told to rebuild the split instead.
  useEffect(() => {
    if (!open || settled || parts.some((p) => p.paid)) return;
    setParts((prev) =>
      Math.abs(round2(prev.reduce((s, p) => s + p.amount, 0)) - bill.total) <= 0.01
        ? prev
        : buildParts(bill.total, prev.length),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill.total, open]);

  const patchPart = (id: string, patch: Partial<SplitPart>) =>
    setParts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const setGuestCount = (n: number) => {
    const next = Math.min(12, Math.max(2, n));
    if (next === parts.length) return;
    if (parts.some((p) => p.paid)) {
      toast.error("A guest has already paid", {
        description: "Undo the collected shares before changing the guest count.",
      });
      return;
    }
    setParts((prev) => buildParts(bill.total, next, prev));
  };

  /** Push whatever is still unassigned onto one guest, so custom edits can close. */
  const absorbRemainder = (id: string) => {
    setParts((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, amount: round2(Math.max(0, p.amount + unassigned)) } : p,
      ),
    );
  };

  const tenderSummary = useMemo(() => {
    const used = Array.from(new Set(payable.map((p) => p.method)));
    return used.length === 1 ? used[0] : "Split";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts]);

  const handleConfirm = async () => {
    if (!allPaid || !balanced || isSettling) return;
    // Snapshot before settling: the parent clears the cart on success, and the
    // receipt has to keep showing what the guests actually ate.
    const snapshot = {
      lines: lines.map((l) => ({ ...l })),
      bill: { ...bill },
      parts: payable.map((p) => ({ ...p })),
      customer: customer?.name,
    };
    const result = await onSettle({
      tender: tenderSummary.toLowerCase(),
      payments: payable.map((p) => ({
        method: p.method.toLowerCase(),
        amount: p.amount,
        ...(p.reference.trim() ? { reference: p.reference.trim() } : {}),
      })),
      customer,
    });
    // The parent has already surfaced the API error; keep the collected shares on
    // screen so the cashier can retry rather than re-enter everything.
    if (!result) return;
    setSettled({ id: result.id, ts: Date.now(), ...snapshot });
  };

  const receiptData: ReceiptData | null = settled
    ? {
        id: settled.id,
        ts: settled.ts,
        tender:
          settled.parts.length > 1
            ? `Split · ${settled.parts.length} guests`
            : settled.parts[0].method,
        total: settled.bill.total,
        subtotal: settled.bill.subtotal,
        discount: settled.bill.discount,
        tax: round2(settled.bill.tax + settled.bill.serviceCharge),
        lines: settled.lines,
        customer: settled.customer,
        note: [
          receiptNote,
          `Split ${settled.parts.length} ways`,
          ...settled.parts.map((p) => `${p.label} ${p.method} ${fmtBDT(p.amount)}`),
        ]
          .filter(Boolean)
          .join(" · "),
      }
    : null;

  return (
    <>
      {/* Hidden while the customer picker is up — stacked modals trap focus in the
          dialog underneath, which is why PosShell does the same swap. */}
      <Dialog open={open && !pickerOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[92dvh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Split className="h-4 w-4 text-primary" />
              {settled ? `Split settled · ${settled.id}` : `Split bill · ${orderLabel}`}
            </DialogTitle>
          </DialogHeader>

          {settled && receiptData ? (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto px-1 py-3">
                <ThermalReceipt brand={brand} idAttr={RECEIPT_ID} data={receiptData} />
                <div id={SLIP_ID} className="hidden">
                  {settled.parts.map((p, i) => (
                    // No break after the last slip, or the printer spits a blank.
                    <div
                      key={p.id}
                      style={{
                        pageBreakAfter: i === settled.parts.length - 1 ? "auto" : "always",
                      }}
                    >
                      <div className="title">{brand.brandName}</div>
                      <div className="text-center">GUEST SHARE SLIP</div>
                      <div className="hr" />
                      <div className="row">
                        <span>Invoice</span>
                        <span>{settled.id}</span>
                      </div>
                      <div className="row">
                        <span>Order</span>
                        <span>{orderLabel}</span>
                      </div>
                      <div className="row">
                        <span>Guest</span>
                        <span>
                          {p.label} ({i + 1} of {settled.parts.length})
                        </span>
                      </div>
                      <div className="row">
                        <span>Date</span>
                        <span>{new Date(settled.ts).toLocaleString()}</span>
                      </div>
                      <div className="hr" />
                      <div className="row">
                        <span>Method</span>
                        <span>{p.method}</span>
                      </div>
                      {p.reference.trim() && (
                        <div className="row">
                          <span>Ref</span>
                          <span>{p.reference.trim()}</span>
                        </div>
                      )}
                      <div className="row total">
                        <span>Share paid</span>
                        <span>{fmtBDT(p.amount)}</span>
                      </div>
                      <div className="hr" />
                      <div className="text-center">Bill total {fmtBDT(settled.bill.total)}</div>
                      {settled.customer && <div className="text-center">{settled.customer}</div>}
                      <div className="text-center">Thank you</div>
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter className="px-5 py-3 border-t shrink-0 bg-background gap-2">
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    buildReceiptPdf(brand, receiptData).save(`${settled.id}.pdf`);
                    toast.success("PDF downloaded");
                  }}
                >
                  <Download className="h-4 w-4" /> PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    const ok = tryPrint(brand, SLIP_ID, `${settled.id} guest slips`);
                    if (ok) toast.success(`${settled.parts.length} guest slips sent`);
                    else
                      toast.error("Print blocked", {
                        description: "Allow pop-ups to print slips.",
                      });
                  }}
                >
                  <Printer className="h-4 w-4" /> Guest slips
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    const ok = tryPrint(brand, RECEIPT_ID, settled.id);
                    if (ok) toast.success("Print sent");
                    else
                      toast.error("Print blocked", {
                        description: "Allow pop-ups to print the bill.",
                      });
                  }}
                >
                  <Printer className="h-4 w-4" /> Print bill
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-xs font-semibold hover:bg-secondary cursor-pointer"
                    title="Attach a customer to this bill"
                  >
                    <User className="h-3.5 w-3.5 text-primary" />
                    <span>{customer?.name || "Walk-in guest"}</span>
                    {customer?.phone && (
                      <span className="text-muted-foreground font-normal">({customer.phone})</span>
                    )}
                  </button>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Guests</Label>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setGuestCount(parts.length - 1)}
                        disabled={parts.length <= 2}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-6 text-center text-sm font-bold tabular-nums">
                        {parts.length}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setGuestCount(parts.length + 1)}
                        disabled={parts.length >= 12}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setParts(buildParts(bill.total, parts.length, parts))}
                      disabled={parts.some((p) => p.paid)}
                      title="Reset every share to an equal split of the bill"
                    >
                      Split equally
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-border bg-card p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Bill total
                    </div>
                    <div className="text-sm font-bold tabular-nums">{fmtBDT(bill.total)}</div>
                  </div>
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                      Collected
                    </div>
                    <div className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {fmtBDT(collected)}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "rounded-lg border p-2",
                      outstanding > 0.01
                        ? "border-amber-500/40 bg-amber-500/5"
                        : "border-border bg-card",
                    )}
                  >
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Outstanding
                    </div>
                    <div className="text-sm font-bold tabular-nums">
                      {fmtBDT(Math.max(0, outstanding))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {parts.map((p, i) => (
                    <div
                      key={p.id}
                      className={cn(
                        "rounded-lg border p-2.5 space-y-2",
                        p.paid ? "border-emerald-500/50 bg-emerald-500/5" : "border-border bg-card",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] font-bold shrink-0">
                          {i + 1}
                        </Badge>
                        <Input
                          className="h-8 flex-1 min-w-0 text-xs"
                          value={p.label}
                          disabled={p.paid}
                          onChange={(e) => patchPart(p.id, { label: e.target.value })}
                          placeholder={`Guest ${i + 1}`}
                        />
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="h-8 w-24 text-xs text-right tabular-nums"
                          value={String(p.amount)}
                          disabled={p.paid}
                          onChange={(e) =>
                            patchPart(p.id, { amount: round2(Number(e.target.value) || 0) })
                          }
                        />
                        {p.paid ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 text-xs shrink-0"
                            onClick={() => patchPart(p.id, { paid: false })}
                            title="Undo this collection"
                          >
                            <Undo2 className="h-3.5 w-3.5" /> Undo
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="h-8 gap-1 text-xs shrink-0"
                            disabled={p.amount <= 0}
                            onClick={() => patchPart(p.id, { paid: true })}
                            title="Mark this share as collected"
                          >
                            <Check className="h-3.5 w-3.5" /> Collect
                          </Button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex gap-1">
                          {METHODS.map(({ id, icon: Icon }) => (
                            <Button
                              key={id}
                              variant={p.method === id ? "default" : "outline"}
                              size="sm"
                              className="h-7 gap-1 text-[11px] px-2"
                              disabled={p.paid}
                              onClick={() =>
                                patchPart(p.id, { method: id, reference: "", received: "" })
                              }
                            >
                              <Icon className="h-3 w-3" /> {id}
                            </Button>
                          ))}
                        </div>
                        {p.method === "Cash" ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              min={0}
                              className="h-7 w-24 text-[11px]"
                              placeholder="Received"
                              value={p.received}
                              disabled={p.paid}
                              onChange={(e) => patchPart(p.id, { received: e.target.value })}
                            />
                            {Number(p.received) > p.amount && (
                              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                Change {fmtBDT(round2(Number(p.received) - p.amount))}
                              </span>
                            )}
                          </div>
                        ) : (
                          <Input
                            className="h-7 w-44 text-[11px]"
                            placeholder={
                              p.method === "Card" ? "Approval code (optional)" : "Txn ID (optional)"
                            }
                            value={p.reference}
                            disabled={p.paid}
                            onChange={(e) => patchPart(p.id, { reference: e.target.value })}
                          />
                        )}
                        {!p.paid && !balanced && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[11px] text-primary"
                            onClick={() => absorbRemainder(p.id)}
                            title="Add the unassigned remainder to this share"
                          >
                            {unassigned > 0
                              ? `+ ${fmtBDT(unassigned)}`
                              : `− ${fmtBDT(Math.abs(unassigned))}`}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {!balanced && (
                  <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                    Shares add up to {fmtBDT(assigned)}, but the bill is {fmtBDT(bill.total)}.
                    Adjust a share by {fmtBDT(Math.abs(unassigned))} before settling — the server
                    rejects a payment total that does not match the bill.
                  </p>
                )}
              </div>

              <DialogFooter className="px-5 py-3 border-t shrink-0 bg-background gap-2">
                <div className="mr-auto text-xs text-muted-foreground">
                  {allPaid && balanced
                    ? "All shares collected — settle to close the table."
                    : `${payable.filter((p) => p.paid).length} of ${payable.length} shares collected`}
                </div>
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!allPaid || !balanced || isSettling}
                  onClick={() => void handleConfirm()}
                >
                  {isSettling ? "Settling…" : `Confirm split & pay ${fmtBDT(bill.total)}`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <CustomerPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        value={customer}
        onSelect={(c) => {
          setCustomer(c);
          setPickerOpen(false);
        }}
      />
    </>
  );
}

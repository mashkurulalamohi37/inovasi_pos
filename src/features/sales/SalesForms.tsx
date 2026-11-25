import { useEffect, useState } from "react";
import { toast } from "sonner";
import { shouldUseBackend } from "@/lib/demo-mode";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useSalesReturn,
  useSalesRefund,
  useSalesExchange,
  useDueCollection,
  useCreateCustomer,
  useApiProducts,
  type ApiSale,
} from "@/hooks/use-api-config";
import { useFashionVariants } from "@/hooks/use-industry-data";
import {
  returnableQty,
  validateReturnQty,
  validateRefundAmount,
  validateCollectionAmount,
  maxRefundable,
} from "@/features/sales/utils";
import { Printer } from "lucide-react";
import { fmtBDT } from "@/lib/pos-data";
import { printReturnExchangeSlip } from "@/lib/receipt";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function SalesReturnForm({
  open,
  onOpenChange,
  sale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: ApiSale;
}) {
  const ret = useSalesReturn();
  const [reason, setReason] = useState("");
  const [condition, setCondition] = useState("saleable");
  const [refundMethod, setRefundMethod] = useState<"cash" | "card" | "store_credit">("cash");
  const [restockingMode, setRestockingMode] = useState<"pct" | "fixed">("pct");
  const [restockingValue, setRestockingValue] = useState("0");
  const [managerPin, setManagerPin] = useState("");
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isFashion = sale.industry_pack === "fashion";

  const rawReturnTotal = sale.lines.reduce((acc, l) => acc + (Number(qtys[l.id] || 0) * l.unit_price), 0);
  const numRestockingVal = Math.max(0, Number(restockingValue) || 0);
  const restockingFeeAmt = restockingMode === "pct"
    ? Math.round(rawReturnTotal * (numRestockingVal / 100))
    : Math.min(rawReturnTotal, Math.round(numRestockingVal));
  const effectiveRestockingPct = rawReturnTotal > 0 ? (restockingFeeAmt / rawReturnTotal) * 100 : 0;
  const netRefundTotal = Math.max(0, rawReturnTotal - restockingFeeAmt);
  const requireManagerPin = rawReturnTotal > 5000 || condition === "damaged" || condition === "defective";

  useEffect(() => {
    if (!open) return;
    const init: Record<string, string> = {};
    sale.lines.forEach((l) => {
      const bal = returnableQty(l);
      if (bal > 0) init[l.id] = "1";
    });
    setQtys(init);
    setReason("");
    setCondition("saleable");
    setRefundMethod("cash");
    setRestockingMode("pct");
    setRestockingValue("0");
    setManagerPin("");
    setErrors({});
  }, [open, sale]);

  const handleSubmit = async () => {
    const next: Record<string, string> = {};
    const lines = sale.lines
      .map((l) => {
        const bal = returnableQty(l);
        const qty = Number(qtys[l.id] ?? 0);
        if (qty <= 0) return null;
        const err = validateReturnQty(qty, bal);
        if (err) next[l.id] = err;
        const meta = (l.meta ?? {}) as Record<string, unknown>;
        return {
          invoice_line_id: l.id,
          qty,
          ...(meta.variant_id ? { meta: { variant_id: meta.variant_id } } : {}),
        };
      })
      .filter(Boolean) as Array<{ invoice_line_id: string; qty: number; meta?: { variant_id: unknown } }>;
    if (lines.length === 0) next.form = "Enter return quantity for at least one line";
    if (requireManagerPin && !managerPin.trim()) {
      next.managerPin = "Manager PIN authorization required for this return";
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    if (!shouldUseBackend()) {
      const voucherMsg = refundMethod === "store_credit" ? " (Store Credit Voucher: VOUCHER-" + Math.random().toString(36).slice(-6).toUpperCase() + ")" : "";
      toast.success(`Return processed (Demo mode) - Refund Net: ${fmtBDT(netRefundTotal)}${voucherMsg}`);
      printReturnExchangeSlip({
        type: "return",
        invoiceNumber: sale.invoice_number,
        customerName: sale.customer_name ?? undefined,
        reason: reason.trim() || undefined,
        itemsReturned: lines.map((l) => {
          const invLine = sale.lines.find((sl) => sl.id === l.invoice_line_id);
          return { name: invLine?.name ?? "Item", qty: l.qty, unitPrice: invLine?.unit_price ?? 0 };
        }),
        restockingFee: restockingFeeAmt,
        netAmount: netRefundTotal,
        refundMethod,
      });
      onOpenChange(false);
      return;
    }
    await ret.mutateAsync({
      invoiceId: sale.id,
      body: {
        reason: reason.trim() || "Customer Return",
        condition: isFashion ? condition : undefined,
        refund_method: refundMethod,
        restocking_fee_pct: effectiveRestockingPct,
        restocking_fee_amount: restockingFeeAmt,
        lines,
      },
    });
    if (refundMethod === "store_credit") {
      toast.success(`Return posted — Store Credit Voucher code issued for ${fmtBDT(netRefundTotal)}`);
    } else {
      toast.success(`Return posted — Net refund: ${fmtBDT(netRefundTotal)}`);
    }
    printReturnExchangeSlip({
      type: "return",
      invoiceNumber: sale.invoice_number,
      customerName: sale.customer_name ?? undefined,
      reason: reason.trim() || undefined,
      itemsReturned: lines.map((l) => {
        const invLine = sale.lines.find((sl) => sl.id === l.invoice_line_id);
        return { name: invLine?.name ?? "Item", qty: l.qty, unitPrice: invLine?.unit_price ?? 0 };
      }),
      restockingFee: restockingFeeAmt,
      netAmount: netRefundTotal,
      refundMethod,
    });
    onOpenChange(false);
  };

  return (
    <EntityFormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={`Sales Return — ${sale.invoice_number}`}
      onSubmit={handleSubmit}
      submitLabel="Post Return"
      isPending={ret.isPending}
      errorMessage={ret.error instanceof Error ? ret.error.message : null}
      className="sm:max-w-lg"
    >
      <FieldError message={errors.form} />
      
      {/* Refund Method & Restocking Fee Header Card */}
      <div className="rounded-xl bg-secondary/30 p-4 border border-border/60 space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-semibold text-foreground/80">Refund Tender Method</Label>
            <select
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-medium shadow-sm transition-all focus:border-primary focus:ring-1 focus:ring-primary"
              value={refundMethod}
              onChange={(e) => setRefundMethod(e.target.value as any)}
            >
              <option value="cash">💵 Cash Refund</option>
              <option value="card">💳 Card Refund</option>
              <option value="store_credit">🎟️ Store Credit Voucher</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground/80">Restocking Fee</Label>
              {/* Unit Mode Toggle - Touch Friendly Sizing */}
              <div className="flex rounded-lg bg-background border border-border/80 p-0.5 text-xs shadow-2xs">
                <button
                  type="button"
                  onClick={() => { setRestockingMode("pct"); setRestockingValue("0"); }}
                  className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition-all ${restockingMode === "pct" ? "bg-primary text-primary-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"}`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => { setRestockingMode("fixed"); setRestockingValue("0"); }}
                  className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition-all ${restockingMode === "fixed" ? "bg-primary text-primary-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"}`}
                >
                  ৳
                </button>
              </div>
            </div>

            {/* Input & Inline Quick Presets */}
            <div className="mt-1.5 flex items-center gap-2">
              <div className="relative flex-1 min-w-[75px]">
                <Input
                  type="number"
                  min={0}
                  max={restockingMode === "pct" ? 100 : rawReturnTotal}
                  step={restockingMode === "pct" ? "0.5" : "1"}
                  value={restockingValue}
                  onChange={(e) => setRestockingValue(e.target.value)}
                  placeholder="0"
                  className="h-9 text-xs font-mono font-bold pl-3 pr-7 bg-background rounded-lg border-input shadow-2xs"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground pointer-events-none">
                  {restockingMode === "pct" ? "%" : "৳"}
                </span>
              </div>

              {/* Inline Quick Presets - Comfortable Touch Targets */}
              <div className="flex items-center gap-1.5 shrink-0">
                {restockingMode === "pct" ? (
                  [0, 5, 10, 15].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRestockingValue(String(preset))}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        Number(restockingValue) === preset
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-background border-border/80 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      {preset}%
                    </button>
                  ))
                ) : (
                  [0, 50, 100, 200].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRestockingValue(String(preset))}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        Number(restockingValue) === preset
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-background border-border/80 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      ৳{preset}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <Label className="text-xs font-semibold text-foreground/80">Return Reason (Optional)</Label>
        <Input
          placeholder="e.g. Customer change of mind / size mismatch / defective (Optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 h-9 text-xs rounded-lg bg-background"
        />
      </div>

      {isFashion && (
        <div>
          <Label className="text-xs font-semibold text-foreground/80">Item Restock Condition</Label>
          <select
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-medium"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
          >
            <option value="saleable">Saleable (restock to inventory balance)</option>
            <option value="damaged">Damaged (write off / no restock)</option>
            <option value="defective">Defective (RMA / no restock)</option>
          </select>
        </div>
      )}

      {/* Return Summary Card */}
      {rawReturnTotal > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-1.5 text-xs shadow-2xs">
          <div className="flex justify-between text-muted-foreground">
            <span>Return Subtotal:</span>
            <span className="font-mono font-medium">{fmtBDT(rawReturnTotal)}</span>
          </div>
          {restockingFeeAmt > 0 && (
            <div className="flex justify-between text-warning font-semibold">
              <span>Restocking Fee Deduction ({restockingMode === "pct" ? `${numRestockingVal}%` : fmtBDT(restockingFeeAmt)}):</span>
              <span className="font-mono">-{fmtBDT(restockingFeeAmt)}</span>
            </div>
          )}
          <div className="flex justify-between items-center font-bold text-foreground text-sm pt-2 border-t border-primary/15">
            <span>Net Refund Payable:</span>
            <span className="font-mono text-base text-primary">{fmtBDT(netRefundTotal)}</span>
          </div>
        </div>
      )}

      {requireManagerPin && (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-3.5 space-y-2">
          <Label className="text-xs font-semibold text-warning">Manager Authorization PIN Required</Label>
          <Input
            type="password"
            placeholder="Enter Manager PIN to authorize"
            value={managerPin}
            onChange={(e) => setManagerPin(e.target.value)}
            className="bg-background h-9 text-xs"
          />
          <FieldError message={errors.managerPin} />
        </div>
      )}

      {/* Line Item Return Cards */}
      <div className="space-y-2.5">
        <Label className="text-xs font-semibold text-foreground/80">Purchased Invoice Items</Label>
        {sale.lines.map((l) => {
          const bal = returnableQty(l);
          const currentQty = Number(qtys[l.id] ?? (bal > 0 ? 1 : 0));
          const lineTotal = currentQty * l.unit_price;
          const meta = (l.meta ?? {}) as Record<string, unknown>;
          const batchLabel = meta.batch ?? meta.batch_id;
          const isFullyReturned = bal <= 0;

          const setVal = (n: number) => {
            const clamped = Math.max(0, Math.min(bal, n));
            setQtys((p) => ({ ...p, [l.id]: String(clamped) }));
          };

          return (
            <div key={l.id} className={`rounded-xl border p-3.5 space-y-3 transition-all hover:border-border shadow-2xs ${isFullyReturned ? "bg-muted/40 border-border/40 opacity-75" : "border-border/70 bg-background/80"}`}>
              <div className="flex justify-between items-start gap-2">
                <div className="space-y-0.5">
                  <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                    {l.name}
                    {isFullyReturned && (
                      <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">Already Returned</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Unit Price: <strong className="font-mono text-foreground">{fmtBDT(l.unit_price)}</strong></span>
                    <span>·</span>
                    <span>Max Returnable: <strong className="text-foreground">{bal}</strong></span>
                    {sale.industry_pack === "pharmacy" && batchLabel ? (
                      <span>· Batch: {String(batchLabel)}</span>
                    ) : null}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-mono font-bold text-primary">{fmtBDT(lineTotal)}</div>
                  <div className="text-[10px] text-muted-foreground">Return Value</div>
                </div>
              </div>

              {/* Stepper controls */}
              {!isFullyReturned && (
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/40">
                  <span className="text-xs font-medium text-muted-foreground">Return Qty:</span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setVal(currentQty - 1)}
                      disabled={currentQty <= 0}
                      className="h-8 w-8 rounded-lg border border-border bg-secondary/50 font-bold text-sm flex items-center justify-center transition-all cursor-pointer hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      -
                    </button>

                    <Input
                      type="number"
                      min={0}
                      max={bal}
                      value={qtys[l.id] ?? "1"}
                      onChange={(e) => setQtys((p) => ({ ...p, [l.id]: e.target.value }))}
                      className="h-8 w-16 text-center text-xs font-mono font-bold bg-background rounded-lg border-input"
                    />

                    <button
                      type="button"
                      onClick={() => setVal(currentQty + 1)}
                      disabled={currentQty >= bal}
                      className="h-8 w-8 rounded-lg border border-border bg-secondary/50 font-bold text-sm flex items-center justify-center transition-all cursor-pointer hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      +
                    </button>

                    <button
                      type="button"
                      onClick={() => setVal(bal)}
                      className="h-8 px-2.5 rounded-lg border border-border/80 bg-background text-[11px] font-semibold text-muted-foreground transition-all cursor-pointer hover:border-primary hover:text-primary"
                    >
                      Max ({bal})
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Return Financial Summary & Print Receipt Slip Card */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-foreground/90 uppercase tracking-wider">Return Financial Summary</div>
          <button
            type="button"
            onClick={() => {
              const return_lines = sale.lines
                .map((l) => {
                  const qty = Number(qtys[l.id] ?? 0);
                  if (qty <= 0) return null;
                  return { name: l.name, qty, unitPrice: l.unit_price };
                })
                .filter(Boolean) as Array<{ name: string; qty: number; unitPrice: number }>;

              printReturnExchangeSlip({
                type: "return",
                invoiceNumber: sale.invoice_number,
                customerName: sale.customer_name ?? undefined,
                reason: reason.trim() || undefined,
                itemsReturned: return_lines.length > 0 ? return_lines : sale.lines.map((l) => ({ name: l.name, qty: 1, unitPrice: l.unit_price })),
                restockingFee: restockingFeeAmt,
                netAmount: netRefundTotal,
                refundMethod,
              });
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-primary/40 bg-background text-xs font-bold text-primary transition-all hover:bg-primary hover:text-primary-foreground cursor-pointer shadow-2xs"
          >
            <Printer className="h-3.5 w-3.5" /> Print Slip
          </button>
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between text-muted-foreground">
            <span>Gross Returned Value:</span>
            <span className="font-mono font-medium">{fmtBDT(rawReturnTotal)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Restocking Fee Deduction ({effectiveRestockingPct.toFixed(1)}%):</span>
            <span className="font-mono font-medium text-destructive">-{fmtBDT(restockingFeeAmt)}</span>
          </div>
          <div className="pt-2 border-t border-primary/20 flex justify-between items-center text-sm font-bold">
            <span className="text-foreground">Net Refund Payable ({refundMethod}):</span>
            <span className="font-mono text-primary text-base">{fmtBDT(netRefundTotal)}</span>
          </div>
        </div>
      </div>
    </EntityFormDrawer>
  );
}

export function SalesRefundForm({
  open,
  onOpenChange,
  sale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: ApiSale;
}) {
  const refund = useSalesRefund();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const cap = maxRefundable(sale);

  useEffect(() => {
    if (!open) return;
    setAmount(String(cap));
    setMethod(sale.tender?.toLowerCase() || "cash");
    setReference("");
    setErrors({});
  }, [open, sale, cap]);

  const handleSubmit = async () => {
    const next: Record<string, string> = {};
    const amt = Number(amount);
    const err = validateRefundAmount(amt, cap);
    if (err) next.amount = err;
    setErrors(next);
    if (Object.keys(next).length) return;
    await refund.mutateAsync({
      invoiceId: sale.id,
      body: { amount: amt, method, reference: reference || undefined },
    });
    onOpenChange(false);
  };

  return (
    <EntityFormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={`Refund — ${sale.invoice_number}`}
      description={`Max refundable ${fmtBDT(cap)}`}
      onSubmit={handleSubmit}
      submitLabel="Issue refund"
      isPending={refund.isPending}
      errorMessage={refund.error instanceof Error ? refund.error.message : null}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Amount</Label>
          <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <FieldError message={errors.amount} />
        </div>
        <div>
          <Label>Method</Label>
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="mobile">Mobile</option>
            <option value="bank">Bank</option>
          </select>
        </div>
      </div>
      <div>
        <Label>Reference</Label>
        <Input value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
    </EntityFormDrawer>
  );
}

export function SalesExchangeForm({
  open,
  onOpenChange,
  sale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: ApiSale;
}) {
  const exchange = useSalesExchange();
  const [reason, setReason] = useState("");
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [productQ, setProductQ] = useState("");
  const [newProductId, setNewProductId] = useState("");
  const [newVariantId, setNewVariantId] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [customPrice, setCustomPrice] = useState("");
  const [exchangeMode, setExchangeMode] = useState<"variant" | "catalog">("variant");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { data: productsPage } = useApiProducts({ q: productQ || undefined, page: 1 });
  const { data: fashionVariants } = useFashionVariants();
  const isFashion = sale.industry_pack === "fashion";

  const returnedProductId = sale.lines.find((l) => Number(qtys[l.id] ?? 0) > 0)?.product_id
    ?? sale.lines[0]?.product_id
    ?? "";

  const fashionReplacementVariants = (fashionVariants ?? []).filter((v) => {
    if (v.source === "legacy" || v.is_active === false) return false;
    if (!isFashion || !returnedProductId) return true;
    return v.product_id === returnedProductId;
  });

  const returnedTotal = sale.lines.reduce((acc, l) => acc + (Number(qtys[l.id] || 0) * l.unit_price), 0);
  const selectedProduct = productsPage?.items.find((p) => p.id === newProductId);
  const selectedVariant = fashionReplacementVariants.find((v) => v.id === newVariantId);
  const defaultUnitPrice = (selectedVariant as any)?.price ?? selectedProduct?.base_price ?? (sale.lines.find((l) => Number(qtys[l.id] || 0) > 0)?.unit_price ?? sale.lines[0]?.unit_price ?? 0);
  const replacementUnitPrice = customPrice !== "" && !isNaN(Number(customPrice)) ? Math.max(0, Number(customPrice)) : defaultUnitPrice;
  const replacementQty = Math.max(1, Number(newQty) || 1);
  const replacementTotal = replacementUnitPrice * replacementQty;
  const balanceDiff = replacementTotal - returnedTotal;

  useEffect(() => {
    if (!open) return;
    const init: Record<string, string> = {};
    sale.lines.forEach((l) => {
      init[l.id] = "1";
    });
    setQtys(init);
    setReason("");
    setProductQ("");
    setNewProductId(isFashion ? (sale.lines[0]?.product_id ?? "") : "");
    setNewVariantId("");
    setNewQty("1");
    setCustomPrice(sale.lines[0]?.unit_price != null ? String(sale.lines[0].unit_price) : "");
    setErrors({});
  }, [open, sale, isFashion]);

  const handleSubmit = async () => {
    const next: Record<string, string> = {};
    const return_lines = sale.lines
      .map((l) => {
        const bal = returnableQty(l);
        const qty = Number(qtys[l.id] ?? (bal > 0 ? 1 : 0));
        if (qty <= 0) return null;
        const err = validateReturnQty(qty, bal);
        if (err) next[l.id] = err;
        return { invoice_line_id: l.id, qty };
      })
      .filter(Boolean) as Array<{ invoice_line_id: string; qty: number }>;
    if (return_lines.length === 0) next.form = "Select at least one line to return";
    if (isFashion) {
      if (!newVariantId) next.variant = "Select replacement size × color";
    } else if (!newProductId && !newVariantId) {
      next.product = "Select replacement product or variant";
    }
    const nq = Number(newQty);
    if (!Number.isFinite(nq) || nq <= 0) next.newQty = "New item qty must be greater than zero";
    setErrors(next);
    if (Object.keys(next).length) return;
    if (!shouldUseBackend()) {
      toast.success("Exchange processed (Demo mode)");
      printReturnExchangeSlip({
        type: "exchange",
        invoiceNumber: sale.invoice_number,
        customerName: sale.customer_name ?? undefined,
        reason: reason.trim() || undefined,
        itemsReturned: return_lines.map((rl) => {
          const l = sale.lines.find((item) => item.id === rl.invoice_line_id);
          return { name: l?.name ?? "Returned Item", qty: rl.qty, unitPrice: l?.unit_price ?? 0 };
        }),
        itemsReplacement: [{ name: selectedProduct?.name ?? selectedVariant?.sku ?? "Replacement Item", qty: nq, unitPrice: replacementUnitPrice }],
        netAmount: balanceDiff,
      });
      onOpenChange(false);
      return;
    }
    const product = productsPage?.items.find((p) => p.id === newProductId);
    const variant = fashionReplacementVariants.find((v) => v.id === newVariantId);
    const resolvedProductId = (isFashion ? returnedProductId : newProductId) || variant?.product_id;
    const resolvedProduct = product ?? productsPage?.items.find((p) => p.id === resolvedProductId);
    const unitPrice = replacementUnitPrice;
    await exchange.mutateAsync({
      invoiceId: sale.id,
      body: {
        reason: reason.trim() || "Customer Exchange",
        return_lines: return_lines.map((rl) => {
          const line = sale.lines.find((l) => l.id === rl.invoice_line_id);
          const meta = (line?.meta ?? {}) as Record<string, unknown>;
          return meta.variant_id
            ? { ...rl, meta: { variant_id: meta.variant_id } }
            : rl;
        }),
        new_lines: [{
          product_id: resolvedProductId,
          sku: variant?.sku ?? resolvedProduct?.sku,
          name: resolvedProduct?.name,
          qty: nq,
          unit_price: unitPrice,
          variant_id: newVariantId || undefined,
        }],
      },
    });
    toast.success("Exchange posted successfully");
    printReturnExchangeSlip({
      type: "exchange",
      invoiceNumber: sale.invoice_number,
      customerName: sale.customer_name ?? undefined,
      reason: reason.trim() || undefined,
      itemsReturned: return_lines.map((rl) => {
        const l = sale.lines.find((item) => item.id === rl.invoice_line_id);
        return { name: l?.name ?? "Returned Item", qty: rl.qty, unitPrice: l?.unit_price ?? 0 };
      }),
      itemsReplacement: [{ name: resolvedProduct?.name ?? selectedVariant?.sku ?? "Replacement Item", qty: nq, unitPrice: replacementUnitPrice }],
      netAmount: balanceDiff,
    });
    onOpenChange(false);
  };

  return (
    <EntityFormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={`Item Exchange — ${sale.invoice_number}`}
      onSubmit={handleSubmit}
      submitLabel="Process Exchange"
      isPending={exchange.isPending}
      errorMessage={exchange.error instanceof Error ? exchange.error.message : null}
      className="sm:max-w-lg"
    >
      <FieldError message={errors.form} />

      <div>
        <Label className="text-xs font-semibold text-foreground/80">Exchange Reason (Optional)</Label>
        <Input
          placeholder="e.g. Size mismatch / color exchange / style swap (Optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 h-9 text-xs rounded-lg bg-background"
        />
      </div>

      {/* Item Return Section */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-foreground/80">1. Select Returned Item(s)</Label>
          <span className="text-[11px] text-muted-foreground">Original Invoice</span>
        </div>

        {sale.lines.map((l) => {
          const bal = returnableQty(l);
          const currentQty = Number(qtys[l.id] ?? (bal > 0 ? 1 : 0));
          const lineTotal = currentQty * l.unit_price;
          const isFullyReturned = bal <= 0;

          const setVal = (n: number) => {
            const clamped = Math.max(0, Math.min(bal, n));
            setQtys((p) => ({ ...p, [l.id]: String(clamped) }));
          };

          return (
            <div key={l.id} className={`rounded-xl border p-3.5 space-y-3 shadow-2xs ${isFullyReturned ? "bg-muted/40 border-border/40 opacity-75" : "border-border/70 bg-background/80"}`}>
              <div className="flex justify-between items-start gap-2">
                <div className="space-y-0.5">
                  <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                    {l.name}
                    {isFullyReturned && (
                      <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">Already Returned</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Unit Price: <strong className="font-mono text-foreground">{fmtBDT(l.unit_price)}</strong></span>
                    <span>·</span>
                    <span>Max Returnable: <strong className="text-foreground">{bal}</strong></span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-mono font-bold text-primary">{fmtBDT(lineTotal)}</div>
                  <div className="text-[10px] text-muted-foreground">Returned Value</div>
                </div>
              </div>

              {/* Stepper controls */}
              {!isFullyReturned && (
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/40">
                  <span className="text-xs font-medium text-muted-foreground">Return Qty:</span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setVal(currentQty - 1)}
                      disabled={currentQty <= 0}
                      className="h-8 w-8 rounded-lg border border-border bg-secondary/50 font-bold text-sm flex items-center justify-center transition-all cursor-pointer hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      -
                    </button>

                    <Input
                      type="number"
                      min={0}
                      max={bal}
                      value={qtys[l.id] ?? "1"}
                      onChange={(e) => setQtys((p) => ({ ...p, [l.id]: e.target.value }))}
                      className="h-8 w-16 text-center text-xs font-mono font-bold bg-background rounded-lg border-input"
                    />

                    <button
                      type="button"
                      onClick={() => setVal(currentQty + 1)}
                      disabled={currentQty >= bal}
                      className="h-8 w-8 rounded-lg border border-border bg-secondary/50 font-bold text-sm flex items-center justify-center transition-all cursor-pointer hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      +
                    </button>

                    <button
                      type="button"
                      onClick={() => setVal(bal)}
                      className="h-8 px-2.5 rounded-lg border border-border/80 bg-background text-[11px] font-semibold text-muted-foreground transition-all cursor-pointer hover:border-primary hover:text-primary"
                    >
                      Max ({bal})
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Replacement Item Section */}
      <div className="rounded-xl border border-border/70 bg-secondary/20 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-semibold text-foreground/80">2. Select Replacement Item</Label>
          {isFashion && (
            <div className="flex rounded-lg bg-background p-0.5 border border-border/70 text-[11px] shrink-0">
              <button
                type="button"
                onClick={() => setExchangeMode("variant")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  exchangeMode === "variant"
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Size / Color Swap
              </button>
              <button
                type="button"
                onClick={() => setExchangeMode("catalog")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  exchangeMode === "catalog"
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Pick Any Product
              </button>
            </div>
          )}
        </div>

        {isFashion && exchangeMode === "variant" ? (
          <div>
            <Label className="text-[11px] text-muted-foreground">Replacement Size × Color (Same Product Line)</Label>
            <select
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-medium shadow-2xs"
              value={newVariantId}
              onChange={(e) => {
                const vid = e.target.value;
                setNewVariantId(vid);
                const v = fashionReplacementVariants.find((fv) => fv.id === vid);
                if (v) {
                  setNewProductId(v.product_id);
                  const price = (v as any).price ?? (v as any).base_price ?? (sale.lines.find((l) => l.product_id === v.product_id)?.unit_price ?? sale.lines[0]?.unit_price);
                  if (price != null) setCustomPrice(String(price));
                }
              }}
            >
              <option value="">Select Replacement Variant…</option>
              {fashionReplacementVariants.map((v) => {
                const price = (v as any).price ?? (v as any).base_price ?? (sale.lines.find((l) => l.product_id === v.product_id)?.unit_price ?? sale.lines[0]?.unit_price ?? 0);
                return (
                  <option key={v.id} value={v.id}>
                    {v.size} · {v.color} ({v.sku}) — {fmtBDT(price)}
                  </option>
                );
              })}
            </select>
            <FieldError message={errors.variant} />
          </div>
        ) : (
          <div className="space-y-2.5">
            <div>
              <Label className="text-[11px] text-muted-foreground">Search Product Catalog</Label>
              <Input
                placeholder="Type SKU or item name…"
                value={productQ}
                onChange={(e) => setProductQ(e.target.value)}
                className="mt-1 h-9 text-xs bg-background rounded-lg"
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Replacement Product</Label>
              <select
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-medium shadow-2xs"
                value={newProductId}
                onChange={(e) => {
                  const pid = e.target.value;
                  setNewProductId(pid);
                  const p = productsPage?.items.find((item) => item.id === pid);
                  if (p?.base_price != null) {
                    setCustomPrice(String(p.base_price));
                  }
                }}
              >
                <option value="">Select Replacement Item…</option>
                {(productsPage?.items ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.sku} — {p.name} ({fmtBDT(p.base_price)})</option>
                ))}
              </select>
              <FieldError message={errors.product} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px] text-muted-foreground">Replacement Quantity</Label>
            <Input
              type="number"
              min={1}
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              className="mt-1 h-9 text-xs font-mono font-bold bg-background rounded-lg"
            />
            <FieldError message={errors.newQty} />
          </div>

          <div>
            <Label className="text-[11px] text-muted-foreground">Unit Price (৳)</Label>
            <Input
              type="number"
              min={0}
              placeholder={String(defaultUnitPrice)}
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              className="mt-1 h-9 text-xs font-mono font-bold bg-background rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Real-Time Financial Exchange Settlement Card */}
      {returnedTotal > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-foreground/90 uppercase tracking-wider">3. Exchange Settlement Summary</div>
            <button
              type="button"
              onClick={() => {
                const return_lines = sale.lines
                  .map((l) => {
                    const qty = Number(qtys[l.id] ?? 0);
                    if (qty <= 0) return null;
                    return { name: l.name, qty, unitPrice: l.unit_price };
                  })
                  .filter(Boolean) as Array<{ name: string; qty: number; unitPrice: number }>;

                const replacementName = selectedProduct?.name ?? selectedVariant?.sku ?? "Replacement Item";

                printReturnExchangeSlip({
                  type: "exchange",
                  invoiceNumber: sale.invoice_number,
                  customerName: sale.customer_name ?? undefined,
                  reason: reason.trim() || undefined,
                  itemsReturned: return_lines.length > 0 ? return_lines : sale.lines.map((l) => ({ name: l.name, qty: 1, unitPrice: l.unit_price })),
                  itemsReplacement: [{ name: replacementName, qty: replacementQty, unitPrice: replacementUnitPrice }],
                  netAmount: balanceDiff,
                });
              }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-primary/40 bg-background text-xs font-bold text-primary transition-all hover:bg-primary hover:text-primary-foreground cursor-pointer shadow-2xs"
            >
              <Printer className="h-3.5 w-3.5" /> Print Slip
            </button>
          </div>
          
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Returned Value:</span>
              <span className="font-mono font-medium">{fmtBDT(returnedTotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Replacement Item Value:</span>
              <span className="font-mono font-medium">{fmtBDT(replacementTotal)}</span>
            </div>

            <div className="pt-2 border-t border-primary/20 flex justify-between items-center text-sm font-bold">
              {balanceDiff > 0 ? (
                <>
                  <span className="text-primary flex items-center gap-1">
                    <span>🔵 Customer Owes Extra:</span>
                  </span>
                  <span className="font-mono text-primary text-base">+{fmtBDT(balanceDiff)}</span>
                </>
              ) : balanceDiff < 0 ? (
                <>
                  <span className="text-success flex items-center gap-1">
                    <span>🟢 Store Refund Due:</span>
                  </span>
                  <span className="font-mono text-success text-base">-{fmtBDT(Math.abs(balanceDiff))}</span>
                </>
              ) : (
                <>
                  <span className="text-foreground/80 flex items-center gap-1">
                    <span>⚪ Even Price Exchange:</span>
                  </span>
                  <span className="font-mono text-foreground text-base">৳0</span>
                </>
              )}
            </div>

            {balanceDiff > 0 && (
              <p className="text-[11px] text-primary/80 font-medium pt-1">
                💡 Collect difference of {fmtBDT(balanceDiff)} from customer at till checkout.
              </p>
            )}
            {balanceDiff < 0 && (
              <p className="text-[11px] text-success/80 font-medium pt-1">
                💡 Issue refund or Store Credit Voucher of {fmtBDT(Math.abs(balanceDiff))} to customer.
              </p>
            )}
          </div>
        </div>
      )}
    </EntityFormDrawer>
  );
}

export function DueCollectionForm({
  open,
  onOpenChange,
  sale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: ApiSale;
}) {
  const collect = useDueCollection();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const due = sale.due_amount ?? 0;

  useEffect(() => {
    if (!open) return;
    setAmount(String(due));
    setMethod("cash");
    setReference("");
    setErrors({});
  }, [open, sale, due]);

  const handleSubmit = async () => {
    const next: Record<string, string> = {};
    if (!sale.customer_id) next.customer = "Sale has no customer";
    const amt = Number(amount);
    const err = validateCollectionAmount(amt, due);
    if (err) next.amount = err;
    setErrors(next);
    if (Object.keys(next).length) return;
    await collect.mutateAsync({
      customer_id: sale.customer_id!,
      amount: amt,
      invoice_id: sale.id,
      method,
      reference: reference || undefined,
      store_id: sale.store_id ?? undefined,
    });
    onOpenChange(false);
  };

  return (
    <EntityFormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={`Collect due — ${sale.invoice_number}`}
      description={`Outstanding on invoice: ${fmtBDT(due)}`}
      onSubmit={handleSubmit}
      submitLabel="Record collection"
      isPending={collect.isPending}
      errorMessage={collect.error instanceof Error ? collect.error.message : null}
    >
      <FieldError message={errors.customer} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Amount</Label>
          <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <FieldError message={errors.amount} />
        </div>
        <div>
          <Label>Method</Label>
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="mobile">Mobile</option>
            <option value="bank">Bank</option>
          </select>
        </div>
      </div>
      <div>
        <Label>Reference</Label>
        <Input value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
    </EntityFormDrawer>
  );
}

export function CustomerCreateForm({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (customer: { id: string; name: string }) => void;
}) {
  const create = useCreateCustomer();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setCode(`C${Date.now().toString().slice(-6)}`);
    setName("");
    setPhone("");
    setEmail("");
    setCreditLimit("");
    setErrors({});
  }, [open]);

  const handleSubmit = async () => {
    const next: Record<string, string> = {};
    if (!code.trim()) next.code = "Code is required";
    if (!name.trim()) next.name = "Name is required";
    setErrors(next);
    if (Object.keys(next).length) return;
    const customer = await create.mutateAsync({
      code: code.trim(),
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      credit_limit: creditLimit ? Number(creditLimit) : undefined,
    });
    onCreated?.({ id: customer.id, name: customer.name });
    onOpenChange(false);
  };

  return (
    <EntityFormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="New customer"
      onSubmit={handleSubmit}
      submitLabel="Create customer"
      isPending={create.isPending}
      errorMessage={create.error instanceof Error ? create.error.message : null}
    >
      <div>
        <Label>Code</Label>
        <Input value={code} onChange={(e) => setCode(e.target.value)} />
        <FieldError message={errors.code} />
      </div>
      <div>
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <FieldError message={errors.name} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      </div>
      <div>
        <Label>Credit limit (optional)</Label>
        <Input type="number" min={0} value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
      </div>
    </EntityFormDrawer>
  );
}

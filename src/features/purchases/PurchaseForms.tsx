import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus } from "lucide-react";
import {
  useApiProducts,
  useApiStores,
  useApiSuppliers,
  useCreatePurchase,
  useUpdatePurchase,
  useReceivePurchase,
  useDirectReceivePurchase,
  usePurchaseReturn,
  useCreateSupplierInvoice,
  useApproveSupplierInvoice,
  useCreateSupplierPayment,
  useSupplierInvoices,
  useProductVariants,
  type ApiPurchase,
  type ApiProductVariant,
  type ApiSupplierInvoice,
  type ApiPurchaseReceiveResult,
} from "@/hooks/use-api-config";
import {
  lineSubtotal,
  purchaseTotals,
  returnableQty,
  validateReceiveQty,
  validateReturnQty,
} from "@/features/purchases/utils";
import { PurchaseFormShell, type PurchaseFormLayout } from "@/features/purchases/PurchaseFormShell";
import { safeRandomUUID } from "@/lib/utils";

type LineDraft = {
  key: string;
  product_id: string;
  product_name: string;
  sku: string;
  industry_pack: string;
  variant_id: string;
  size: string;
  color: string;
  batch_no?: string;
  expiry_date?: string;
  show_batch?: boolean;
  qty: string;
  unit_cost: string;
  discount: string;
  tax: string;
};

function emptyLine(): LineDraft {
  return {
    key: safeRandomUUID(),
    product_id: "",
    product_name: "",
    sku: "",
    industry_pack: "",
    variant_id: "",
    size: "",
    color: "",
    batch_no: "",
    expiry_date: "",
    show_batch: false,
    qty: "1",
    unit_cost: "0",
    discount: "0",
    tax: "0",
  };
}

function lineNet(line: LineDraft): number {
  return (
    lineSubtotal(Number(line.qty) || 0, Number(line.unit_cost) || 0)
    - (Number(line.discount) || 0)
    + (Number(line.tax) || 0)
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function FashionVariantSelect({
  productId,
  value,
  onChange,
}: {
  productId: string;
  value: string;
  onChange: (variant: ApiProductVariant | null) => void;
}) {
  const { data: variants = [], isLoading } = useProductVariants(productId || undefined);
  const active = variants.filter((v) => v.is_active !== false);
  return (
    <select
      className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
      value={value}
      disabled={!productId || isLoading}
      onChange={(e) => {
        const v = active.find((x) => x.id === e.target.value) ?? null;
        onChange(v);
      }}
    >
      <option value="">{isLoading ? "Loading variants…" : "Select size × color…"}</option>
      {active.map((v) => (
        <option key={v.id} value={v.id}>
          {[v.size, v.color].filter(Boolean).join(" · ") || v.variant_code}
          {v.barcode ? ` · ${v.barcode}` : ""}
        </option>
      ))}
    </select>
  );
}

const LINE_GRID = "grid grid-cols-[minmax(0,1fr)_4.5rem_6rem_5rem_5rem_6.5rem_2.25rem] items-start gap-2";

function PurchaseLinesEditor({
  lines,
  setLines,
  errors,
}: {
  lines: LineDraft[];
  setLines: (updater: (prev: LineDraft[]) => LineDraft[]) => void;
  errors: Record<string, string>;
}) {
  const patch = (key: string, partial: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...partial } : l)));
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <div className="min-w-[42rem]">
        <div className={`${LINE_GRID} border-b border-border bg-secondary/40 px-3 py-2 text-xs font-medium uppercase text-muted-foreground`}>
          <span>Item</span><span>Qty</span><span>Rate</span><span>Disc</span><span>Tax</span><span className="text-right">Total</span><span />
        </div>
        {lines.map((line, idx) => (
          <div key={line.key} className={`${LINE_GRID} border-b border-border px-3 py-2 text-sm last:border-0`}>
            <div>
              <div className="font-medium">{line.product_name || "—"}</div>
              <div className="text-xs text-muted-foreground">{line.sku}</div>
              {line.industry_pack === "fashion" && line.product_id && (
                <FashionVariantSelect
                  productId={line.product_id}
                  value={line.variant_id}
                  onChange={(v) => patch(line.key, { variant_id: v?.id ?? "", size: v?.size ?? "", color: v?.color ?? "" })}
                />
              )}
              {line.industry_pack === "fashion" && (line.size || line.color) && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {[line.size, line.color].filter(Boolean).join(" · ")}
                </div>
              )}
              {line.product_id ? (
                (() => {
                  const isBatchPack = ["cosmetics", "pharmacy", "grocery", "super-shop", "surgical-shop"].includes(line.industry_pack);
                  const shouldShow = isBatchPack || Boolean(line.show_batch || line.batch_no || line.expiry_date);
                  if (shouldShow) {
                    return (
                      <div className="mt-2 rounded-md border border-border/70 bg-secondary/25 p-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Batch & Expiry</span>
                          {!isBatchPack && !line.batch_no && !line.expiry_date && (
                            <button
                              type="button"
                              className="text-[10px] text-muted-foreground hover:text-foreground"
                              onClick={() => patch(line.key, { show_batch: false })}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] text-muted-foreground block">Batch / Lot #</label>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => patch(line.key, { batch_no: "Old Stock" })}
                                  className={`px-1 py-0.2 rounded text-[9px] font-semibold border ${
                                    line.batch_no === "Old Stock"
                                      ? "bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300"
                                      : "bg-background border-border text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  🏷️ Old
                                </button>
                                <button
                                  type="button"
                                  onClick={() => patch(line.key, { batch_no: "New Stock" })}
                                  className={`px-1 py-0.2 rounded text-[9px] font-semibold border ${
                                    line.batch_no === "New Stock"
                                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-300"
                                      : "bg-background border-border text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  ✨ New
                                </button>
                              </div>
                            </div>
                            <Input
                              placeholder="e.g. Old Stock / New Stock"
                              className="h-7 text-xs bg-background mt-0.5 font-medium"
                              value={line.batch_no ?? ""}
                              onChange={(e) => patch(line.key, { batch_no: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground block">Expiry Date</label>
                            <Input
                              type="date"
                              className="h-7 text-xs bg-background mt-0.5"
                              value={line.expiry_date ?? ""}
                              onChange={(e) => patch(line.key, { expiry_date: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <button
                      type="button"
                      className="mt-1 text-[11px] text-primary/90 hover:text-primary hover:underline flex items-center gap-1 font-semibold"
                      onClick={() => patch(line.key, { show_batch: true, batch_no: "New Stock" })}
                    >
                      + Track Batch &amp; Expiry (Old / New Stock)
                    </button>
                  );
                })()
              ) : null}
            </div>
            <Input type="number" min={0} value={line.qty} onChange={(e) => patch(line.key, { qty: e.target.value })} />
            <Input type="number" min={0} value={line.unit_cost} onChange={(e) => patch(line.key, { unit_cost: e.target.value })} />
            <Input type="number" min={0} value={line.discount} onChange={(e) => patch(line.key, { discount: e.target.value })} />
            <Input type="number" min={0} value={line.tax} onChange={(e) => patch(line.key, { tax: e.target.value })} />
            <div className="pt-2 text-right tabular-nums">{fmt(lineNet(line))}</div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setLines((prev) => prev.length > 1 ? prev.filter((l) => l.key !== line.key) : [emptyLine()])}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <div className="col-span-7">
              <FieldError message={errors[`line-${idx}-qty`] || errors[`line-${idx}-rate`] || errors[`line-${idx}-variant`]} />
            </div>
          </div>
        ))}
        <div className="px-3 py-2">
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setLines((p) => [...p, emptyLine()])}>
            <Plus className="h-3.5 w-3.5" /> Add line
          </Button>
          <FieldError message={errors.lines} />
        </div>
      </div>
    </div>
  );
}

function OrderTotalsSummary({
  totals,
  discount,
  setDiscount,
  tax,
  setTax,
}: {
  totals: { subtotal: number; lineDiscount: number; lineTax: number; total: number };
  discount: string;
  setDiscount: (v: string) => void;
  tax: string;
  setTax: (v: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-secondary/30 p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="tabular-nums">{fmt(totals.subtotal)}</span>
      </div>
      {totals.lineDiscount > 0 && (
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Line discounts</span>
          <span className="tabular-nums">−{fmt(totals.lineDiscount)}</span>
        </div>
      )}
      {totals.lineTax > 0 && (
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Line tax</span>
          <span className="tabular-nums">{fmt(totals.lineTax)}</span>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Header discount</span>
        <Input type="number" min={0} className="h-8 w-28 text-right" value={discount} onChange={(e) => setDiscount(e.target.value)} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Tax / VAT</span>
        <Input type="number" min={0} className="h-8 w-28 text-right" value={tax} onChange={(e) => setTax(e.target.value)} />
      </div>
      <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
        <span>Net amount</span>
        <span className="tabular-nums">{fmt(totals.total)}</span>
      </div>
    </div>
  );
}

export function PurchaseOrderForm({
  open,
  onOpenChange,
  purchase,
  defaultStoreId,
  layout = "drawer",
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchase?: ApiPurchase;
  defaultStoreId?: string;
  layout?: PurchaseFormLayout;
  onSuccess?: (purchase: ApiPurchase) => void;
}) {
  const isEdit = !!purchase;
  const { data: suppliers } = useApiSuppliers();
  const { data: stores } = useApiStores();
  const [productQ, setProductQ] = useState("");
  const { data: productsPage } = useApiProducts({ q: productQ || undefined, page: 1 });
  const create = useCreatePurchase();
  const update = useUpdatePurchase();

  const [supplierId, setSupplierId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    if (purchase) {
      setSupplierId(purchase.supplier_id ?? "");
      setStoreId(purchase.store_id ?? "");
      setRemarks(purchase.remarks ?? "");
      setExpectedDate(purchase.expected_date ? purchase.expected_date.slice(0, 10) : "");
      setReferenceNo(purchase.reference_no ?? "");
      setDiscount(String(purchase.discount_amount ?? 0));
      setTax(String(purchase.tax_amount ?? 0));
      setLines(
        purchase.lines.length
          ? purchase.lines.map((l) => ({
              key: l.id,
              product_id: l.product_id,
              product_name: l.product_name ?? "",
              sku: l.sku ?? "",
              industry_pack: l.industry_pack ?? "",
              variant_id: l.variant_id ?? "",
              size: l.size ?? "",
              color: l.color ?? "",
              batch_no: (l as any).batch_no || "",
              expiry_date: (l as any).expiry_date ? String((l as any).expiry_date).slice(0, 10) : "",
              show_batch: Boolean((l as any).batch_no || (l as any).expiry_date),
              qty: String(l.qty),
              unit_cost: String(l.unit_cost),
              discount: String(l.discount_amount ?? 0),
              tax: String(l.tax_amount ?? 0),
            }))
          : [emptyLine()],
      );
    } else {
      setSupplierId("");
      setStoreId(defaultStoreId ?? "");
      setRemarks("");
      setExpectedDate("");
      setReferenceNo("");
      setDiscount("0");
      setTax("0");
      setLines([emptyLine()]);
    }
    setErrors({});
    setProductQ("");
  }, [open, purchase, defaultStoreId]);

  const parsedLines = useMemo(
    () =>
      lines
        .filter((l) => l.product_id)
        .map((l) => ({
          product_id: l.product_id,
          industry_pack: l.industry_pack,
          variant_id: l.variant_id || undefined,
          batch_no: l.batch_no?.trim() || undefined,
          expiry_date: l.expiry_date?.trim() || undefined,
          qty: Number(l.qty) || 0,
          unit_cost: Number(l.unit_cost) || 0,
          discount_amount: Number(l.discount) || 0,
          tax_amount: Number(l.tax) || 0,
        })),
    [lines],
  );

  const totals = purchaseTotals(parsedLines, Number(discount) || 0, Number(tax) || 0);
  const mutation = isEdit ? update : create;
  const mutationError = mutation.error instanceof Error ? mutation.error.message : null;

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!supplierId) next.supplier = "Supplier is required";
    if (!storeId) next.store = "Store is required";
    if (parsedLines.length === 0) next.lines = "Add at least one line";
    parsedLines.forEach((l, i) => {
      if (l.qty <= 0) next[`line-${i}-qty`] = "Qty must be greater than zero";
      if (l.unit_cost < 0) next[`line-${i}-rate`] = "Rate cannot be negative";
      if (l.discount_amount < 0 || l.tax_amount < 0) next[`line-${i}-rate`] = "Discount and tax cannot be negative";
      if (l.industry_pack === "fashion" && !l.variant_id) {
        next[`line-${i}-variant`] = "Fashion lines require size × color";
      }
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const body = {
      supplier_id: supplierId,
      store_id: storeId,
      remarks: remarks || undefined,
      expected_date: expectedDate ? `${expectedDate}T00:00:00` : undefined,
      reference_no: referenceNo.trim() || undefined,
      discount_amount: Number(discount) || 0,
      tax_amount: Number(tax) || 0,
      lines: parsedLines.map(({ product_id, qty, unit_cost, variant_id, batch_no, expiry_date, discount_amount, tax_amount }) => ({
        product_id,
        qty,
        unit_cost,
        discount_amount,
        tax_amount,
        ...(variant_id ? { variant_id } : {}),
        ...(batch_no ? { batch_no } : {}),
        ...(expiry_date ? { expiry_date } : {}),
      })),
    };
    if (isEdit && purchase) {
      const updated = await update.mutateAsync({ id: purchase.id, body });
      onSuccess?.(updated);
    } else {
      const created = await create.mutateAsync(body);
      onSuccess?.(created);
    }
    onOpenChange(false);
  };

  const addProduct = (productId: string) => {
    const p = productsPage?.items.find((x) => x.id === productId);
    if (!p) return;
    setLines((prev) => {
      const empty = prev.find((l) => !l.product_id);
      const draft: LineDraft = {
        key: empty?.key ?? safeRandomUUID(),
        product_id: p.id,
        product_name: p.name,
        sku: p.sku,
        industry_pack: p.industry_pack ?? "",
        variant_id: "",
        size: "",
        color: "",
        qty: "1",
        unit_cost: String(
          (p as { cost_price?: number | null }).cost_price
          ?? (p as { wholesale_price?: number | null }).wholesale_price
          ?? p.base_price
          ?? 0,
        ),
        discount: "0",
        tax: "0",
      };
      if (empty) return prev.map((l) => (l.key === empty.key ? draft : l));
      return [...prev, draft];
    });
    setProductQ("");
  };

  return (
    <PurchaseFormShell
      layout={layout}
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `Edit ${purchase?.invoice_number}` : "New purchase order"}
      description="Multi-line PO — fashion lines require size × color. Save as pending, then approve from the purchases list."
      onSubmit={handleSubmit}
      submitLabel={isEdit ? "Save" : "Create PO"}
      isPending={mutation.isPending}
      errorMessage={mutationError}
      className="sm:max-w-2xl"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label>Supplier *</Label>
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">Select supplier…</option>
            {(suppliers ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {(suppliers ?? []).length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">No suppliers yet — create one under Suppliers first.</p>
          ) : null}
          <FieldError message={errors.supplier} />
        </div>
        <div>
          <Label>Store *</Label>
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          >
            <option value="">Select store…</option>
            {(stores ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {(stores ?? []).length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">No stores available for this tenant.</p>
          ) : null}
          <FieldError message={errors.store} />
        </div>
        <div>
          <Label>Expected delivery</Label>
          <Input type="date" className="mt-1" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </div>
        <div>
          <Label>Supplier ref / bill no</Label>
          <Input className="mt-1" placeholder="Optional" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Add product</Label>
        <div className="mt-1 flex gap-2">
          <Input placeholder="Search SKU or name…" value={productQ} onChange={(e) => setProductQ(e.target.value)} />
          <select
            className="min-w-[14rem] rounded-md border border-input bg-background px-2 py-2 text-sm"
            value=""
            onChange={(e) => e.target.value && addProduct(e.target.value)}
          >
            <option value="">Pick…</option>
            {(productsPage?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <PurchaseLinesEditor lines={lines} setLines={setLines} errors={errors} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <Label>Remarks</Label>
          <textarea
            className="mt-1 min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Notes for the supplier or your team…"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
        <OrderTotalsSummary totals={totals} discount={discount} setDiscount={setDiscount} tax={tax} setTax={setTax} />
      </div>
    </PurchaseFormShell>
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(n);
}

export function GrnReceiveForm({
  open,
  onOpenChange,
  purchase,
  layout = "drawer",
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchase: ApiPurchase;
  layout?: PurchaseFormLayout;
  onSuccess?: (result: ApiPurchaseReceiveResult) => void;
}) {
  const receive = useReceivePurchase();
  const [remarks, setRemarks] = useState("");
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [batchFields, setBatchFields] = useState<Record<string, { batch_no: string; expiry_date: string }>>({});
  const [serialFields, setSerialFields] = useState<Record<string, string>>({});
  // Per-line "skip serial" override — lets users bypass serial validation when product
  // metadata is ambiguous or the backend flag doesn't match any known key name.
  const [skipSerialLines, setSkipSerialLines] = useState<Record<string, boolean>>({});
  const [jewelryFields, setJewelryFields] = useState<Record<string, {
    certificate_no: string;
    tag_no: string;
    gross_weight: string;
    stone_weight: string;
    net_metal_weight: string;
    purity: string;
  }>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [grnNo, setGrnNo] = useState<string | null>(null);
  // At-GRN payment
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payRef, setPayRef] = useState("");

  useEffect(() => {
    if (!open) return;
    const init: Record<string, string> = {};
    purchase.lines.forEach((l) => {
      const openQty = l.open_qty ?? Math.max(0, l.qty - l.received_qty);
      if (openQty > 0) init[l.id] = String(openQty);
    });
    setQtys(init);
    const bf: Record<string, { batch_no: string; expiry_date: string }> = {};
    purchase.lines.forEach((l) => {
      bf[l.id] = {
        batch_no: (l as any).batch_no || "",
        expiry_date: (l as any).expiry_date ? String((l as any).expiry_date).slice(0, 10) : "",
      };
    });
    setBatchFields(bf);
    const sf: Record<string, string> = {};
    purchase.lines.forEach((l) => { sf[l.id] = ""; });
    setSerialFields(sf);
    setSkipSerialLines({});
    setPayAmount("");
    setPayMethod("cash");
    setPayRef("");
    const jf: Record<string, {
      certificate_no: string;
      tag_no: string;
      gross_weight: string;
      stone_weight: string;
      net_metal_weight: string;
      purity: string;
    }> = {};
    purchase.lines.forEach((l) => {
      jf[l.id] = {
        certificate_no: "",
        tag_no: "",
        gross_weight: "",
        stone_weight: "0",
        net_metal_weight: "",
        purity: "22K",
      };
    });
    setJewelryFields(jf);
    setRemarks("");
    setErrors({});
    setGrnNo(null);
  }, [open, purchase]);

  const mutationError = receive.error instanceof Error ? receive.error.message : null;
  const { data: productsPage } = useApiProducts({ limit: 200 });

  const isPharmacy = purchase.industry_pack === "pharmacy";
  const isElectronics = purchase.industry_pack === "electronics" || purchase.industry_pack === "mobile-shop";
  const isMobileShop = purchase.industry_pack === "mobile-shop";
  const isJewelry = purchase.industry_pack === "jewelry";

  const isLineSerialized = (line: (typeof purchase.lines)[number]) => {
    // Check all known API field name variants for serial tracking flag
    const SERIAL_META_KEYS = [
      "serialized", "has_serial", "hasSerial",
      "serial_imei_required", "imei_required", "serial_tracked",
      // Additional backend variants:
      "track_serial", "serial_number_required", "is_serial_tracked",
      "require_imei", "requires_serial", "is_serialized",
    ];
    const prod = productsPage?.items?.find((p) => p.id === line.product_id);
    if (prod?.meta) {
      const meta = prod.meta as Record<string, unknown>;
      for (const k of SERIAL_META_KEYS) {
        if (k in meta) {
          const val = meta[k];
          if (typeof val === "string") return val.toLowerCase() === "true" || val === "1";
          return Boolean(val);
        }
      }
      // Product found in catalog but has no serial meta key → not serialized
      return false;
    }
    // Fallback to purchase line fields (sent directly by backend)
    for (const k of SERIAL_META_KEYS) {
      const val = (line as unknown as Record<string, unknown>)[k];
      if (val !== undefined) {
        if (typeof val === "string") return val.toLowerCase() === "true" || val === "1";
        return Boolean(val);
      }
    }
    // Cannot determine — default to NOT required to avoid blocking the GRN
    return false;
  };

  const parseSerialGrid = (raw: string) =>
    raw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("|").map((p) => p.trim());
        if (isMobileShop) {
          // IMEI-1 | IMEI-2 | serial   OR   IMEI-1 | IMEI-2
          const imei_1 = parts[0] || undefined;
          const imei_2 = parts[1] || undefined;
          const serial_no = parts[2] || imei_1;
          return {
            serial_no: serial_no || "",
            imei_no: imei_1,
            imei_1,
            imei_2: imei_2 || undefined,
            condition: "new",
          };
        }
        const [serial_no, imei_no] = parts;
        return { serial_no, imei_no: imei_no || undefined };
      });

  const handleSubmit = async () => {
    const next: Record<string, string> = {};
    const lines = purchase.lines
      .map((l) => {
        const openQty = l.open_qty ?? Math.max(0, l.qty - l.received_qty);
        const qty = Number(qtys[l.id] ?? 0);
        const err = validateReceiveQty(qty, openQty);
        if (err) next[l.id] = err;
        const bf = batchFields[l.id];
        if (isPharmacy && qty > 0) {
          if (!bf?.batch_no?.trim()) next[`${l.id}-batch`] = "Batch number required for pharmacy";
          if (!bf?.expiry_date) next[`${l.id}-expiry`] = "Expiry date required for pharmacy";
        }
        const lineSerialized = isLineSerialized(l);
        const isSkipped = skipSerialLines[l.id] === true;
        const rawSerials = (serialFields[l.id] ?? "").trim();
        const serials = isElectronics && qty > 0 && lineSerialized && !isSkipped && rawSerials ? parseSerialGrid(rawSerials) : [];
        if (isElectronics && qty > 0 && lineSerialized && !isSkipped) {
          if (!rawSerials) {
            next[`${l.id}-serial`] = `Serial / IMEI numbers required for ${l.product_name ?? "product"} (${Math.floor(qty)} needed)`;
          } else if (serials.length !== Math.floor(qty)) {
            next[`${l.id}-serial`] = `Serial count (${serials.length}) must match qty (${Math.floor(qty)})`;
          } else {
            const seen = new Set<string>();
            for (const s of serials) {
              if (seen.has(s.serial_no.toLowerCase())) {
                next[`${l.id}-serial`] = `Duplicate serial in grid: ${s.serial_no}`;
                break;
              }
              seen.add(s.serial_no.toLowerCase());
            }
          }
        }
        const jf = jewelryFields[l.id];
        if (isJewelry && qty > 0 && jf) {
          if (!jf.certificate_no.trim()) {
            next[`${l.id}-jw-cert`] = "Certificate no. required for jewelry GRN";
          }
          if (!jf.gross_weight || Number(jf.gross_weight) <= 0) {
            next[`${l.id}-jw-gross`] = "Gross weight required for jewelry GRN";
          }
        }
        return {
          purchase_line_id: l.id,
          qty,
          ...(isPharmacy && qty > 0 ? {
            batch_no: bf?.batch_no?.trim(),
            expiry_date: bf?.expiry_date ? `${bf.expiry_date}T23:59:59` : undefined,
          } : {}),
          ...(isElectronics && qty > 0 && serials.length ? { serials } : {}),
          ...(isJewelry && qty > 0 && jf ? {
            certificate_no: jf.certificate_no.trim() || undefined,
            tag_no: jf.tag_no.trim() || undefined,
            gross_weight: Number(jf.gross_weight || 0),
            stone_weight: Number(jf.stone_weight || 0),
            net_metal_weight: jf.net_metal_weight
              ? Number(jf.net_metal_weight)
              : Number(jf.gross_weight || 0) - Number(jf.stone_weight || 0),
            purity: jf.purity || "22K",
            metal_type: "Gold",
          } : {}),
        };
      })
      .filter((l) => l.qty > 0);
    if (lines.length === 0) next.form = "Enter receive quantity for at least one line";
    setErrors(next);
    if (Object.keys(next).length) return;
    const payAmtNum = Number(payAmount) || 0;
    const res = await receive.mutateAsync({
      id: purchase.id,
      body: {
        remarks: remarks || undefined,
        lines,
        ...(payAmtNum > 0 ? {
          payment_amount: payAmtNum,
          payment_method: payMethod,
          payment_reference: payRef.trim() || undefined,
        } : {}),
      },
    });
    setGrnNo(res.receive_no);
    onSuccess?.(res);
  };

  return (
    <PurchaseFormShell
      layout={layout}
      open={open}
      onOpenChange={(v) => { if (!v) setGrnNo(null); onOpenChange(v); }}
      title={`Receive GRN — ${purchase.invoice_number}`}
      description="Partial receive supported. Stock posts through inventory service on save."
      onSubmit={handleSubmit}
      submitLabel={grnNo ? "Done" : "Post GRN"}
      isPending={receive.isPending}
      submitDisabled={!!grnNo}
      errorMessage={mutationError}
      className="sm:max-w-lg"
      footer={grnNo ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-emerald-700">GRN posted: <span className="font-mono font-semibold">{grnNo}</span></p>
          <Button type="button" className="w-full" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      ) : undefined}
    >
      <FieldError message={errors.form} />
      {purchase.lines.map((l) => {
        const openQty = l.open_qty ?? Math.max(0, l.qty - l.received_qty);
        if (openQty <= 0) return null;
        return (
          <div key={l.id} className="rounded-md border border-border p-3">
            <div className="font-medium">{l.product_name ?? l.product_id}</div>
            <div className="text-xs text-muted-foreground">
              Ordered {l.qty} · Received {l.received_qty} · Balance {openQty}
              {(l.size || l.color || l.variant_code) ? (
                <> · {[l.variant_code, l.size, l.color].filter(Boolean).join(" · ")}</>
              ) : null}
              {l.industry_pack === "fashion" && !l.variant_id ? (
                <span className="ml-1 text-amber-700">Missing variant — edit PO before receive</span>
              ) : null}
            </div>
            <Label className="mt-2">Receive qty</Label>
            <Input
              type="number"
              min={0}
              max={openQty}
              value={qtys[l.id] ?? ""}
              onChange={(e) => setQtys((p) => ({ ...p, [l.id]: e.target.value }))}
            />
            <FieldError message={errors[l.id]} />
            {(isPharmacy || ["cosmetics", "pharmacy", "grocery", "super-shop", "surgical-shop"].includes(purchase.industry_pack || "") || ["cosmetics", "pharmacy", "grocery", "super-shop", "surgical-shop"].includes(l.industry_pack || "") || Boolean(batchFields[l.id]?.batch_no || batchFields[l.id]?.expiry_date)) && (
              <div className="mt-2 rounded-md border border-border/70 bg-secondary/25 p-2 space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Batch & Expiry</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px]">Batch no.</Label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setBatchFields((p) => ({ ...p, [l.id]: { ...p[l.id], batch_no: "Old Stock", expiry_date: p[l.id]?.expiry_date ?? "" } }))}
                          className={`px-1 py-0.2 rounded text-[9px] font-semibold border ${
                            batchFields[l.id]?.batch_no === "Old Stock"
                              ? "bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300"
                              : "bg-background border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          🏷️ Old
                        </button>
                        <button
                          type="button"
                          onClick={() => setBatchFields((p) => ({ ...p, [l.id]: { ...p[l.id], batch_no: "New Stock", expiry_date: p[l.id]?.expiry_date ?? "" } }))}
                          className={`px-1 py-0.2 rounded text-[9px] font-semibold border ${
                            batchFields[l.id]?.batch_no === "New Stock"
                              ? "bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-300"
                              : "bg-background border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          ✨ New
                        </button>
                      </div>
                    </div>
                    <Input className="h-8 text-xs bg-background mt-0.5 font-medium" placeholder="e.g. Old Stock / New Stock" value={batchFields[l.id]?.batch_no ?? ""} onChange={(e) => setBatchFields((p) => ({ ...p, [l.id]: { ...p[l.id], batch_no: e.target.value, expiry_date: p[l.id]?.expiry_date ?? "" } }))} />
                    <FieldError message={errors[`${l.id}-batch`]} />
                  </div>
                  <div>
                    <Label className="text-[11px]">Expiry date</Label>
                    <Input type="date" className="h-8 text-xs bg-background mt-0.5" value={batchFields[l.id]?.expiry_date ?? ""} onChange={(e) => setBatchFields((p) => ({ ...p, [l.id]: { batch_no: p[l.id]?.batch_no ?? "", expiry_date: e.target.value } }))} />
                    <FieldError message={errors[`${l.id}-expiry`]} />
                  </div>
                </div>
              </div>
            )}
            {isElectronics && isLineSerialized(l) && (
              <div className="mt-2 space-y-2">
                {!skipSerialLines[l.id] ? (
                  <div>
                    <Label>
                      {isMobileShop
                        ? "IMEI capture (Required for handsets: IMEI-1|IMEI-2)"
                        : "Serial / IMEI (Required, one per unit: SERIAL or SERIAL|IMEI)"}
                    </Label>
                    <textarea
                      className="mt-1 min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                      placeholder={
                        isMobileShop
                          ? "860123456789012|860123456789020\n860123456789038|860123456789046"
                          : "SN-001\nSN-002|356938035643809"
                      }
                      value={serialFields[l.id] ?? ""}
                      onChange={(e) => setSerialFields((p) => ({ ...p, [l.id]: e.target.value }))}
                    />
                    <FieldError message={errors[`${l.id}-serial`]} />
                  </div>
                ) : (
                  <div className="rounded-md border border-amber-300/50 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                    ⚠ Serial entry skipped — stock will be received without serial numbers. You can capture serials later from Inventory.
                  </div>
                )}
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={skipSerialLines[l.id] === true}
                    onChange={(e) => {
                      setSkipSerialLines((p) => ({ ...p, [l.id]: e.target.checked }));
                      if (e.target.checked) {
                        // Clear any existing serial error for this line
                        setErrors((p) => { const n = { ...p }; delete n[`${l.id}-serial`]; return n; });
                      }
                    }}
                  />
                  Skip serial entry for this item
                </label>
              </div>
            )}
            {isElectronics && !isLineSerialized(l) && (
              <div className="mt-2 rounded-md bg-secondary/30 px-3 py-1.5 text-xs text-muted-foreground">
                Non-serialized item · Serial/IMEI tracking not required
              </div>
            )}
            {isJewelry && (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Certificate no. *</Label>
                    <Input
                      value={jewelryFields[l.id]?.certificate_no ?? ""}
                      onChange={(e) => setJewelryFields((p) => ({
                        ...p,
                        [l.id]: { ...p[l.id], certificate_no: e.target.value },
                      }))}
                    />
                    {errors[`${l.id}-jw-cert`] && (
                      <p className="text-xs text-destructive">{errors[`${l.id}-jw-cert`]}</p>
                    )}
                  </div>
                  <div>
                    <Label>Tag no.</Label>
                    <Input
                      value={jewelryFields[l.id]?.tag_no ?? ""}
                      onChange={(e) => setJewelryFields((p) => ({
                        ...p,
                        [l.id]: { ...p[l.id], tag_no: e.target.value },
                      }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>Gross wt (g)</Label>
                    <Input
                      type="number"
                      value={jewelryFields[l.id]?.gross_weight ?? ""}
                      onChange={(e) => setJewelryFields((p) => ({
                        ...p,
                        [l.id]: { ...p[l.id], gross_weight: e.target.value },
                      }))}
                    />
                    <FieldError message={errors[`${l.id}-jw-gross`]} />
                  </div>
                  <div>
                    <Label>Stone wt</Label>
                    <Input
                      type="number"
                      value={jewelryFields[l.id]?.stone_weight ?? "0"}
                      onChange={(e) => setJewelryFields((p) => ({
                        ...p,
                        [l.id]: { ...p[l.id], stone_weight: e.target.value },
                      }))}
                    />
                  </div>
                  <div>
                    <Label>Net metal</Label>
                    <Input
                      type="number"
                      value={jewelryFields[l.id]?.net_metal_weight ?? ""}
                      onChange={(e) => setJewelryFields((p) => ({
                        ...p,
                        [l.id]: { ...p[l.id], net_metal_weight: e.target.value },
                      }))}
                      placeholder="gross − stone"
                    />
                  </div>
                </div>
                <div>
                  <Label>Purity</Label>
                  <Input
                    value={jewelryFields[l.id]?.purity ?? "22K"}
                    onChange={(e) => setJewelryFields((p) => ({
                      ...p,
                      [l.id]: { ...p[l.id], purity: e.target.value },
                    }))}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
      {/* Payment at GRN (Issue #3 fix) */}
      {(() => {
        const poTotal = (purchase as any).total_amount ?? (purchase as any).total ?? purchase.lines.reduce((s, l) => s + (l.unit_cost ?? 0) * (l.qty ?? 0), 0);
        const payAmtNum = Number(payAmount) || 0;
        const balanceDue = Math.max(0, poTotal - ((purchase as any).paid_amount ?? (purchase as any).amount_paid ?? 0) - payAmtNum);
        return (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Payment at GRN (Optional)</span>
              <span className="text-xs text-muted-foreground font-mono">PO Total: {fmt(poTotal)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Amount Paid Now</Label>
                <Input type="number" min={0} max={poTotal} placeholder="0" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="mt-1 font-mono" />
              </div>
              <div>
                <Label className="text-xs">Payment Method</Label>
                <select className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="mobile">Mobile Banking</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Reference / Transaction ID</Label>
              <Input placeholder="Optional" value={payRef} onChange={(e) => setPayRef(e.target.value)} className="mt-1 text-xs" />
            </div>
            {payAmtNum > 0 && (
              <div className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-semibold ${balanceDue <= 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"}`}>
                <span>{balanceDue <= 0 ? "Fully paid" : "Balance Due after payment"}</span>
                <span className="font-mono">{balanceDue <= 0 ? fmt(0) : fmt(balanceDue)}</span>
              </div>
            )}
          </div>
        );
      })()}
      <div><Label>Remarks</Label><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
    </PurchaseFormShell>
  );
}

export function PurchaseReturnForm({
  open,
  onOpenChange,
  purchase,
  layout = "drawer",
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchase: ApiPurchase;
  layout?: PurchaseFormLayout;
  onSuccess?: () => void;
}) {
  const ret = usePurchaseReturn();
  const [reason, setReason] = useState("");
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const init: Record<string, string> = {};
    purchase.lines.forEach((l) => {
      const bal = returnableQty(l);
      if (bal > 0) init[l.id] = "1";
    });
    setQtys(init);
    setReason("");
    setErrors({});
  }, [open, purchase]);

  const handleSubmit = async () => {
    const next: Record<string, string> = {};
    if (!reason.trim()) next.reason = "Return reason is required";
    const lines = purchase.lines
      .map((l) => {
        const bal = returnableQty(l);
        const qty = Number(qtys[l.id] ?? 0);
        if (qty <= 0) return null;
        const err = validateReturnQty(qty, bal);
        if (err) next[l.id] = err;
        return { product_id: l.product_id, purchase_line_id: l.id, qty, unit_cost: l.unit_cost };
      })
      .filter(Boolean) as Array<{ product_id: string; purchase_line_id: string; qty: number; unit_cost: number }>;
    if (lines.length === 0) next.form = "Enter return quantity for at least one line";
    setErrors(next);
    if (Object.keys(next).length) return;
    await ret.mutateAsync({ id: purchase.id, body: { reason: reason.trim(), lines } });
    onSuccess?.();
    onOpenChange(false);
  };

  return (
    <PurchaseFormShell
      layout={layout}
      open={open}
      onOpenChange={onOpenChange}
      title={`Return to supplier — ${purchase.invoice_number}`}
      description="Sends received goods back to the supplier. Reduces stock and the supplier balance on save."
      onSubmit={handleSubmit}
      submitLabel="Post return"
      isPending={ret.isPending}
      errorMessage={ret.error instanceof Error ? ret.error.message : null}
      className="sm:max-w-lg"
    >
      <FieldError message={errors.form} />
      <div>
        <Label>Reason</Label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        <FieldError message={errors.reason} />
      </div>
      {purchase.lines.map((l) => {
        const bal = returnableQty(l);
        if (bal <= 0) return null;
        return (
          <div key={l.id} className="rounded-md border border-border p-3">
            <div className="font-medium">{l.product_name ?? l.product_id}</div>
            <div className="text-xs text-muted-foreground">Returnable {bal}</div>
            <Input type="number" min={0} max={bal} value={qtys[l.id] ?? ""} onChange={(e) => setQtys((p) => ({ ...p, [l.id]: e.target.value }))} />
            <FieldError message={errors[l.id]} />
          </div>
        );
      })}
    </PurchaseFormShell>
  );
}

export function SupplierInvoiceForm({
  open,
  onOpenChange,
  purchase,
  layout = "drawer",
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchase: ApiPurchase;
  layout?: PurchaseFormLayout;
  onSuccess?: () => void;
}) {
  const create = useCreateSupplierInvoice();
  const approve = useApproveSupplierInvoice();
  const [invoiceNo, setInvoiceNo] = useState("");
  const [tax, setTax] = useState("0");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setInvoiceNo("");
    setTax(String(purchase.tax_amount ?? 0));
    setErrors({});
  }, [open, purchase]);

  const lines = purchase.lines
    .filter((l) => l.received_qty > 0)
    .map((l) => ({ purchase_line_id: l.id, qty: l.received_qty, unit_cost: l.unit_cost }));

  const handleSubmit = async () => {
    const next: Record<string, string> = {};
    if (!invoiceNo.trim()) next.invoice_no = "Invoice number is required";
    if (lines.length === 0) next.lines = "No received lines to invoice";
    setErrors(next);
    if (Object.keys(next).length) return;
    const inv = await create.mutateAsync({
      purchaseId: purchase.id,
      body: { invoice_no: invoiceNo.trim(), tax_amount: Number(tax) || 0, lines },
    });
    await approve.mutateAsync(inv.id);
    onSuccess?.();
    onOpenChange(false);
  };

  return (
    <PurchaseFormShell
      layout={layout}
      open={open}
      onOpenChange={onOpenChange}
      title={`Supplier invoice — ${purchase.invoice_number}`}
      description="Creates supplier invoice from received quantities and posts AP on approval."
      onSubmit={handleSubmit}
      submitLabel="Create & approve invoice"
      isPending={create.isPending || approve.isPending}
      errorMessage={((create.error ?? approve.error) as Error | null)?.message ?? null}
    >
      <div><Label>Invoice no</Label><Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} /><FieldError message={errors.invoice_no} /></div>
      <div><Label>Tax / VAT</Label><Input type="number" min={0} value={tax} onChange={(e) => setTax(e.target.value)} /></div>
      <FieldError message={errors.lines} />
      <div className="rounded-md border border-border p-3 text-sm">
        {lines.map((l) => {
          const pl = purchase.lines.find((x) => x.id === l.purchase_line_id);
          return (
            <div key={l.purchase_line_id} className="flex justify-between py-1">
              <span>{pl?.product_name} × {l.qty}</span>
              <span className="tabular-nums">{fmt(lineSubtotal(l.qty, l.unit_cost))}</span>
            </div>
          );
        })}
      </div>
    </PurchaseFormShell>
  );
}

export function SupplierPaymentForm({
  open,
  onOpenChange,
  defaultSupplierId,
  layout = "drawer",
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSupplierId?: string;
  layout?: PurchaseFormLayout;
  onSuccess?: () => void;
}) {
  const { data: suppliers } = useApiSuppliers();
  const { data: invoices } = useSupplierInvoices();
  const pay = useCreateSupplierPayment();
  const [supplierId, setSupplierId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setSupplierId(defaultSupplierId ?? "");
    setInvoiceId("");
    setAmount("");
    setMethod("bank");
    setReference("");
    setRemarks("");
    setErrors({});
  }, [open, defaultSupplierId]);

  const supplierInvoices = (invoices ?? []).filter(
    (inv: ApiSupplierInvoice) => inv.supplier_id === supplierId && inv.due_amount > 0,
  );
  const selectedInv = supplierInvoices.find((i) => i.id === invoiceId);

  const handleSubmit = async () => {
    const next: Record<string, string> = {};
    if (!supplierId) next.supplier = "Supplier is required";
    const amt = Number(amount);
    const due = selectedInv?.due_amount ?? 0;
    let amtErr: string | null = null;
    if (!Number.isFinite(amt) || amt <= 0) amtErr = "Payment amount must be greater than zero";
    else if (invoiceId && amt > due + 0.01) amtErr = "Payment cannot exceed invoice due";
    if (amtErr) next.amount = amtErr;
    setErrors(next);
    if (Object.keys(next).length) return;
    await pay.mutateAsync({
      supplier_id: supplierId,
      supplier_invoice_id: invoiceId || undefined,
      purchase_id: selectedInv?.purchase_id,
      amount: amt,
      method,
      reference: reference || remarks || undefined,
    });
    onSuccess?.();
    onOpenChange(false);
  };

  return (
    <PurchaseFormShell
      layout={layout}
      open={open}
      onOpenChange={onOpenChange}
      title="Supplier payment"
      onSubmit={handleSubmit}
      submitLabel="Record payment"
      isPending={pay.isPending}
      errorMessage={pay.error instanceof Error ? pay.error.message : null}
    >
      <div>
        <Label>Supplier</Label>
        <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setInvoiceId(""); }}>
          <option value="">Select…</option>
          {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <FieldError message={errors.supplier} />
      </div>
      <div>
        <Label>Invoice (optional)</Label>
        <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={invoiceId} onChange={(e) => { setInvoiceId(e.target.value); const inv = supplierInvoices.find((i) => i.id === e.target.value); if (inv) setAmount(String(inv.due_amount)); }}>
          <option value="">Pay on account</option>
          {supplierInvoices.map((inv) => (
            <option key={inv.id} value={inv.id}>{inv.invoice_no} — due {fmt(inv.due_amount)}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Amount</Label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /><FieldError message={errors.amount} /></div>
        <div>
          <Label>Method</Label>
          <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="cheque">Cheque</option>
            <option value="mobile">Mobile</option>
          </select>
        </div>
      </div>
      <div><Label>Reference no</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
      <div><Label>Remarks</Label><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
    </PurchaseFormShell>
  );
}

/** One-step create + approve + full GRN receive (auto PO). */
export function DirectPurchaseReceiveForm({
  open,
  onOpenChange,
  defaultStoreId,
  layout = "page",
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStoreId?: string;
  layout?: PurchaseFormLayout;
  onSuccess?: (result: ApiPurchaseReceiveResult) => void;
}) {
  const { data: suppliers } = useApiSuppliers();
  const { data: stores } = useApiStores();
  const [productQ, setProductQ] = useState("");
  const { data: productsPage } = useApiProducts({ q: productQ || undefined, page: 1 });
  const direct = useDirectReceivePurchase();

  const [supplierId, setSupplierId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ApiPurchaseReceiveResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setSupplierId("");
    setStoreId(defaultStoreId ?? "");
    setRemarks("");
    setExpectedDate("");
    setReferenceNo("");
    setDiscount("0");
    setTax("0");
    setLines([emptyLine()]);
    setErrors({});
    setProductQ("");
    setResult(null);
  }, [open, defaultStoreId]);

  const parsedLines = useMemo(
    () =>
      lines
        .filter((l) => l.product_id)
        .map((l) => ({
          product_id: l.product_id,
          industry_pack: l.industry_pack,
          variant_id: l.variant_id || undefined,
          batch_no: l.batch_no?.trim() || undefined,
          expiry_date: l.expiry_date?.trim() || undefined,
          qty: Number(l.qty) || 0,
          unit_cost: Number(l.unit_cost) || 0,
          discount_amount: Number(l.discount) || 0,
          tax_amount: Number(l.tax) || 0,
        })),
    [lines],
  );
  const totals = purchaseTotals(parsedLines, Number(discount) || 0, Number(tax) || 0);

  const addProduct = (productId: string) => {
    const p = productsPage?.items.find((x) => x.id === productId);
    if (!p) return;
    setLines((prev) => {
      const empty = prev.find((l) => !l.product_id);
      const draft: LineDraft = {
        key: empty?.key ?? safeRandomUUID(),
        product_id: p.id,
        product_name: p.name,
        sku: p.sku,
        industry_pack: p.industry_pack ?? "",
        variant_id: "",
        size: "",
        color: "",
        qty: "1",
        unit_cost: String(
          (p as { cost_price?: number | null }).cost_price
          ?? (p as { wholesale_price?: number | null }).wholesale_price
          ?? p.base_price
          ?? 0,
        ),
        discount: "0",
        tax: "0",
      };
      if (empty) return prev.map((l) => (l.key === empty.key ? draft : l));
      return [...prev, draft];
    });
    setProductQ("");
  };

  const handleSubmit = async () => {
    if (result) {
      onOpenChange(false);
      return;
    }
    const next: Record<string, string> = {};
    if (!supplierId) next.supplier = "Supplier is required";
    if (!storeId) next.store = "Store is required";
    if (parsedLines.length === 0) next.lines = "Add at least one line";
    parsedLines.forEach((l, i) => {
      if (l.qty <= 0) next[`line-${i}-qty`] = "Qty must be greater than zero";
      if (l.unit_cost < 0) next[`line-${i}-rate`] = "Rate cannot be negative";
      if (l.industry_pack === "fashion" && !l.variant_id) {
        next[`line-${i}-variant`] = "Fashion lines require size × color";
      }
    });
    setErrors(next);
    if (Object.keys(next).length) return;
    const res = await direct.mutateAsync({
      supplier_id: supplierId,
      store_id: storeId,
      remarks: remarks || undefined,
      expected_date: expectedDate ? `${expectedDate}T00:00:00` : undefined,
      reference_no: referenceNo.trim() || undefined,
      discount_amount: Number(discount) || 0,
      tax_amount: Number(tax) || 0,
      lines: parsedLines.map(({ product_id, qty, unit_cost, variant_id, batch_no, expiry_date, discount_amount, tax_amount }) => ({
        product_id,
        qty,
        unit_cost,
        discount_amount,
        tax_amount,
        ...(variant_id ? { variant_id } : {}),
        ...(batch_no ? { batch_no } : {}),
        ...(expiry_date ? { expiry_date } : {}),
      })),
    });
    setResult(res);
    onSuccess?.(res);
  };

  return (
    <PurchaseFormShell
      layout={layout}
      open={open}
      onOpenChange={onOpenChange}
      title="Direct purchase & receive"
      description="Creates a PO, auto-approves it, posts a full GRN, and increases stock in one step."
      onSubmit={handleSubmit}
      submitLabel={result ? "Done" : "Post purchase & receive"}
      isPending={direct.isPending}
      submitDisabled={!!result}
      errorMessage={direct.error instanceof Error ? direct.error.message : null}
      footer={result ? (
        <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p>Stock posted successfully.</p>
          <p>PO: <span className="font-mono font-semibold">{result.purchase.invoice_number}</span></p>
          <p>GRN: <span className="font-mono font-semibold">{result.receive_no}</span></p>
          <p>Status: <span className="font-semibold">{result.purchase.status}</span></p>
          <Button type="button" className="w-full" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      ) : undefined}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label>Supplier *</Label>
          <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Select supplier…</option>
            {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <FieldError message={errors.supplier} />
        </div>
        <div>
          <Label>Store *</Label>
          <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Select store…</option>
            {(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <FieldError message={errors.store} />
        </div>
        <div>
          <Label>Delivery date</Label>
          <Input type="date" className="mt-1" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </div>
        <div>
          <Label>Supplier ref / bill no</Label>
          <Input className="mt-1" placeholder="Optional" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Add product</Label>
        <div className="mt-1 flex gap-2">
          <Input placeholder="Search SKU or name…" value={productQ} onChange={(e) => setProductQ(e.target.value)} />
          <select className="min-w-[14rem] rounded-md border border-input bg-background px-2 py-2 text-sm" value="" onChange={(e) => e.target.value && addProduct(e.target.value)}>
            <option value="">Pick…</option>
            {(productsPage?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <PurchaseLinesEditor lines={lines} setLines={setLines} errors={errors} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <Label>Remarks</Label>
          <textarea
            className="mt-1 min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="GRN notes — supplier challan, transport, condition…"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
        <OrderTotalsSummary totals={totals} discount={discount} setDiscount={setDiscount} tax={tax} setTax={setTax} />
      </div>
    </PurchaseFormShell>
  );
}

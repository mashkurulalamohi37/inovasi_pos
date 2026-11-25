import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Cpu, RotateCcw, Wrench, Barcode, CreditCard, Search} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";
import { electronicsCatalog } from "@/lib/industry-mock";
import { fmtBDT } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import { PosShell, ProductGrid, PosProductCard } from "./PosShell";
import type { CustomerSelection } from "@/features/sales/CustomerPicker";
import { usePosCatalog, catalogToCartExtras, type PosCatalogItem } from "@/hooks/use-pos-catalog";
import { usePosBarcodeScan } from "@/hooks/use-pos-barcode";
import { validateElectronicsSerial } from "@/hooks/use-industry-data";
import { useCreateElectronicsRma, useCreateElectronicsEmi } from "@/hooks/use-industry-backoffice";
import { useElectronicsSerials } from "@/hooks/use-api-config";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { EmiConfigDialog, type EmiPlan } from "./EmiConfigDialog";

type ElectronicsItem = PosCatalogItem & {
  brand: string;
  model: string;
  warrantyMonths: number;
  serialized: boolean;
  inStock: number;
};

export function ElectronicsPos() {
  const app = useApp();
  const useApi = shouldUseBackend();
  const createRma = useCreateElectronicsRma();
  // Electronics-only EMI: only available when electronics.emi feature flag is on
  const createEmi = useCreateElectronicsEmi();
  const [emiOpen, setEmiOpen] = useState(false);
  const [emiPlan, setEmiPlan] = useState<EmiPlan | null>(null);
  // PosShell owns the authoritative bill (manual discount, campaign, tax), so the
  // EMI plan is priced off what PosShell reports rather than a second derivation.
  const [posTotal, setPosTotal] = useState(0);
  const [posCustomer, setPosCustomer] = useState<CustomerSelection | undefined>();
  // Scoped to the product being sold and only fetched while the capture dialog is
  // open. Previously this pulled every available serial in the company and
  // narrowed it in the browser, which silently lost options once the endpoint
  // started paging.
  const [serialOpen, setSerialOpen] = useState<ElectronicsItem | null>(null);
  const availableSerials = useElectronicsSerials({
    status: "available",
    product_id: serialOpen?.id,
    enabled: !!serialOpen,
  });
  const [serial, setSerial] = useState("");
  const [validating, setValidating] = useState(false);
  const [rmaOpen, setRmaOpen] = useState(false);
  const [rmaForm, setRmaForm] = useState({
    invoice: "",
    customer: "",
    product: "",
    serial: "",
    warrantyStatus: "Active",
    reason: "",
    actionType: "return",
    conditionNote: "",
  });

  const demoItems = useMemo(
    (): ElectronicsItem[] =>
      electronicsCatalog.map((e) => ({
        id: e.sku,
        sku: e.sku,
        name: e.name,
        price: e.price,
        stock: e.inStock,
        meta: {
          brand: e.brand,
          model: e.model,
          warrantyMonths: e.warrantyMonths,
          serialized: e.serialized,
        },
        brand: e.brand,
        model: e.model,
        warrantyMonths: e.warrantyMonths,
        serialized: e.serialized,
        inStock: e.inStock,
      })),
    [],
  );

  const catalog = usePosCatalog("electronics", demoItems);

  const items = useMemo((): ElectronicsItem[] => {
    if (catalog.fromBackend) {
      return catalog.items.map((p) => {
        const fallback = electronicsCatalog.find((x) => x.sku === p.sku);
        const isSerializedProd =
          p.meta?.serialized === true ||
          p.meta?.serial_tracked === true ||
          p.meta?.serialized === "true" ||
          p.meta?.serial_tracked === "true" ||
          (p.meta?.serialized === undefined && p.meta?.serial_tracked === undefined ? (fallback?.serialized ?? false) : false);

        return {
          ...p,
          brand: String(p.meta?.brand ?? fallback?.brand ?? ""),
          model: String(p.meta?.model ?? fallback?.model ?? ""),
          warrantyMonths: Number(p.meta?.warrantyMonths ?? p.meta?.warranty_months ?? fallback?.warrantyMonths ?? 12),
          serialized: isSerializedProd,
          inStock: p.stock || (fallback?.inStock ?? 10),
        };
      });
    }
    return catalog.items as ElectronicsItem[];
  }, [catalog.fromBackend, catalog.items]);

  const isSerialized = (e: ElectronicsItem) =>
    Boolean(
      e.serialized === true ||
      e.meta?.serialized === true ||
      e.meta?.serial_tracked === true ||
      e.meta?.serialized === "true" ||
      e.meta?.serial_tracked === "true"
    );

  const addWithoutSerial = (e: ElectronicsItem) => {
    app.addToCart({
      sku: e.sku,
      name: `${e.brand} ${e.name}`.trim() || e.name,
      meta: e.model,
      price: e.price,
      qty: 1,
      industry: "electronics",
      extras: {
        ...catalogToCartExtras(e),
        brand: e.brand,
        model: e.model,
        serial: "N/A",
        warrantyMonths: e.warrantyMonths,
        product_id: e.id,
      },
    });
    setSerialOpen(null);
    setSerial("");
    toast.success("Added item to cart");
  };

  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return items;
    return items.filter((e) =>
      [e.name, e.sku, e.brand, e.model, e.meta?.category, e.barcode, e.meta?.barcode].some((x) =>
        String(x ?? "").toLowerCase().includes(q)
      )
    );
  }, [items, search]);

  const {
    barcode,
    setBarcode,
    handleScan,
    isPending: barcodePending,
  } = usePosBarcodeScan({
    fromBackend: useApi && catalog.fromBackend,
    catalogItems: items,
    onAdd: (item) => {
      const e =
        items.find((x) => x.id === item.id || x.sku === item.sku) ??
        ({
          ...item,
          brand: String(item.meta?.brand ?? ""),
          model: String(item.meta?.model ?? ""),
          warrantyMonths: Number(item.meta?.warrantyMonths ?? 12),
          serialized: Boolean(item.meta?.serialized ?? item.meta?.serial_tracked ?? false),
          inStock: item.stock,
        } as ElectronicsItem);
      if (isSerialized(e) && app.isFeatureEnabled("electronics.serial")) {
        setSerialOpen(e);
        setSerial("");
      } else {
        app.addToCart({
          sku: e.sku,
          name: e.name,
          meta: e.model,
          price: e.price,
          qty: 1,
          industry: "electronics",
          extras: {
            ...catalogToCartExtras(e),
            brand: e.brand,
            model: e.model,
            warrantyMonths: e.warrantyMonths,
          },
        });
      }
    },
  });

  const handleElectronicsScan = async () => {
    const code = (barcode || search).trim();
    if (!code) return;
    setBarcode(code);
    const match = items.find(
      (i) =>
        (i.barcode && i.barcode.toLowerCase() === code.toLowerCase()) ||
        (i.meta?.barcode && String(i.meta.barcode).toLowerCase() === code.toLowerCase()) ||
        i.sku.toLowerCase() === code.toLowerCase()
    );
    if (match) {
      if (isSerialized(match) && app.isFeatureEnabled("electronics.serial")) {
        setSerialOpen(match);
        setSerial("");
      } else {
        app.addToCart({
          sku: match.sku,
          name: match.name,
          meta: match.model,
          price: match.price,
          qty: 1,
          industry: "electronics",
          extras: {
            ...catalogToCartExtras(match),
            brand: match.brand,
            model: match.model,
            warrantyMonths: match.warrantyMonths,
          },
        });
      }
      setBarcode("");
      setSearch("");
      return;
    }
    if (filtered.length === 1) {
      const single = filtered[0];
      if (isSerialized(single) && app.isFeatureEnabled("electronics.serial")) {
        setSerialOpen(single);
        setSerial("");
      } else {
        app.addToCart({
          sku: single.sku,
          name: single.name,
          meta: single.model,
          price: single.price,
          qty: 1,
          industry: "electronics",
          extras: {
            ...catalogToCartExtras(single),
            brand: single.brand,
            model: single.model,
            warrantyMonths: single.warrantyMonths,
          },
        });
      }
      setBarcode("");
      setSearch("");
      return;
    }
    await handleScan();
    setBarcode("");
    setSearch("");
  };

  const confirmAdd = async () => {
    if (!serialOpen) return;
    if (isSerialized(serialOpen) && app.isFeatureEnabled("electronics.serial") && !serial.trim()) {
      toast.error("Serial/IMEI required");
      return;
    }
    let serialId: string | undefined;
    let imeiNo: string | undefined;
    if (useApi && serial.trim()) {
      setValidating(true);
      try {
        const res = await validateElectronicsSerial(serial.trim(), serialOpen.id);
        if (!res.valid || !res.available) {
          toast.error(
            res.detail ||
              (res.valid ? "Serial already sold or unavailable" : "Serial/IMEI not found"),
          );
          return;
        }
        serialId = res.serial_id;
        imeiNo = res.imei_no ?? undefined;
      } catch (e: unknown) {
        toast.error(String((e as { detail?: string }).detail ?? "Serial validation failed"));
        return;
      } finally {
        setValidating(false);
      }
    }
    app.addToCart({
      sku: serialOpen.sku,
      name: `${serialOpen.brand} ${serialOpen.name}`.trim() || serialOpen.name,
      meta: serialOpen.model,
      price: serialOpen.price,
      qty: 1,
      industry: "electronics",
      extras: {
        ...catalogToCartExtras(serialOpen),
        brand: serialOpen.brand,
        model: serialOpen.model,
        serial: serial || "N/A",
        // Cart extras are string|number|boolean — omit rather than carry undefined.
        ...(serial ? { serial_imei: serial } : {}),
        ...(serialId ? { serial_id: serialId } : {}),
        ...(imeiNo ? { imei_no: imeiNo } : {}),
        warrantyMonths: serialOpen.warrantyMonths,
        product_id: serialOpen.id,
      },
    });
    setSerialOpen(null);
    setSerial("");
  };

  const productSerialOptions = useMemo(() => {
    if (!serialOpen || !useApi) return [];
    return (availableSerials.data ?? []).filter(
      (s) =>
        String(s.product_id) === serialOpen.id ||
        String(s.product_sku ?? "") === serialOpen.sku ||
        String(s.product_id) === serialOpen.sku,
    );
  }, [availableSerials.data, serialOpen, useApi]);

  return (
    <>
      <PosShell
        industry="electronics"
        title="Electronics POS"
        subtitle="Serial · warranty · service · accessories"
        receiptNote="Warranty & service contact on receipt"
        onTotalsChange={(t) => setPosTotal(t.total)}
        onCustomerChange={setPosCustomer}
        headerBadges={
          <>
            {app.isFeatureEnabled("electronics.return_replacement") &&
              app.isFeatureEnabled("electronics.return") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1"
                  onClick={() => setRmaOpen(true)}
                >
                  <RotateCcw className="h-3 w-3" /> RMA / Return
                </Button>
              )}
            {app.isFeatureEnabled("electronics.service_job") && (
              <DisabledReasonButton
                label="Service job"
                reason="Service job cards deferred — use RMA workflow"
                icon={<Wrench className="h-3 w-3" />}
              />
            )}
            {/* Electronics-only: EMI tender — not available in any other POS vertical */}
            {app.isFeatureEnabled("electronics.emi") && app.cart.length > 0 && (
              <Button
                size="sm"
                variant={emiPlan ? "default" : "outline"}
                className={`h-7 gap-1 ${emiPlan ? "bg-violet-600 hover:bg-violet-700 text-white" : "border-violet-400/50 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20"}`}
                onClick={() => setEmiOpen(true)}
              >
                <CreditCard className="h-3 w-3" />{" "}
                {emiPlan ? `${emiPlan.bankName} (${emiPlan.tenure}mo)` : "EMI"}
              </Button>
            )}
          </>
        }
        cartLineExtra={(l) =>
          l.extras ? (
            <div className="text-[10px] text-muted-foreground">
              SN {String(l.extras.serial)} · {String(l.extras.warrantyMonths)}mo warranty
            </div>
          ) : null
        }
        onBeforeComplete={async () => {
          const missing = app.cart.some((l) => {
            const e = items.find((x) => x.sku === l.sku);
            return (
              e &&
              isSerialized(e) &&
              app.isFeatureEnabled("electronics.serial") &&
              (!l.extras?.serial || l.extras.serial === "N/A")
            );
          });
          if (missing) {
            toast.error("Capture serial/IMEI for all serialized items");
            return false;
          }
          // The plan is priced against the bill as it stood when it was confirmed.
          // If the cart moved afterwards, the schedule no longer matches what is
          // being charged, so the operator must reconfigure rather than have us
          // silently file an agreement with mismatched figures.
          if (emiPlan && Math.round(emiPlan.pricedAgainstTotal) !== Math.round(posTotal)) {
            toast.error("Cart changed after the EMI plan was set", {
              description: "Reconfigure the EMI plan to match the new total.",
            });
            setEmiPlan(null);
            return false;
          }
          if (emiPlan) {
            const firstItem = app.cart[0];
            const emiPayload = {
              principal_amount: posTotal,
              down_payment: emiPlan.downPayment,
              processing_fee: emiPlan.processingFee,
              interest_rate: emiPlan.interestRate,
              tenure_months: emiPlan.tenure,
              bank_financier: emiPlan.bankName,
              customer_name: posCustomer?.name || "Walk-in Customer",
              customer_phone: posCustomer?.phone || undefined,
              product_name: firstItem?.name || "Electronics Item",
              serial_imei: firstItem?.extras?.serial || undefined,
            };
            if (useApi) {
              // Awaited, and the sale is aborted on failure. Fire-and-forget here
              // meant a failed registration still closed the sale, leaving the
              // customer financed with no agreement on record — and the plan was
              // left set, so the next sale silently filed a duplicate.
              try {
                await createEmi.mutateAsync(emiPayload);
                toast.success("EMI agreement created");
                setEmiPlan(null);
              } catch (err: unknown) {
                toast.error("EMI registration failed — sale not completed", {
                  description: String(
                    (err as { detail?: string })?.detail ??
                      (err as Error)?.message ??
                      "Please retry.",
                  ),
                });
                return false;
              }
            } else {
              // Demo dataset. Awaited so a failure here aborts the sale too, and
              // keyed off a unique id rather than array length, which repeated
              // numbers as soon as anything was removed.
              const { emiSchedules } = await import("@/lib/industry-mock");
              const uid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
              const emiNo = `EMI-DEMO-${uid}`;
              const monthly = emiPlan.monthlyAmount;
              const installments = Array.from({ length: emiPlan.tenure }, (_, i) => {
                const due = new Date();
                due.setMonth(due.getMonth() + i + 1);
                return {
                  id: `${emiNo}-inst-${i + 1}`,
                  installment_no: i + 1,
                  due_date: due.toISOString().slice(0, 10),
                  amount: monthly,
                  status: "pending" as const,
                };
              });
              emiSchedules.unshift({
                id: `demo-${uid}`,
                emi_no: emiNo,
                customer_name: posCustomer?.name || "Walk-in Customer",
                customer_phone: posCustomer?.phone ?? undefined,
                product_name: firstItem?.name || "Electronics Item",
                serial_imei:
                  firstItem?.extras?.serial == null ? undefined : String(firstItem.extras.serial),
                bank_financier: emiPlan.bankName,
                tenure_months: emiPlan.tenure,
                principal_amount: posTotal,
                down_payment: emiPlan.downPayment,
                processing_fee: emiPlan.processingFee,
                interest_rate: emiPlan.interestRate,
                monthly_amount: monthly,
                total_payable: emiPlan.totalPayable,
                // Mirrors the backend: total_payable is the financed balance and
                // already excludes the down payment, so collection starts at 0.
                total_collected: 0,
                status: "active",
                first_due_date: emiPlan.firstDueDate,
                installments,
              });
              toast.success(`EMI agreement ${emiNo} registered`);
              setEmiPlan(null);
            }
          }
          return true;
        }}
        catalog={
          <>
            <form
              className="mb-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void handleElectronicsScan();
              }}
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9 pr-9"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setBarcode(e.target.value);
                  }}
                  placeholder="Search SKU, brand, model, or scan barcode (Enter to add)…"
                />
                <Barcode className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
              </div>
              <Button type="submit" disabled={barcodePending}>
                Scan
              </Button>
            </form>
            <ProductGrid
              items={filtered}
              onAdd={(item) => {
                const e = item as ElectronicsItem;
                if (isSerialized(e) && app.isFeatureEnabled("electronics.serial")) {
                  setSerialOpen(e);
                  // Never pre-fill. This used to invent `SN-<model>-<random>`,
                  // which sailed past the serial-required check and wrote a
                  // serial that matches no physical unit onto the sale.
                  setSerial("");
                } else {
                  app.addToCart({
                    sku: e.sku,
                    name: e.name,
                    meta: e.model,
                    price: e.price,
                    qty: 1,
                    industry: "electronics",
                    extras: {
                      ...catalogToCartExtras(e),
                      brand: e.brand,
                      model: e.model,
                      warrantyMonths: e.warrantyMonths,
                    },
                  });
                }
              }}
              renderCard={(item) => {
                const e = item as ElectronicsItem;
                return (
                  <PosProductCard
                    badge={e.brand}
                    title={e.name}
                    subtitle={`${e.model} · ${e.warrantyMonths}mo`}
                    price={fmtBDT(e.price)}
                    industry="electronics"
                    sku={e.sku}
                    imageUrl={(e.meta?.image_url as string) || (e.meta?.image as string)}
                    footer={
                      <div className="mt-1 flex gap-1">
                        {isSerialized(e) && (
                          <Badge variant="outline" className="text-[9px]">
                            Serialized
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-[9px]">
                          {e.inStock ?? e.stock} in stock
                        </Badge>
                      </div>
                    }
                  />
                );
              }}
            />
          </>
        }
      />

      <Dialog open={!!serialOpen} onOpenChange={(v) => !v && setSerialOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5" /> Serial / IMEI capture
            </DialogTitle>
          </DialogHeader>
          <Label>{serialOpen?.name}</Label>
          {useApi && productSerialOptions.length > 0 && (
            <Select value={serial || undefined} onValueChange={setSerial}>
              <SelectTrigger>
                <SelectValue placeholder="Select available serial" />
              </SelectTrigger>
              <SelectContent>
                {productSerialOptions.map((s) => (
                  <SelectItem key={String(s.id)} value={String(s.serial_no ?? s.serial_imei)}>
                    {String(s.serial_no ?? s.serial_imei)}
                    {s.imei_no ? ` · IMEI ${String(s.imei_no)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            className="font-mono"
            placeholder="Scan or enter serial / IMEI"
          />
          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={() => serialOpen && addWithoutSerial(serialOpen)}
            >
              Skip (Sell Non-Tracked)
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSerialOpen(null)}>
                Cancel
              </Button>
              <Button onClick={confirmAdd} disabled={validating}>
                {validating ? "Validating…" : "Add to cart"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rmaOpen} onOpenChange={setRmaOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>RMA / Return · Replacement</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Invoice number</Label>
              <Input
                value={rmaForm.invoice}
                onChange={(e) => setRmaForm((f) => ({ ...f, invoice: e.target.value }))}
              />
            </div>
            <div>
              <Label>Customer</Label>
              <Input
                value={rmaForm.customer}
                onChange={(e) => setRmaForm((f) => ({ ...f, customer: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Product</Label>
              <Input
                value={rmaForm.product}
                onChange={(e) => setRmaForm((f) => ({ ...f, product: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Serial / IMEI</Label>
              <Input
                value={rmaForm.serial}
                onChange={(e) => setRmaForm((f) => ({ ...f, serial: e.target.value }))}
                className="font-mono"
              />
            </div>
            <div>
              <Label>Action type</Label>
              <Select
                value={rmaForm.actionType}
                onValueChange={(v) => setRmaForm((f) => ({ ...f, actionType: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["return", "replacement", "repair", "supplier_claim"].map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Problem description</Label>
              <Input
                value={rmaForm.reason}
                onChange={(e) => setRmaForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Condition note</Label>
              <Input
                value={rmaForm.conditionNote}
                onChange={(e) => setRmaForm((f) => ({ ...f, conditionNote: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRmaOpen(false)}>
              Cancel
            </Button>
            {useApi ? (
              <Button
                disabled={createRma.isPending}
                onClick={async () => {
                  if (!rmaForm.serial.trim()) {
                    toast.error("Serial/IMEI required");
                    return;
                  }
                  if (!rmaForm.reason.trim()) {
                    toast.error("Problem description required");
                    return;
                  }
                  try {
                    await createRma.mutateAsync({
                      serial_imei: rmaForm.serial.trim(),
                      customer_name: rmaForm.customer,
                      product_name: rmaForm.product,
                      invoice_number: rmaForm.invoice || undefined,
                      problem_description: rmaForm.reason.trim(),
                      action_type: rmaForm.actionType,
                      condition_note: rmaForm.conditionNote || undefined,
                      warranty_status: rmaForm.warrantyStatus.toLowerCase(),
                    });
                    setRmaOpen(false);
                  } catch (e: unknown) {
                    toast.error(
                      String(
                        (e as { detail?: string; message?: string }).detail ??
                          (e as Error).message ??
                          "RMA failed",
                      ),
                    );
                  }
                }}
              >
                {createRma.isPending ? "Submitting…" : "Submit RMA"}
              </Button>
            ) : (
              <DisabledReasonButton label="Submit RMA" reason="Enable backend mode to create RMA" />
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Electronics-only EMI Configuration Dialog */}
      <EmiConfigDialog
        open={emiOpen}
        onOpenChange={setEmiOpen}
        total={posTotal}
        onConfirm={(plan) => {
          setEmiPlan(plan);
          toast.success(
            `EMI Plan selected: ${plan.bankName} (${plan.tenure} months @ ${fmtBDT(plan.monthlyAmount)}/mo)`,
          );
          // Optionally create EMI agreement via backend if enabled or store plan in cart/sale
        }}
      />
    </>
  );
}

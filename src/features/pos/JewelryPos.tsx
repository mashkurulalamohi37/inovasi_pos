import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Gem, TrendingUp, Barcode, Scale, Wrench, Search} from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { useApp } from "@/lib/app-store";
import { OldGoldTradeInDialog, type OldGoldTradeIn } from "./OldGoldTradeInDialog";
import { jewelryCatalog } from "@/lib/industry-mock";
import { fmtBDT } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import { PosShell, ProductGrid, PosProductCard } from "./PosShell";
import type { CustomerSelection } from "@/features/sales/CustomerPicker";
import { usePosCatalog, catalogToCartExtras, type PosCatalogItem } from "@/hooks/use-pos-catalog";
import { lookupJewelryCertificate, useGoldRate } from "@/hooks/use-industry-data";
import {
  useCreateJewelryRate,
  useJewelryQuote,
  useCreateJewelryBuyback,
} from "@/hooks/use-industry-backoffice";
import { useBarcodeLookup } from "@/hooks/use-api-config";
import { barcodeLookupToCatalogItem, lookupBarcodeLocal } from "@/lib/barcode-pos";
import { formatApiError, type ApiError } from "@/lib/api";
import { gramsToBhori } from "@/lib/jewelry-units";

type JewelryItem = PosCatalogItem & {
  metal: string;
  karat: number | string;
  grossWeight: number;
  netWeight: number;
  stoneWeight: number;
  makingChargePerGram: number;
  makingChargeType: string;
  wastagePercentage: number;
  stoneValue: number;
  certificate: string;
  certificateRequired: boolean;
  certificateId?: string;
};

type Breakdown = {
  metal_value: number;
  making_charge: number;
  wastage_value: number;
  stone_value: number;
  gross_amount: number;
  discount_amount: number;
  tax_amount: number;
  net_amount: number;
  metal_rate?: number;
};

function localCalc(j: JewelryItem, rate: number, wastageOn: boolean): Breakdown {
  const metalValue =
    j.metal === "Gold" || j.metal === "gold" ? j.netWeight * rate : j.netWeight * 120;
  const making = j.netWeight * j.makingChargePerGram;
  const stone = j.stoneValue || j.stoneWeight * 5000;
  const wastage = wastageOn ? metalValue * ((j.wastagePercentage || 2) / 100) : 0;
  const gross = Math.round(metalValue + making + stone + wastage);
  const tax = Math.round(gross * 0.05);
  return {
    metal_value: Math.round(metalValue),
    making_charge: Math.round(making),
    wastage_value: Math.round(wastage),
    stone_value: Math.round(stone),
    gross_amount: gross,
    discount_amount: 0,
    tax_amount: tax,
    net_amount: gross + tax,
    metal_rate: rate,
  };
}

function karatLabel(k: number | string): string {
  const s = String(k);
  if (s.endsWith("K") || s === "925" || s === "999" || s === "950") return s;
  return `${s}K`;
}

export function JewelryPos() {
  const app = useApp();
  const useApi = shouldUseBackend();
  const [rateOpen, setRateOpen] = useState(false);
  const [localRate, setLocalRate] = useState(String(app.goldRatePerGram));
  const [overrideReason, setOverrideReason] = useState("");
  const [pendingItem, setPendingItem] = useState<JewelryItem | null>(null);
  const [certInput, setCertInput] = useState("");
  const [breakdownOpen, setBreakdownOpen] = useState<JewelryItem | null>(null);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [quotedRate, setQuotedRate] = useState<number | null>(null);
  const [barcode, setBarcode] = useState("");
  const [search, setSearch] = useState("");
  const [scanPending, setScanPending] = useState(false);
  const [tradeInOpen, setTradeInOpen] = useState(false);
  const [tradeIn, setTradeIn] = useState<OldGoldTradeIn | null>(null);
  // Mirrored out of PosShell rather than read off the app store: `app.total` and
  // `app.selectedCustomer` do not exist, so the dialog showed a ৳0 cart and every
  // buyback ticket was filed against "Walk-in Customer".
  const [cartTotal, setCartTotal] = useState(0);
  const [customer, setCustomer] = useState<CustomerSelection | undefined>();
  const createRate = useCreateJewelryRate();
  const createBuyback = useCreateJewelryBuyback();
  const quote = useJewelryQuote();
  const barcodeLookup = useBarcodeLookup();

  const demoItems = useMemo(
    (): JewelryItem[] =>
      jewelryCatalog.map((j) => ({
        id: j.sku,
        sku: j.sku,
        name: j.name,
        price: 0,
        stock: 1,
        meta: {},
        metal: j.metal,
        karat: j.karat,
        grossWeight: j.grossWeight,
        netWeight: j.netWeight,
        stoneWeight: j.stoneWeight,
        makingChargePerGram: j.makingChargePerGram,
        makingChargeType: "per_gram",
        wastagePercentage: 2,
        stoneValue: j.stoneWeight * 5000,
        certificate: j.certificate ?? "",
        certificateRequired: Boolean(j.certificate),
      })),
    [],
  );

  const catalog = usePosCatalog("jewelry", demoItems);
  const goldRateQuery = useGoldRate();

  useEffect(() => {
    if (goldRateQuery.data?.rate_per_gram) {
      app.setGoldRatePerGram(goldRateQuery.data.rate_per_gram);
      setLocalRate(String(goldRateQuery.data.rate_per_gram));
    }
  }, [goldRateQuery.data?.rate_per_gram]);

  const items = useMemo((): JewelryItem[] => {
    if (catalog.fromBackend) {
      return catalog.items.map((p) => {
        const fallback = jewelryCatalog.find((j) => j.sku === p.sku) as any;
        return {
          ...p,
          metal: String(p.meta?.metal ?? fallback?.metal ?? "Gold"),
          karat: (p.meta?.karat as string | number | undefined) ?? fallback?.karat ?? "22K",
          grossWeight: Number(p.meta?.grossWeight ?? p.meta?.gross_weight ?? fallback?.grossWeight ?? 10.0),
          netWeight: Number(p.meta?.netWeight ?? p.meta?.net_weight ?? p.meta?.net_metal_weight ?? fallback?.netWeight ?? 9.5),
          stoneWeight: Number(p.meta?.stoneWeight ?? p.meta?.stone_weight ?? fallback?.stoneWeight ?? 0.5),
          makingChargePerGram: Number(p.meta?.makingChargePerGram ?? p.meta?.making_charge_rate ?? fallback?.makingChargePerGram ?? 800),
          makingChargeType: String(p.meta?.making_charge_type ?? fallback?.makingChargeType ?? "per_gram"),
          wastagePercentage: Number(p.meta?.wastage_percentage ?? fallback?.wastagePercentage ?? 2),
          stoneValue: Number(p.meta?.default_stone_value ?? fallback?.stoneValue ?? 0),
          certificate: String(p.meta?.certificate ?? p.meta?.tag_no ?? fallback?.certificate ?? `CERT-${p.sku}`),
          certificateRequired: false,
        };
      });
    }
    return catalog.items as JewelryItem[];
  }, [catalog.fromBackend, catalog.items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return items;
    return items.filter((j) =>
      [j.name, j.sku, j.metal, j.karat, j.barcode, j.meta?.barcode, j.meta?.tag_no].some((x) =>
        String(x ?? "").toLowerCase().includes(q)
      )
    );
  }, [items, search]);

  const handleJewelryScan = async () => {
    const code = (barcode || search).trim();
    if (!code) return;
    setBarcode(code);
    const match = items.find(
      (i) =>
        (i.barcode && i.barcode.toLowerCase() === code.toLowerCase()) ||
        (i.meta?.barcode && String(i.meta.barcode).toLowerCase() === code.toLowerCase()) ||
        (i.meta?.tag_no && String(i.meta.tag_no).toLowerCase() === code.toLowerCase()) ||
        i.sku.toLowerCase() === code.toLowerCase()
    );
    if (match) {
      beginAdd(match as JewelryItem);
      setBarcode("");
      setSearch("");
      return;
    }
    if (filtered.length === 1) {
      beginAdd(filtered[0] as JewelryItem);
      setBarcode("");
      setSearch("");
      return;
    }
    await handleScan();
    setBarcode("");
    setSearch("");
  };

  const calcPrice = (j: JewelryItem) =>
    localCalc(j, app.goldRatePerGram, app.isFeatureEnabled("jewelry.wastage_pct")).net_amount;

  const quoteAndShow = async (j: JewelryItem) => {
    let bd = localCalc(j, app.goldRatePerGram, app.isFeatureEnabled("jewelry.wastage_pct"));
    let rateUsed = app.goldRatePerGram;
    if (useApi) {
      try {
        const q = await quote.mutateAsync({
          product_id: j.id,
          metal_type: j.metal,
          karat: karatLabel(j.karat),
          net_metal_weight: j.netWeight,
          gross_weight: j.grossWeight,
          stone_weight: j.stoneWeight,
          making_charge_type: j.makingChargeType,
          making_charge_rate: j.makingChargePerGram,
          wastage_percentage: app.isFeatureEnabled("jewelry.wastage_pct") ? j.wastagePercentage : 0,
          stone_value: j.stoneValue,
          certificate_no: j.certificate || undefined,
          for_sale: Boolean(j.certificate),
        });
        const b = (q.breakdown as Breakdown) || q;
        rateUsed = Number(q.metal_rate ?? app.goldRatePerGram);
        bd = {
          metal_value: Number(b.metal_value ?? 0),
          making_charge: Number(b.making_charge ?? 0),
          wastage_value: Number(b.wastage_value ?? 0),
          stone_value: Number(b.stone_value ?? 0),
          gross_amount: Number(b.gross_amount ?? 0),
          discount_amount: Number(b.discount_amount ?? 0),
          tax_amount: Number(b.tax_amount ?? 0),
          net_amount: Number(b.net_amount ?? q.net_amount ?? 0),
          metal_rate: rateUsed,
        };
      } catch (e: unknown) {
        toast.error(
          String(
            (e as { detail?: string; message?: string }).detail ??
              (e as Error).message ??
              "Quote failed",
          ),
        );
        return;
      }
    }
    setQuotedRate(rateUsed);
    setBreakdown(bd);
    setBreakdownOpen(j);
  };

  const beginAdd = (j: JewelryItem) => {
    const needsCert =
      useApi &&
      (j.certificateRequired || app.isFeatureEnabled("jewelry.certificate")) &&
      !j.certificate;
    if (needsCert) {
      setPendingItem(j);
      setCertInput("");
      return;
    }
    void quoteAndShow(j);
  };

  const confirmCertificate = async () => {
    if (!pendingItem) return;
    const code = certInput.trim();
    if (!code) {
      toast.error("Certificate / tag required");
      return;
    }
    let next = { ...pendingItem, certificate: code };
    if (useApi) {
      try {
        const cert = await lookupJewelryCertificate(code);
        if (cert.status === "sold") {
          toast.error(`Certificate already sold: ${code}`);
          return;
        }
        if (cert.product_id && cert.product_id !== pendingItem.id) {
          toast.error("Certificate does not match selected product");
          return;
        }
        next = {
          ...next,
          certificate: cert.certificate_no || code,
          certificateId: cert.id,
          grossWeight: Number(cert.gross_weight ?? next.grossWeight),
          netWeight: Number(cert.net_metal_weight ?? next.netWeight),
          stoneWeight: Number(cert.stone_weight ?? next.stoneWeight),
          karat: cert.purity || next.karat,
          metal: cert.metal_type || next.metal,
        };
      } catch (e: unknown) {
        toast.error(formatApiError(e as ApiError) || "Certificate not found");
        return;
      }
    }
    setPendingItem(null);
    await quoteAndShow(next);
  };

  const confirmAdd = () => {
    if (!breakdownOpen || !breakdown) return;
    const j = breakdownOpen;
    const rate = quotedRate ?? breakdown.metal_rate ?? app.goldRatePerGram;
    app.addToCart({
      sku: j.sku,
      name: j.name,
      price: breakdown.net_amount,
      qty: 1,
      industry: "jewelry",
      extras: {
        ...catalogToCartExtras(j),
        metal: j.metal,
        karat: j.karat,
        purity: karatLabel(j.karat),
        grossWeight: j.grossWeight,
        netWeight: j.netWeight,
        net_metal_weight: j.netWeight,
        stoneWeight: j.stoneWeight,
        makingCharge: breakdown.making_charge,
        goldRate: rate,
        metal_rate: rate,
        metal_value: breakdown.metal_value,
        wastage_value: breakdown.wastage_value,
        stone_value: breakdown.stone_value,
        gross_amount: breakdown.gross_amount,
        certificate: j.certificate,
        certificate_no: j.certificate,
        // Cart extras carry primitives only; an absent id must be omitted rather
        // than serialised as undefined.
        ...(j.certificateId ? { certificate_id: j.certificateId } : {}),
        amount: breakdown.net_amount,
      },
    });
    setBreakdownOpen(null);
    setBreakdown(null);
    setQuotedRate(null);
  };

  const handleScan = async () => {
    const code = barcode.trim();
    if (!code) return;
    setScanPending(true);
    try {
      if (useApi && catalog.fromBackend) {
        try {
          const cert = await lookupJewelryCertificate(code);
          if (cert.status === "sold") {
            toast.error(`Certificate already sold: ${code}`);
            return;
          }
          const product =
            items.find((x) => x.id === cert.product_id) ??
            items.find((x) => x.sku === cert.product_sku);
          if (!product) {
            toast.error("Certificate product not in POS catalog");
            return;
          }
          const enriched: JewelryItem = {
            ...product,
            certificate: cert.certificate_no || code,
            certificateId: cert.id,
            certificateRequired: true,
            grossWeight: Number(cert.gross_weight ?? product.grossWeight),
            netWeight: Number(cert.net_metal_weight ?? product.netWeight),
            stoneWeight: Number(cert.stone_weight ?? product.stoneWeight),
            karat: cert.purity || product.karat,
            metal: cert.metal_type || product.metal,
          };
          setBarcode("");
          await quoteAndShow(enriched);
          return;
        } catch {
          // fall through to product barcode
        }
        try {
          const hit = await barcodeLookup.mutateAsync(code);
          const stockRow = items.find((i) => i.id === hit.id);
          const item = barcodeLookupToCatalogItem(hit, stockRow?.stock ?? 0);
          const j = items.find((x) => x.id === item.id || x.sku === item.sku);
          if (j) {
            setBarcode("");
            beginAdd(j);
            return;
          }
          toast.error("Product not found");
        } catch (err) {
          toast.error(formatApiError(err as ApiError) || "Product not found");
        }
        return;
      }
      const hit = lookupBarcodeLocal(code, items);
      if (!hit) {
        toast.error("Product not found");
        return;
      }
      const j = items.find((x) => x.id === hit.id || x.sku === hit.sku);
      if (j) {
        setBarcode("");
        beginAdd(j);
      }
    } finally {
      setScanPending(false);
    }
  };

  return (
    <>
      <PosShell
        industry="jewelry"
        title="Jewelry POS"
        subtitle={`Gold rate ${fmtBDT(app.goldRatePerGram)}/g · ${app.store}`}
        taxRate={0.05}
        receiptNote="Certificate & weight on receipt"
        onTotalsChange={(t) => setCartTotal(t.total)}
        onCustomerChange={setCustomer}
        headerBadges={
          <>
            {app.isFeatureEnabled("jewelry.gold_rate") && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1"
                onClick={() => setRateOpen(true)}
              >
                <TrendingUp className="h-3 w-3" /> Gold rate
              </Button>
            )}
            {app.isFeatureEnabled("jewelry.buyback") && (
              <Button
                size="sm"
                variant={tradeIn ? "default" : "outline"}
                className={`h-7 gap-1 ${tradeIn ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-amber-400/50 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"}`}
                onClick={() => setTradeInOpen(true)}
              >
                <Scale className="h-3 w-3" />{" "}
                {tradeIn ? `Credit ${fmtBDT(tradeIn.finalValuation)}` : "Old Gold Trade-In"}
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 gap-1" asChild>
              <Link to="/app/sales">Exchange / return</Link>
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1" asChild>
              <Link to="/app/jewelry/buyback">Buyback</Link>
            </Button>
          </>
        }
        cartLineExtra={(l) =>
          l.extras ? (
            <div className="text-[10px] text-muted-foreground">
              {String(l.extras.metal)} {String(l.extras.purity ?? l.extras.karat)} ·{" "}
              {String(l.extras.netWeight)}g · Cert {String(l.extras.certificate)}
              {l.extras.metal_value != null && (
                <div>
                  Metal {fmtBDT(Number(l.extras.metal_value))} · Making{" "}
                  {fmtBDT(Number(l.extras.makingCharge))} · Stone{" "}
                  {fmtBDT(Number(l.extras.stone_value ?? 0))}
                </div>
              )}
            </div>
          ) : null
        }
        creditAmount={tradeIn?.finalValuation ?? 0}
        creditLabel="Old gold trade-in"
        onBeforeComplete={async () => {
          if (!tradeIn) return true;
          const customerName = customer?.name || app.customer || "Walk-in Customer";
          const buybackPayload = {
            customer_id: customer?.id,
            customer_name: customerName,
            metal_type: tradeIn.metalType,
            purity: tradeIn.karat,
            gross_weight: tradeIn.grossWeightGrams,
            net_metal_weight: tradeIn.netWeightGrams,
            deductions: tradeIn.purityDeductionPct,
            notes: `POS Old Gold Exchange Trade-in Credit applied: ${fmtBDT(tradeIn.finalValuation)}`,
          };
          // Awaited, and the sale is refused if this write fails: the credit has
          // already reduced what the customer pays, so completing without the
          // matching buyback ticket would leave the till short with no record.
          if (useApi) {
            try {
              await createBuyback.mutateAsync(buybackPayload);
              toast.success(`Trade-In Buyback ticket created for ${customerName}`);
              setTradeIn(null);
              return true;
            } catch (err: unknown) {
              toast.error("Trade-in could not be recorded — sale not completed", {
                description: formatApiError(err as ApiError) || (err as Error).message,
              });
              return false;
            }
          }
          try {
            const { addDemoBuyback } = await import("@/lib/industry-mock");
            const created = addDemoBuyback({
              customer_name: customerName,
              metal_type: tradeIn.metalType,
              karat: tradeIn.karat,
              gross_weight: tradeIn.grossWeightGrams,
              net_weight: tradeIn.netWeightGrams,
              offered_rate: tradeIn.boardRatePerGram,
              purity_deduction_pct: tradeIn.purityDeductionPct,
              final_amount: tradeIn.finalValuation,
              status: "settled",
            });
            toast.success(`Trade-In Buyback Ticket ${created.buyback_no} registered (Demo Mode)`);
            setTradeIn(null);
            return true;
          } catch {
            toast.error("Trade-in could not be recorded — sale not completed");
            return false;
          }
        }}
        catalog={
          <>
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
              <Badge variant="outline" className="gap-1">
                <Gem className="h-3 w-3" /> Rate: {fmtBDT(app.goldRatePerGram)}/g (≈{" "}
                {fmtBDT(Math.round(app.goldRatePerGram * 11.664))}/vori)
              </Badge>
              {app.isFeatureEnabled("jewelry.repair") && (
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" asChild>
                  <Link to="/app/jewelry/repair">
                    <Wrench className="h-3 w-3" /> Repair Job Cards
                  </Link>
                </Button>
              )}
            </div>
            <form
              className="flex gap-2 border-b border-border px-4 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                void handleJewelryScan();
              }}
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9 pr-9 font-mono"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setBarcode(e.target.value);
                  }}
                  placeholder="Search jewelry, metal, karat, or scan barcode / tag (Enter to add)…"
                />
                <Barcode className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
              </div>
              <Button type="submit" disabled={scanPending}>
                Scan
              </Button>
            </form>
            <ProductGrid
              items={filtered}
              onAdd={(item) => beginAdd(item as JewelryItem)}
              renderCard={(item) => {
                const j = item as JewelryItem;
                return (
                  <PosProductCard
                    badge={`${karatLabel(j.karat)} ${j.metal}`}
                    title={j.name}
                    subtitle={`Net ${j.netWeight}g · Making ${fmtBDT(j.makingChargePerGram)}/g`}
                    price={fmtBDT(calcPrice(j))}
                    industry="jewelry"
                    sku={j.sku}
                    imageUrl={(j.meta?.image_url as string) || (j.meta?.image as string)}
                  />
                );
              }}
            />
          </>
        }
      />

      <Dialog open={!!pendingItem} onOpenChange={(v) => !v && setPendingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Certificate / tag</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {pendingItem?.name} requires a certificate or tag before sale.
          </p>
          <Label>Certificate / tag no.</Label>
          <Input
            className="font-mono"
            value={certInput}
            onChange={(e) => setCertInput(e.target.value)}
            placeholder="CERT-… or TAG-…"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingItem(null)}>
              Cancel
            </Button>
            <Button onClick={() => void confirmCertificate()}>Look up & quote</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!breakdownOpen} onOpenChange={(v) => !v && setBreakdownOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Price breakdown — {breakdownOpen?.name}</DialogTitle>
          </DialogHeader>
          {breakdown && (
            <div className="space-y-1 text-sm tabular-nums">
              {(quotedRate ?? breakdown.metal_rate) != null && (
                <div className="mb-2 text-xs text-muted-foreground flex justify-between">
                  <span>Rate {fmtBDT(quotedRate ?? breakdown.metal_rate ?? 0)}/g · Cert {breakdownOpen?.certificate || "—"}</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {breakdownOpen ? gramsToBhori(breakdownOpen.netWeight).displayEn : ""}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Net Weight</span>
                <span className="font-mono">{breakdownOpen?.netWeight}g</span>
              </div>
              <div className="flex justify-between">
                <span>Metal value</span>
                <span>{fmtBDT(breakdown.metal_value)}</span>
              </div>
              <div className="flex justify-between">
                <span>Making charge</span>
                <span>{fmtBDT(breakdown.making_charge)}</span>
              </div>
              <div className="flex justify-between">
                <span>Wastage</span>
                <span>{fmtBDT(breakdown.wastage_value)}</span>
              </div>
              <div className="flex justify-between">
                <span>Stone value</span>
                <span>{fmtBDT(breakdown.stone_value)}</span>
              </div>
              <div className="my-2 border-t border-border" />
              <div className="flex justify-between font-medium">
                <span>Gross</span>
                <span>{fmtBDT(breakdown.gross_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Discount</span>
                <span>-{fmtBDT(breakdown.discount_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>VAT</span>
                <span>{fmtBDT(breakdown.tax_amount)}</span>
              </div>
              <div className="my-2 border-t border-border" />
              <div className="flex justify-between text-base font-semibold">
                <span>Net payable</span>
                <span>{fmtBDT(breakdown.net_amount)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBreakdownOpen(null)}>
              Cancel
            </Button>
            <Button onClick={confirmAdd}>Add to cart</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Daily gold rate update</DialogTitle>
          </DialogHeader>
          <Label>Rate per gram (BDT)</Label>
          <Input type="number" value={localRate} onChange={(e) => setLocalRate(e.target.value)} />
          {useApi && (
            <>
              <Label>Override reason (required for mid-day override)</Label>
              <Input
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Optional for scheduled daily post"
              />
            </>
          )}
          <DialogFooter>
            {useApi ? (
              <Button
                disabled={createRate.isPending}
                onClick={async () => {
                  try {
                    const isOverride = Boolean(overrideReason.trim());
                    await createRate.mutateAsync({
                      metal_type: "Gold",
                      karat: "22K",
                      selling_rate: Number(localRate),
                      manual_override: isOverride || undefined,
                      override_reason: overrideReason.trim() || undefined,
                    });
                    app.setGoldRatePerGram(Number(localRate));
                    setRateOpen(false);
                    setOverrideReason("");
                  } catch (e: unknown) {
                    toast.error(
                      String(
                        (e as { detail?: string; message?: string }).detail ??
                          (e as Error).message ??
                          "Rate update failed",
                      ),
                    );
                  }
                }}
              >
                {createRate.isPending ? "Saving…" : "Post rate"}
              </Button>
            ) : (
              <Button
                onClick={() => {
                  app.setGoldRatePerGram(Number(localRate));
                  setRateOpen(false);
                }}
              >
                Update local demo rate
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Jewelry-only Old Gold Exchange / Buyback Trade-In Dialog */}
      <OldGoldTradeInDialog
        open={tradeInOpen}
        onOpenChange={setTradeInOpen}
        cartTotal={cartTotal}
        currentBoardRate={app.goldRatePerGram}
        onConfirm={(plan) => {
          setTradeIn(plan);
          toast.success(
            `Trade-In Credit applied: ${fmtBDT(plan.finalValuation)} (${plan.netWeightGrams}g ${plan.karat} ${plan.metalType})`,
          );
        }}
      />
    </>
  );
}

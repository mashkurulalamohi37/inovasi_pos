import { useMemo, useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  AlertTriangle,
  Barcode,
  Boxes,
  Calendar,
  CheckCircle2,
  FileCheck,
  Info,
  Pill,
  Shield,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  User, Search} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";
import { pharmacyItems, fmtBDT } from "@/lib/pos-data";
import { requirePermission } from "@/lib/permission-ui";
import { PosShell, ProductGrid, PosProductCard, CartPill } from "./PosShell";
import { usePosCatalog, catalogToCartExtras, type PosCatalogItem } from "@/hooks/use-pos-catalog";
import { usePharmaBatches, usePharmaFefo } from "@/hooks/use-industry-data";
import { usePosBarcodeScan } from "@/hooks/use-pos-barcode";

function showGeneric(app: ReturnType<typeof useApp>) {
  return app.isFeatureEnabled("pharmacy.generic_display") || app.isFeatureEnabled("pharmacy.generic");
}
function showManufacturer(app: ReturnType<typeof useApp>) {
  return app.isFeatureEnabled("pharmacy.manufacturer_display");
}
function showStrength(app: ReturnType<typeof useApp>) {
  return app.isFeatureEnabled("pharmacy.strength_display");
}
function showDosage(app: ReturnType<typeof useApp>) {
  return app.isFeatureEnabled("pharmacy.dosage_form_display");
}

type DemoPharma = typeof pharmacyItems[0];

function demoFefoBatch(p: DemoPharma) {
  const sorted = [...p.batches].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  return sorted.find((b) => b.status !== "expired") ?? sorted[0];
}

function batchDaysLeft(expiry: string) {
  return Math.floor((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export type DispenseUnit = "box" | "strip" | "piece";

export function PharmacyPos() {
  const app = useApp();
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<PosCatalogItem | null>(null);
  const [pendingDemo, setPendingDemo] = useState<DemoPharma | null>(null);
  const [batch, setBatch] = useState("");
  const [dispenseUnit, setDispenseUnit] = useState<DispenseUnit>("box");
  const [stripRatio, setStripRatio] = useState("10"); // 10 strips per box
  const [pieceRatio, setPieceRatio] = useState("100"); // 100 tablets per box
  const [rxOpen, setRxOpen] = useState(false);
  const [restrictedOpen, setRestrictedOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [rxRef, setRxRef] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [patientName, setPatientName] = useState("");

  const demoItems = useMemo(() => pharmacyItems.map((p) => {
    const b = demoFefoBatch(p);
    return {
      id: p.id,
      sku: p.sku,
      name: p.brand,
      price: b.mrp,
      stock: p.batches.reduce((s, x) => s + Object.values(x.qty).reduce((a, n) => a + n, 0), 0),
      meta: {
        generic: p.generic,
        manufacturer: p.manufacturer,
        dosageForm: p.dosageForm,
        strength: p.strength,
        prescriptionRequired: p.prescriptionRequired,
        restricted: p.restricted,
        demoId: p.id,
      },
    };
  }), []);

  const catalog = usePosCatalog("pharmacy", demoItems);
  const productId = pending?.id;
  const fefoQuery = usePharmaFefo(catalog.fromBackend ? productId : undefined);
  const batchesQuery = usePharmaBatches(catalog.fromBackend ? productId : undefined, true);

  // Sort batches by FEFO (earliest expiry first)
  const sortedBatches = useMemo(() => {
    if (catalog.fromBackend) {
      const list = [...(batchesQuery.data ?? (fefoQuery.data ? [fefoQuery.data] : []))];
      return list.sort((a, b) => (a.expiry_date || "").localeCompare(b.expiry_date || ""));
    }
    return pendingDemo?.batches ? [...pendingDemo.batches].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)) : [];
  }, [catalog.fromBackend, batchesQuery.data, fefoQuery.data, pendingDemo]);

  useEffect(() => {
    if (pending && catalog.fromBackend && fefoQuery.data) {
      setBatch(fefoQuery.data.batch_no);
    }
  }, [pending, catalog.fromBackend, fefoQuery.data]);

  const { barcode, setBarcode, handleScan, isPending } = usePosBarcodeScan({
    fromBackend: catalog.fromBackend,
    catalogItems: catalog.items,
    onAdd: (item) => tryAdd(item),
  });

  const handlePharmacyScan = async () => {
    const code = (barcode || search).trim();
    if (!code) return;
    setBarcode(code);
    const match = catalog.items.find(
      (i) =>
        (i.barcode && i.barcode.toLowerCase() === code.toLowerCase()) ||
        (i.meta?.barcode && String(i.meta.barcode).toLowerCase() === code.toLowerCase()) ||
        i.sku.toLowerCase() === code.toLowerCase()
    );
    if (match) {
      tryAdd(match);
      setBarcode("");
      setSearch("");
      return;
    }
    if (filtered.length === 1) {
      tryAdd(filtered[0]);
      setBarcode("");
      setSearch("");
      return;
    }
    await handleScan();
    setBarcode("");
    setSearch("");
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return catalog.items.filter((p) => {
      if (!q) return true;
      const meta = p.meta ?? {};
      const parts = [p.name, p.sku];
      if (showGeneric(app)) parts.push(String(meta.generic ?? ""));
      if (showManufacturer(app)) parts.push(String(meta.manufacturer ?? ""));
      if (showStrength(app)) parts.push(String(meta.strength ?? ""));
      if (showDosage(app)) parts.push(String(meta.dosageForm ?? ""));
      return parts.some((x) => x.toLowerCase().includes(q));
    });
  }, [search, app.flags, catalog.items]);

  // Clinical Drug-to-Drug & Duplicate Therapy Advisory Engine
  const clinicalAdvisories = useMemo(() => {
    const alerts: Array<{ type: "duplicate" | "interaction"; title: string; desc: string }> = [];
    const genericCounts: Record<string, number> = {};
    const genericsInCart = new Set<string>();

    for (const line of app.cart) {
      const g = String(line.extras?.generic ?? line.meta ?? "").toLowerCase().trim();
      if (g) {
        genericCounts[g] = (genericCounts[g] || 0) + 1;
        genericsInCart.add(g);
      }
    }

    // Check duplicate therapies
    for (const [gen, count] of Object.entries(genericCounts)) {
      if (count > 1) {
        alerts.push({
          type: "duplicate",
          title: `Duplicate Generic Therapy: ${gen.toUpperCase()}`,
          desc: `Cart contains ${count} items with identical molecule ${gen}. Verify patient dosage to avoid accidental toxicity.`,
        });
      }
    }

    // Common interaction checks
    const hasNSAID = Array.from(genericsInCart).some(g => g.includes("ibuprofen") || g.includes("diclofenac") || g.includes("ketorolac") || g.includes("naproxen"));
    const hasAspirinOrBloodThinner = Array.from(genericsInCart).some(g => g.includes("aspirin") || g.includes("clopidogrel") || g.includes("warfarin"));
    if (hasNSAID && hasAspirinOrBloodThinner) {
      alerts.push({
        type: "interaction",
        title: "Major Interaction: NSAID + Antiplatelet/Anticoagulant",
        desc: "Increased risk of gastrointestinal ulceration and bleeding. Consider gastroprotection (PPI).",
      });
    }

    const hasQuinolone = Array.from(genericsInCart).some(g => g.includes("ciprofloxacin") || g.includes("levofloxacin"));
    const hasAntacid = Array.from(genericsInCart).some(g => g.includes("antacid") || g.includes("calcium") || g.includes("magnesium"));
    if (hasQuinolone && hasAntacid) {
      alerts.push({
        type: "interaction",
        title: "Absorption Warning: Quinolone + Multivalent Antacid",
        desc: "Chelation reduces antibiotic absorption. Advise patient to space administration by at least 2 hours.",
      });
    }

    return alerts;
  }, [app.cart]);

  const cardTitle = (p: PosCatalogItem) => {
    const parts = [p.name];
    if (showStrength(app) && p.meta?.strength) parts.push(String(p.meta.strength));
    return parts.join(" ");
  };

  const cardSubtitle = (p: PosCatalogItem) => {
    const parts: string[] = [];
    if (showGeneric(app) && p.meta?.generic) parts.push(String(p.meta.generic));
    if (showManufacturer(app) && p.meta?.manufacturer) parts.push(String(p.meta.manufacturer));
    return parts.join(" · ") || p.sku;
  };

  const getDemoItem = (p: PosCatalogItem) =>
    pharmacyItems.find((x) => x.id === p.id || x.sku === p.sku) ?? null;

  const tryAdd = (p: PosCatalogItem) => {
    const demo = getDemoItem(p);
    const rxRequired = catalog.fromBackend ? Boolean(p.meta?.prescriptionRequired) : demo?.prescriptionRequired;
    const restricted = catalog.fromBackend ? Boolean(p.meta?.restricted) : demo?.restricted;

    setDispenseUnit("box");
    if (!catalog.fromBackend && demo) {
      setBatch(demoFefoBatch(demo).batchNo);
    }
    if (rxRequired && app.isFeatureEnabled("pharmacy.rx_required")) {
      setPending(p);
      setPendingDemo(demo);
      setRxOpen(true);
      return;
    }
    if (restricted && app.isFeatureEnabled("pharmacy.restricted")) {
      if (!requirePermission(app.can("pharmacy.restricted_sell"))) return;
      setPending(p);
      setPendingDemo(demo);
      setRestrictedOpen(true);
      return;
    }
    setPending(p);
    setPendingDemo(demo);
    setBatchOpen(true);
  };

  const calculateDispensePrice = (basePrice: number) => {
    if (dispenseUnit === "strip") {
      const divisor = Number(stripRatio) || 10;
      return Math.round((basePrice / divisor) * 100) / 100;
    }
    if (dispenseUnit === "piece") {
      const divisor = Number(pieceRatio) || 100;
      return Math.round((basePrice / divisor) * 100) / 100;
    }
    return basePrice;
  };

  const confirmAdd = () => {
    if (!pending) return;

    if (catalog.fromBackend) {
      const selected = batchesQuery.data?.find((b) => b.batch_no === batch) ?? fefoQuery.data;
      if (!selected) { toast.error("No valid batch available"); return; }
      const days = batchDaysLeft(selected.expiry_date);
      if (days <= 0) {
        toast.error("Expired batch cannot be sold");
        return;
      }
      if (days <= 90) {
        toast.warning(`Near-expiry batch: ${days} days left`);
      }
      const unitPrice = calculateDispensePrice(pending.price);
      const unitLabel = dispenseUnit === "strip" ? "Strip" : dispenseUnit === "piece" ? "Pcs" : "Box";

      app.addToCart({
        sku: pending.sku,
        name: `${cardTitle(pending)} (${unitLabel})`,
        meta: showGeneric(app) ? String(pending.meta?.generic ?? pending.name) : pending.name,
        price: unitPrice,
        qty: 1,
        industry: "pharmacy",
        flags: pending.meta?.prescriptionRequired ? ["Rx"] : pending.meta?.restricted ? ["Restricted"] : [],
        extras: {
          ...catalogToCartExtras(pending),
          batch: selected.batch_no,
          batch_id: selected.id,
          fefo: true,
          expiry: selected.expiry_date,
          dispense_unit: dispenseUnit,
          ...(showGeneric(app) ? { generic: String(pending.meta?.generic ?? "") } : {}),
          ...(showManufacturer(app) ? { manufacturer: String(pending.meta?.manufacturer ?? "") } : {}),
          ...(showStrength(app) ? { strength: String(pending.meta?.strength ?? "") } : {}),
          ...(showDosage(app) ? { dosageForm: String(pending.meta?.dosageForm ?? "") } : {}),
          ...(pending.meta?.restricted ? { restricted: true } : {}),
          ...(rxRef ? { rx_ref: rxRef } : {}),
          ...(doctorName ? { doctor_name: doctorName } : {}),
        },
      });
      toast.success(`Added ${unitLabel} · batch ${selected.batch_no}`);
    } else if (pendingDemo) {
      const b = pendingDemo.batches.find((x) => x.batchNo === batch) ?? demoFefoBatch(pendingDemo);
      if (b.status === "expired" && app.isFeatureEnabled("pharmacy.fefo_block_expired")) {
        toast.error("Expired batch blocked");
        return;
      }
      const unitPrice = calculateDispensePrice(b.mrp);
      const unitLabel = dispenseUnit === "strip" ? "Strip" : dispenseUnit === "piece" ? "Pcs" : "Box";

      app.addToCart({
        sku: pendingDemo.sku,
        name: `${cardTitle(pending)} (${unitLabel})`,
        meta: showGeneric(app) ? pendingDemo.generic : pendingDemo.brand,
        price: unitPrice,
        qty: 1,
        industry: "pharmacy",
        flags: pendingDemo.prescriptionRequired ? ["Rx"] : pendingDemo.restricted ? ["Restricted"] : [],
        extras: {
          batch: b.batchNo,
          expiry: b.expiryDate,
          dispense_unit: dispenseUnit,
          ...(showGeneric(app) ? { generic: pendingDemo.generic } : {}),
          ...(showManufacturer(app) ? { manufacturer: pendingDemo.manufacturer } : {}),
          ...(showStrength(app) ? { strength: pendingDemo.strength } : {}),
          ...(showDosage(app) ? { dosageForm: pendingDemo.dosageForm } : {}),
          ...(rxRef ? { rx_ref: rxRef } : {}),
          ...(doctorName ? { doctor_name: doctorName } : {}),
        },
      });
      toast.success(`Added ${unitLabel} · batch ${b.batchNo}`);
    }
    setBatchOpen(false);
    setPending(null);
    setPendingDemo(null);
    setRxRef("");
    setDoctorName("");
    setPatientName("");
  };

  const selectedBatchDetails = useMemo(() => {
    if (!batch) return null;
    if (catalog.fromBackend) {
      return (batchesQuery.data ?? []).find(b => b.batch_no === batch) ?? fefoQuery.data;
    }
    return (pendingDemo?.batches ?? []).find(b => b.batchNo === batch);
  }, [batch, catalog.fromBackend, batchesQuery.data, fefoQuery.data, pendingDemo]);

  return (
    <>
      <PosShell
        industry="pharmacy"
        title="Pharmacy POS"
        subtitle="Batch · FEFO · barcode · prescription · restricted controls"
        taxRate={0}
        receiptNote="Consult physician · batch & expiry on receipt"
        onBeforeComplete={() => {
          const rxMissing = app.cart.some((l) => l.flags?.includes("Rx") && !app.customer);
          if (rxMissing) { toast.error("Attach customer for Rx items"); return false; }
          return true;
        }}
        cartLineExtra={(l) => l.extras ? (
          <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
            {l.extras.batch && <CartPill variant="warning">Batch: {String(l.extras.batch)}</CartPill>}
            {l.extras.expiry && <CartPill variant="neutral">Exp: {String(l.extras.expiry).slice(0, 10)}</CartPill>}
            {catalog.fromBackend && <CartPill variant="success">batch stock</CartPill>}
            {l.extras.strength && <CartPill variant="info">{String(l.extras.strength)}</CartPill>}
            {l.extras.manufacturer && <CartPill variant="neutral">{String(l.extras.manufacturer)}</CartPill>}
            {l.extras.rx_ref && <CartPill variant="info">Rx: {String(l.extras.rx_ref)}</CartPill>}
          </div>
        ) : null}
        catalog={
          <>
            {/* Clinical Safety & Drug Interaction Alert Banner */}
            {clinicalAdvisories.length > 0 && (
              <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 space-y-1.5">
                {clinicalAdvisories.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                    <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">{a.title}: </span>
                      <span>{a.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-b border-border px-4 py-3 space-y-2">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handlePharmacyScan();
                }}
              >
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setBarcode(e.target.value);
                    }}
                    placeholder="Search brand, generic molecule, strength, or scan barcode (Enter to add)…"
                    className="h-11 pl-9 pr-9 font-mono"
                  />
                  <Barcode className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
                </div>
                <Button type="submit" className="h-11 px-4" disabled={isPending}>
                  Scan
                </Button>
              </form>
              {app.isFeatureEnabled("pharmacy.fefo") && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                  <span>FEFO auto-suggests earliest valid batch · expired batches blocked at sale</span>
                </div>
              )}
            </div>
            <ProductGrid
              items={filtered}
              onAdd={(item) => tryAdd(item as PosCatalogItem)}
              renderCard={(item) => {
                const p = item as PosCatalogItem;
                const demo = getDemoItem(p);
                const demoBatch = demo ? demoFefoBatch(demo) : null;
                return (
                  <PosProductCard
                    badge={showDosage(app) ? String(p.meta?.dosageForm ?? "Med") : "Med"}
                    title={cardTitle(p)}
                    subtitle={cardSubtitle(p)}
                    price={fmtBDT(catalog.fromBackend ? p.price : (demoBatch?.mrp ?? p.price))}
                    industry="pharmacy"
                    sku={p.sku}
                    imageUrl={(p.meta?.image_url as string) || (p.meta?.image as string)}
                    footer={
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-1">
                        <div className="flex gap-1">
                          {(demo?.prescriptionRequired || Boolean(p.meta?.prescriptionRequired)) && (
                            <Badge className="text-[9px] py-0 px-1">Rx</Badge>
                          )}
                          {(demo?.restricted || Boolean(p.meta?.restricted)) && (
                            <Badge variant="destructive" className="text-[9px] py-0 px-1">Restricted</Badge>
                          )}
                        </div>
                        {demoBatch?.status === "near-expiry" && (
                          <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-300 py-0">
                            Near expiry
                          </Badge>
                        )}
                      </div>
                    }
                  />
                );
              }}
            />
          </>
        }
      />

      {/* FEFO Batch Selector Dialog */}
      <Dialog
        open={batchOpen && Boolean(pending)}
        onOpenChange={(v) => {
          setBatchOpen(v);
          if (!v) {
            setPending(null);
            setPendingDemo(null);
          }
        }}
      >
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pill className="h-5 w-5 text-primary" />
              <span>Select FEFO Batch &amp; Dispensing Unit</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="p-3 bg-muted/40 rounded-lg border border-border space-y-1 text-xs">
              <div className="font-semibold text-foreground">{pending ? cardTitle(pending) : ""}</div>
              <div className="text-muted-foreground">{pending ? cardSubtitle(pending) : ""}</div>
            </div>

            {/* Dispense Unit Multiplier */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1">
                <Boxes className="h-3.5 w-3.5 text-primary" />
                Dispense Packaging Unit
              </Label>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={dispenseUnit === "box" ? "default" : "outline"}
                  className="h-10 text-xs flex flex-col items-center justify-center p-1"
                  onClick={() => setDispenseUnit("box")}
                >
                  <span className="font-semibold">Full Box</span>
                  <span className="text-[10px] opacity-80">{fmtBDT(pending?.price ?? 0)}</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={dispenseUnit === "strip" ? "default" : "outline"}
                  className="h-10 text-xs flex flex-col items-center justify-center p-1"
                  onClick={() => setDispenseUnit("strip")}
                >
                  <span className="font-semibold">Strip (1/10)</span>
                  <span className="text-[10px] opacity-80">{fmtBDT(Math.round(((pending?.price ?? 0) / 10) * 100) / 100)}</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={dispenseUnit === "piece" ? "default" : "outline"}
                  className="h-10 text-xs flex flex-col items-center justify-center p-1"
                  onClick={() => setDispenseUnit("piece")}
                >
                  <span className="font-semibold">Pcs (1/100)</span>
                  <span className="text-[10px] opacity-80">{fmtBDT(Math.round(((pending?.price ?? 0) / 100) * 100) / 100)}</span>
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Available Batches (FEFO Sorted)</Label>
              <Select value={batch} onValueChange={setBatch}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Select batch" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {catalog.fromBackend
                    ? (sortedBatches as Array<{ id: string; batch_no: string; expiry_date: string; qty_on_hand?: number }>).map((b) => {
                      const days = batchDaysLeft(b.expiry_date);
                      const isExpired = days <= 0;
                      const isNearExpiry = days > 0 && days <= 90;
                      return (
                        <SelectItem key={b.batch_no} value={b.batch_no} disabled={isExpired}>
                          <div className="flex items-center justify-between gap-2 sm:gap-4 w-full text-xs py-0.5">
                            <div className="truncate">
                              <span className="font-medium">{b.batch_no}</span>
                              <span className="text-muted-foreground ml-2 text-[11px]">Exp: {b.expiry_date.slice(0, 10)}</span>
                              {b.qty_on_hand != null && <span className="text-muted-foreground ml-2 text-[11px]">Qty: {b.qty_on_hand}</span>}
                            </div>
                            <div className="shrink-0">
                              {isExpired ? (
                                <Badge variant="destructive" className="text-[10px] py-0">Expired</Badge>
                              ) : isNearExpiry ? (
                                <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 py-0">{days}d left</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px] text-emerald-600 py-0">FEFO Ready</Badge>
                              )}
                            </div>
                          </div>
                        </SelectItem>
                      );
                    })
                    : (sortedBatches as Array<{ batchNo: string; expiryDate: string; mrp: number; status: string }>).map((b) => (
                      <SelectItem key={b.batchNo} value={b.batchNo} disabled={b.status === "expired"}>
                        <div className="flex items-center justify-between gap-2 sm:gap-4 w-full text-xs py-0.5">
                          <span className="truncate">{b.batchNo} · exp {b.expiryDate}</span>
                          <span className="font-semibold text-primary shrink-0">{fmtBDT(b.mrp)}</span>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setBatchOpen(false);
                setPending(null);
                setPendingDemo(null);
              }}
            >
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" onClick={confirmAdd}>Add to cart</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prescription Requirement Modal */}
      <Dialog
        open={rxOpen}
        onOpenChange={(v) => {
          setRxOpen(v);
          if (!v) {
            setPending(null);
            setPendingDemo(null);
          }
        }}
      >
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-primary" />
              <span>Prescription (Rx) Required</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <p className="text-xs text-muted-foreground">
              This medication is classified as Rx-only. Enter prescription details or doctor registration reference.
            </p>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Rx Reference / Prescription No. *</Label>
                <Input
                  placeholder="e.g. RX-2026-0941"
                  value={rxRef}
                  onChange={(e) => setRxRef(e.target.value)}
                  className="h-9 text-xs font-mono"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Doctor / Physician</Label>
                  <Input
                    placeholder="Dr. M. Hossain"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Patient Name</Label>
                  <Input
                    placeholder="Patient name"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>
            {app.isFeatureEnabled("pharmacy.rx_upload") && (
              <p className="text-xs text-muted-foreground">Prescription file upload will be completed in document storage phase.</p>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setRxOpen(false);
                setPending(null);
                setPendingDemo(null);
              }}
            >
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => {
              if (!rxRef.trim() && catalog.fromBackend) { toast.error("Enter Rx reference"); return; }
              setRxOpen(false);
              const restricted = catalog.fromBackend ? pending?.meta?.restricted : pendingDemo?.restricted;
              if (restricted) setRestrictedOpen(true);
              else setBatchOpen(true);
            }}>
              Verify &amp; continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restricted Medicine Approval Modal */}
      <Dialog
        open={restrictedOpen}
        onOpenChange={(v) => {
          setRestrictedOpen(v);
          if (!v) {
            setPending(null);
            setPendingDemo(null);
          }
        }}
      >
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-destructive" />
              <span>Restricted Medicine Approval</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-xs text-muted-foreground">
              Requires pharmacy.restricted_sell permission. Sale will be logged on post. No PIN bypass in backend mode.
            </p>
            <div className="p-2.5 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Controlled substance sale will be recorded in audit log.</span>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setRestrictedOpen(false);
                setPending(null);
                setPendingDemo(null);
              }}
            >
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => {
              if (!requirePermission(app.can("pharmacy.restricted_sell"))) return;
              setRestrictedOpen(false);
              setBatchOpen(true);
            }}>
              Approve sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

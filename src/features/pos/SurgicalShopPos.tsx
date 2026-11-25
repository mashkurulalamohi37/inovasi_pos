import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Barcode,
  Building2,
  CheckCircle2,
  FileText,
  Search,
  ShieldCheck,
  Stethoscope,
  Tag,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";
import { surgicalCatalog } from "@/lib/industry-mock";
import { fmtBDT } from "@/lib/pos-data";
import { PosShell, ProductGrid, PosProductCard } from "./PosShell";
import { usePosCatalog, catalogToCartExtras, type PosCatalogItem } from "@/hooks/use-pos-catalog";
import { useSurgicalProductStock, type ApiSurgicalStockUnit } from "@/hooks/use-api-config";
import { usePosBarcodeScan } from "@/hooks/use-pos-barcode";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";

/** Helper to parse GS1-128 / UDI application identifiers. */
export function parseUdiBarcode(raw: string): {
  gtin?: string;
  expiry?: string;
  batch?: string;
  serial?: string;
} {
  const text = (raw || "").trim();
  if (!text) return {};

  const res: { gtin?: string; expiry?: string; batch?: string; serial?: string } = {};

  // Formats like (01)088493019283(17)261231(10)LOT12345(21)SN99881
  const aiRegex = /\((01|17|10|21)\)([^()]+)/g;
  let match: RegExpExecArray | null;
  let matchedAny = false;

  while ((match = aiRegex.exec(text)) !== null) {
    matchedAny = true;
    const ai = match[1];
    const val = match[2].trim();
    if (ai === "01") res.gtin = val;
    else if (ai === "17") {
      // YYMMDD -> 20YY-MM-DD
      if (val.length === 6) {
        res.expiry = `20${val.slice(0, 2)}-${val.slice(2, 4)}-${val.slice(4, 6)}`;
      } else {
        res.expiry = val;
      }
    } else if (ai === "10") res.batch = val;
    else if (ai === "21") res.serial = val;
  }

  if (matchedAny) return res;

  // Raw stream pattern fallback e.g. 010884930192831726123110B204
  if (text.startsWith("01") && text.length >= 16) {
    res.gtin = text.slice(2, 16);
    const rest = text.slice(16);
    if (rest.startsWith("17") && rest.length >= 8) {
      const exp = rest.slice(2, 8);
      res.expiry = `20${exp.slice(0, 2)}-${exp.slice(2, 4)}-${exp.slice(4, 6)}`;
    }
  }

  return res;
}

function toDemoItems(): PosCatalogItem[] {
  return surgicalCatalog.map((row) => ({
    id: row.sku,
    sku: row.sku,
    name: row.name,
    price: row.price,
    stock: 50,
    meta: {
      brand: row.brand,
      unit: row.unit,
      sterile: row.sterile,
      batch_no: row.batchNo,
      expiry_date: row.expiryDate,
      surgical_grade: row.surgicalGrade,
      category: row.category,
    },
  }));
}

export function SurgicalShopPos() {
  const app = useApp();
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<PosCatalogItem | null>(null);
  const [unitId, setUnitId] = useState("");

  // Hospital / Clinic requisition & Consignment details
  const [doctorName, setDoctorName] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  const [otRequisition, setOtRequisition] = useState("");
  const [patientId, setPatientId] = useState("");
  const [procedureName, setProcedureName] = useState("");
  const [isConsignment, setIsConsignment] = useState(false);
  const [isHospitalContract, setIsHospitalContract] = useState(false);
  const [showRequisitionPanel, setShowRequisitionPanel] = useState(false);

  // Sterilization check
  const [sterilizationMethod, setSterilizationMethod] = useState("autoclave_134");
  const [sterilityCycle, setSterilityCycle] = useState("");

  // Warranty card registration
  const [warrantyOpen, setWarrantyOpen] = useState(false);
  const [warrantyForm, setWarrantyForm] = useState({
    hospitalName: "",
    surgeonName: "",
    serialOrLot: "",
    equipmentName: "Laryngoscope Set / Surgical Retractor",
    warrantyMonths: "12",
  });

  const handleSaveWarranty = () => {
    if (!warrantyForm.hospitalName.trim() && !warrantyForm.serialOrLot.trim()) {
      toast.error("Enter Hospital Name or Serial / Lot No.");
      return;
    }
    const certNo = `WAR-SG-${Date.now().toString().slice(-6)}`;
    toast.success(`Warranty Certificate ${certNo} registered (${warrantyForm.warrantyMonths} Months) for ${warrantyForm.hospitalName || "Hospital"}`);
    setWarrantyOpen(false);
  };

  const demoItems = useMemo(() => toDemoItems(), []);
  const catalog = usePosCatalog("surgical-shop", demoItems);
  const stockQuery = useSurgicalProductStock(catalog.fromBackend ? pending?.id : undefined, true);

  // Sort live stock units by FEFO (First-Expired-First-Out)
  const sortedStockUnits = useMemo(() => {
    const units = [...(stockQuery.data ?? [])];
    return units.sort((a, b) => {
      const daysA = typeof a.days_to_expiry === "number" ? a.days_to_expiry : 99999;
      const daysB = typeof b.days_to_expiry === "number" ? b.days_to_expiry : 99999;
      return daysA - daysB;
    });
  }, [stockQuery.data]);

  useEffect(() => {
    if (pending && catalog.fromBackend && sortedStockUnits.length) {
      // Pick first sellable unit (non-expired)
      const firstSellable = sortedStockUnits.find(
        (u) => !["expired", "quarantined", "recalled", "damaged", "sold", "retired"].includes(String(u.status ?? ""))
          && (u.days_to_expiry == null || Number(u.days_to_expiry) > 0)
      );
      if (firstSellable) {
        setUnitId(String(firstSellable.id));
      } else {
        setUnitId(String(sortedStockUnits[0].id));
      }
    }
  }, [pending, catalog.fromBackend, sortedStockUnits]);

  const { barcode, setBarcode, handleScan, isPending } = usePosBarcodeScan({
    fromBackend: catalog.fromBackend,
    catalogItems: catalog.items,
    onAdd: (item) => tryAdd(item),
  });

  const handleCustomScan = () => {
    const parsed = parseUdiBarcode(barcode);
    if (parsed.gtin || parsed.serial || parsed.batch) {
      // Try to find matching catalog item by GTIN or SKU or name
      const matched = catalog.items.find(
        (i) => (parsed.gtin && (i.sku.includes(parsed.gtin) || String(i.meta?.udi_code ?? "").includes(parsed.gtin)))
          || (parsed.batch && i.meta?.batch_no === parsed.batch)
      );
      if (matched) {
        tryAdd(matched);
        toast.info(`UDI matched: ${matched.name}${parsed.batch ? ` (Batch: ${parsed.batch})` : ""}`);
        return;
      }
    }
    handleScan();
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return catalog.items.filter((p) => {
      if (!q) return true;
      return [p.name, p.sku, String(p.meta?.brand ?? ""), String(p.meta?.manufacturer_name ?? "")]
        .some((x) => x.toLowerCase().includes(q));
    });
  }, [search, catalog.items]);

  const tryAdd = (p: PosCatalogItem) => {
    setPending(p);
    setUnitId("");
  };

  const confirmAdd = () => {
    if (!pending) return;

    // Apply contract pricing if enabled
    const effectivePrice = isHospitalContract && app.isFeatureEnabled("surgical.hospital_contract")
      ? Math.round(pending.price * 0.9) // 10% institutional contract pricing
      : pending.price;

    const selected = (stockQuery.data ?? []).find((u) => String(u.id) === unitId);

    if (catalog.fromBackend && selected) {
      const status = String(selected.status ?? "");
      if (["expired", "quarantined", "recalled", "damaged", "sold", "retired"].includes(status)) {
        toast.error(`Selected stock is ${status} and cannot be sold.`);
        return;
      }
      const days = typeof selected.days_to_expiry === "number" ? selected.days_to_expiry : null;
      if (days != null && days <= 0) {
        toast.error("Selected batch is expired and cannot be sold.");
        return;
      }
      if (days != null && days <= 90) {
        toast.warning(`Near-expiry stock: ${days} days left`);
      }
      app.addToCart({
        sku: pending.sku,
        name: pending.name,
        meta: String(pending.meta?.manufacturer_name ?? pending.meta?.brand ?? pending.name),
        price: effectivePrice,
        qty: 1,
        industry: "surgical-shop",
        flags: selected.sterile_status === "sterile" ? ["Sterile"] : [],
        extras: {
          ...catalogToCartExtras(pending),
          stock_unit_id: selected.id ? String(selected.id) : "",
          batch_id: selected.id ? String(selected.id) : "",
          batch: selected.batch_no ? String(selected.batch_no) : "",
          batch_no: selected.batch_no ? String(selected.batch_no) : "",
          lot_no: selected.lot_no ? String(selected.lot_no) : "",
          serial: selected.serial_no ? String(selected.serial_no) : "",
          serial_no: selected.serial_no ? String(selected.serial_no) : "",
          udi: selected.udi_code ? String(selected.udi_code) : "",
          udi_code: selected.udi_code ? String(selected.udi_code) : "",
          expiry: selected.expiry_date ? String(selected.expiry_date) : "",
          expiry_date: selected.expiry_date ? String(selected.expiry_date) : "",
          sterile_status: selected.sterile_status ? String(selected.sterile_status) : "",
          sterile: selected.sterile_status === "sterile",
          sterilization_method: (selected.sterilization_method ? String(selected.sterilization_method) : "") || sterilizationMethod || "",
          ...(sterilityCycle ? { sterility_cycle: sterilityCycle } : {}),
          ...(app.isFeatureEnabled("surgical.grade")
            ? {
                surgical_grade: pending.meta?.surgical_grade ? String(pending.meta.surgical_grade) : pending.meta?.device_class ? String(pending.meta.device_class) : "",
                device_class: pending.meta?.device_class ? String(pending.meta.device_class) : "",
              }
            : {}),
          ...(doctorName ? { doctorRef: doctorName } : {}),
          ...(hospitalName ? { hospitalRef: hospitalName } : {}),
          ...(otRequisition ? { otRequisition } : {}),
          ...(patientId ? { patientId } : {}),
          ...(procedureName ? { procedureName } : {}),
          ...(isConsignment ? { isConsignment: true, pricingTier: "consignment_stock" } : {}),
          ...(isHospitalContract ? { pricingTier: "hospital_contract" } : {}),
        },
      });
      toast.success(
        selected.serial_no
          ? `Added · serial ${String(selected.serial_no)}`
          : `Added · batch ${String(selected.batch_no ?? selected.lot_no ?? selected.id)}`,
      );
    } else {
      app.addToCart({
        sku: pending.sku,
        name: pending.name,
        meta: String(pending.meta?.brand ?? pending.name),
        price: effectivePrice,
        qty: 1,
        industry: "surgical-shop",
        flags: pending.meta?.sterile ? ["Sterile"] : [],
        extras: {
          ...catalogToCartExtras(pending),
          batch_no: pending.meta?.batch_no ? String(pending.meta.batch_no) : "",
          expiry_date: pending.meta?.expiry_date ? String(pending.meta.expiry_date) : "",
          sterile: Boolean(pending.meta?.sterile),
          surgical_grade: app.isFeatureEnabled("surgical.grade") && pending.meta?.surgical_grade ? String(pending.meta.surgical_grade) : "",
          ...(doctorName ? { doctorRef: doctorName } : {}),
          ...(hospitalName ? { hospitalRef: hospitalName } : {}),
          ...(otRequisition ? { otRequisition } : {}),
          ...(patientId ? { patientId } : {}),
          ...(procedureName ? { procedureName } : {}),
          ...(isConsignment ? { isConsignment: true, pricingTier: "consignment_stock" } : {}),
          ...(isHospitalContract ? { pricingTier: "hospital_contract" } : {}),
        },
      });
      toast.success(`Added ${pending.name}`);
    }
    setPending(null);
    setUnitId("");
  };

  const selectedUnitDetails = useMemo(() => {
    if (!unitId || !stockQuery.data) return null;
    return stockQuery.data.find((u) => String(u.id) === unitId);
  }, [unitId, stockQuery.data]);

  return (
    <>
      <PosShell
        industry="surgical-shop"
        title="Surgical Items Shop POS"
        subtitle="Sterile gloves · sutures · implants · instruments — batch / serial / UDI"
        taxRate={0}
        receiptNote="Batch, expiry & sterile status on tracked items"
        cartLineExtra={(line) => (
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            <div>
              {line.extras?.batch_no || line.extras?.batch ? `Batch ${String(line.extras.batch_no ?? line.extras.batch)}` : ""}
              {line.extras?.serial_no || line.extras?.serial ? ` · SN ${String(line.extras.serial_no ?? line.extras.serial)}` : ""}
              {line.extras?.udi_code || line.extras?.udi ? ` · UDI ${String(line.extras.udi_code ?? line.extras.udi)}` : ""}
              {line.extras?.expiry_date || line.extras?.expiry ? ` · Exp ${String(line.extras.expiry_date ?? line.extras.expiry).slice(0, 10)}` : ""}
              {line.extras?.sterile_status ? ` · ${String(line.extras.sterile_status)}` : ""}
            </div>
            {(line.extras?.doctorRef || line.extras?.hospitalRef || line.extras?.otRequisition || line.extras?.patientId) && (
              <div className="text-primary font-medium flex flex-wrap gap-1">
                {line.extras?.hospitalRef ? `Hospital: ${String(line.extras.hospitalRef)}` : ""}
                {line.extras?.doctorRef ? ` · Dr: ${String(line.extras.doctorRef)}` : ""}
                {line.extras?.otRequisition ? ` · OT: ${String(line.extras.otRequisition)}` : ""}
                {line.extras?.patientId ? ` · Patient: ${String(line.extras.patientId)}` : ""}
                {line.extras?.procedureName ? ` (${String(line.extras.procedureName)})` : ""}
                {line.extras?.isConsignment ? ` · [Consignment Stock]` : ""}
              </div>
            )}
          </div>
        )}
        catalog={
          <>
            <div className="border-b border-border px-4 py-2.5 space-y-2 bg-muted/10">
              <div className="flex gap-2 items-center">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setBarcode(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleCustomScan();
                      }
                    }}
                    placeholder="Search item, brand, ref code, or scan barcode / UDI…"
                    className="h-9 pl-9 text-xs"
                  />
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCustomScan}
                  disabled={isPending || !search.trim()}
                  className="h-9 text-xs gap-1 shrink-0"
                >
                  <Barcode className="h-3.5 w-3.5" />
                  Scan
                </Button>

                <Button
                  variant={showRequisitionPanel ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowRequisitionPanel(!showRequisitionPanel)}
                  className="h-9 text-xs gap-1.5 shrink-0"
                >
                  <Stethoscope className="h-3.5 w-3.5" />
                  <span>Hospital / OT Ref</span>
                </Button>
              </div>

              {showRequisitionPanel && (
                <div className="p-3 bg-muted/50 border border-border rounded-lg space-y-2.5 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      Hospital Requisition &amp; Consignment Billing
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={isConsignment ? "default" : "outline"}
                        className="h-7 text-xs"
                        onClick={() => setIsConsignment(!isConsignment)}
                      >
                        {isConsignment ? "Consignment Billing: ON" : "Consignment Billing"}
                      </Button>
                      {app.isFeatureEnabled("surgical.hospital_contract") && (
                        <Button
                          size="sm"
                          variant={isHospitalContract ? "default" : "outline"}
                          className="h-7 text-xs"
                          onClick={() => setIsHospitalContract(!isHospitalContract)}
                        >
                          <Tag className="h-3 w-3 mr-1" />
                          {isHospitalContract ? "Contract Price (10% Off)" : "Standard Retail"}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Hospital / Clinic</Label>
                      <div className="relative">
                        <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="e.g. Square Hospital"
                          value={hospitalName}
                          onChange={(e) => setHospitalName(e.target.value)}
                          className="h-8 pl-8 text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Surgeon / Doctor</Label>
                      <div className="relative">
                        <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="e.g. Dr. K. Ahmed"
                          value={doctorName}
                          onChange={(e) => setDoctorName(e.target.value)}
                          className="h-8 pl-8 text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">OT / Requisition No.</Label>
                      <Input
                        placeholder="e.g. REQ-2026-092"
                        value={otRequisition}
                        onChange={(e) => setOtRequisition(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Patient MRN / ID</Label>
                      <Input
                        placeholder="e.g. PT-99201"
                        value={patientId}
                        onChange={(e) => setPatientId(e.target.value)}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-[11px] text-muted-foreground">Procedure / Surgical Case</Label>
                      <Input
                        placeholder="e.g. Total Knee Arthroplasty (TKA)"
                        value={procedureName}
                        onChange={(e) => setProcedureName(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                <span>Expired, quarantined, and recalled stock are blocked at sale validation.</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 gap-1 text-[11px] text-foreground border-border hover:bg-secondary"
                  onClick={() => setWarrantyOpen(true)}
                >
                  <ShieldCheck className="h-3 w-3 text-emerald-500" />
                  Warranty register
                </Button>
              </div>
            </div>

            <ProductGrid
              items={filtered}
              onAdd={(item) => tryAdd(item as PosCatalogItem)}
              renderCard={(item) => {
                const p = item as PosCatalogItem;
                const price = isHospitalContract && app.isFeatureEnabled("surgical.hospital_contract")
                  ? Math.round(p.price * 0.9)
                  : p.price;
                return (
                  <PosProductCard
                    badge={p.meta?.sterile || p.meta?.sterile_required ? "Sterile" : String(p.meta?.category ?? "Surgical")}
                    title={p.name}
                    subtitle={`${String(p.meta?.brand ?? p.meta?.manufacturer_name ?? "")} · ${p.sku}`}
                    price={fmtBDT(price)}
                    industry="surgical-shop"
                    sku={p.sku}
                    imageUrl={(p.meta?.image_url as string) || (p.meta?.image as string)}
                    footer={
                      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                        {p.meta?.expiry_date ? (
                          <span>Exp {String(p.meta.expiry_date).slice(0, 10)}</span>
                        ) : (
                          <span>FEFO Batch Tracked</span>
                        )}
                        {p.meta?.surgical_grade ? (
                          <Badge variant="outline" className="text-[9px] py-0 px-1">
                            {String(p.meta.surgical_grade)}
                          </Badge>
                        ) : null}
                      </div>
                    }
                  />
                );
              }}
            />
          </>
        }
      />

      <Dialog open={Boolean(pending)} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="truncate mr-2">{pending?.name ?? "Select stock unit"}</span>
              {Boolean(pending?.meta?.sterile) && (
                <Badge variant="secondary" className="gap-1 shrink-0">
                  <ShieldCheck className="h-3 w-3 text-emerald-500" />
                  Sterile Unit
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {catalog.fromBackend ? (
            <div className="space-y-4">
              {stockQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading stock units & FEFO batches…</p>
              ) : sortedStockUnits.length === 0 ? (
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-center">
                  <AlertTriangle className="h-5 w-5 text-destructive mx-auto mb-1.5" />
                  <p className="text-sm font-medium text-destructive">No sellable stock units for this product.</p>
                  <p className="text-xs text-muted-foreground mt-1">Check inventory receiving / QC release status.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Select Available Batch / Serial (FEFO Sorted)</Label>
                    <Select value={unitId} onValueChange={setUnitId}>
                      <SelectTrigger className="h-12 w-full">
                        <SelectValue placeholder="Select batch / serial unit" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {sortedStockUnits.map((u: any) => {
                          const days = typeof u.days_to_expiry === "number" ? u.days_to_expiry : null;
                          const isExpired = days != null && days <= 0;
                          const isNearExpiry = days != null && days > 0 && days <= 90;
                          const isBlocked = ["expired", "quarantined", "recalled", "damaged", "sold", "retired"].includes(String(u.status ?? ""));

                          return (
                            <SelectItem
                              key={String(u.id)}
                              value={String(u.id)}
                              disabled={isExpired || isBlocked}
                              className="py-2"
                            >
                              <div className="flex items-center justify-between gap-2 sm:gap-4 w-full">
                                <div className="truncate">
                                  <div className="font-medium text-xs truncate">
                                    {u.serial_no
                                      ? `SN: ${u.serial_no}`
                                      : `Batch: ${u.batch_no ?? u.lot_no ?? u.id}`}
                                    {u.udi_code ? ` · UDI: ${u.udi_code}` : ""}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                                    <span>Qty: {u.qty_on_hand}</span>
                                    <span>· {u.sterile_status === "sterile" ? "Sterile" : "Non-sterile"}</span>
                                    {u.expiry_date && <span>· Exp: {String(u.expiry_date).slice(0, 10)}</span>}
                                  </div>
                                </div>
                                <div className="shrink-0">
                                  {isExpired || isBlocked ? (
                                    <Badge variant="destructive" className="text-[10px] py-0">Blocked</Badge>
                                  ) : isNearExpiry ? (
                                    <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 py-0">{days}d left</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[10px] text-emerald-600 py-0">FEFO Ready</Badge>
                                  )}
                                </div>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedUnitDetails && (
                    <div className="p-3 bg-muted/40 rounded-lg border border-border text-xs space-y-1.5">
                      <div className="font-semibold text-foreground flex items-center justify-between">
                        <span>Stock Unit Specifications</span>
                        <Badge variant="outline" className="text-[10px]">
                          {selectedUnitDetails.sterile_status === "sterile" ? "Sterile Packaging" : "Non-Sterile"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                        <div><span className="text-foreground font-medium">Batch/Lot:</span> {String(selectedUnitDetails.batch_no ?? selectedUnitDetails.lot_no ?? "—")}</div>
                        <div><span className="text-foreground font-medium">Serial No:</span> {String(selectedUnitDetails.serial_no ?? "—")}</div>
                        <div><span className="text-foreground font-medium">Expiry:</span> {selectedUnitDetails.expiry_date ? String(selectedUnitDetails.expiry_date).slice(0, 10) : "—"}</div>
                        <div><span className="text-foreground font-medium">UDI:</span> {String(selectedUnitDetails.udi_code ?? "—")}</div>
                        {selectedUnitDetails.sterilization_method ? (
                          <div className="col-span-1 sm:col-span-2"><span className="text-foreground font-medium">Sterilization:</span> {String(selectedUnitDetails.sterilization_method)}</div>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {pending?.meta?.warranty_months ? (
                    <Badge variant="secondary">Warranty {String(pending.meta.warranty_months)} mo (registration deferred)</Badge>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Demo mode — batch/expiry from catalog stub.</p>
              {Boolean(pending?.meta?.batch_no) && (
                <div className="p-3 bg-muted/40 rounded-lg border border-border text-xs space-y-1">
                  <div><span className="font-medium text-foreground">Batch:</span> {String(pending?.meta?.batch_no)}</div>
                  {pending?.meta?.expiry_date ? (
                    <div><span className="font-medium text-foreground">Expiry:</span> {String(pending.meta.expiry_date)}</div>
                  ) : null}
                  {Boolean(pending?.meta?.sterile) ? (
                    <div className="text-emerald-600 font-medium flex items-center gap-1 mt-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Sterile certified
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setPending(null)}>Cancel</Button>
            <Button className="w-full sm:w-auto" onClick={confirmAdd}>Add to cart</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warranty Card Registration Dialog */}
      <Dialog open={warrantyOpen} onOpenChange={setWarrantyOpen}>
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              <span>Surgical Equipment Warranty Registration</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 py-1 text-sm">
            <p className="text-xs text-muted-foreground">
              Register hospital / clinic warranty cards for autoclaves, surgical instrument sets, and OT equipment.
            </p>

            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Hospital / Clinic / Institute *</Label>
                <Input
                  placeholder="e.g. Dhaka Medical College Hospital / Popular Diagnostic"
                  value={warrantyForm.hospitalName}
                  onChange={(e) => setWarrantyForm((f) => ({ ...f, hospitalName: e.target.value }))}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Surgeon / Department Head</Label>
                <Input
                  placeholder="e.g. Prof. Dr. M. Rahman / Dept of Surgery"
                  value={warrantyForm.surgeonName}
                  onChange={(e) => setWarrantyForm((f) => ({ ...f, surgeonName: e.target.value }))}
                  className="h-9 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Serial / Lot / UDI Code</Label>
                  <Input
                    placeholder="e.g. SN-88392 / LOT-2026"
                    value={warrantyForm.serialOrLot}
                    onChange={(e) => setWarrantyForm((f) => ({ ...f, serialOrLot: e.target.value }))}
                    className="h-9 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Warranty Period</Label>
                  <Select
                    value={warrantyForm.warrantyMonths}
                    onValueChange={(v) => setWarrantyForm((f) => ({ ...f, warrantyMonths: v }))}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="12">12 Months (1 Year)</SelectItem>
                      <SelectItem value="24">24 Months (2 Years)</SelectItem>
                      <SelectItem value="36">36 Months (3 Years)</SelectItem>
                      <SelectItem value="60">60 Months (5 Years Replacement)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Equipment / Item Description</Label>
                <Input
                  placeholder="e.g. McIntosh Laryngoscope Set / Balfour Retractor"
                  value={warrantyForm.equipmentName}
                  onChange={(e) => setWarrantyForm((f) => ({ ...f, equipmentName: e.target.value }))}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setWarrantyOpen(false)}>
              Cancel
            </Button>
            <Button className="w-full sm:w-auto gap-1.5" onClick={handleSaveWarranty}>
              <CheckCircle2 className="h-4 w-4" />
              Register Certificate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

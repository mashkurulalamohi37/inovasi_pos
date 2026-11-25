import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Glasses,
  Layers,
  Send,
  Sparkles,
  Stethoscope,
  User,
  Wallet,
  Wrench, Search, Barcode } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";
import { opticalCatalog } from "@/lib/industry-mock";
import { fmtBDT } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import { PosShell, ProductGrid, PosProductCard } from "./PosShell";
import { usePosCatalog, type PosCatalogItem } from "@/hooks/use-pos-catalog";
import { usePosBarcodeScan } from "@/hooks/use-pos-barcode";
import {
  useOpticalFrames,
  useOpticalLenses,
  useOpticalPrescriptions,
} from "@/hooks/use-api-config";
import {
  useCreateOpticalOrder,
  useCreateOpticalPrescription,
  useConfirmOpticalOrder,
  useOpticalOrderAdvance,
  useFinalizeOpticalOrder,
} from "@/hooks/use-industry-backoffice";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { CustomerPicker, type CustomerSelection } from "@/features/sales/CustomerPicker";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";

export function OpticalShopPos() {
  const app = useApp();
  const useApi = shouldUseBackend();
  const [customer, setCustomer] = useState<CustomerSelection | undefined>();
  const [pickCustomer, setPickCustomer] = useState(false);
  const [rxId, setRxId] = useState<string>("");
  const [frameId, setFrameId] = useState<string>("");
  const [lensId, setLensId] = useState<string>("");
  const [coating, setCoating] = useState("anti-reflective");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [rxOpen, setRxOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [advanceAmt, setAdvanceAmt] = useState("500");
  const [deliveryPromiseDays, setDeliveryPromiseDays] = useState("3");

  const [rxForm, setRxForm] = useState({
    od_sphere: "-2.00",
    od_cylinder: "-0.50",
    od_axis: "180",
    od_addition: "+1.50",
    od_va: "6/6",
    od_pd: "31.5",
    os_sphere: "-1.75",
    os_cylinder: "-0.25",
    os_axis: "90",
    os_addition: "+1.50",
    os_va: "6/6",
    os_pd: "31.5",
    pd: "63",
    pd_near: "60",
    fitting_height: "18",
    doctor_name: "",
    notes: "",
  });

  const [repairOpen, setRepairOpen] = useState(false);
  const [repairForm, setRepairForm] = useState({
    serviceType: "nose_pad",
    frameBrand: "",
    issueNotes: "Replace silicone nose pads & frame alignment",
    charge: "80",
    isUrgent: false,
    deliveryDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  });

  const repairOptions = [
    { id: "nose_pad", label: "Silicone Nose Pad Replacement (Pair)", price: 80 },
    { id: "alignment", label: "Frame Alignment & Temple Adjustment", price: 100 },
    { id: "screw_fix", label: "Screw & Hinge Tightening / Replacement", price: 50 },
    { id: "lens_edging", label: "Lens Re-Fitting & Edging", price: 150 },
    { id: "temple_replace", label: "Temple / Arm Replacement", price: 250 },
    { id: "cleaning", label: "Ultrasonic Deep Cleaning & Polishing", price: 50 },
    { id: "warranty_remake", label: "Warranty Remake / Lens Replacement", price: 0 },
    { id: "custom", label: "Custom Eyewear Repair Service", price: 100 },
  ];

  const handleAddRepairToCart = () => {
    const selectedOpt = repairOptions.find(o => o.id === repairForm.serviceType);
    const label = selectedOpt ? selectedOpt.label : "Eyewear Repair Service";
    const price = Number(repairForm.charge) || 0;

    app.addToCart({
      sku: `SRV-OPT-${repairForm.serviceType.toUpperCase()}`,
      name: `Repair: ${label}`,
      price,
      qty: 1,
      industry: "optical-shop",
      extras: {
        repairType: label,
        frameBrand: repairForm.frameBrand || "Customer Frame",
        issueNotes: repairForm.issueNotes,
        deliveryDate: repairForm.deliveryDate,
        customerName: customer?.name || "Walk-in Customer",
        isUrgent: repairForm.isUrgent,
      },
    });

    const ticketNo = `REP-${Date.now().toString().slice(-6)}`;
    toast.success(`Repair ticket ${ticketNo} added to cart (৳${price})`);
    setRepairOpen(false);
  };

  const demoItems = useMemo(() => opticalCatalog.map(m => ({
    id: m.sku,
    sku: m.sku,
    name: m.name,
    price: m.price,
    stock: 99,
    meta: { category: m.category, brand: m.brand, lens_power: m.lensPower, frame_size: m.frameSize, coating: m.coating },
  })), []);

  const catalog = usePosCatalog("optical-shop", demoItems);
  const frames = useOpticalFrames();
  const lenses = useOpticalLenses();
  const prescriptions = useOpticalPrescriptions(customer?.id ? { customer_id: customer.id } : undefined);
  const createRx = useCreateOpticalPrescription();
  const createOrder = useCreateOpticalOrder();
  const confirmOrder = useConfirmOpticalOrder();
  const advance = useOpticalOrderAdvance();
  const finalize = useFinalizeOpticalOrder();
  const barcode = usePosBarcodeScan({
    fromBackend: useApi && catalog.fromBackend,
    catalogItems: catalog.items,
    onAdd: (item) => {
      app.addToCart({
        sku: item.sku,
        name: item.name,
        price: item.price,
        qty: 1,
        industry: "optical-shop",
        extras: { brand: String(item.meta?.brand ?? ""), coating: String(item.meta?.coating || coating || "") },
      });
      toast.success(`Added ${item.name}`);
    },
  });

  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return catalog.items;
    return catalog.items.filter((item) =>
      [item.name, item.sku, item.barcode, item.meta?.brand, item.meta?.category].some((x) =>
        String(x ?? "").toLowerCase().includes(q)
      )
    );
  }, [catalog.items, search]);

  const handleOpticalScan = async () => {
    const code = (barcode.barcode || search).trim();
    if (!code) return;
    barcode.setBarcode(code);
    const match = catalog.items.find(
      (i) =>
        (i.barcode && i.barcode.toLowerCase() === code.toLowerCase()) ||
        (i.meta?.barcode && String(i.meta.barcode).toLowerCase() === code.toLowerCase()) ||
        i.sku.toLowerCase() === code.toLowerCase()
    );
    if (match) {
      const cat = String(match.meta?.category ?? "").toLowerCase();
      if (useApi && (cat.includes("frame") || cat.includes("lens"))) {
        setWizardOpen(true);
      } else {
        app.addToCart({
          sku: match.sku,
          name: match.name,
          price: match.price,
          qty: 1,
          industry: "optical-shop",
          extras: { brand: String(match.meta?.brand ?? ""), coating: String(match.meta?.coating || coating || "") },
        });
        toast.success(`Added ${match.name}`);
      }
      barcode.setBarcode("");
      setSearch("");
      return;
    }
    if (filtered.length === 1) {
      const single = filtered[0];
      const cat = String(single.meta?.category ?? "").toLowerCase();
      if (useApi && (cat.includes("frame") || cat.includes("lens"))) {
        setWizardOpen(true);
      } else {
        app.addToCart({
          sku: single.sku,
          name: single.name,
          price: single.price,
          qty: 1,
          industry: "optical-shop",
          extras: { brand: String(single.meta?.brand ?? ""), coating: String(single.meta?.coating || coating || "") },
        });
        toast.success(`Added ${single.name}`);
      }
      barcode.setBarcode("");
      setSearch("");
      return;
    }
    await barcode.handleScan();
    barcode.setBarcode("");
    setSearch("");
  };

  const frameOptions = useApi ? (frames.data ?? []) : [];
  const lensOptions = useApi ? (lenses.data ?? []) : [];

  const selectedFrame = useMemo(() => {
    return frameOptions.find(f => String(f.product_id) === frameId || String(f.id) === frameId);
  }, [frameOptions, frameId]);

  const selectedLens = useMemo(() => {
    return lensOptions.find(l => String(l.product_id) === lensId || String(l.id) === lensId);
  }, [lensOptions, lensId]);

  const estimatedOrderTotal = useMemo(() => {
    const framePrice = Number(selectedFrame?.selling_price ?? 0);
    const lensPrice = Number(selectedLens?.selling_price ?? 0);
    const coatingAddon = coating === "blue-cut" ? 500 : coating === "photochromic" ? 800 : 0;
    return framePrice + lensPrice + coatingAddon;
  }, [selectedFrame, selectedLens, coating]);

  const createOrderFlow = async () => {
    if (!useApi) return;
    if (!customer?.id) {
      toast.error("Select a customer");
      return;
    }
    if (!frameId || !lensId) {
      toast.error("Select frame and lens");
      return;
    }
    const frame = frameOptions.find(f => String(f.product_id) === frameId || String(f.id) === frameId);
    const lens = lensOptions.find(l => String(l.product_id) === lensId || String(l.id) === lensId);
    const order = await createOrder.mutateAsync({
      customer_id: customer.id,
      prescription_id: rxId || undefined,
      lines: [
        {
          line_type: "frame",
          product_id: String(frame?.product_id ?? frameId),
          qty: 1,
          unit_price: Number(frame?.selling_price ?? 0),
        },
        {
          line_type: "lens_pair",
          product_id: String(lens?.product_id ?? lensId),
          qty: 1,
          unit_price: Number(lens?.selling_price ?? 0),
          configuration: {
            coating,
            prescription_id: rxId || null,
            od: rxForm.od_sphere ? `SPH ${rxForm.od_sphere} CYL ${rxForm.od_cylinder} AXIS ${rxForm.od_axis}°` : undefined,
            os: rxForm.os_sphere ? `SPH ${rxForm.os_sphere} CYL ${rxForm.os_cylinder} AXIS ${rxForm.os_axis}°` : undefined,
            pd: rxForm.pd,
            monocular_pd: `R:${rxForm.od_pd} L:${rxForm.os_pd}`,
          },
        },
      ],
    });
    const confirmed = await confirmOrder.mutateAsync({ orderId: String(order.id) });
    setActiveOrderId(String(confirmed.id));
    setWizardOpen(false);
    toast.success(`Order ${confirmed.order_no} confirmed`);
  };

  const saveRx = async () => {
    if (!customer?.id) {
      toast.error("Select a customer first");
      return;
    }
    const rx = await createRx.mutateAsync({
      customer_id: customer.id,
      doctor_name: rxForm.doctor_name || undefined,
      od: {
        sphere: Number(rxForm.od_sphere) || 0,
        cylinder: Number(rxForm.od_cylinder) || 0,
        axis: Number(rxForm.od_axis) || 0,
        addition: Number(rxForm.od_addition) || undefined,
        visual_acuity: rxForm.od_va || undefined,
      },
      os: {
        sphere: Number(rxForm.os_sphere) || 0,
        cylinder: Number(rxForm.os_cylinder) || 0,
        axis: Number(rxForm.os_axis) || 0,
        addition: Number(rxForm.os_addition) || undefined,
        visual_acuity: rxForm.os_va || undefined,
      },
      pd: Number(rxForm.pd) || undefined,
      pd_near: Number(rxForm.pd_near) || undefined,
      fitting_height: Number(rxForm.fitting_height) || undefined,
      notes: rxForm.notes || undefined,
    });
    setRxId(String(rx.id));
    setRxOpen(false);
    toast.success(`Prescription ${rx.prescription_no} saved`);
    prescriptions.refetch();
  };

  return (
    <>
      <PosShell
        industry="optical-shop"
        title="Optical Shop POS"
        subtitle={
          useApi
            ? `Customer ${customer?.name ?? "—"} · Rx ${rxId ? "selected" : "none"} · Order ${activeOrderId ? "active" : "—"}`
            : "Frames · lenses · contact lenses · accessories"
        }
        receiptNote="Prescription eyewear uses Optical Order workflow"
        cartLineExtra={(line) => (
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            <div>
              {line.extras?.brand ? `Brand: ${String(line.extras.brand)}` : ""}
              {line.extras?.frame_size ? ` · Size: ${String(line.extras.frame_size)}` : ""}
              {line.extras?.lens_power ? ` · Power: ${String(line.extras.lens_power)}` : ""}
              {line.extras?.coating ? ` · Coating: ${String(line.extras.coating)}` : ""}
            </div>
            {line.extras?.od_summary && (
              <div className="text-primary font-medium">
                OD: {String(line.extras.od_summary)} · OS: {String(line.extras.os_summary ?? "")}
                {line.extras.pd ? ` · PD: ${String(line.extras.pd)}mm` : ""}
              </div>
            )}
          </div>
        )}
        onBeforeComplete={() => {
          if (useApi) {
            toast.error("Use Optical Order wizard for prescription eyewear; accessories can use Complete sale in demo cart only when not using order flow");
            return !activeOrderId;
          }
          return true;
        }}
        headerBadges={
          <>
            {useApi ? (
              <>
                <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => setPickCustomer(true)}>
                  <User className="h-3 w-3" />
                  {customer ? customer.name : "Customer"}
                </Button>
                <Button size="sm" variant="default" className="h-7 gap-1 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setWizardOpen(true)}>
                  <Glasses className="h-3 w-3" /> New optical order
                </Button>
                {activeOrderId && (
                  <>
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-sky-600" onClick={() => toast.success(`Readiness SMS & WhatsApp notification sent to ${customer?.name ?? "Customer"}`)}>
                      <Send className="h-3 w-3" />
                      Notify Ready
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => setAdvanceOpen(true)}>
                      <Wallet className="h-3 w-3 text-amber-500" />
                      Advance
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 gap-1"
                      disabled={finalize.isPending}
                      onClick={() => void finalize.mutateAsync({ orderId: activeOrderId, body: { tender: "cash" } })
                        .then(r => {
                          toast.success(`Invoiced ${String((r.invoice as Record<string, unknown>)?.invoice_number ?? "")}`);
                          setActiveOrderId(null);
                        })
                        .catch(e => toast.error(String((e as Error)?.message ?? e)))}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Finalize &amp; pay
                    </Button>
                  </>
                )}
              </>
            ) : (
              <DisabledReasonButton
                label="Optical order wizard"
                reason="Connect backend for prescription orders, lab workflow, and settlement"
              />
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-foreground border-border/80 hover:bg-secondary"
              onClick={() => setRepairOpen(true)}
            >
              <Wrench className="h-3 w-3 text-amber-500" />
              Repair / remake
            </Button>
          </>
        }
        catalog={
          <>
            {useApi && (
              <form
                className="flex flex-wrap gap-2 border-b border-border px-4 py-2 bg-muted/20"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleOpticalScan();
                }}
              >
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-8 pl-8 pr-8 text-xs font-mono"
                    placeholder="Search frame, lens, brand, or scan barcode / SKU (Enter to add)…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      barcode.setBarcode(e.target.value);
                    }}
                  />
                  <Barcode className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
                </div>
                <Button size="sm" variant="outline" className="h-8 text-xs" type="submit" disabled={barcode.isPending}>
                  Scan
                </Button>
              </form>
            )}
            <ProductGrid
              items={filtered}
              onAdd={item => {
                const m = item as PosCatalogItem;
                // Accessories / simple items → cart; prescription eyewear → wizard
                const cat = String(m.meta?.category ?? "").toLowerCase();
                if (useApi && (cat.includes("frame") || cat.includes("lens"))) {
                  toast.message("Use New optical order for frames/lenses configuration");
                  setWizardOpen(true);
                  return;
                }
                app.addToCart({
                  sku: m.sku,
                  name: m.name,
                  price: m.price,
                  qty: 1,
                  industry: "optical-shop",
                  extras: { brand: String(m.meta?.brand ?? ""), coating: String(m.meta?.coating || coating || ""), frame_size: String(m.meta?.frame_size ?? "") },
                });
                toast.success(`Added ${m.name}`);
              }}
              renderCard={item => {
                const m = item as PosCatalogItem;
                return (
                  <PosProductCard
                    badge={String(m.meta?.category ?? "Optical")}
                    title={m.name}
                    subtitle={String(m.meta?.brand ?? m.meta?.lens_power ?? m.meta?.frame_size ?? "")}
                    price={fmtBDT(m.price)}
                    industry="optical-shop"
                    sku={m.sku}
                    imageUrl={(m.meta?.image_url as string) || (m.meta?.image as string)}
                    footer={
                      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{m.meta?.frame_size ? `Size ${String(m.meta.frame_size)}` : (m.meta?.coating ? String(m.meta.coating) : "Standard")}</span>
                        {m.meta?.lens_power ? (
                          <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">
                            {String(m.meta.lens_power)}
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

      <CustomerPicker
        open={pickCustomer}
        onOpenChange={setPickCustomer}
        onSelect={c => {
          setCustomer(c);
          setRxId("");
          setPickCustomer(false);
        }}
      />

      {/* Optical Order Wizard Dialog */}
      <Dialog
        open={wizardOpen}
        onOpenChange={(v) => {
          if (!v && (pickCustomer || rxOpen)) return;
          setWizardOpen(v);
        }}
      >
        <DialogContent
          className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden"
          onPointerDownOutside={(e) => {
            if (pickCustomer || rxOpen) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (pickCustomer || rxOpen) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Glasses className="h-5 w-5 text-primary" />
              <span>Create Custom Optical Order</span>
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-3.5 text-sm py-1">
            {/* Customer & Prescription Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-muted/40 rounded-lg border border-border">
              <div className="min-w-0">
                <Label className="text-xs font-semibold">Customer</Label>
                <div className="flex gap-2 mt-1">
                  <Input readOnly value={customer?.name ?? ""} placeholder="Select customer" className="h-9 text-xs flex-1 min-w-0" />
                  <Button type="button" size="sm" variant="outline" className="shrink-0 h-9" onClick={() => setPickCustomer(true)}>Pick</Button>
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Prescription (OD/OS)</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px] gap-1 shrink-0 text-primary border-primary/30 hover:bg-primary/10"
                    onClick={() => setRxOpen(true)}
                  >
                    <Eye className="h-3 w-3" />
                    + New Rx
                  </Button>
                </div>
                <div className="mt-1">
                  <Select value={rxId || "none"} onValueChange={v => setRxId(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-9 text-xs w-full min-w-0">
                      <SelectValue placeholder="Select Rx" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      <SelectItem value="none">None / capture new</SelectItem>
                      {(prescriptions.data ?? []).map(r => (
                        <SelectItem key={String(r.id)} value={String(r.id)}>
                          <span className="truncate">{String(r.prescription_no)} · {String((r.summary as Record<string, string>)?.od ?? "")}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Frame Selection */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Glasses className="h-3.5 w-3.5 text-primary" />
                  Select Eyeglass Frame
                </Label>
                {selectedFrame && (
                  <span className="text-[11px] text-muted-foreground">
                    Stock: {String(selectedFrame.stock_qty ?? 0)} pcs · {String(selectedFrame.material ?? "Acetate")}
                  </span>
                )}
              </div>
              <Select value={frameId} onValueChange={setFrameId}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="Choose frame (brand, size, model)…" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {frameOptions.map(f => (
                    <SelectItem key={String(f.product_id)} value={String(f.product_id)}>
                      <div className="flex items-center justify-between gap-2 sm:gap-4 w-full text-xs">
                        <span className="truncate">{String(f.name)} ({String(f.sku)})</span>
                        <span className="font-semibold text-primary shrink-0">{fmtBDT(Number(f.selling_price ?? 0))}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Lens Pair Selection */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  Select Prescription Lens Pair
                </Label>
                {selectedLens && (
                  <span className="text-[11px] text-muted-foreground">
                    Index: {String(selectedLens.refractive_index ?? "1.56")} · {String(selectedLens.lens_type ?? "Single Vision")}
                  </span>
                )}
              </div>
              <Select value={lensId} onValueChange={setLensId}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="Choose lens pair (index, single vision, bifocal)…" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {lensOptions.map(l => (
                    <SelectItem key={String(l.product_id)} value={String(l.product_id)}>
                      <div className="flex items-center justify-between gap-2 sm:gap-4 w-full text-xs">
                        <span className="truncate">{String(l.name)} ({String(l.sku)})</span>
                        <span className="font-semibold text-primary shrink-0">{fmtBDT(Number(l.selling_price ?? 0))}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Coating & Delivery */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  Lens Coating
                </Label>
                <Select value={coating} onValueChange={setCoating}>
                  <SelectTrigger className="h-9 text-xs w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anti-reflective">Anti-Reflective (ARC)</SelectItem>
                    <SelectItem value="blue-cut">Blue-Cut / Computer Shield (+৳500)</SelectItem>
                    <SelectItem value="photochromic">Photochromic Day/Night (+৳800)</SelectItem>
                    <SelectItem value="none">Standard Uncoated</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <Clock className="h-3 w-3 text-primary" />
                  Delivery Promise (Days)
                </Label>
                <Input
                  type="number"
                  min="1"
                  max="14"
                  value={deliveryPromiseDays}
                  onChange={e => setDeliveryPromiseDays(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Order Summary Footer Box */}
            <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
              <div>
                <span className="font-medium text-foreground">Estimated Order Total: </span>
                <span className="font-bold text-base text-primary">{fmtBDT(estimatedOrderTotal)}</span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Advance can be recorded after confirmation
              </span>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setWizardOpen(false)}>Cancel</Button>
            <Button
              className="w-full sm:w-auto"
              disabled={createOrder.isPending || confirmOrder.isPending || !customer?.id || !frameId || !lensId}
              onClick={() => void createOrderFlow().catch(e => toast.error(String((e as Error)?.message ?? e)))}
            >
              Confirm optical order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prescription Capture Dialog */}
      <Dialog
        open={rxOpen}
        onOpenChange={(v) => {
          if (!v && pickCustomer) return;
          setRxOpen(v);
        }}
      >
        <DialogContent
          className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto"
          onPointerDownOutside={(e) => {
            if (pickCustomer) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (pickCustomer) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              <span>Capture Optical Prescription</span>
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Enter clinical refraction measurements (OD: Right Eye, OS: Left Eye) and Dual Monocular PD for retail lens edging and fitting.
          </p>

          <div className="space-y-3 py-1">
            {/* OD Table */}
            <div className="p-3 bg-muted/40 rounded-lg border border-border space-y-2">
              <span className="text-xs font-bold text-foreground flex items-center gap-1">
                <Badge variant="outline" className="text-[10px] py-0">OD</Badge>
                Right Eye
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">SPH</Label>
                  <Input value={rxForm.od_sphere} onChange={e => setRxForm(f => ({ ...f, od_sphere: e.target.value }))} placeholder="-2.00" className="h-8 text-xs font-mono" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">CYL</Label>
                  <Input value={rxForm.od_cylinder} onChange={e => setRxForm(f => ({ ...f, od_cylinder: e.target.value }))} placeholder="-0.50" className="h-8 text-xs font-mono" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">AXIS (0-180)</Label>
                  <Input value={rxForm.od_axis} onChange={e => setRxForm(f => ({ ...f, od_axis: e.target.value }))} placeholder="180" className="h-8 text-xs font-mono" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">ADD</Label>
                  <Input value={rxForm.od_addition} onChange={e => setRxForm(f => ({ ...f, od_addition: e.target.value }))} placeholder="+1.50" className="h-8 text-xs font-mono" />
                </div>
              </div>
            </div>

            {/* OS Table */}
            <div className="p-3 bg-muted/40 rounded-lg border border-border space-y-2">
              <span className="text-xs font-bold text-foreground flex items-center gap-1">
                <Badge variant="outline" className="text-[10px] py-0">OS</Badge>
                Left Eye
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">SPH</Label>
                  <Input value={rxForm.os_sphere} onChange={e => setRxForm(f => ({ ...f, os_sphere: e.target.value }))} placeholder="-1.75" className="h-8 text-xs font-mono" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">CYL</Label>
                  <Input value={rxForm.os_cylinder} onChange={e => setRxForm(f => ({ ...f, os_cylinder: e.target.value }))} placeholder="-0.25" className="h-8 text-xs font-mono" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">AXIS (0-180)</Label>
                  <Input value={rxForm.os_axis} onChange={e => setRxForm(f => ({ ...f, os_axis: e.target.value }))} placeholder="90" className="h-8 text-xs font-mono" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">ADD</Label>
                  <Input value={rxForm.os_addition} onChange={e => setRxForm(f => ({ ...f, os_addition: e.target.value }))} placeholder="+1.50" className="h-8 text-xs font-mono" />
                </div>
              </div>
            </div>

            {/* Monocular Dual PD & Optometrist */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <Label className="text-[11px] text-muted-foreground">OD PD (mm)</Label>
                <Input
                  value={rxForm.od_pd}
                  onChange={e => {
                    const od = e.target.value;
                    const total = (Number(od) || 0) + (Number(rxForm.os_pd) || 0);
                    setRxForm(f => ({ ...f, od_pd: od, pd: total ? String(total) : f.pd }));
                  }}
                  placeholder="31.5"
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">OS PD (mm)</Label>
                <Input
                  value={rxForm.os_pd}
                  onChange={e => {
                    const os = e.target.value;
                    const total = (Number(rxForm.od_pd) || 0) + (Number(os) || 0);
                    setRxForm(f => ({ ...f, os_pd: os, pd: total ? String(total) : f.pd }));
                  }}
                  placeholder="31.5"
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Total PD (mm)</Label>
                <Input value={rxForm.pd} onChange={e => setRxForm(f => ({ ...f, pd: e.target.value }))} placeholder="63" className="h-8 text-xs font-mono" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Fitting Height (mm)</Label>
                <Input value={rxForm.fitting_height} onChange={e => setRxForm(f => ({ ...f, fitting_height: e.target.value }))} placeholder="18" className="h-8 text-xs font-mono" />
              </div>
            </div>

            <div>
              <Label className="text-[11px] text-muted-foreground">Doctor / Optometrist</Label>
              <Input value={rxForm.doctor_name} onChange={e => setRxForm(f => ({ ...f, doctor_name: e.target.value }))} placeholder="Dr. S. Rahman" className="h-8 text-xs" />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setRxOpen(false)}>Cancel</Button>
            <Button className="w-full sm:w-auto" disabled={createRx.isPending} onClick={() => void saveRx().catch(e => toast.error(String((e as Error)?.message ?? e)))}>
              Save prescription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Advance Dialog */}
      <ConfirmActionDialog
        open={advanceOpen}
        onOpenChange={setAdvanceOpen}
        title="Record advance payment"
        description="Advance is tracked against the optical order and credited during final settlement."
        confirmLabel="Record advance"
        isPending={advance.isPending}
        onConfirm={async () => {
          if (!activeOrderId) return;
          await advance.mutateAsync({
            orderId: activeOrderId,
            body: { amount: Number(advanceAmt) || 0, method: "cash" },
          });
          toast.success("Advance payment recorded");
          setAdvanceOpen(false);
        }}
      >
        <div className="px-1 py-2 space-y-2">
          <Label className="text-xs">Advance Amount (৳)</Label>
          <Input type="number" value={advanceAmt} onChange={e => setAdvanceAmt(e.target.value)} className="h-9 font-mono" />
        </div>
      </ConfirmActionDialog>

      {/* Optical Repair & Remake Service Dialog */}
      <Dialog open={repairOpen} onOpenChange={setRepairOpen}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-amber-500" />
              <span>Optical Repair &amp; Remake Service</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 py-1 text-sm">
            <p className="text-xs text-muted-foreground">
              Create an after-sales repair ticket or custom eyewear remake job and bill service charges at the counter.
            </p>

            {/* Repair Type Preset */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Repair / Service Type</Label>
              <Select
                value={repairForm.serviceType}
                onValueChange={(val) => {
                  const found = repairOptions.find((o) => o.id === val);
                  setRepairForm((f) => ({
                    ...f,
                    serviceType: val,
                    charge: found ? String(found.price) : f.charge,
                    issueNotes: found ? found.label : f.issueNotes,
                  }));
                }}
              >
                <SelectTrigger className="h-10 w-full text-xs">
                  <SelectValue placeholder="Select repair service" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {repairOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      <div className="flex items-center justify-between gap-3 w-full text-xs">
                        <span>{opt.label}</span>
                        <span className="font-semibold text-primary shrink-0">
                          {opt.price === 0 ? "Free (Warranty)" : fmtBDT(opt.price)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Frame Brand & Model */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Frame Brand / Model</Label>
                <Input
                  placeholder="e.g. Ray-Ban RB5154 / Metal Frame"
                  value={repairForm.frameBrand}
                  onChange={(e) => setRepairForm((f) => ({ ...f, frameBrand: e.target.value }))}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Service Charge (৳)</Label>
                <Input
                  type="number"
                  placeholder="80"
                  value={repairForm.charge}
                  onChange={(e) => setRepairForm((f) => ({ ...f, charge: e.target.value }))}
                  className="h-9 text-xs font-mono font-semibold text-primary"
                />
              </div>
            </div>

            {/* Problem Description / Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Issue Details &amp; Technician Notes</Label>
              <Input
                placeholder="e.g. Broken right temple hinge, replace screw and adjust fit"
                value={repairForm.issueNotes}
                onChange={(e) => setRepairForm((f) => ({ ...f, issueNotes: e.target.value }))}
                className="h-9 text-xs"
              />
            </div>

            {/* Delivery Date */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Estimated Ready / Delivery Date</Label>
              <Input
                type="date"
                value={repairForm.deliveryDate}
                onChange={(e) => setRepairForm((f) => ({ ...f, deliveryDate: e.target.value }))}
                className="h-9 text-xs font-mono"
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setRepairOpen(false)}>
              Cancel
            </Button>
            <Button className="w-full sm:w-auto gap-1.5" onClick={handleAddRepairToCart}>
              <CheckCircle2 className="h-4 w-4" />
              Add service to cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

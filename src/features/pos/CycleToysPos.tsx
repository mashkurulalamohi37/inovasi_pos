import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bike,
  Wrench,
  Battery,
  Gift,
  Boxes,
  Plus,
  ShieldCheck,
  Search,
  Printer,
  Sparkles,
  Gamepad2,
  Tag,
  X,
  PackageCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";
import { cycleToysCatalog } from "@/lib/industry-mock";
import { fmtBDT } from "@/lib/pos-data";
import { PosShell, ProductGrid, PosProductCard, CartPill } from "./PosShell";
import { usePosCatalog, catalogToCartExtras, type PosCatalogItem } from "@/hooks/use-pos-catalog";
import { useCategories, useBrands } from "@/hooks/use-api-config";
import { shouldUseBackend } from "@/lib/demo-mode";
import { readStorage, writeStorage } from "@/lib/pulse-storage";
import { formatApiError } from "@/lib/api";
import { useReceiptBrand } from "@/hooks/use-receipt-brand";
import {
  useCreateCycleAssemblyOrder,
  useCreateCycleBatteryLog,
  useCreateCycleInspection,
  useCreateCycleServiceJob,
} from "@/hooks/use-industry-backoffice";

type CycleToysPosItem = PosCatalogItem & {
  category?: string;
  brand?: string;
  wheelSize?: string;
  ageGroup?: string;
  assemblyStatus?: string;
  assemblyFee?: number;
  batterySpec?: string;
  batteryRequired?: string;
  gearType?: string;
  frameMaterial?: string;
  safetyCert?: string;
  isBoxed?: boolean;
  isElectric?: boolean;
  chokingHazard?: boolean;
  frameSerialRequired?: boolean;
};

const STANDARD_AGE_GROUPS = [
  "0-12 Months",
  "1-3 Years",
  "3-5 Years",
  "6-8 Years",
  "9-12 Years",
  "13+ / Adult",
];

function isServiceItem(item: { sku?: string; category?: string }): boolean {
  const cat = (item.category || "").toLowerCase();
  const sku = (item.sku || "").toUpperCase();
  return (
    sku.startsWith("WRK-") ||
    sku === "GIFT-WRAP" ||
    cat.includes("workshop") ||
    cat.includes("service") ||
    cat.includes("assembly charge")
  );
}

function isReadyToRideStatus(status?: string): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s.includes("ready-to-ride") || (s.includes("assembled") && !s.includes("unassembled") && !s.includes("boxed"));
}

function isBoxedStatus(status?: string): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s.includes("boxed") || s.includes("skd") || s.includes("unassembled");
}

function isSafetyAccessoryCategory(category?: string): boolean {
  if (!category) return false;
  const c = category.toLowerCase();
  return c.includes("spares") || c.includes("accessories") || c.includes("helmet") || c.includes("gear");
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function CycleToysPos() {
  const app = useApp();
  const useApi = shouldUseBackend();
  const receiptBrand = useReceiptBrand("cycle-toys");

  const createAssemblyMut = useCreateCycleAssemblyOrder();
  const createServiceJobMut = useCreateCycleServiceJob();
  const createBatteryLogMut = useCreateCycleBatteryLog();
  const createInspectionMut = useCreateCycleInspection();

  // Feature flags (default enabled unless explicitly turned off)
  const flagAssembly = app.flags["cycle_toys.assembly_service"] !== false;
  const flagWorkshop = app.flags["cycle_toys.workshop_service"] !== false;
  const flagSizeAge = app.flags["cycle_toys.size_age_matrix"] !== false;
  const flagBattery = app.flags["cycle_toys.battery_rideon"] !== false;
  const flagCrossSell = app.flags["cycle_toys.accessories_cross_sell"] !== false;
  const flagGift = app.flags["cycle_toys.gift_packaging"] !== false;
  const flagSafety = app.flags["cycle_toys.safety_compliance"] !== false;

  const [selectedCategory, setSelectedCategory] = useState("All");
  const [filterReadyToRide, setFilterReadyToRide] = useState(false);
  const [filterBoxed, setFilterBoxed] = useState(false);
  const [filterElectric, setFilterElectric] = useState(false);
  const [filterAgeGroup, setFilterAgeGroup] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Dynamic receipt stamps collected during the active sale (serials, PDI, RC bench, battery)
  const [saleStamps, setSaleStamps] = useState<string[]>([]);

  // Clear sale stamps automatically when cart is emptied after checkout
  useEffect(() => {
    if (app.cart.length === 0 && saleStamps.length > 0) {
      setSaleStamps([]);
    }
  }, [app.cart.length, saleStamps.length]);

  // Modals state
  const [serviceJobOpen, setServiceJobOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [bikeModel, setBikeModel] = useState("");
  const [serviceType, setServiceType] = useState("Complete Overhaul & Tuning");
  const [serviceCost, setServiceCost] = useState("600");
  const [assignedMechanic, setAssignedMechanic] = useState("Master Mechanic Kabir");

  const [giftOpen, setGiftOpen] = useState(false);
  const [giftTheme, setGiftTheme] = useState<"cartoon" | "festive" | "luxury">("cartoon");
  const [giftRecipient, setGiftRecipient] = useState("");
  const [giftGreeting, setGiftGreeting] = useState("Happy Birthday!");

  // 1: Frame Serial Number & Anti-Theft Tagging
  const [frameSerialOpen, setFrameSerialOpen] = useState(false);
  const [selectedCycleForSerial, setSelectedCycleForSerial] = useState("");
  const [stampedFrameSerial, setStampedFrameSerial] = useState("");
  const [ownerNidOrPhone, setOwnerNidOrPhone] = useState("");
  const [frameColor, setFrameColor] = useState("Matte Black / Cyan");

  // 2: 5-Point Pre-Delivery Inspection (PDI) Checklist
  const [pdiOpen, setPdiOpen] = useState(false);
  const [pdiCheck1, setPdiCheck1] = useState(true);
  const [pdiCheck2, setPdiCheck2] = useState(true);
  const [pdiCheck3, setPdiCheck3] = useState(true);
  const [pdiCheck4, setPdiCheck4] = useState(true);
  const [pdiCheck5, setPdiCheck5] = useState(true);
  const [pdiInspector, setPdiInspector] = useState("Master Mechanic Kabir");

  // 3: Price-Hidden Gift Exchange Receipt
  const [giftReceiptOpen, setGiftReceiptOpen] = useState(false);

  // 4: Gift Finder Wizard
  const [giftFinderOpen, setGiftFinderOpen] = useState(false);
  const [wizardAge, setWizardAge] = useState("3-5 Years");
  const [wizardInterest, setWizardInterest] = useState("All");

  // 5: RC Toy & Drone Pre-Handover Bench Test
  const [rcBenchTestOpen, setRcBenchTestOpen] = useState(false);
  const [rcToyModel, setRcToyModel] = useState("");
  const [rcRemotePaired, setRcRemotePaired] = useState(true);
  const [rcMotorTested, setRcMotorTested] = useState(true);
  const [rcSteeringAligned, setRcSteeringAligned] = useState(true);
  const [rcChargerVerified, setRcChargerVerified] = useState(true);

  // 6: Battery test modal
  const [batteryTestOpen, setBatteryTestOpen] = useState(false);
  const [batteryModel, setBatteryModel] = useState("");
  const [batterySerial, setBatterySerial] = useState("");
  const [batteryCustomerName, setBatteryCustomerName] = useState("");
  const [batteryVoltageRating, setBatteryVoltageRating] = useState<"6V" | "12V" | "24V">("12V");
  const [measuredVoltage, setMeasuredVoltage] = useState("12.6V");
  const [remotePaired, setRemotePaired] = useState(true);
  const [pdiStatus, setPdiStatus] = useState<"Passed PDI" | "Charged 100%" | "Warranty Service">("Passed PDI");

  const demoItems = useMemo((): CycleToysPosItem[] => {
    return cycleToysCatalog.map((item) => ({
      id: item.sku,
      sku: item.sku,
      name: item.name,
      price: item.price,
      stock: item.stock,
      barcode: item.barcode,
      meta: {
        category: item.category,
        brand: item.brand,
        wheelSize: item.wheelSize,
        ageGroup: item.ageGroup,
        assemblyStatus: item.assemblyStatus,
        assemblyFee: item.assemblyFee,
        batterySpec: item.batterySpec,
        batteryRequired: item.batteryRequired,
        gearType: item.gearType,
        frameMaterial: item.frameMaterial,
        safetyCert: item.safetyCert,
        isBoxed: item.isBoxed,
        isElectric: item.isElectric,
        chokingHazard: item.chokingHazard,
        frameSerialRequired: item.frameSerialRequired,
      },
      category: item.category,
      brand: item.brand,
      wheelSize: item.wheelSize,
      ageGroup: item.ageGroup,
      assemblyStatus: item.assemblyStatus,
      assemblyFee: item.assemblyFee,
      batterySpec: item.batterySpec,
      batteryRequired: item.batteryRequired,
      gearType: item.gearType,
      frameMaterial: item.frameMaterial,
      safetyCert: item.safetyCert,
      isBoxed: item.isBoxed,
      isElectric: item.isElectric,
      chokingHazard: item.chokingHazard,
      frameSerialRequired: item.frameSerialRequired,
    }));
  }, []);

  const catalog = usePosCatalog("cycle-toys", demoItems);
  const categoriesQuery = useCategories({ industry: "cycle-toys" }, useApi);
  const brandsQuery = useBrands({ industry: "cycle-toys" }, useApi);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categoriesQuery.data ?? []) {
      map.set(c.id, c.name);
    }
    return map;
  }, [categoriesQuery.data]);

  const brandNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of brandsQuery.data ?? []) {
      map.set(b.id, b.name);
    }
    return map;
  }, [brandsQuery.data]);

  const catalogItems = useMemo((): CycleToysPosItem[] => {
    return catalog.items.map((p) => {
      const meta = (p.meta ?? {}) as Record<string, unknown>;
      const catId = meta.category_id as string | undefined;
      const brandId = meta.brand_id as string | undefined;
      const rawCategory =
        (meta.category as string) ||
        (catId ? categoryNameById.get(catId) : undefined) ||
        (p as CycleToysPosItem).category ||
        "General";
      const rawBrand =
        (meta.brand as string) ||
        (brandId ? brandNameById.get(brandId) : undefined) ||
        (p as CycleToysPosItem).brand ||
        "";
      const rawAssembly = (meta.assembly_status as string) ?? (meta.assemblyStatus as string) ?? (p as CycleToysPosItem).assemblyStatus;
      const rawBattery =
        (meta.battery_spec as string) ??
        (meta.battery_type as string) ??
        (meta.batterySpec as string) ??
        (p as CycleToysPosItem).batterySpec;
      const cleanBattery = rawBattery && rawBattery.toLowerCase() !== "none" ? rawBattery : undefined;
      const catLower = rawCategory.toLowerCase();
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        price: p.price,
        originalPrice: p.originalPrice,
        isMarkdownActive: p.isMarkdownActive,
        markdownBadge: p.markdownBadge,
        markdownDiscountPct: p.markdownDiscountPct,
        markdownRuleName: p.markdownRuleName,
        stock: p.stock ?? 0,
        barcode: p.barcode,
        imageUrl: p.imageUrl,
        meta,
        category: rawCategory,
        brand: rawBrand,
        wheelSize: (meta.wheel_size as string) ?? (meta.wheelSize as string) ?? (p as CycleToysPosItem).wheelSize,
        ageGroup: (meta.age_group as string) ?? (meta.ageGroup as string) ?? (p as CycleToysPosItem).ageGroup,
        assemblyStatus: rawAssembly,
        assemblyFee: typeof meta.assembly_fee === "number" ? meta.assembly_fee : (p as CycleToysPosItem).assemblyFee,
        batterySpec: cleanBattery,
        batteryRequired: (meta.battery_required as string) ?? (meta.batteryRequired as string) ?? (p as CycleToysPosItem).batteryRequired,
        gearType: (meta.gear_type as string) ?? (meta.gearType as string) ?? (p as CycleToysPosItem).gearType,
        frameMaterial: (meta.frame_material as string) ?? (meta.frameMaterial as string) ?? (p as CycleToysPosItem).frameMaterial,
        safetyCert: (meta.safety_cert as string) ?? (meta.safetyCert as string) ?? (p as CycleToysPosItem).safetyCert,
        isBoxed: isBoxedStatus(rawAssembly) || Boolean((p as CycleToysPosItem).isBoxed),
        isElectric:
          Boolean(cleanBattery) ||
          Boolean((p as CycleToysPosItem).isElectric) ||
          catLower.includes("electric") ||
          catLower.includes("ride-on"),
        chokingHazard: Boolean(meta.choking_hazard || (p as CycleToysPosItem).chokingHazard),
        frameSerialRequired: Boolean(meta.frame_serial_required || (p as CycleToysPosItem).frameSerialRequired),
      };
    });
  }, [catalog.items, categoryNameById, brandNameById]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    catalogItems.forEach((i) => {
      if (i.category) set.add(i.category);
    });
    return ["All", ...Array.from(set)];
  }, [catalogItems]);

  // Union of standard backend/Product Master age groups + any catalog-specific age groups
  const ageGroups = useMemo(() => {
    const set = new Set<string>(STANDARD_AGE_GROUPS);
    catalogItems.forEach((i) => {
      if (i.ageGroup) set.add(i.ageGroup);
    });
    return ["All", ...Array.from(set)];
  }, [catalogItems]);

  const cartQtyBySku = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of app.cart) {
      map.set(line.sku, (map.get(line.sku) ?? 0) + line.qty);
    }
    return map;
  }, [app.cart]);

  const filteredItems = useMemo(() => {
    return catalogItems.filter((item) => {
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matches =
          item.name.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q) ||
          (item.barcode && item.barcode.toLowerCase().includes(q)) ||
          (item.brand && item.brand.toLowerCase().includes(q)) ||
          (item.wheelSize && item.wheelSize.toLowerCase().includes(q));
        if (!matches) return false;
      }
      if (selectedCategory !== "All" && item.category !== selectedCategory) return false;
      if (filterReadyToRide && !isReadyToRideStatus(item.assemblyStatus)) return false;
      if (filterBoxed && !item.isBoxed) return false;
      if (filterElectric && !item.isElectric) return false;
      if (filterAgeGroup !== "All" && item.ageGroup !== filterAgeGroup) return false;
      return true;
    });
  }, [catalogItems, searchQuery, selectedCategory, filterReadyToRide, filterBoxed, filterElectric, filterAgeGroup]);

  // Contextual helpers: check metadata first, then fallback to product name
  const cartHasCycle = app.cart.some((l) => {
    const ex = (l.extras ?? {}) as Record<string, unknown>;
    const cat = String(ex.category ?? "").toLowerCase();
    const wheel = String(ex.wheel_size ?? ex.wheelSize ?? "");
    const name = l.name.toLowerCase();
    return (
      (wheel !== "" && wheel !== "N/A") ||
      cat.includes("cycle") ||
      cat.includes("mtb") ||
      cat.includes("bicycle") ||
      name.includes("cycle") ||
      name.includes("bicycle") ||
      name.includes("mtb")
    );
  });

  const boxedCartLine = app.cart.find((l) => {
    const ex = (l.extras ?? {}) as Record<string, unknown>;
    const asm = String(ex.assembly_status ?? ex.assemblyStatus ?? "");
    const name = l.name.toLowerCase();
    return Boolean(ex.isBoxed) || isBoxedStatus(asm) || name.includes("boxed") || name.includes("carton");
  });
  const cartHasBoxed = Boolean(boxedCartLine);
  const cartHasAssembly = app.cart.some(
    (l) => l.sku === "WRK-ASM-01" || l.name.toLowerCase().includes("assembly")
  );
  const assemblyFeeAmount = useMemo(() => {
    const ex = (boxedCartLine?.extras ?? {}) as Record<string, unknown>;
    const fromBike = typeof ex.assemblyFee === "number" ? ex.assemblyFee : typeof ex.assembly_fee === "number" ? ex.assembly_fee : undefined;
    if (fromBike != null && fromBike >= 0) return fromBike;
    const fromCatalog = catalogItems.find((i) => i.sku === "WRK-ASM-01")?.price;
    return fromCatalog != null ? fromCatalog : 300;
  }, [boxedCartLine, catalogItems]);

  const toyNeedingBattery = app.cart.find((l) => {
    const ex = (l.extras ?? {}) as Record<string, unknown>;
    const req = String(ex.battery_required ?? ex.batteryRequired ?? "");
    const name = l.name.toLowerCase();
    return (
      Boolean(req) ||
      name.includes("robot") ||
      name.includes("crawler") ||
      name.includes("sound")
    );
  });
  const cartHasBatteries = app.cart.some(
    (l) => l.sku.startsWith("BAT-") || l.name.toLowerCase().includes("battery") || l.name.toLowerCase().includes("batteries")
  );

  const safetyAccessories = useMemo(
    () =>
      catalogItems
        .filter((i) => isSafetyAccessoryCategory(i.category) && !i.sku.startsWith("BAT-"))
        .slice(0, 3),
    [catalogItems]
  );

  const giftFinderMatches = useMemo(() => {
    return catalogItems
      .filter((item) => {
        // Age filter
        const ageMatch =
          item.ageGroup === wizardAge ||
          (!item.ageGroup && wizardAge === "13+ / Adult");
        if (!ageMatch) return false;

        // Play interest filter
        if (wizardInterest === "All") return true;
        const cat = (item.category || "").toLowerCase();
        const name = item.name.toLowerCase();
        if (wizardInterest === "Cycles") {
          return cat.includes("cycle") || cat.includes("mtb") || Boolean(item.wheelSize && item.wheelSize !== "N/A");
        }
        if (wizardInterest === "Electric") {
          return Boolean(item.isElectric) || cat.includes("electric") || cat.includes("ride-on") || name.includes("rc");
        }
        if (wizardInterest === "Blocks") {
          return (
            cat.includes("toy") ||
            cat.includes("block") ||
            cat.includes("game") ||
            name.includes("lego") ||
            name.includes("block") ||
            name.includes("puzzle")
          );
        }
        return true;
      })
      .slice(0, 6);
  }, [catalogItems, wizardAge, wizardInterest]);

  const appendStamp = (stamp: string) => {
    setSaleStamps((prev) => (prev.includes(stamp) ? prev : [...prev, stamp]));
  };

  const handleAddToCart = (item: CycleToysPosItem) => {
    const service = isServiceItem(item);
    if (!service) {
      const currentInCart = cartQtyBySku.get(item.sku) ?? 0;
      if (item.stock <= 0) {
        toast.error(`${item.name} is out of stock.`);
        return;
      }
      if (currentInCart + 1 > item.stock) {
        toast.error(`Only ${item.stock} unit(s) of ${item.name} available in stock.`);
        return;
      }
    }

    const extras = catalogToCartExtras(item);
    // Avoid failing stock reservation / stock deduction for unstocked workshop services
    if (service && item.stock <= 0) {
      delete (extras as Record<string, unknown>).productId;
    }

    app.addToCart({
      id: `${item.sku}-${Date.now()}`,
      sku: item.sku,
      name: item.name,
      price: item.price,
      qty: 1,
      industry: "cycle-toys",
      extras,
    });
    toast.success(`Added ${item.name} to cart`);
  };

  const handleBarcodeOrSearchEnter = (code: string) => {
    const q = code.trim().toLowerCase();
    if (!q) return;
    const exact = catalogItems.find(
      (i) => i.sku.toLowerCase() === q || (i.barcode && i.barcode.toLowerCase() === q)
    );
    if (exact) {
      handleAddToCart(exact);
      setSearchQuery("");
      return;
    }
    setSearchQuery(code.trim());
    toast.info(`Filtered catalog for "${code.trim()}"`);
  };

  const handleAddAssemblyService = async () => {
    const assemblyItem = catalogItems.find((i) => i.sku === "WRK-ASM-01");
    const fee = assemblyFeeAmount;
    if (assemblyItem && assemblyItem.price === fee) {
      handleAddToCart(assemblyItem);
    } else {
      app.addToCart({
        id: `wrk-asm-${Date.now()}`,
        sku: "WRK-ASM-01",
        name: "In-Store Bicycle Assembly & Tuning Service",
        price: fee,
        qty: 1,
        industry: "cycle-toys",
        extras: {
          service_kind: "assembly",
          bicycle_model: boxedCartLine?.name,
        },
      });
    }

    // Also queue into Assembly Workshop Queue if a boxed bike is in cart
    if (boxedCartLine) {
      const ex = (boxedCartLine.extras ?? {}) as Record<string, unknown>;
      const wheelSize = String(ex.wheel_size ?? ex.wheelSize ?? '16"');
      if (useApi) {
        try {
          const order = await createAssemblyMut.mutateAsync({
            customer_name: app.customer || "Walk-in Customer",
            customer_phone: "",
            bicycle_model: boxedCartLine.name,
            wheel_size: wheelSize,
            technician: "Workshop Queue",
            assembly_fee: fee,
            notes: "Added from Cycle POS counter",
          });
          appendStamp(`Assembly Queued: ${order.order_no}`);
          toast.success(`Assembly service added (+${fmtBDT(fee)}) & queued (${order.order_no})!`);
          return;
        } catch (err) {
          toast.warning(formatApiError(err));
          return;
        }
      } else {
        const key = "pulse_cycle_toys_assembly_queue";
        const existing = readStorage<Array<Record<string, unknown>>>(key, []);
        const code = `ASM-${Date.now().toString().slice(-4)}`;
        writeStorage(key, [
          {
            id: code,
            orderNo: code,
            customerName: app.customer || "Walk-in Customer",
            customerPhone: "",
            bicycleModel: boxedCartLine.name,
            wheelSize,
            technician: "Workshop Queue",
            assemblyFee: fee,
            status: "Queue",
            notes: "Added from Cycle POS counter",
            createdAt: new Date().toISOString().replace("T", " ").slice(0, 16),
          },
          ...existing,
        ]);
        appendStamp(`Assembly Queued: ${code}`);
      }
    }
    toast.success(`Assembly service added (+${fmtBDT(fee)}) with Pre-Delivery Inspection checklist!`);
  };

  const handleAddBatteries = (type: "AA" | "AAA") => {
    const sku = type === "AA" ? "BAT-AA-04" : "BAT-AAA-04";
    const found = catalogItems.find((i) => i.sku === sku);
    if (found) {
      handleAddToCart(found);
    } else {
      app.addToCart({
        id: `bat-${type.toLowerCase()}-${Date.now()}`,
        sku,
        name: `Panasonic Alkaline ${type} Batteries (4-Pack)`,
        price: type === "AA" ? 160 : 180,
        qty: 1,
        industry: "cycle-toys",
      });
    }
    toast.success(`Added ${type} 4-Pack Batteries to cart! Toy is ready to play!`);
  };

  const handleRegisterFrameSerial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stampedFrameSerial.trim()) {
      toast.error("Please enter the stamped frame serial number.");
      return;
    }
    const serial = stampedFrameSerial.trim();
    const model = selectedCycleForSerial.trim() || "Bicycle";

    if (useApi) {
      try {
        await createInspectionMut.mutateAsync({
          log_type: "frame_serial",
          item_model: model,
          frame_serial: serial,
          frame_color: frameColor.trim(),
          customer_contact: ownerNidOrPhone.trim(),
          passed: true,
        });
      } catch (err) {
        toast.error(formatApiError(err));
        return;
      }
    }

    // Attach frame_serial to matching cycle line in cart if present
    const cycleLine = app.cart.find((l) => {
      const n = l.name.toLowerCase();
      return n.includes("cycle") || n.includes("bicycle") || n.includes("mtb") || n.includes(model.toLowerCase());
    });
    if (cycleLine) {
      app.updateLine(cycleLine.id || cycleLine.sku, {
        extras: { ...(cycleLine.extras ?? {}), frame_serial: serial, frame_color: frameColor.trim() },
      });
    }

    appendStamp(`Frame Serial: ${serial} (${model})`);
    toast.success(`Chassis Serial ${serial} saved & stamped on receipt!`);
    setFrameSerialOpen(false);
    setStampedFrameSerial("");
    setOwnerNidOrPhone("");
  };

  const handleCertifyPdi = async () => {
    if (!pdiCheck1 || !pdiCheck2 || !pdiCheck3 || !pdiCheck4 || !pdiCheck5) {
      toast.warning("Please ensure all 5 PDI safety inspection checks are passed before delivery.");
      return;
    }

    const cycleLine = app.cart.find((l) => {
      const n = l.name.toLowerCase();
      return n.includes("cycle") || n.includes("bicycle") || n.includes("mtb");
    });

    if (useApi) {
      try {
        await createInspectionMut.mutateAsync({
          log_type: "pdi_5point",
          item_model: cycleLine?.name || "Bicycle Sale",
          inspector: pdiInspector.trim(),
          passed: true,
          details: {
            handlebar_stem: pdiCheck1,
            brakes: pdiCheck2,
            pedals_crank: pdiCheck3,
            tires_wheels: pdiCheck4,
            drivetrain_gears: pdiCheck5,
          },
        });
      } catch (err) {
        toast.error(formatApiError(err));
        return;
      }
    }

    appendStamp(`5-Point PDI Certified by ${pdiInspector.trim() || "Workshop"}`);
    toast.success(`5-Point PDI Certified by ${pdiInspector}! Stamped on invoice.`);
    setPdiOpen(false);
  };

  const handleRcBenchTestSave = async () => {
    if (!rcRemotePaired || !rcMotorTested || !rcSteeringAligned) {
      toast.warning("Remote control or motor response test incomplete!");
      return;
    }
    const model = rcToyModel.trim() || "RC Model";

    if (useApi) {
      try {
        await createInspectionMut.mutateAsync({
          log_type: "rc_bench_test",
          item_model: model,
          passed: true,
          details: {
            remote_paired: rcRemotePaired,
            motor_tested: rcMotorTested,
            steering_aligned: rcSteeringAligned,
            charger_verified: rcChargerVerified,
          },
        });
      } catch (err) {
        toast.error(formatApiError(err));
        return;
      }
    }

    appendStamp(`RC Bench Verified at Counter (${model})`);
    toast.success(`Bench Test Passed for ${model}! Stamped: Verified Working at Counter.`);
    setRcBenchTestOpen(false);
    setRcToyModel("");
  };

  const handleCreateServiceJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim() || !bikeModel.trim()) {
      toast.error("Please fill in customer name, phone, and bicycle model.");
      return;
    }
    const parsedCost = parseFloat(serviceCost);
    const cost = Number.isNaN(parsedCost) ? 600 : Math.max(0, parsedCost);
    let jobRef = `JOB-${Date.now().toString().slice(-4)}`;

    if (useApi) {
      try {
        const res = await createServiceJobMut.mutateAsync({
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          bike_model: bikeModel.trim(),
          service_type: serviceType,
          labor_fee: cost,
          parts_cost: 0,
          mechanic: assignedMechanic.trim(),
          notes: "Created from Cycle POS counter",
        });
        jobRef = res.job_no;
      } catch (err) {
        toast.error(formatApiError(err));
        return;
      }
    } else {
      const key = "pulse_cycle_toys_service_jobs";
      const existing = readStorage<Array<Record<string, unknown>>>(key, []);
      writeStorage(key, [
        {
          id: jobRef,
          jobNo: jobRef,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          bikeModel: bikeModel.trim(),
          serviceType,
          partsReplaced: "",
          laborFee: cost,
          partsCost: 0,
          totalCost: cost,
          mechanic: assignedMechanic.trim(),
          status: "Intake",
          notes: "Created from Cycle POS counter",
          receivedDate: new Date().toISOString().replace("T", " ").slice(0, 16),
        },
        ...existing,
      ]);
    }

    app.addToCart({
      id: `wrk-job-${Date.now()}`,
      sku: "WRK-JOB-CARD",
      name: `Repair Job (${jobRef}): ${bikeModel.trim()} (${serviceType}) - Cust: ${customerName.trim()}`,
      price: cost,
      qty: 1,
      industry: "cycle-toys",
      extras: {
        job_no: jobRef,
        bike_model: bikeModel.trim(),
        customer_name: customerName.trim(),
        service_type: serviceType,
      },
    });
    appendStamp(`Service Job: ${jobRef}`);
    toast.success(`Service Job Card ${jobRef} saved for ${customerName} and added to cart!`);
    setServiceJobOpen(false);
    setCustomerName("");
    setCustomerPhone("");
    setBikeModel("");
  };

  const handleAddGiftWrap = () => {
    const fee = giftTheme === "luxury" ? 150 : giftTheme === "festive" ? 100 : 50;
    const recipient = giftRecipient.trim() || "VIP Kid";
    const greeting = giftGreeting.trim() || "Happy Birthday!";
    app.addToCart({
      id: `gift-wrap-${Date.now()}`,
      sku: "GIFT-WRAP",
      name: `Birthday Gift Wrap (${giftTheme.toUpperCase()} theme) - To: ${recipient} [${greeting}]`,
      price: fee,
      qty: 1,
      industry: "cycle-toys",
      extras: {
        gift_theme: giftTheme,
        recipient,
        greeting,
      },
    });
    appendStamp(`Gift Wrap: ${recipient}`);
    toast.success(`Festive Gift Wrap & Message Slip added (+${fmtBDT(fee)})!`);
    setGiftOpen(false);
  };

  const handleSavePdiTest = async (e: React.FormEvent) => {
    e.preventDefault();
    const model = batteryModel.trim() || "Electric Ride-on";
    const serial = batterySerial.trim() || `BAT-${Date.now().toString().slice(-6)}`;

    if (useApi) {
      try {
        const res = await createBatteryLogMut.mutateAsync({
          vehicle_model: model,
          customer_name: batteryCustomerName.trim() || app.customer || "Walk-in Customer",
          customer_phone: "",
          battery_serial: serial,
          voltage_rating: batteryVoltageRating,
          measured_voltage: measuredVoltage.trim(),
          remote_paired: remotePaired,
          warranty_months: batteryVoltageRating === "12V" ? 12 : 6,
          status: pdiStatus,
          notes: "Logged from Cycle POS counter",
        });
        appendStamp(`Battery PDI: ${res.log_no} (${measuredVoltage})`);
        toast.success(`Battery Inspection ${res.log_no} saved to Warranty Log! Voltage: ${measuredVoltage}`);
      } catch (err) {
        toast.error(formatApiError(err));
        return;
      }
    } else {
      const key = "pulse_cycle_toys_battery_logs";
      const existing = readStorage<Array<Record<string, unknown>>>(key, []);
      const code = `BAT-${Date.now().toString().slice(-4)}`;
      writeStorage(key, [
        {
          id: code,
          logNo: code,
          vehicleModel: model,
          customerName: batteryCustomerName.trim() || app.customer || "Walk-in Customer",
          customerPhone: "",
          batterySerial: serial,
          voltageRating: batteryVoltageRating,
          measuredVoltage: measuredVoltage.trim(),
          remotePaired,
          warrantyMonths: batteryVoltageRating === "12V" ? 12 : 6,
          chargerSerial: "",
          status: pdiStatus,
          inspectedAt: new Date().toISOString().replace("T", " ").slice(0, 16),
        },
        ...existing,
      ]);
      appendStamp(`Battery PDI: ${code} (${measuredVoltage})`);
      toast.success(`Battery Inspection ${code} saved! Voltage: ${measuredVoltage}`);
    }

    setBatteryTestOpen(false);
    setBatteryModel("");
    setBatterySerial("");
    setBatteryCustomerName("");
  };

  const handlePrintGiftReceipt = () => {
    if (app.cart.length === 0) {
      toast.warning("Add items to cart before printing a gift receipt.");
      return;
    }
    const brandName = receiptBrand.brandName || "PEDAL & PLAY";
    const tagline = receiptBrand.tagline || "Cycles, Toys & Kids Lifestyle Store";
    const exchangeCode = `GIFT-EXCH-${Date.now().toString().slice(-6)}`;
    const linesHtml = app.cart
      .map(
        (l) =>
          `<div style="display:flex;justify-content:space-between;margin:4px 0;">
            <span>${l.qty}x ${escapeHtml(l.name)}</span>
            <span>*** (GIFT)</span>
          </div>`
      )
      .join("");

    const win = window.open("", "_blank", "width=380,height=600");
    if (!win) {
      toast.error("Popup blocked — please allow popups to print the gift receipt.");
      return;
    }
    win.document.write(`<!doctype html>
<html>
<head>
  <title>Gift Receipt - ${escapeHtml(brandName)}</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; width: 76mm; margin: 0 auto; padding: 12px; color: #111; }
    .center { text-align: center; }
    .divider { border-top: 1px dashed #666; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; margin: 3px 0; }
  </style>
</head>
<body>
  <div class="center">
    <div style="font-weight:bold;font-size:15px;">${escapeHtml(brandName)}</div>
    <div style="font-size:10px;color:#555;">${escapeHtml(tagline)}</div>
    <div style="font-weight:bold;margin-top:6px;">*** OFFICIAL GIFT RECEIPT ***</div>
  </div>
  <div class="divider"></div>
  <div class="row"><span>Recipient:</span><strong>${escapeHtml(giftRecipient || "VIP Kid")}</strong></div>
  <div class="row"><span>Message:</span><span>"${escapeHtml(giftGreeting)}"</span></div>
  <div class="row"><span>Date:</span><span>${new Date().toLocaleDateString()}</span></div>
  <div class="divider"></div>
  ${linesHtml}
  <div class="divider"></div>
  <div class="center" style="font-size:10px;color:#555;">
    <div>Eligible for exchange within 7 days in original sealed box.</div>
    <div>No cash refunds. Exchange slip required.</div>
    <div style="font-weight:bold;color:#111;margin-top:8px;letter-spacing:1px;">||||| ${exchangeCode} |||||</div>
  </div>
  <script>setTimeout(function(){ window.focus(); window.print(); }, 150);</script>
</body>
</html>`);
    win.document.close();
    toast.success("Price-hidden gift receipt sent to printer!");
    setGiftReceiptOpen(false);
  };

  const combinedReceiptNote = useMemo(() => {
    const base = "Pre-delivery inspected · Frame serial registered · Genuine batteries";
    if (saleStamps.length === 0) return base;
    return `${base} | ${saleStamps.join(" · ")}`;
  }, [saleStamps]);

  return (
    <div className="relative">
      <PosShell
        industry="cycle-toys"
        title="Cycle & Toys POS"
        subtitle="Pedal & Play · Cycles, electric ride-ons, toys, assembly workshop & anti-theft serial logs"
        receiptNote={combinedReceiptNote}
        onCameraScan={handleBarcodeOrSearchEnter}
        cartLineExtra={(line) => {
          const ex = (line.extras ?? {}) as Record<string, unknown>;
          const serial = ex.frame_serial as string | undefined;
          const wheel = (ex.wheel_size ?? ex.wheelSize) as string | undefined;
          const asm = (ex.assembly_status ?? ex.assemblyStatus) as string | undefined;
          if (!serial && (!wheel || wheel === "N/A") && !isBoxedStatus(asm)) return null;
          return (
            <div className="mt-1 flex flex-wrap gap-1">
              {serial && <CartPill variant="info">Serial: {serial}</CartPill>}
              {wheel && wheel !== "N/A" && <CartPill variant="neutral">{wheel}</CartPill>}
              {isBoxedStatus(asm) && <CartPill variant="warning">Boxed SKD</CartPill>}
            </div>
          );
        }}
        catalog={
          <div className="space-y-4">
            {/* Top Industry Header & Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-sky-500/20 bg-gradient-to-r from-sky-500/10 via-cyan-500/5 to-amber-500/10 p-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm">
                  <Bike className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">Cycle & Toys POS</span>
                    <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 font-mono text-[10px]">
                      Pedal & Play
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cycles, electric ride-ons, toys, assembly workshop & anti-theft serial logs
                  </p>
                </div>
              </div>

              {/* Action Modals Triggers */}
              <div className="flex flex-wrap items-center gap-1.5">
                {flagGift && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-sky-500/30 text-sky-700 hover:bg-sky-500/10 dark:text-sky-300 text-xs gap-1.5"
                    onClick={() => setGiftFinderOpen(true)}
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    Gift Finder
                  </Button>
                )}
                {flagWorkshop && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-sky-500/30 text-sky-700 hover:bg-sky-500/10 dark:text-sky-300 text-xs gap-1.5"
                    onClick={() => setServiceJobOpen(true)}
                  >
                    <Wrench className="h-3.5 w-3.5 text-sky-600" />
                    Workshop Job
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-sky-500/30 text-sky-700 hover:bg-sky-500/10 dark:text-sky-300 text-xs gap-1.5"
                  onClick={() => {
                    if (!selectedCycleForSerial) {
                      const cycleInCart = app.cart.find((l) => {
                        const n = l.name.toLowerCase();
                        return n.includes("cycle") || n.includes("bicycle") || n.includes("mtb");
                      });
                      if (cycleInCart) setSelectedCycleForSerial(cycleInCart.name);
                    }
                    setFrameSerialOpen(true);
                  }}
                >
                  <Tag className="h-3.5 w-3.5 text-sky-600" />
                  Frame Serial
                </Button>
                {flagAssembly && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300 text-xs gap-1.5"
                    onClick={() => setPdiOpen(true)}
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    5-Point PDI
                  </Button>
                )}
                {flagBattery && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-purple-500/30 text-purple-700 hover:bg-purple-500/10 dark:text-purple-300 text-xs gap-1.5"
                    onClick={() => {
                      if (!rcToyModel) {
                        const rcInCart = app.cart.find((l) => {
                          const n = l.name.toLowerCase();
                          return n.includes("rc") || n.includes("drone") || n.includes("crawler");
                        });
                        if (rcInCart) setRcToyModel(rcInCart.name);
                      }
                      setRcBenchTestOpen(true);
                    }}
                  >
                    <Gamepad2 className="h-3.5 w-3.5 text-purple-600" />
                    RC Bench Test
                  </Button>
                )}
                {flagGift && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-pink-500/30 text-pink-700 hover:bg-pink-500/10 dark:text-pink-300 text-xs gap-1.5"
                    onClick={() => setGiftOpen(true)}
                  >
                    <PackageCheck className="h-3.5 w-3.5 text-pink-600" />
                    Gift Wrap
                  </Button>
                )}
                {flagGift && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-amber-500/30 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300 text-xs gap-1.5"
                    onClick={() => setGiftReceiptOpen(true)}
                  >
                    <Gift className="h-3.5 w-3.5 text-amber-600" />
                    Gift Receipt
                  </Button>
                )}
                {flagBattery && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-cyan-500/30 text-cyan-700 hover:bg-cyan-500/10 dark:text-cyan-300 text-xs gap-1.5"
                    onClick={() => {
                      if (!batteryModel) {
                        const evInCart = app.cart.find((l) => {
                          const ex = (l.extras ?? {}) as Record<string, unknown>;
                          const n = l.name.toLowerCase();
                          return Boolean(ex.isElectric || ex.battery_spec || ex.battery_type) || n.includes("12v") || n.includes("6v") || n.includes("ride-on");
                        });
                        if (evInCart) setBatteryModel(evInCart.name);
                      }
                      setBatteryTestOpen(true);
                    }}
                  >
                    <Battery className="h-3.5 w-3.5 text-cyan-600" />
                    Battery & PDI Log
                  </Button>
                )}
              </div>
            </div>

            {/* Active Receipt Stamps Strip */}
            {saleStamps.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1.5 text-[11px]">
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">Stamped on Receipt:</span>
                {saleStamps.map((stamp) => (
                  <Badge
                    key={stamp}
                    variant="secondary"
                    className="gap-1 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 text-[10px]"
                  >
                    {stamp}
                    <button
                      type="button"
                      onClick={() => setSaleStamps((prev) => prev.filter((s) => s !== stamp))}
                      className="hover:text-destructive"
                      aria-label={`Remove ${stamp}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Search & Barcode Input Bar */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchQuery.trim()) {
                    e.preventDefault();
                    handleBarcodeOrSearchEnter(searchQuery);
                  }
                }}
                placeholder="Search cycle, toy, brand, wheel size, SKU, or scan barcode (Enter to add)…"
                className="h-9 pl-8 pr-8 text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* SMART ALERT 1: Battery Add-on Prompt */}
            {flagBattery && toyNeedingBattery && !cartHasBatteries && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2">
                  <Battery className="h-4 w-4 shrink-0 text-amber-600 animate-pulse" />
                  <span>
                    <strong>Toy in Cart Requires Batteries!</strong> Customer will need batteries to play immediately.
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs bg-amber-600 text-white hover:bg-amber-700"
                    onClick={() => handleAddBatteries("AA")}
                  >
                    + Add AA 4-Pack (৳160)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-amber-500/40"
                    onClick={() => handleAddBatteries("AAA")}
                  >
                    + Add AAA 4-Pack (৳180)
                  </Button>
                </div>
              </div>
            )}

            {/* SMART ALERT 2: Boxed Cycle in Cart */}
            {flagAssembly && cartHasBoxed && !cartHasAssembly && (
              <div className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2">
                  <Boxes className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    <strong>Boxed Cycle in Cart:</strong> Customer may require store assembly & brake/gear tuning!
                  </span>
                </div>
                <Button size="sm" variant="secondary" className="h-7 text-xs bg-amber-600 text-white hover:bg-amber-700" onClick={handleAddAssemblyService}>
                  <Plus className="mr-1 h-3 w-3" /> Add Assembly (+{fmtBDT(assemblyFeeAmount)})
                </Button>
              </div>
            )}

            {/* SMART ALERT 3: Recommended Safety Gear */}
            {flagCrossSell && cartHasCycle && safetyAccessories.length > 0 && (
              <div className="rounded-md border border-sky-500/20 bg-sky-500/5 p-2.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-sky-800 dark:text-sky-300 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-sky-600" /> Recommended Safety Gear & Accessories:
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {safetyAccessories.map((acc) => (
                    <Button
                      key={acc.id}
                      variant="outline"
                      size="sm"
                      className="h-auto py-1 px-2 text-left justify-start border-sky-500/30 hover:bg-sky-500/10"
                      onClick={() => handleAddToCart(acc)}
                    >
                      <div className="truncate">
                        <div className="text-[11px] font-medium truncate">{acc.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{fmtBDT(acc.price)}</div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Category Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              {categories.map((cat) => (
                <Button
                  key={cat}
                  size="sm"
                  variant={selectedCategory === cat ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </Button>
              ))}
            </div>

            {/* Attribute Filter Chips */}
            {(flagAssembly || flagBattery || flagSizeAge) && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground font-medium">Quick Filters:</span>
                {flagAssembly && (
                  <>
                    <Badge
                      variant={filterReadyToRide ? "default" : "outline"}
                      className="cursor-pointer gap-1 select-none hover:bg-accent"
                      onClick={() => setFilterReadyToRide(!filterReadyToRide)}
                    >
                      🚲 Ready to Ride
                    </Badge>
                    <Badge
                      variant={filterBoxed ? "default" : "outline"}
                      className="cursor-pointer gap-1 select-none hover:bg-accent"
                      onClick={() => setFilterBoxed(!filterBoxed)}
                    >
                      📦 Boxed SKD
                    </Badge>
                  </>
                )}
                {flagBattery && (
                  <Badge
                    variant={filterElectric ? "default" : "outline"}
                    className="cursor-pointer gap-1 select-none hover:bg-accent"
                    onClick={() => setFilterElectric(!filterElectric)}
                  >
                    ⚡ Electric/Battery
                  </Badge>
                )}

                {flagSizeAge && (
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-muted-foreground">Age:</span>
                    <Select value={filterAgeGroup} onValueChange={setFilterAgeGroup}>
                      <SelectTrigger className="h-7 text-xs w-[130px]">
                        <SelectValue placeholder="All Ages" />
                      </SelectTrigger>
                      <SelectContent>
                        {ageGroups.map((ag) => (
                          <SelectItem key={ag} value={ag} className="text-xs">
                            {ag}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* Product Catalog Grid */}
            {filteredItems.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-xs text-muted-foreground">
                {catalog.isLoading
                  ? "Loading Cycle & Toys catalog…"
                  : "No products match the active search or filters."}
              </div>
            ) : (
              <ProductGrid
                items={filteredItems}
                onAdd={(item) => handleAddToCart(item as CycleToysPosItem)}
                renderCard={(item) => {
                  const it = item as CycleToysPosItem;
                  const outOfStock = !isServiceItem(it) && it.stock <= 0;
                  return (
                    <PosProductCard
                      key={it.id}
                      badge={
                        it.wheelSize && it.wheelSize !== "N/A"
                          ? it.wheelSize
                          : it.ageGroup
                          ? it.ageGroup
                          : it.category
                      }
                      title={it.name}
                      subtitle={
                        isServiceItem(it)
                          ? `${it.sku} · Service`
                          : `${it.sku} · ${outOfStock ? "Out of stock" : `Stock: ${it.stock}`}`
                      }
                      price={fmtBDT(it.price)}
                      originalPrice={it.originalPrice ? fmtBDT(it.originalPrice) : undefined}
                      isMarkdown={it.isMarkdownActive}
                      imageUrl={it.imageUrl}
                      count={cartQtyBySku.get(it.sku)}
                      industry="cycle-toys"
                      sku={it.sku}
                      footer={
                        <div className="flex flex-col gap-1 text-[11px] text-muted-foreground mt-1">
                          <div className="flex flex-wrap items-center gap-1">
                            {outOfStock && (
                              <Badge variant="destructive" className="text-[9px] px-1 py-0">
                                Out of Stock
                              </Badge>
                            )}
                            {flagAssembly && it.assemblyStatus && (
                              <Badge
                                variant="secondary"
                                className={`text-[9px] px-1 py-0 ${
                                  it.isBoxed
                                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                    : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                }`}
                              >
                                {it.isBoxed ? "📦 Boxed Carton" : "🚲 Assembled"}
                              </Badge>
                            )}
                            {it.gearType && it.gearType !== "None" && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0">
                                {it.gearType}
                              </Badge>
                            )}
                            {flagBattery && it.batteryRequired && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-700 dark:text-amber-300 border-amber-500/40">
                                🔋 Needs {it.batteryRequired.split(" ")[0]}
                              </Badge>
                            )}
                            {flagBattery && it.batterySpec && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 text-cyan-700 dark:text-cyan-300 border-cyan-500/30">
                                ⚡ {it.batterySpec.split(",")[0]}
                              </Badge>
                            )}
                            {flagSafety && it.chokingHazard && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 text-rose-600 dark:text-rose-400 border-rose-500/30">
                                ⚠️ 3+ Only (Choking Hazard)
                              </Badge>
                            )}
                            {flagSafety && it.safetyCert && (
                              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">
                                ✓ {it.safetyCert}
                              </span>
                            )}
                          </div>
                        </div>
                      }
                    />
                  );
                }}
              />
            )}
          </div>
        }
      />

      {/* MODAL 1: Frame Serial Number & Anti-Theft Registration */}
      <Dialog open={frameSerialOpen} onOpenChange={setFrameSerialOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sky-600">
              <Tag className="h-5 w-5" />
              Bicycle Frame Serial & Anti-Theft Registration
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRegisterFrameSerial} className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Bicycle Model in Sale</Label>
              <Input
                placeholder="e.g. Veloce Outrace 26'' MTB"
                value={selectedCycleForSerial}
                onChange={(e) => setSelectedCycleForSerial(e.target.value)}
                className="h-8 text-xs mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-xs">Stamped Chassis / Frame Serial Number</Label>
              <Input
                placeholder="Found under Bottom Bracket shell e.g. VEL-26-88912"
                value={stampedFrameSerial}
                onChange={(e) => setStampedFrameSerial(e.target.value)}
                className="h-8 text-xs mt-1 font-mono font-medium"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Customer Phone / NID</Label>
                <Input
                  placeholder="017xxxxxxxx"
                  value={ownerNidOrPhone}
                  onChange={(e) => setOwnerNidOrPhone(e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Frame Colorway</Label>
                <Input
                  value={frameColor}
                  onChange={(e) => setFrameColor(e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>
            <div className="rounded border border-sky-500/20 bg-sky-500/5 p-2 text-[11px] text-sky-800 dark:text-sky-300">
              🛡️ <strong>Anti-Theft Protection:</strong> Serial number is saved to the registry and printed on the invoice as legal proof of ownership for police recovery and manufacturer frame warranty claims.
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setFrameSerialOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createInspectionMut.isPending} className="bg-sky-600 hover:bg-sky-700 text-white">
                {createInspectionMut.isPending ? "Saving…" : "Register Anti-Theft Serial"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: 5-Point Pre-Delivery Inspection (PDI) Checklist */}
      <Dialog open={pdiOpen} onOpenChange={setPdiOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <ShieldCheck className="h-5 w-5" />
              5-Point Pre-Delivery Inspection (PDI)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p className="text-muted-foreground">
              Confirm technician has verified all 5 critical safety points before customer rollout:
            </p>
            <div className="space-y-2.5 rounded-lg border p-3 bg-muted/20">
              <div className="flex items-start gap-2">
                <Checkbox id="pdi1" checked={pdiCheck1} onCheckedChange={(v) => setPdiCheck1(Boolean(v))} />
                <Label htmlFor="pdi1" className="cursor-pointer text-xs font-normal">
                  <strong>1. Handlebar & Stem:</strong> Centered, aligned with front wheel, stem bolts torqued.
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox id="pdi2" checked={pdiCheck2} onCheckedChange={(v) => setPdiCheck2(Boolean(v))} />
                <Label htmlFor="pdi2" className="cursor-pointer text-xs font-normal">
                  <strong>2. Brakes (Front & Rear):</strong> Pads centered on rims/rotors, firm lever feel, full stopping lock.
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox id="pdi3" checked={pdiCheck3} onCheckedChange={(v) => setPdiCheck3(Boolean(v))} />
                <Label htmlFor="pdi3" className="cursor-pointer text-xs font-normal">
                  <strong>3. Pedals & Crank:</strong> Thread grease applied, left pedal reverse-threaded & fully torqued.
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox id="pdi4" checked={pdiCheck4} onCheckedChange={(v) => setPdiCheck4(Boolean(v))} />
                <Label htmlFor="pdi4" className="cursor-pointer text-xs font-normal">
                  <strong>4. Tires & Wheels:</strong> Inflated to 45 PSI, bead seated evenly, quick-release/nuts tight.
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox id="pdi5" checked={pdiCheck5} onCheckedChange={(v) => setPdiCheck5(Boolean(v))} />
                <Label htmlFor="pdi5" className="cursor-pointer text-xs font-normal">
                  <strong>5. Drivetrain & Gears:</strong> Indexed through all gears, chain lubed, H/L limits prevent spoke drop.
                </Label>
              </div>
            </div>

            <div>
              <Label className="text-xs">Inspecting Mechanic</Label>
              <Input
                value={pdiInspector}
                onChange={(e) => setPdiInspector(e.target.value)}
                className="h-8 text-xs mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPdiOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={createInspectionMut.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCertifyPdi}>
              {createInspectionMut.isPending ? "Saving…" : "Certify PDI & Stamp Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: Price-Hidden Gift Exchange Receipt */}
      <Dialog open={giftReceiptOpen} onOpenChange={setGiftReceiptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Gift className="h-5 w-5" />
              Gift Exchange Receipt (Price Hidden)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Recipient Name</Label>
                <Input
                  placeholder="e.g. Rayan"
                  value={giftRecipient}
                  onChange={(e) => setGiftRecipient(e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Greeting</Label>
                <Input
                  value={giftGreeting}
                  onChange={(e) => setGiftGreeting(e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>
            <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-4 text-xs font-mono">
              <div className="text-center border-b pb-2 mb-2">
                <div className="font-bold text-base">{receiptBrand.brandName || "PEDAL & PLAY"}</div>
                <div className="text-[10px] text-muted-foreground">
                  {receiptBrand.tagline || "Cycles, Toys & Kids Lifestyle Store"}
                </div>
                <div className="text-[10px] text-amber-600 font-bold mt-1">*** OFFICIAL GIFT RECEIPT ***</div>
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span>Gift Recipient:</span>
                  <span className="font-bold">{giftRecipient || "VIP Kid"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Greeting:</span>
                  <span>"{giftGreeting}"</span>
                </div>
                <div className="flex justify-between">
                  <span>Date:</span>
                  <span>{new Date().toLocaleDateString()}</span>
                </div>
              </div>

              <div className="border-t border-b py-2 my-2 space-y-1">
                {app.cart.length === 0 ? (
                  <div className="text-center text-muted-foreground text-[11px] py-1">
                    No items in cart yet.
                  </div>
                ) : (
                  app.cart.map((line, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[11px]">
                      <span className="truncate max-w-[220px]">{line.qty}x {line.name}</span>
                      <span className="text-muted-foreground font-semibold">*** (GIFT)</span>
                    </div>
                  ))
                )}
              </div>

              <div className="text-center text-[10px] text-muted-foreground space-y-1">
                <p>Eligible for exchange within 7 days in original sealed box.</p>
                <p>No cash refunds. Exchange slip required.</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setGiftReceiptOpen(false)}>
              Close
            </Button>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
              onClick={handlePrintGiftReceipt}
            >
              <Printer className="h-3.5 w-3.5" />
              Print Gift Receipt Slip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: Gift Finder Wizard */}
      <Dialog open={giftFinderOpen} onOpenChange={setGiftFinderOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Sparkles className="h-5 w-5" />
              Gift Finder Wizard (By Age & Milestone)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Kid Age Bracket</Label>
                <Select value={wizardAge} onValueChange={setWizardAge}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ageGroups
                      .filter((ag) => ag !== "All")
                      .map((ag) => (
                        <SelectItem key={ag} value={ag}>
                          {ag}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Play Interest</Label>
                <Select value={wizardInterest} onValueChange={setWizardInterest}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Categories</SelectItem>
                    <SelectItem value="Cycles">Wheels & Cycles</SelectItem>
                    <SelectItem value="Electric">Electric Ride-ons & RC</SelectItem>
                    <SelectItem value="Blocks">Building Blocks & Brain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-md border p-2 bg-muted/20">
              <div className="font-semibold text-foreground mb-2">
                Recommended for {wizardAge}{wizardInterest !== "All" ? ` · ${wizardInterest}` : ""}:
              </div>
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                {giftFinderMatches.length === 0 ? (
                  <div className="py-4 text-center text-muted-foreground">
                    No matching products for {wizardAge} ({wizardInterest}). Try another interest or age group.
                  </div>
                ) : (
                  giftFinderMatches.map((rec) => (
                    <div key={rec.id} className="flex items-center justify-between p-1.5 rounded bg-background border text-xs">
                      <div className="min-w-0 pr-2">
                        <div className="font-medium truncate">{rec.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {fmtBDT(rec.price)} · Stock: {rec.stock}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-6 text-[10px] shrink-0"
                        disabled={!isServiceItem(rec) && rec.stock <= 0}
                        onClick={() => handleAddToCart(rec)}
                      >
                        Add to Cart
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={() => setGiftFinderOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 5: RC Toy & Drone Bench Test Log */}
      <Dialog open={rcBenchTestOpen} onOpenChange={setRcBenchTestOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-600">
              <Gamepad2 className="h-5 w-5" />
              RC Car & Drone Pre-Handover Bench Test
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p className="text-muted-foreground">
              Confirm in-store demonstration to protect against post-crash return disputes:
            </p>
            <div>
              <Label className="text-xs">RC Vehicle / Drone Model</Label>
              <Input
                placeholder="e.g. WLToys 4WD Rock Crawler Buggy"
                value={rcToyModel}
                onChange={(e) => setRcToyModel(e.target.value)}
                className="h-8 text-xs mt-1"
              />
            </div>
            <div className="space-y-2 rounded border p-3 bg-muted/20">
              <div className="flex items-center gap-2">
                <Checkbox id="rc1" checked={rcRemotePaired} onCheckedChange={(v) => setRcRemotePaired(Boolean(v))} />
                <Label htmlFor="rc1" className="cursor-pointer text-xs">
                  <strong>1. Remote Binding:</strong> 2.4GHz controller bound without signal drop.
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="rc2" checked={rcMotorTested} onCheckedChange={(v) => setRcMotorTested(Boolean(v))} />
                <Label htmlFor="rc2" className="cursor-pointer text-xs">
                  <strong>2. Throttle Motor:</strong> Forward/Reverse spin verified on stand.
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="rc3" checked={rcSteeringAligned} onCheckedChange={(v) => setRcSteeringAligned(Boolean(v))} />
                <Label htmlFor="rc3" className="cursor-pointer text-xs">
                  <strong>3. Steering Trim:</strong> Servo centers wheels straight.
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="rc4" checked={rcChargerVerified} onCheckedChange={(v) => setRcChargerVerified(Boolean(v))} />
                <Label htmlFor="rc4" className="cursor-pointer text-xs">
                  <strong>4. Battery & Cable:</strong> Li-ion pack & USB charger verified in carton.
                </Label>
              </div>
            </div>
            <div className="rounded border border-purple-500/20 bg-purple-500/5 p-2 text-[11px] text-purple-800 dark:text-purple-300">
              ✓ Stamps sales receipt: <strong>"Verified Working at Store Counter"</strong>.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRcBenchTestOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={createInspectionMut.isPending} className="bg-purple-600 hover:bg-purple-700 text-white" onClick={handleRcBenchTestSave}>
              {createInspectionMut.isPending ? "Saving…" : "Save Bench Test Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 6: Workshop Service Job Card */}
      <Dialog open={serviceJobOpen} onOpenChange={setServiceJobOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sky-600">
              <Wrench className="h-5 w-5" />
              New Bicycle Workshop Service Job
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateServiceJob} className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Customer Name</Label>
              <Input
                placeholder="e.g. Tanvir Ahmed"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="h-8 text-xs mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-xs">Contact Phone</Label>
              <Input
                placeholder="017xxxxxxxx"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="h-8 text-xs mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-xs">Bicycle Brand & Model</Label>
              <Input
                placeholder="e.g. Phoenix 26'' MTB Black"
                value={bikeModel}
                onChange={(e) => setBikeModel(e.target.value)}
                className="h-8 text-xs mt-1"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Service Type</Label>
                <Select value={serviceType} onValueChange={setServiceType}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Tube Puncture Patch & Air">Tire / Tube Repair</SelectItem>
                    <SelectItem value="Gear Indexing & Cable Fix">Gear Tuning</SelectItem>
                    <SelectItem value="Brake Pad Replacement">Brake Tuning</SelectItem>
                    <SelectItem value="Complete Overhaul & Tuning">Full Overhaul (৳600)</SelectItem>
                    <SelectItem value="Wheel Truing & Alignment">Wheel Truing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Estimated Fee (৳)</Label>
                <Input
                  type="number"
                  min="0"
                  value={serviceCost}
                  onChange={(e) => setServiceCost(e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Assigned Technician</Label>
              <Input
                value={assignedMechanic}
                onChange={(e) => setAssignedMechanic(e.target.value)}
                className="h-8 text-xs mt-1"
              />
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setServiceJobOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createServiceJobMut.isPending} className="bg-sky-600 hover:bg-sky-700 text-white">
                {createServiceJobMut.isPending ? "Saving…" : "Create & Add to Cart"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 7: Gift Wrap & Birthday Message */}
      <Dialog open={giftOpen} onOpenChange={setGiftOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Gift className="h-5 w-5" />
              Festive Gift & Birthday Wrap Service
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Wrapping Theme</Label>
              <Select value={giftTheme} onValueChange={(v: "cartoon" | "festive" | "luxury") => setGiftTheme(v)}>
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cartoon">Cartoon / Kids Theme (+৳50)</SelectItem>
                  <SelectItem value="festive">Festive Eid / Holiday Wrap (+৳100)</SelectItem>
                  <SelectItem value="luxury">Luxury Box with Ribbon (+৳150)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Recipient Kid Name</Label>
              <Input
                placeholder="e.g. Rayan / Ayesha"
                value={giftRecipient}
                onChange={(e) => setGiftRecipient(e.target.value)}
                className="h-8 text-xs mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Greeting Message Slip</Label>
              <Input
                placeholder="e.g. Happy 5th Birthday Rayan! From Uncle"
                value={giftGreeting}
                onChange={(e) => setGiftGreeting(e.target.value)}
                className="h-8 text-xs mt-1"
              />
            </div>
            <div className="rounded border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] text-amber-800 dark:text-amber-300">
              🎁 Includes protective bubble padding, celebration wrapping paper, and customized greeting card attached to cycle/toy box.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setGiftOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleAddGiftWrap}>
              Add Gift Wrap to Cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 8: Battery & Pre-Delivery Test Log */}
      <Dialog open={batteryTestOpen} onOpenChange={setBatteryTestOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-cyan-600">
              <Battery className="h-5 w-5" />
              Electric Ride-on Battery & PDI Log
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSavePdiTest} className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Ride-on Vehicle Model</Label>
              <Input
                placeholder="e.g. Mercedes-Benz G63 12V Jeep"
                value={batteryModel}
                onChange={(e) => setBatteryModel(e.target.value)}
                className="h-8 text-xs mt-1"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Battery Serial No.</Label>
                <Input
                  placeholder="e.g. BAT-12V-90812"
                  value={batterySerial}
                  onChange={(e) => setBatterySerial(e.target.value)}
                  className="h-8 text-xs mt-1 font-mono"
                  required
                />
              </div>
              <div>
                <Label className="text-xs">Customer Name</Label>
                <Input
                  placeholder="Optional"
                  value={batteryCustomerName}
                  onChange={(e) => setBatteryCustomerName(e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Rating</Label>
                <Select value={batteryVoltageRating} onValueChange={(v: "6V" | "12V" | "24V") => setBatteryVoltageRating(v)}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6V">6V</SelectItem>
                    <SelectItem value="12V">12V</SelectItem>
                    <SelectItem value="24V">24V</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Measured Voltage</Label>
                <Input
                  value={measuredVoltage}
                  onChange={(e) => setMeasuredVoltage(e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">2.4G Remote</Label>
                <Select value={remotePaired ? "yes" : "no"} onValueChange={(v) => setRemotePaired(v === "yes")}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Paired</SelectItem>
                    <SelectItem value="no">N/A</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">PDI Inspection Result</Label>
              <Select value={pdiStatus} onValueChange={(v: "Passed PDI" | "Charged 100%" | "Warranty Service") => setPdiStatus(v)}>
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Passed PDI">Passed PDI</SelectItem>
                  <SelectItem value="Charged 100%">Charged 100%</SelectItem>
                  <SelectItem value="Warranty Service">Warranty Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setBatteryTestOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createBatteryLogMut.isPending} className="bg-cyan-600 hover:bg-cyan-700 text-white">
                {createBatteryLogMut.isPending ? "Saving…" : "Save Inspection Record"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

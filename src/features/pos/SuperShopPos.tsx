import React, { useMemo, useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Apple,
  ShoppingBasket,
  Pill,
  Shirt,
  Sparkles,
  Cpu,
  PenLine,
  Scale,
  Barcode,
  Layers,
  Check,
  ShieldCheck,
  FileCheck,
  AlertTriangle,
  RotateCcw,
  SlidersHorizontal,
  ChevronRight,
  Plus,
  Minus,
  Edit2,
  Percent,
  Search,
  Zap,
  Camera,
} from "lucide-react";
import { CameraBarcodeScannerDialog } from "@/components/scanner/CameraBarcodeScannerDialog";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";
import { fmtBDT } from "@/lib/pos-data";
import { cn } from "@/lib/utils";
import { PosShell, ProductGrid, PosProductCard, CartPill, ScrollableRow } from "./PosShell";
import { usePosCatalog, catalogToCartExtras, type PosCatalogItem } from "@/hooks/use-pos-catalog";
import {
  superShopCatalog,
  getSuperShopDepartments,
  parseScaleBarcode,
  DEFAULT_FAST_KEYS,
  type SuperShopDepartment,
  type SuperShopCatalogItem,
  type SuperShopCatalogVariant,
  type FastKeyItem,
} from "@/lib/super-shop-data";
import type { CartLine } from "@/lib/app-store";

const ICON_MAP: Record<string, React.ElementType> = {
  Apple,
  ShoppingBasket,
  Pill,
  Shirt,
  Sparkles,
  Cpu,
  PenLine,
};

export function SuperShopPos() {
  const app = useApp();

  // Departments from dynamic store
  const [departments, setDepartments] = useState<SuperShopDepartment[]>(getSuperShopDepartments);
  useEffect(() => {
    const handleUpdate = () => setDepartments(getSuperShopDepartments());
    window.addEventListener("super-shop-departments-updated", handleUpdate);
    return () => window.removeEventListener("super-shop-departments-updated", handleUpdate);
  }, []);

  const [activeDept, setActiveDept] = useState<string>("ALL");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);
  const [groupByDept, setGroupByDept] = useState(false);

  // Simulated live scanner-scale weight (kg)
  const [simulatedWeight, setSimulatedWeight] = useState<number>(0.85);
  const [isScaleStable, setIsScaleStable] = useState(true);

  // Dialog states for smart dispatcher
  const [weighItem, setWeighItem] = useState<SuperShopCatalogItem | null>(null);
  const [weighKg, setWeighKg] = useState<string>("0.850");
  const [tareGrams, setTareGrams] = useState<number>(15);

  const [variantItem, setVariantItem] = useState<SuperShopCatalogItem | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<SuperShopCatalogVariant | null>(null);

  const [serialItem, setSerialItem] = useState<SuperShopCatalogItem | null>(null);
  const [serialInput, setSerialInput] = useState("");

  const [rxItem, setRxItem] = useState<SuperShopCatalogItem | null>(null);
  const [rxDoctorRef, setRxDoctorRef] = useState("");

  // In-cart line editing state
  const [editingLine, setEditingLine] = useState<CartLine | null>(null);
  const [editQty, setEditQty] = useState<number>(1);
  const [editWeight, setEditWeight] = useState<string>("");
  const [editDiscountPct, setEditDiscountPct] = useState<string>("");
  const [editSerial, setEditSerial] = useState<string>("");

  // Map demo catalog items to standard PosCatalogItem format
  const demoItems: PosCatalogItem[] = useMemo(() => {
    return superShopCatalog.map((item) => ({
      id: item.id,
      sku: item.sku,
      name: item.name,
      price: item.price,
      originalPrice: item.mrp && item.mrp > item.price ? item.mrp : undefined,
      barcode: item.barcode,
      stock: item.stock,
      meta: {
        departmentCode: item.departmentCode,
        category: item.category,
        mrp: item.mrp,
        ratePerKg: item.ratePerKg,
        tareWeightGrams: item.tareWeightGrams,
        isWeighable: item.isWeighable,
        batchNo: item.batchNo,
        expiryDate: item.expiryDate,
        genericName: item.genericName,
        rxRequired: item.rxRequired,
        styleCode: item.styleCode,
        variants: item.variants,
        serialRequired: item.serialRequired,
        warrantyMonths: item.warrantyMonths,
        shelfLocation: item.shelfLocation,
        pluCode: item.pluCode,
      },
    }));
  }, []);

  const catalog = usePosCatalog("super-shop", demoItems);

  // Effective catalog items: use backend items if available; otherwise fallback to rich multi-department catalog
  // CRITICAL: Ensure every item is dynamically enriched with a departmentCode and rich capabilities
  const effectiveItems: PosCatalogItem[] = useMemo(() => {
    const rawList = catalog.items && catalog.items.length > 0 ? catalog.items : demoItems;
    return rawList.map((item) => {
      // 1. Existing departmentCode
      let deptCode = String(
        item.meta?.departmentCode ||
        item.meta?.department_code ||
        (item as any).departmentCode ||
        ""
      ).trim().toUpperCase();

      // 2. Lookup corresponding rich catalog entry in superShopCatalog
      const foundInCatalog = superShopCatalog.find(
        (c) =>
          c.sku.toUpperCase() === item.sku.toUpperCase() ||
          (item.barcode && c.barcode === item.barcode) ||
          c.name.trim().toLowerCase() === item.name.trim().toLowerCase() ||
          item.sku.toUpperCase().includes(c.sku.split("-")[0].toUpperCase()) ||
          c.sku.toUpperCase().includes(item.sku.replace(/^SS-/, "").split("-")[0].toUpperCase())
      );

      if (!deptCode && foundInCatalog) {
        deptCode = foundInCatalog.departmentCode.toUpperCase();
      }

      // 3. Fallback heuristic mapping if still not assigned
      if (!deptCode) {
        const text = `${item.sku} ${item.name} ${String(item.meta?.category || "")}`.toUpperCase();
        if (
          text.includes("BEEF") || text.includes("CHICKEN") || text.includes("APPLE") ||
          text.includes("TOMATO") || text.includes("FRESH") || text.includes("MEAT") ||
          text.includes("FISH") || text.includes("FRUIT") || text.includes("VEG")
        ) {
          deptCode = "FRESH";
        } else if (
          text.includes("NAPA") || text.includes("MOXACIL") || text.includes("CEVIT") ||
          text.includes("MED") || text.includes("PHARM") || text.includes("TABLET") ||
          text.includes("CAPSULE") || text.includes("SYRUP")
        ) {
          deptCode = "PHARM";
        } else if (
          text.includes("POLO") || text.includes("CHINO") || text.includes("SOCK") ||
          text.includes("SHIRT") || text.includes("PANT") || text.includes("TROUSER") ||
          text.includes("APPAREL") || text.includes("FASH") || text.includes("CLOTH")
        ) {
          deptCode = "APPAREL";
        } else if (
          text.includes("NIVEA") || text.includes("LAKME") || text.includes("CREAM") ||
          text.includes("LIP") || text.includes("BEAUTY") || text.includes("COS") ||
          text.includes("LOTION") || text.includes("SOAP")
        ) {
          deptCode = "BEAUTY";
        } else if (
          text.includes("LED") || text.includes("CHARGER") || text.includes("ANKER") ||
          text.includes("WALTON") || text.includes("TECH") || text.includes("BULB") ||
          text.includes("ELECT") || text.includes("HUB") || text.includes("CABLE")
        ) {
          deptCode = "TECH";
        } else if (
          text.includes("PAPER") || text.includes("PEN") || text.includes("MATADOR") ||
          text.includes("STAT") || text.includes("KHATA") || text.includes("BOOK")
        ) {
          deptCode = "STAT";
        } else {
          deptCode = "GROC";
        }
      }

      return {
        ...item,
        meta: {
          ...(foundInCatalog
            ? {
                ratePerKg: foundInCatalog.ratePerKg,
                tareWeightGrams: foundInCatalog.tareWeightGrams,
                isWeighable: foundInCatalog.isWeighable,
                batchNo: foundInCatalog.batchNo,
                expiryDate: foundInCatalog.expiryDate,
                genericName: foundInCatalog.genericName,
                rxRequired: foundInCatalog.rxRequired,
                styleCode: foundInCatalog.styleCode,
                variants: foundInCatalog.variants,
                serialRequired: foundInCatalog.serialRequired,
                warrantyMonths: foundInCatalog.warrantyMonths,
                shelfLocation: foundInCatalog.shelfLocation,
                pluCode: foundInCatalog.pluCode,
                mrp: foundInCatalog.mrp,
              }
            : {}),
          ...(item.meta || {}),
          departmentCode: deptCode,
        },
      };
    });
  }, [catalog.items, demoItems]);

  // Filter catalog items by active department
  const filteredItems = useMemo(() => {
    if (!activeDept || activeDept === "ALL") return effectiveItems;
    return effectiveItems.filter(
      (item) => String(item.meta?.departmentCode || "").trim().toUpperCase() === activeDept.trim().toUpperCase()
    );
  }, [effectiveItems, activeDept]);

  // Find department definition helper
  const getDept = (code?: string) => {
    return departments.find((d) => d.code.toUpperCase() === String(code || "").toUpperCase());
  };

  // Add line to cart helper
  const addLineToCart = (
    item: PosCatalogItem | SuperShopCatalogItem,
    qty: number,
    priceOverride?: number,
    customExtras?: Record<string, string | number | boolean | undefined>
  ) => {
    const meta = item.meta as Record<string, unknown> | undefined;
    const deptCode = String(meta?.departmentCode || (item as any).departmentCode || "GROC");
    const dept = getDept(deptCode);
    const unitPrice = priceOverride ?? item.price;

    app.addToCart({
      sku: item.sku,
      name: item.name,
      price: unitPrice,
      qty,
      industry: "super-shop",
      meta: String(meta?.shelfLocation || (item as any).shelfLocation || ""),
      extras: {
        ...catalogToCartExtras(item as PosCatalogItem),
        departmentCode: deptCode,
        departmentName: dept?.name || deptCode,
        departmentColor: dept?.color || "#64748b",
        barcode: item.barcode || "",
        mrp: meta?.mrp != null ? Number(meta.mrp) : (item as any).mrp ?? 0,
        ...customExtras,
      },
    });
    toast.success(`Added ${item.name} (${qty})`);
  };

  // Smart action dispatcher for item click or scan
  const handleItemSelect = (item: PosCatalogItem) => {
    const meta = item.meta as Record<string, unknown> | undefined;
    const isWeighable = Boolean(meta?.isWeighable);
    const serialRequired = Boolean(meta?.serialRequired);
    const variants = meta?.variants as SuperShopCatalogVariant[] | undefined;
    const rxRequired = Boolean(meta?.rxRequired);

    const catalogItem: SuperShopCatalogItem =
      superShopCatalog.find((x) => x.sku === item.sku || x.name === item.name) ||
      ({
        id: item.id,
        sku: item.sku,
        name: item.name,
        departmentCode: String(meta?.departmentCode || "GROC"),
        category: String(meta?.category || ""),
        price: item.price,
        mrp: meta?.mrp ? Number(meta.mrp) : item.originalPrice,
        stock: item.stock,
        barcode: item.barcode,
        pluCode: meta?.pluCode as string | undefined,
        ratePerKg: meta?.ratePerKg as number | undefined,
        tareWeightGrams: meta?.tareWeightGrams as number | undefined,
        isWeighable: Boolean(meta?.isWeighable),
        batchNo: meta?.batchNo as string | undefined,
        expiryDate: meta?.expiryDate as string | undefined,
        genericName: meta?.genericName as string | undefined,
        rxRequired: Boolean(meta?.rxRequired),
        variants: meta?.variants as SuperShopCatalogVariant[] | undefined,
        serialRequired: Boolean(meta?.serialRequired),
        warrantyMonths: meta?.warrantyMonths as number | undefined,
        shelfLocation: meta?.shelfLocation as string | undefined,
        meta: item.meta,
      } as SuperShopCatalogItem);

    // 1. Weighable item
    if (isWeighable) {
      setWeighItem(catalogItem);
      const defaultKg = simulatedWeight > 0 ? simulatedWeight.toFixed(3) : "1.000";
      setWeighKg(defaultKg);
      setTareGrams(Number(meta?.tareWeightGrams || 15));
      return;
    }

    // 2. Rx required pharmacy item
    if (rxRequired) {
      setRxItem(catalogItem);
      setRxDoctorRef("");
      return;
    }

    // 3. Apparel item with variants
    if (variants && variants.length > 0) {
      setVariantItem(catalogItem);
      setSelectedVariant(variants[0]);
      return;
    }

    // 4. Electronics item with serial required
    if (serialRequired) {
      setSerialItem(catalogItem);
      setSerialInput(`SN-${Date.now().toString().slice(-6)}`);
      return;
    }

    // 5. Standard FMCG / Grocery / Packaged / General items -> Add directly to cart
    addLineToCart(item, 1);
  };

  // Handle barcode / PLU scanner input
  const handleScanSubmit = (overrideCode?: string) => {
    const input = (overrideCode !== undefined ? overrideCode : barcodeInput).trim();
    if (!input) return;

    // Check for quantity multiplier e.g. "3*894110022331"
    let targetBarcode = input;
    let multiplier = 1;
    if (input.includes("*")) {
      const parts = input.split("*");
      multiplier = parseInt(parts[0], 10) || 1;
      targetBarcode = parts[1].trim();
    }

    // 1. Check for standard variable measure scale barcode (Prefix 20/21)
    const scaleResult = parseScaleBarcode(targetBarcode);
    if (scaleResult.isScaleBarcode && scaleResult.pluCode) {
      const pluItem = superShopCatalog.find((p) => p.pluCode === scaleResult.pluCode);
      if (pluItem) {
        const dept = getDept(pluItem.departmentCode);
        const weight = scaleResult.weightKg || 1.0;
        const rate = pluItem.ratePerKg || pluItem.price;
        const linePrice = scaleResult.priceBDT ?? Math.round(weight * rate);

        app.addToCart({
          sku: pluItem.sku,
          name: pluItem.name,
          price: linePrice,
          qty: 1,
          industry: "super-shop",
          meta: pluItem.shelfLocation || "",
          extras: {
            departmentCode: pluItem.departmentCode,
            departmentName: dept?.name || pluItem.departmentCode,
            departmentColor: dept?.color || "#10b981",
            isWeighable: true,
            netKg: weight.toFixed(3),
            ratePerKg: rate,
            barcode: targetBarcode,
            scaleLabelScanned: true,
          },
        });
        toast.success(`Scanned Scale Label: ${pluItem.name} (${weight.toFixed(3)} kg = ৳${linePrice})`);
        setBarcodeInput("");
        return;
      }
    }

    // 2. Match by standard barcode, SKU, or PLU
    const matched = superShopCatalog.find(
      (p) =>
        p.barcode === targetBarcode ||
        p.sku.toLowerCase() === targetBarcode.toLowerCase() ||
        p.pluCode === targetBarcode ||
        (p.variants && p.variants.some((v) => v.barcode === targetBarcode))
    );

    if (matched) {
      // If matched a specific variant barcode
      const matchedVariant = matched.variants?.find((v) => v.barcode === targetBarcode);
      if (matchedVariant) {
        const dept = getDept(matched.departmentCode);
        app.addToCart({
          sku: matchedVariant.sku,
          name: `${matched.name} (${matchedVariant.size} · ${matchedVariant.color})`,
          price: matchedVariant.price,
          qty: multiplier,
          industry: "super-shop",
          extras: {
            departmentCode: matched.departmentCode,
            departmentName: dept?.name || matched.departmentCode,
            departmentColor: dept?.color || "#64748b",
            variantSize: matchedVariant.size,
            variantColor: matchedVariant.color,
            barcode: matchedVariant.barcode,
          },
        });
        toast.success(`Scanned: ${matched.name} (${matchedVariant.size}) × ${multiplier}`);
      } else {
        const posItem = effectiveItems.find((d) => d.sku === matched.sku);
        if (posItem) {
          if (matched.isWeighable || matched.serialRequired || matched.rxRequired) {
            handleItemSelect(posItem);
          } else {
            addLineToCart(posItem, multiplier);
          }
        }
      }
    } else {
      toast.error(`Barcode / PLU "${input}" not found in catalog`);
    }

    setBarcodeInput("");
  };

  // Complete scale weighing modal
  const confirmWeighAdd = () => {
    if (!weighItem) return;
    const grossKg = parseFloat(weighKg) || 0;
    const tareKg = (tareGrams || 0) / 1000;
    const netKg = Math.max(0.01, grossKg - tareKg);
    const rate = weighItem.ratePerKg || weighItem.price;
    const calculatedLinePrice = Math.round(netKg * rate);

    const dept = getDept(weighItem.departmentCode);
    app.addToCart({
      sku: weighItem.sku,
      name: weighItem.name,
      price: calculatedLinePrice,
      qty: 1,
      industry: "super-shop",
      meta: weighItem.shelfLocation || "",
      extras: {
        departmentCode: weighItem.departmentCode,
        departmentName: dept?.name || weighItem.departmentCode,
        departmentColor: dept?.color || "#10b981",
        isWeighable: true,
        grossKg: grossKg.toFixed(3),
        tareGrams,
        netKg: netKg.toFixed(3),
        ratePerKg: rate,
        barcode: weighItem.barcode || "",
        shelf: weighItem.shelfLocation || "",
      },
    });

    toast.success(`Weighed: ${weighItem.name} (${netKg.toFixed(3)} kg @ ৳${rate}/kg)`);
    setWeighItem(null);
  };

  // Complete variant modal
  const confirmVariantAdd = () => {
    if (!variantItem || !selectedVariant) return;
    const dept = getDept(variantItem.departmentCode);
    app.addToCart({
      sku: selectedVariant.sku,
      name: `${variantItem.name} (${selectedVariant.size} · ${selectedVariant.color})`,
      price: selectedVariant.price,
      qty: 1,
      industry: "super-shop",
      extras: {
        departmentCode: variantItem.departmentCode,
        departmentName: dept?.name || variantItem.departmentCode,
        departmentColor: dept?.color || "#8b5cf6",
        variantSize: selectedVariant.size,
        variantColor: selectedVariant.color,
        barcode: selectedVariant.barcode,
      },
    });
    toast.success(`Added variant: ${selectedVariant.size} · ${selectedVariant.color}`);
    setVariantItem(null);
  };

  // Complete serial modal
  const confirmSerialAdd = () => {
    if (!serialItem) return;
    const serial = serialInput.trim() || `SN-${Date.now().toString().slice(-6)}`;
    const dept = getDept(serialItem.departmentCode);
    app.addToCart({
      sku: serialItem.sku,
      name: serialItem.name,
      price: serialItem.price,
      qty: 1,
      industry: "super-shop",
      extras: {
        departmentCode: serialItem.departmentCode,
        departmentName: dept?.name || serialItem.departmentCode,
        departmentColor: dept?.color || "#3b82f6",
        serialNo: serial,
        warrantyMonths: serialItem.warrantyMonths || 12,
        barcode: serialItem.barcode || "",
      },
    });
    toast.success(`Serial registered: ${serialItem.name} [S/N: ${serial}]`);
    setSerialItem(null);
  };

  // Complete Rx modal
  const confirmRxAdd = () => {
    if (!rxItem) return;
    const dept = getDept(rxItem.departmentCode);
    app.addToCart({
      sku: rxItem.sku,
      name: rxItem.name,
      price: rxItem.price,
      qty: 1,
      industry: "super-shop",
      extras: {
        departmentCode: rxItem.departmentCode,
        departmentName: dept?.name || rxItem.departmentCode,
        departmentColor: dept?.color || "#06b6d4",
        rxDoctorRef: rxDoctorRef.trim() || "Verified by Pharmacist",
        batchNo: rxItem.batchNo || "BT-2026",
        expiryDate: rxItem.expiryDate || "2027-12-31",
        genericName: rxItem.genericName || "",
      },
    });
    toast.success(`Rx verified: ${rxItem.name}`);
    setRxItem(null);
  };

  // Open line editor for in-cart editing
  const openLineEditor = (line: CartLine) => {
    setEditingLine(line);
    setEditQty(line.qty);
    setEditWeight(line.extras?.netKg ? String(line.extras.netKg) : "");
    setEditDiscountPct(line.extras?.discountPct ? String(line.extras.discountPct) : "");
    setEditSerial(line.extras?.serialNo ? String(line.extras.serialNo) : "");
  };

  // Save in-cart line edits
  const saveLineEdits = () => {
    if (!editingLine) return;
    const lineId = editingLine.id || editingLine.sku;

    // 1. Update quantity
    if (editQty !== editingLine.qty && editQty > 0) {
      app.updateQty(lineId, editQty - editingLine.qty);
    }

    // 2. Update line extras & price if weight or discounts adjusted
    const newExtras = { ...(editingLine.extras || {}) };
    let newPrice = editingLine.price;

    if (newExtras.isWeighable && editWeight) {
      const netKg = parseFloat(editWeight) || 1;
      const rate = Number(newExtras.ratePerKg) || editingLine.price;
      newPrice = Math.round(netKg * rate);
      newExtras.netKg = netKg.toFixed(3);
    }

    if (editSerial) {
      newExtras.serialNo = editSerial.trim();
    }

    if (editDiscountPct) {
      const pct = parseFloat(editDiscountPct) || 0;
      newExtras.discountPct = pct;
      newExtras.lineDiscountAmount = Math.round((newPrice * pct) / 100);
      newPrice = newPrice - (newExtras.lineDiscountAmount as number);
    }

    // Apply extras & price update
    app.updateLine(lineId, { extras: newExtras, price: newPrice, qty: editQty });
    toast.success(`Updated line item: ${editingLine.name}`);
    setEditingLine(null);
  };

  // Calculate department subtotals for grouped cart view
  const departmentSubtotals = useMemo(() => {
    const map: Record<string, { name: string; color: string; count: number; subtotal: number }> = {};
    for (const line of app.cart || []) {
      const deptCode = String(line.extras?.departmentCode || "OTHER").toUpperCase();
      const dept = getDept(deptCode);
      if (!map[deptCode]) {
        map[deptCode] = {
          name: dept?.name || String(line.extras?.departmentName || deptCode),
          color: dept?.color || "#64748b",
          count: 0,
          subtotal: 0,
        };
      }
      map[deptCode].count += line.qty;
      map[deptCode].subtotal += line.price * line.qty;
    }
    return map;
  }, [app.cart, departments]);

  return (
    <>
      <PosShell
        industry="super-shop"
        title="Super Shop POS"
        subtitle={`Multi-Department Retail · ${departments.length} Active Departments`}
        receiptNote="Grouped by Department · Mixed VAT rates · Thank you for shopping with us!"
        headerBadges={
          <div className="flex items-center gap-2">
            {/* Live Scale Monitor Badge */}
            <div
              onClick={() => {
                const newW = simulatedWeight >= 2.5 ? 0.45 : +(simulatedWeight + 0.4).toFixed(2);
                setSimulatedWeight(newW);
                toast.info(`Scanner-Scale weight set to ${newW} kg`);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 cursor-pointer hover:bg-emerald-500/20 transition-colors"
              title="Click to cycle simulated scale weight"
            >
              <Scale className="h-3.5 w-3.5 animate-pulse" />
              <span>Scale: {simulatedWeight.toFixed(3)} kg</span>
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            </div>

            {/* Group by Department Cart Toggle */}
            <Button
              variant={groupByDept ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs gap-1 cursor-pointer"
              onClick={() => setGroupByDept(!groupByDept)}
            >
              <Layers className="h-3 w-3" />
              {groupByDept ? "Grouped Depts" : "Scan Order"}
            </Button>
          </div>
        }
        cartLineExtra={(line) => (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {/* Department tag */}
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
              style={{ backgroundColor: String(line.extras?.departmentColor || "#64748b") }}
            >
              {String(line.extras?.departmentName || line.extras?.departmentCode || "General")}
            </span>

            {/* Weighed attributes */}
            {line.extras?.isWeighable && (
              <CartPill variant="success">
                {String(line.extras.netKg)} kg @ {fmtBDT(Number(line.extras.ratePerKg))}/kg
              </CartPill>
            )}

            {/* Pharmacy batch & expiry */}
            {line.extras?.batchNo && (
              <CartPill variant="info">
                Batch: {String(line.extras.batchNo)} (Exp: {String(line.extras.expiryDate)})
              </CartPill>
            )}

            {/* Apparel variant */}
            {line.extras?.variantSize && (
              <CartPill variant="neutral">
                {String(line.extras.variantSize)} · {String(line.extras.variantColor)}
              </CartPill>
            )}

            {/* Electronics serial */}
            {line.extras?.serialNo && (
              <CartPill variant="warning">
                S/N: {String(line.extras.serialNo)} ({String(line.extras.warrantyMonths)}m wty)
              </CartPill>
            )}

            {/* MRP Savings callout */}
            {line.extras?.mrp && Number(line.extras.mrp) > line.price && (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                Save {fmtBDT(Number(line.extras.mrp) - line.price)}
              </span>
            )}

            {/* Edit line button */}
            <button
              type="button"
              onClick={() => openLineEditor(line)}
              className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline font-medium ml-auto cursor-pointer"
            >
              <Edit2 className="h-3 w-3" /> Edit
            </button>
          </div>
        )}
        catalog={
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {/* Top Bar: Barcode / PLU search */}
            <div className="shrink-0 flex items-center gap-2 border-b border-border bg-card px-4 py-2.5">
              <div className="relative flex-1">
                <Barcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleScanSubmit()}
                  placeholder="Scan barcode, enter PLU (e.g. 4011), or 3*barcode..."
                  className="h-10 pl-9 font-mono text-sm"
                  autoFocus
                />
              </div>
              <Button size="sm" onClick={() => handleScanSubmit()} className="h-10 px-4">
                Scan
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCameraScannerOpen(true)}
                className="h-10 px-3 gap-1.5 border-dashed border-primary/40 text-primary hover:bg-primary/10"
                title="Scan barcode using camera"
              >
                <Camera className="h-4 w-4" />
                <span className="hidden sm:inline text-xs font-medium">Camera</span>
              </Button>
            </div>

            {/* Fast Keys (F10) one-touch bar */}
            <div className="shrink-0 border-b border-border bg-card/60 px-3 py-1.5 flex items-center gap-2 overflow-x-auto text-xs">
              <span className="font-semibold text-muted-foreground shrink-0 flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span>Fast Keys (F10):</span>
              </span>
              {DEFAULT_FAST_KEYS.map((k) => (
                <Button
                  key={k.id}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2.5 shrink-0 gap-1 font-medium hover:bg-primary/10"
                  onClick={() => {
                    const found = effectiveItems.find((it) => it.sku === k.sku);
                    if (found) handleItemSelect(found);
                    else toast.info(`Fast key: ${k.label}`);
                  }}
                >
                  <span className="font-mono text-[10px] text-primary font-bold">{k.subLabel || k.label}</span>
                  <span>{k.label}</span>
                </Button>
              ))}
            </div>

            {/* Department Navigation Filter Bar with Left/Right Scroll Controls */}
            <div className="shrink-0 border-b border-border bg-background px-3 py-2 flex items-center min-w-0">
              <ScrollableRow className="gap-2">
                <Button
                  variant={activeDept === "ALL" ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-8 rounded-full text-xs font-semibold shrink-0 cursor-pointer transition-all px-3.5",
                    activeDept === "ALL" ? "bg-primary text-primary-foreground shadow-xs font-bold" : "hover:bg-accent"
                  )}
                  onClick={() => {
                    setActiveDept("ALL");
                    toast.info(`Showing all ${effectiveItems.length} products`);
                  }}
                >
                  All Departments ({effectiveItems.length})
                </Button>

                {departments
                  .filter((d) => d.isActive)
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((d) => {
                    const Icon = ICON_MAP[d.iconName] || ShoppingBasket;
                    const count = effectiveItems.filter(
                      (item) => String(item.meta?.departmentCode || "").trim().toUpperCase() === d.code.trim().toUpperCase()
                    ).length;
                    const isSelected = activeDept.trim().toUpperCase() === d.code.trim().toUpperCase();

                    return (
                      <Button
                        key={d.id}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        className={cn(
                          "h-8 rounded-full text-xs shrink-0 gap-1.5 cursor-pointer transition-all px-3.5",
                          isSelected ? "shadow-xs font-bold ring-2 ring-primary/30" : "hover:bg-accent"
                        )}
                        style={
                          isSelected
                            ? { backgroundColor: d.color, borderColor: d.color, color: "#fff" }
                            : { borderColor: `${d.color}60` }
                        }
                        onClick={() => {
                          setActiveDept(d.code);
                          toast.info(`Switched to: ${d.name} (${count} items)`);
                        }}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{d.name}</span>
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.2 rounded-full font-bold",
                            isSelected ? "bg-white/25 text-white" : "bg-muted text-muted-foreground"
                          )}
                        >
                          {count}
                        </span>
                      </Button>
                    );
                  })}
              </ScrollableRow>
            </div>

            {/* Department Subtotals Banner (When Grouped View is Active) */}
            {groupByDept && Object.keys(departmentSubtotals).length > 0 && (
              <div className="shrink-0 bg-secondary/30 border-b border-border px-4 py-2 flex items-center gap-3 overflow-x-auto no-scrollbar text-xs">
                <span className="font-semibold text-muted-foreground shrink-0">Basket Breakdown:</span>
                {Object.entries(departmentSubtotals).map(([code, data]) => (
                  <div key={code} className="flex items-center gap-1 shrink-0">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: data.color }} />
                    <span className="font-medium">{data.name}:</span>
                    <span className="font-semibold">{fmtBDT(data.subtotal)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Product Grid Area with Dedicated Scroll Container */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 sm:p-3">
              {filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center p-6 text-muted-foreground">
                  <ShoppingBasket className="h-12 w-12 stroke-[1.2] text-muted-foreground/40 mb-3" />
                  <p className="font-semibold text-sm text-foreground">No items found in this department</p>
                  <p className="text-xs text-muted-foreground max-w-sm mt-1">
                    Scan a barcode or switch to &quot;All Departments&quot; to see all products in catalog.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 text-xs"
                    onClick={() => setActiveDept("ALL")}
                  >
                    View All Departments ({effectiveItems.length})
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 pb-6">
                  {filteredItems.map((item) => {
                    const p = item as PosCatalogItem;
                    const deptCode = String(p.meta?.departmentCode || "GROC");
                    const dept = getDept(deptCode);
                    const isWeighable = Boolean(p.meta?.isWeighable);
                    const ratePerKg = Number(p.meta?.ratePerKg);

                    return (
                      <button
                        key={p.sku}
                        type="button"
                        onClick={() => handleItemSelect(p)}
                        className="min-w-0 text-left transition-all duration-150 active:scale-95 cursor-pointer"
                      >
                        <PosProductCard
                          badge={dept?.name || deptCode}
                          title={p.name}
                          subtitle={
                            isWeighable
                              ? `Scale item · PLU ${String(p.meta?.pluCode || "—")}`
                              : `Shelf ${String(p.meta?.shelfLocation || "Aisle 01")}`
                          }
                          price={isWeighable ? `${fmtBDT(ratePerKg)}/kg` : fmtBDT(p.price)}
                          originalPrice={p.originalPrice ? fmtBDT(p.originalPrice) : undefined}
                          sku={p.sku}
                          industry="super-shop"
                          imageUrl={(p.meta?.image_url as string) || (p.meta?.image as string)}
                          footer={
                            <div className="mt-1 flex flex-col gap-0.5 text-[10px]">
                              {Boolean(p.meta?.genericName) && (
                                <span className="text-cyan-600 dark:text-cyan-400 truncate">
                                  Mol: {String(p.meta?.genericName)}
                                </span>
                              )}
                              {Boolean(p.meta?.variants) && (
                                <span className="text-purple-600 dark:text-purple-400 font-medium">
                                  {(p.meta?.variants as any[]).length} variants (Size/Color)
                                </span>
                              )}
                              {Boolean(p.meta?.warrantyMonths) && (
                                <span className="text-blue-600 dark:text-blue-400 font-medium">
                                  {String(p.meta?.warrantyMonths)}m warranty · Serial req.
                                </span>
                              )}
                              {Boolean(p.meta?.mrp && Number(p.meta.mrp) > p.price) && (
                                <span className="line-through text-muted-foreground">
                                  MRP {fmtBDT(Number(p.meta?.mrp))}
                                </span>
                              )}
                              <span className="text-muted-foreground">Stock: {p.stock}</span>
                            </div>
                          }
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        }
    />

      {/* 1. Digital Weighing Scale Dialog */}
      <Dialog open={!!weighItem} onOpenChange={(open) => !open && setWeighItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-emerald-600" />
              Weigh & Price Calculation
            </DialogTitle>
          </DialogHeader>

          {weighItem && (
            <div className="space-y-4 pt-2">
              <div className="rounded-xl border border-border bg-secondary/20 p-3 flex justify-between items-center">
                <div>
                  <h4 className="font-semibold text-sm">{weighItem.name}</h4>
                  <p className="text-xs text-muted-foreground">
                    Rate: {fmtBDT(weighItem.ratePerKg || weighItem.price)} / kg · PLU: {weighItem.pluCode || "4011"}
                  </p>
                </div>
                <Badge className="bg-emerald-600 text-white">Weighable</Badge>
              </div>

              {/* Digital Scale Readout */}
              <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 p-4 text-center space-y-1">
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                  Live Scanner-Scale Weight
                </span>
                <div className="text-4xl font-mono font-bold tracking-tight text-emerald-600">
                  {parseFloat(weighKg || "0").toFixed(3)}{" "}
                  <span className="text-lg font-normal text-muted-foreground">kg</span>
                </div>
                <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  Scale Status: Stable reading
                </p>
              </div>

              {/* Weight Adjustment Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Gross Weight (kg)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={weighKg}
                    onChange={(e) => setWeighKg(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Tare Deduction (grams)</Label>
                  <Input
                    type="number"
                    value={tareGrams}
                    onChange={(e) => setTareGrams(parseInt(e.target.value, 10) || 0)}
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              {/* Net calculation preview */}
              {(() => {
                const gross = parseFloat(weighKg) || 0;
                const tare = (tareGrams || 0) / 1000;
                const net = Math.max(0.01, gross - tare);
                const rate = weighItem.ratePerKg || weighItem.price;
                const total = Math.round(net * rate);

                return (
                  <div className="rounded-lg bg-secondary/30 p-2.5 flex justify-between items-center text-xs">
                    <span>
                      Net: <b>{net.toFixed(3)} kg</b> (Gross {gross.toFixed(3)} − Tare {tare.toFixed(3)})
                    </span>
                    <span className="text-sm font-bold text-primary">{fmtBDT(total)}</span>
                  </div>
                );
              })()}

              <DialogFooter className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setWeighItem(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={confirmWeighAdd}>
                  Add Weighed Line
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 2. Apparel Variant Selector Dialog */}
      <Dialog open={!!variantItem} onOpenChange={(open) => !open && setVariantItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shirt className="h-5 w-5 text-purple-600" />
              Select Size & Color Variant
            </DialogTitle>
          </DialogHeader>

          {variantItem && variantItem.variants && (
            <div className="space-y-4 pt-2">
              <div className="rounded-xl border border-border bg-secondary/20 p-3">
                <h4 className="font-semibold text-sm">{variantItem.name}</h4>
                <p className="text-xs text-muted-foreground">Style Code: {variantItem.styleCode || "STYLE-01"}</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">Available Variants Matrix</Label>
                <div className="grid grid-cols-2 gap-2">
                  {variantItem.variants.map((v) => {
                    const isSelected = selectedVariant?.id === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelectedVariant(v)}
                        className={`flex flex-col p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? "border-purple-600 bg-purple-500/10 ring-2 ring-purple-600/30"
                            : "border-border bg-card hover:bg-secondary/40"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm">{v.size}</span>
                          <span className="text-xs font-bold text-primary">{fmtBDT(v.price)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                          <span>Color: {v.color}</span>
                          <span>Stock: {v.stock}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <DialogFooter className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setVariantItem(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={confirmVariantAdd} disabled={!selectedVariant}>
                  Add Selected Variant
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 3. Electronics Serial / IMEI Capture Dialog */}
      <Dialog open={!!serialItem} onOpenChange={(open) => !open && setSerialItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-blue-600" />
              Serial / IMEI Registration
            </DialogTitle>
          </DialogHeader>

          {serialItem && (
            <div className="space-y-4 pt-2">
              <div className="rounded-xl border border-border bg-secondary/20 p-3">
                <h4 className="font-semibold text-sm">{serialItem.name}</h4>
                <p className="text-xs text-muted-foreground">
                  Warranty: {serialItem.warrantyMonths || 12} Months Manufacturer Warranty
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Device Serial Number / IMEI</Label>
                <Input
                  value={serialInput}
                  onChange={(e) => setSerialInput(e.target.value)}
                  placeholder="Scan or type serial number..."
                  className="font-mono text-sm"
                  autoFocus
                />
                <span className="text-[11px] text-muted-foreground">
                  Serial number will be printed on the invoice for warranty claims.
                </span>
              </div>

              <DialogFooter className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setSerialItem(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={confirmSerialAdd} disabled={!serialInput.trim()}>
                  Register & Add
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 4. Pharmacy Rx Confirmation Dialog */}
      <Dialog open={!!rxItem} onOpenChange={(open) => !open && setRxItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pill className="h-5 w-5 text-cyan-600" />
              Prescription Required Medicine
            </DialogTitle>
          </DialogHeader>

          {rxItem && (
            <div className="space-y-4 pt-2">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 dark:text-amber-200">
                  <p className="font-semibold">{rxItem.name} is a Prescription-Only item.</p>
                  <p className="mt-0.5">
                    Molecule: {rxItem.genericName || "Antibiotic"} · Batch: {rxItem.batchNo}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Doctor / Prescription Reference (Optional)</Label>
                <Input
                  value={rxDoctorRef}
                  onChange={(e) => setRxDoctorRef(e.target.value)}
                  placeholder="e.g. Dr. Rahman · Rx-88219"
                  className="text-sm"
                />
              </div>

              <DialogFooter className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setRxItem(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={confirmRxAdd}>
                  Verify & Dispense
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 5. In-Cart Line Item Editing Dialog */}
      <Dialog open={!!editingLine} onOpenChange={(open) => !open && setEditingLine(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-primary" />
              Edit Cart Item
            </DialogTitle>
          </DialogHeader>

          {editingLine && (
            <div className="space-y-4 pt-2">
              <div className="rounded-xl border border-border bg-secondary/20 p-3">
                <h4 className="font-semibold text-sm">{editingLine.name}</h4>
                <p className="text-xs text-muted-foreground">
                  SKU: {editingLine.sku} · Unit Price: {fmtBDT(editingLine.price)}
                </p>
              </div>

              {/* Quantity Stepper */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Quantity</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setEditQty(Math.max(1, editQty - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    value={editQty}
                    onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="h-9 text-center font-mono font-bold"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setEditQty(editQty + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Weight Edit (if weighable) */}
              {editingLine.extras?.isWeighable && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Net Weight (kg)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editWeight}
                    onChange={(e) => setEditWeight(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Rate: {fmtBDT(Number(editingLine.extras.ratePerKg))}/kg
                  </span>
                </div>
              )}

              {/* Serial Edit (if tech) */}
              {editingLine.extras?.serialNo && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Serial Number</Label>
                  <Input
                    value={editSerial}
                    onChange={(e) => setEditSerial(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
              )}

              {/* Line Discount */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <Percent className="h-3 w-3" /> Item Discount (%)
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={editDiscountPct}
                  onChange={(e) => setEditDiscountPct(e.target.value)}
                  placeholder="e.g. 10 for 10% off"
                  className="font-mono text-sm"
                />
              </div>

              <DialogFooter className="flex justify-between items-center gap-2 pt-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    app.removeLine(editingLine.id || editingLine.sku);
                    toast.info(`Removed ${editingLine.name}`);
                    setEditingLine(null);
                  }}
                >
                  Void Line
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingLine(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveLineEdits}>
                    Save Changes
                  </Button>
                </div>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Device Camera Barcode Scanner Dialog */}
      <CameraBarcodeScannerDialog
        open={cameraScannerOpen}
        onOpenChange={setCameraScannerOpen}
        title="SuperShop Camera Barcode Scanner"
        subtitle="Point device camera at any retail package barcode or weight label"
        continuous={true}
        onScan={(code) => {
          handleScanSubmit(code);
        }}
      />
    </>
  );
}

import { useState, useMemo, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import {
  Barcode,
  Printer,
  Sparkles,
  Copy,
  Check,
  RotateCcw,
  Sliders,
  Layout,
  Eye,
  Info,
  Save,
  Cloud,
  Minus,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { generateBarcodeSvgPaths, generateInStoreBarcode } from "@/lib/barcode-generator";
import { fmtBDT } from "@/lib/pos-data";
import { toast } from "sonner";
import {
  useCreateProductBarcode,
  useUpdateProduct,
  useScreenConfig,
  useSaveScreenConfig,
  useApiStores,
} from "@/hooks/use-api-config";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useAuth } from "@/lib/auth-provider";

export type BarcodePrintProduct = {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  retail_price?: number;
  price?: number;
  category?: string;
  storeName?: string;
};

interface BarcodeLabelPrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: BarcodePrintProduct | null;
  onBarcodeAssigned?: (newBarcode: string) => void;
}

export type LabelPreset = "40x25" | "50x30" | "50x25" | "38x25" | "a4" | "custom";
export type LayoutStyle = "compact" | "retail";
export type LabelOrientation = "horizontal" | "vertical";

export type BarcodeDesignerConfig = {
  preset: LabelPreset;
  customWidth: number;
  customHeight: number;
  columns: 1 | 2;
  orientation: LabelOrientation;
  layoutStyle: LayoutStyle;
  showProductName: boolean;
  showPrice: boolean;
  showBarcode: boolean;
  showSku: boolean;
  showStoreName: boolean;
  customStoreName?: string;
  showBorders: boolean;
  currencySymbol: "TK" | "৳" | "BDT";
  productNameSize: number;
  priceSize: number;
  barcodeHeight: number;
  barcodeWidthScale: number;
};

export const DEFAULT_BARCODE_DESIGNER_CONFIG: BarcodeDesignerConfig = {
  preset: "40x25",
  customWidth: 40,
  customHeight: 25,
  columns: 1,
  orientation: "horizontal",
  layoutStyle: "compact",
  showProductName: true,
  showPrice: true,
  showBarcode: true,
  showSku: true,
  showStoreName: false,
  customStoreName: "",
  showBorders: false,
  currencySymbol: "TK",
  productNameSize: 7.5,
  priceSize: 8.5,
  barcodeHeight: 18,
  barcodeWidthScale: 1.2,
};

export const BARCODE_DESIGNER_STORAGE_KEY = "pulse.barcodeDesignerConfig";
export const BARCODE_DESIGNER_SCREEN_KEY = "barcode_designer";

/** Detects obsolete hardcoded mock store names from earlier versions to avoid polluting user stores */
export function isStaleBananiDefault(val?: string | null): boolean {
  if (!val) return true;
  const s = val.trim().toLowerCase();
  return (
    s === "banani flagship" ||
    s === "banani-flagship" ||
    s === "banani flagship (dhk-01)" ||
    s === "e.g. banani flagship"
  );
}

export function loadBarcodeDesignerConfig(): BarcodeDesignerConfig {
  if (typeof window === "undefined" || !window.localStorage) {
    return { ...DEFAULT_BARCODE_DESIGNER_CONFIG };
  }
  try {
    const raw = localStorage.getItem(BARCODE_DESIGNER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const rawCustomStore = typeof parsed.customStoreName === "string" ? parsed.customStoreName : "";
      return {
        ...DEFAULT_BARCODE_DESIGNER_CONFIG,
        ...parsed,
        customWidth: Number(parsed.customWidth) || DEFAULT_BARCODE_DESIGNER_CONFIG.customWidth,
        customHeight: Number(parsed.customHeight) || DEFAULT_BARCODE_DESIGNER_CONFIG.customHeight,
        productNameSize: Number(parsed.productNameSize) || DEFAULT_BARCODE_DESIGNER_CONFIG.productNameSize,
        priceSize: Number(parsed.priceSize) || DEFAULT_BARCODE_DESIGNER_CONFIG.priceSize,
        barcodeHeight: Number(parsed.barcodeHeight) || DEFAULT_BARCODE_DESIGNER_CONFIG.barcodeHeight,
        barcodeWidthScale: Number(parsed.barcodeWidthScale) || DEFAULT_BARCODE_DESIGNER_CONFIG.barcodeWidthScale,
        customStoreName: isStaleBananiDefault(rawCustomStore) ? "" : rawCustomStore,
      };
    }
  } catch {}
  return { ...DEFAULT_BARCODE_DESIGNER_CONFIG };
}

export function saveBarcodeDesignerConfig(cfg: Partial<BarcodeDesignerConfig>): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const current = loadBarcodeDesignerConfig();
    const cleanStore = cfg.customStoreName && isStaleBananiDefault(cfg.customStoreName) ? "" : cfg.customStoreName;
    const updated = {
      ...current,
      ...cfg,
      ...(cfg.customStoreName !== undefined ? { customStoreName: cleanStore } : {}),
    };
    localStorage.setItem(BARCODE_DESIGNER_STORAGE_KEY, JSON.stringify(updated));
  } catch {}
}

export function resetBarcodeDesignerConfig(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.removeItem(BARCODE_DESIGNER_STORAGE_KEY);
  } catch {}
}

export function BarcodeLabelPrintDialog({
  open,
  onOpenChange,
  product,
  onBarcodeAssigned,
}: BarcodeLabelPrintDialogProps) {
  const isOnlineMode = shouldUseBackend();
  const screenConfigQuery = useScreenConfig<BarcodeDesignerConfig>(BARCODE_DESIGNER_SCREEN_KEY, isOnlineMode);
  const saveScreenConfigMut = useSaveScreenConfig<BarcodeDesignerConfig>(BARCODE_DESIGNER_SCREEN_KEY);

  const { user, isDemo } = useAuth();
  const storesQuery = useApiStores();

  const resolvedDefaultStoreName = useMemo(() => {
    if (product?.storeName && !isStaleBananiDefault(product.storeName)) {
      return product.storeName;
    }
    if (user?.store_name) return user.store_name;
    if (user?.company_name) return user.company_name;
    if (storesQuery.data?.[0]?.name) return storesQuery.data[0].name;
    if (user?.company_code) return user.company_code;
    return isDemo ? "Pulse Retail" : "Main Store";
  }, [product?.storeName, user?.store_name, user?.company_name, user?.company_code, storesQuery.data, isDemo]);

  const createBarcodeMut = useCreateProductBarcode();
  const updateProductMut = useUpdateProduct();

  const [currentBarcode, setCurrentBarcode] = useState<string>("");
  const [customProductName, setCustomProductName] = useState<string>("");
  const [customStoreName, setCustomStoreName] = useState<string>(() => {
    const saved = loadBarcodeDesignerConfig().customStoreName;
    return saved && !isStaleBananiDefault(saved) ? saved : "";
  });
  const [qty, setQty] = useState<number>(1);
  const [savingBarcode, setSavingBarcode] = useState(false);

  const [savedIndicator, setSavedIndicator] = useState(false);

  // 1. Layout & Geometry state (loaded from saved preferences)
  const [preset, setPreset] = useState<LabelPreset>(() => loadBarcodeDesignerConfig().preset);
  const [customWidth, setCustomWidth] = useState<number>(() => loadBarcodeDesignerConfig().customWidth);
  const [customHeight, setCustomHeight] = useState<number>(() => loadBarcodeDesignerConfig().customHeight);
  const [columns, setColumns] = useState<1 | 2>(() => loadBarcodeDesignerConfig().columns);
  const [orientation, setOrientation] = useState<LabelOrientation>(() => loadBarcodeDesignerConfig().orientation);
  const [layoutStyle, setLayoutStyle] = useState<LayoutStyle>(() => loadBarcodeDesignerConfig().layoutStyle);

  // 2. Display Toggles
  const [showProductName, setShowProductName] = useState(() => loadBarcodeDesignerConfig().showProductName);
  const [showPrice, setShowPrice] = useState(() => loadBarcodeDesignerConfig().showPrice);
  const [showBarcode, setShowBarcode] = useState(() => loadBarcodeDesignerConfig().showBarcode);
  const [showSku, setShowSku] = useState(() => loadBarcodeDesignerConfig().showSku);
  const [showStoreName, setShowStoreName] = useState(() => loadBarcodeDesignerConfig().showStoreName);
  const [showBorders, setShowBorders] = useState(() => loadBarcodeDesignerConfig().showBorders);
  const [currencySymbol, setCurrencySymbol] = useState<"TK" | "৳" | "BDT">(() => loadBarcodeDesignerConfig().currencySymbol);

  // 3. Typography & Barcode Sizing Sliders
  const [productNameSize, setProductNameSize] = useState<number>(() => loadBarcodeDesignerConfig().productNameSize);
  const [priceSize, setPriceSize] = useState<number>(() => loadBarcodeDesignerConfig().priceSize);
  const [barcodeHeight, setBarcodeHeight] = useState<number>(() => loadBarcodeDesignerConfig().barcodeHeight);
  const [barcodeWidthScale, setBarcodeWidthScale] = useState<number>(() => loadBarcodeDesignerConfig().barcodeWidthScale);

  // Active Tab
  const [activeTab, setActiveTab] = useState<"layout" | "display" | "sizes">("layout");

  // Track if initial remote config has been loaded to prevent background refetches from overwriting active user edits
  const remoteLoadedRef = useRef(false);

  const applyConfig = (cfg: Partial<BarcodeDesignerConfig>) => {
    if (cfg.preset !== undefined) setPreset(cfg.preset);
    if (cfg.customWidth !== undefined) {
      const val = Number(cfg.customWidth);
      if (!Number.isNaN(val) && val > 0) setCustomWidth(val);
    }
    if (cfg.customHeight !== undefined) {
      const val = Number(cfg.customHeight);
      if (!Number.isNaN(val) && val > 0) setCustomHeight(val);
    }
    if (cfg.columns !== undefined) setColumns(cfg.columns);
    if (cfg.orientation !== undefined) setOrientation(cfg.orientation);
    if (cfg.layoutStyle !== undefined) setLayoutStyle(cfg.layoutStyle);
    if (cfg.showProductName !== undefined) setShowProductName(cfg.showProductName);
    if (cfg.showPrice !== undefined) setShowPrice(cfg.showPrice);
    if (cfg.showBarcode !== undefined) setShowBarcode(cfg.showBarcode);
    if (cfg.showSku !== undefined) setShowSku(cfg.showSku);
    if (cfg.showStoreName !== undefined) setShowStoreName(cfg.showStoreName);
    if (cfg.customStoreName !== undefined) setCustomStoreName(cfg.customStoreName);
    if (cfg.showBorders !== undefined) setShowBorders(cfg.showBorders);
    if (cfg.currencySymbol !== undefined) setCurrencySymbol(cfg.currencySymbol);
    if (cfg.productNameSize !== undefined) {
      const val = Number(cfg.productNameSize);
      if (!Number.isNaN(val) && val > 0) setProductNameSize(val);
    }
    if (cfg.priceSize !== undefined) {
      const val = Number(cfg.priceSize);
      if (!Number.isNaN(val) && val > 0) setPriceSize(val);
    }
    if (cfg.barcodeHeight !== undefined) {
      const val = Number(cfg.barcodeHeight);
      if (!Number.isNaN(val) && val > 0) setBarcodeHeight(val);
    }
    if (cfg.barcodeWidthScale !== undefined) {
      const val = Number(cfg.barcodeWidthScale);
      if (!Number.isNaN(val) && val > 0) setBarcodeWidthScale(val);
    }
  };

  const getCurrentConfig = (): BarcodeDesignerConfig => ({
    preset,
    customWidth,
    customHeight,
    columns,
    orientation,
    layoutStyle,
    showProductName,
    showPrice,
    showBarcode,
    showSku,
    showStoreName,
    customStoreName,
    showBorders,
    currencySymbol,
    productNameSize,
    priceSize,
    barcodeHeight,
    barcodeWidthScale,
  });

  // Re-sync with saved choices when dialog opens
  useEffect(() => {
    if (open) {
      const localCfg = loadBarcodeDesignerConfig();
      applyConfig(localCfg);

      const onlineCfg = screenConfigQuery.data?.config;
      if (onlineCfg && typeof onlineCfg === "object" && Object.keys(onlineCfg).length > 0) {
        applyConfig(onlineCfg);
        saveBarcodeDesignerConfig(onlineCfg);
        remoteLoadedRef.current = true;
      }
    } else {
      remoteLoadedRef.current = false;
    }
  }, [open]);

  // If online config loads after dialog was already opened, apply it once only
  useEffect(() => {
    if (open && !remoteLoadedRef.current && screenConfigQuery.data?.config) {
      const onlineCfg = screenConfigQuery.data.config;
      if (typeof onlineCfg === "object" && Object.keys(onlineCfg).length > 0) {
        applyConfig(onlineCfg);
        saveBarcodeDesignerConfig(onlineCfg);
        remoteLoadedRef.current = true;
      }
    }
  }, [open, screenConfigQuery.data]);

  // Auto-save user choices on change (locally immediately + debounced online sync)
  useEffect(() => {
    if (!open) return;
    const cfg = getCurrentConfig();
    saveBarcodeDesignerConfig(cfg);

    if (isOnlineMode) {
      const timer = setTimeout(() => {
        saveScreenConfigMut.mutate(cfg);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [
    open,
    preset,
    customWidth,
    customHeight,
    columns,
    orientation,
    layoutStyle,
    showProductName,
    showPrice,
    showBarcode,
    showSku,
    showStoreName,
    customStoreName,
    showBorders,
    currencySymbol,
    productNameSize,
    priceSize,
    barcodeHeight,
    barcodeWidthScale,
    isOnlineMode,
  ]);

  // Explicit Save as Default handler
  const handleSaveDefaults = () => {
    const cfg = getCurrentConfig();
    saveBarcodeDesignerConfig(cfg);
    if (isOnlineMode) {
      saveScreenConfigMut.mutate(cfg);
    }
    setSavedIndicator(true);
    setTimeout(() => setSavedIndicator(false), 2400);
    toast.success(isOnlineMode ? "Saved choices locally & synced online!" : "Saved choices as default printing layout!");
  };

  // Reset to working defaults
  const handleResetDefaults = () => {
    resetBarcodeDesignerConfig();
    applyConfig(DEFAULT_BARCODE_DESIGNER_CONFIG);
    if (isOnlineMode) {
      saveScreenConfigMut.mutate(DEFAULT_BARCODE_DESIGNER_CONFIG);
    }
    toast.info("Reset to 40×25mm tag defaults");
  };

  // Sync barcode, custom product name, and mark/store name when product changes or dialog opens
  useEffect(() => {
    if (open && product) {
      setCurrentBarcode(product.barcode || "");
      setCustomProductName(product.name || "");
      const savedCfg = loadBarcodeDesignerConfig();
      if (savedCfg.customStoreName && !isStaleBananiDefault(savedCfg.customStoreName)) {
        setCustomStoreName(savedCfg.customStoreName);
      } else {
        setCustomStoreName(resolvedDefaultStoreName);
      }
    }
  }, [open, product?.id, product?.barcode, product?.name, product?.storeName, resolvedDefaultStoreName]);

  const activeBarcode = useMemo(() => {
    return currentBarcode || product?.barcode || "";
  }, [currentBarcode, product?.barcode]);

  const activeProductName = useMemo(() => {
    return customProductName !== "" ? customProductName : (product?.name || "");
  }, [customProductName, product?.name]);

  const activeStoreName = useMemo(() => {
    if (customStoreName && !isStaleBananiDefault(customStoreName)) {
      return customStoreName;
    }
    return resolvedDefaultStoreName;
  }, [customStoreName, resolvedDefaultStoreName]);

  const price = product?.retail_price ?? product?.price ?? 0;
  const storeName = activeStoreName;

  // Compute final dimensions in millimeters
  const { widthMm, heightMm, isThermal } = useMemo(() => {
    const isThermalPaper = preset !== "a4";
    let w = 40;
    let h = 25;

    if (preset === "custom") {
      w = customWidth || 40;
      h = customHeight || 25;
    } else if (preset === "a4") {
      w = 50;
      h = 30;
    } else {
      const parts = preset.split("x").map(Number);
      w = parts[0] || 40;
      h = parts[1] || 25;
    }

    if (orientation === "vertical" && isThermalPaper) {
      return { widthMm: h, heightMm: w, isThermal: isThermalPaper };
    }
    return { widthMm: w, heightMm: h, isThermal: isThermalPaper };
  }, [preset, customWidth, customHeight, orientation]);

  // Generate new barcode if missing
  const handleGenerateBarcode = async () => {
    if (!product) return;
    const generated = generateInStoreBarcode(product.sku, product.id);
    setCurrentBarcode(generated);
    setSavingBarcode(true);

    try {
      await createBarcodeMut.mutateAsync({
        productId: product.id,
        body: { barcode: generated, is_primary: true },
      });

      await updateProductMut.mutateAsync({
        id: product.id,
        body: { barcode: generated },
      });

      toast.success(`Assigned barcode: ${generated}`);
      onBarcodeAssigned?.(generated);
    } catch {
      toast.info(`Generated barcode: ${generated}`);
      onBarcodeAssigned?.(generated);
    } finally {
      setSavingBarcode(false);
    }
  };

  // SVG Barcode computation
  const barcodeSvgData = useMemo(() => {
    const code = activeBarcode || "894000000000";
    return generateBarcodeSvgPaths(code, barcodeHeight, barcodeWidthScale);
  }, [activeBarcode, barcodeHeight, barcodeWidthScale]);

  // Formatted price string
  const formattedPrice = useMemo(() => {
    const rawVal = fmtBDT(price).replace("৳", "").trim();
    return `${currencySymbol} ${rawVal}`;
  }, [price, currencySymbol]);

  // Print execution handler
  const handlePrint = () => {
    // Auto-save user choices on print so they are preserved next time locally and online
    const cfg = getCurrentConfig();
    saveBarcodeDesignerConfig(cfg);
    if (isOnlineMode) {
      saveScreenConfigMut.mutate(cfg);
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Pop-up blocked. Allow pop-ups to print barcode labels.");
      return;
    }

    const code = activeBarcode || "894000000000";
    const labelProductName = (activeProductName || "").trim();
    const { svgPaths, totalWidth } = generateBarcodeSvgPaths(code, barcodeHeight, barcodeWidthScale);

    const labelWidthStr = `${widthMm}mm`;
    const labelHeightStr = `${heightMm}mm`;

    // Calculate copies & pages
    const totalItems = Math.max(1, qty);
    const pagesCount = columns === 2 ? Math.ceil(totalItems / 2) : totalItems;

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Price Tags - ${labelProductName || "Product"}</title>
  <style>
    @page {
      size: ${isThermal ? `${labelWidthStr} ${labelHeightStr}` : "A4 portrait"};
      margin: 0 !important;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #000000 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    ${
      isThermal
        ? `
    .labels-wrapper {
      display: block !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .label-page {
      width: ${labelWidthStr} !important;
      height: ${labelHeightStr} !important;
      max-height: ${labelHeightStr} !important;
      page-break-after: always !important;
      break-after: page !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      justify-content: ${columns === 2 ? "space-between" : "center"} !important;
      padding: 0.5mm 1mm !important;
      margin: 0 !important;
    }
    .label-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    .label-cell {
      width: ${columns === 2 ? "calc(50% - 1mm)" : "100%"} !important;
      height: 100% !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: space-between !important;
      text-align: center !important;
      padding: 0.8mm 1mm !important;
      ${showBorders ? "border: 0.5px dashed #64748b; border-radius: 1mm;" : ""}
    }
    `
        : `
    .sheet-container {
      display: flex;
      flex-wrap: wrap;
      gap: 3mm;
      padding: 6mm;
      justify-content: flex-start;
    }
    .label-cell {
      width: ${labelWidthStr};
      height: ${labelHeightStr};
      box-sizing: border-box;
      padding: 1.5mm;
      ${showBorders ? "border: 1px dashed #cbd5e1; border-radius: 2mm;" : ""}
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      text-align: center;
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    `
    }
    .store-header {
      font-size: ${Math.max(6, productNameSize - 1)}pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      width: 100%;
      line-height: 1.1;
      margin: 0;
    }
    .product-title {
      font-size: ${productNameSize}pt;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      width: 100%;
      line-height: 1.15;
      margin: 0;
    }
    .price-tag {
      font-size: ${priceSize}pt;
      font-weight: 800;
      line-height: 1.1;
      margin: 0;
    }
    .barcode-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      max-width: 100%;
      margin: 0;
      overflow: hidden;
    }
    .barcode-svg {
      display: block;
      max-width: 95%;
      height: ${barcodeHeight}px;
      margin: 0 auto;
      overflow: visible;
    }
    .barcode-digits {
      font-family: "Courier New", Courier, monospace;
      font-size: ${Math.max(6, productNameSize - 1)}pt;
      font-weight: bold;
      letter-spacing: 1px;
      margin-top: 0.3mm;
      line-height: 1;
    }
  </style>
</head>
<body>
  ${
    isThermal
      ? `<div class="labels-wrapper">
      ${Array.from({ length: pagesCount })
        .map(
          () => `
        <div class="label-page">
          <div class="label-cell">
            ${
              layoutStyle !== "retail"
                ? `
              ${showStoreName ? `<div class="store-header">${storeName}</div>` : ""}
              ${showProductName ? `<div class="product-title">${labelProductName}</div>` : ""}
              ${showPrice ? `<div class="price-tag">${formattedPrice}</div>` : ""}
              ${
                showBarcode
                  ? `
                <div class="barcode-wrap">
                  <svg class="barcode-svg" viewBox="0 0 ${totalWidth} ${barcodeHeight}">
                    <path d="${svgPaths}" fill="#000000" />
                  </svg>
                  ${showSku ? `<div class="barcode-digits">${code}</div>` : ""}
                </div>
              `
                  : showSku
                  ? `<div class="barcode-digits">${code}</div>`
                  : ""
              }
            `
                : `
              ${showStoreName ? `<div class="store-header">${storeName}</div>` : ""}
              ${showProductName ? `<div class="product-title">${labelProductName}</div>` : ""}
              ${
                showBarcode
                  ? `
                <div class="barcode-wrap">
                  <svg class="barcode-svg" viewBox="0 0 ${totalWidth} ${barcodeHeight}">
                    <path d="${svgPaths}" fill="#000000" />
                  </svg>
                  ${showSku ? `<div class="barcode-digits">${code}</div>` : ""}
                </div>
              `
                  : showSku
                  ? `<div class="barcode-digits">${code}</div>`
                  : ""
              }
              ${showPrice ? `<div class="price-tag">${formattedPrice}</div>` : ""}
            `
            }
          </div>
          ${
            columns === 2
              ? `
          <div class="label-cell">
            ${
              layoutStyle !== "retail"
                ? `
              ${showStoreName ? `<div class="store-header">${storeName}</div>` : ""}
              ${showProductName ? `<div class="product-title">${labelProductName}</div>` : ""}
              ${showPrice ? `<div class="price-tag">${formattedPrice}</div>` : ""}
              ${
                showBarcode
                  ? `
                <div class="barcode-wrap">
                  <svg class="barcode-svg" viewBox="0 0 ${totalWidth} ${barcodeHeight}">
                    <path d="${svgPaths}" fill="#000000" />
                  </svg>
                  ${showSku ? `<div class="barcode-digits">${code}</div>` : ""}
                </div>
              `
                  : showSku
                  ? `<div class="barcode-digits">${code}</div>`
                  : ""
              }
            `
                : `
              ${showStoreName ? `<div class="store-header">${storeName}</div>` : ""}
              ${showProductName ? `<div class="product-title">${labelProductName}</div>` : ""}
              ${
                showBarcode
                  ? `
                <div class="barcode-wrap">
                  <svg class="barcode-svg" viewBox="0 0 ${totalWidth} ${barcodeHeight}">
                    <path d="${svgPaths}" fill="#000000" />
                  </svg>
                  ${showSku ? `<div class="barcode-digits">${code}</div>` : ""}
                </div>
              `
                  : showSku
                  ? `<div class="barcode-digits">${code}</div>`
                  : ""
              }
              ${showPrice ? `<div class="price-tag">${formattedPrice}</div>` : ""}
            `
            }
          </div>`
              : ""
          }
        </div>
      `
        )
        .join("")}
    </div>`
      : `<div class="sheet-container">
      ${Array.from({ length: totalItems })
        .map(
          () => `
        <div class="label-cell">
          ${
            layoutStyle !== "retail"
              ? `
            ${showStoreName ? `<div class="store-header">${storeName}</div>` : ""}
            ${showProductName ? `<div class="product-title">${labelProductName}</div>` : ""}
            ${showPrice ? `<div class="price-tag">${formattedPrice}</div>` : ""}
            ${
              showBarcode
                ? `
              <div class="barcode-wrap">
                <svg class="barcode-svg" viewBox="0 0 ${totalWidth} ${barcodeHeight}">
                  <path d="${svgPaths}" fill="#000000" />
                </svg>
                ${showSku ? `<div class="barcode-digits">${code}</div>` : ""}
              </div>
            `
                : showSku
                ? `<div class="barcode-digits">${code}</div>`
                : ""
            }
          `
              : `
            ${showStoreName ? `<div class="store-header">${storeName}</div>` : ""}
            ${showProductName ? `<div class="product-title">${labelProductName}</div>` : ""}
            ${
              showBarcode
                ? `
              <div class="barcode-wrap">
                <svg class="barcode-svg" viewBox="0 0 ${totalWidth} ${barcodeHeight}">
                  <path d="${svgPaths}" fill="#000000" />
                </svg>
                ${showSku ? `<div class="barcode-digits">${code}</div>` : ""}
              </div>
            `
                : showSku
                ? `<div class="barcode-digits">${code}</div>`
                : ""
            }
            ${showPrice ? `<div class="price-tag">${formattedPrice}</div>` : ""}
          `
          }
        </div>
      `
        )
        .join("")}
    </div>`
  }
  <script>
    window.onload = function() {
      window.print();
      window.onafterprint = function() { window.close(); };
    };
  </script>
</body>
</html>`);
    printWindow.document.close();
  };

  if (!product) return null;

  // Single cell renderer for live preview
  const renderPreviewCell = () => {
    const previewProductName = (activeProductName && activeProductName.trim()) || "Sample Product";
    const previewFormattedPrice = formattedPrice || `${currencySymbol} 0.00`;

    return (
      <div
        className={`bg-white text-black rounded transition-all duration-150 p-1.5 flex flex-col items-center justify-around text-center overflow-hidden shadow-sm ${
          showBorders ? "border border-dashed border-slate-400" : "border border-slate-200"
        }`}
        style={{
          width: columns === 2 ? `${Math.round(widthMm * 2.3)}px` : `${Math.round(widthMm * 4.6)}px`,
          height: `${Math.round(heightMm * 4.6)}px`,
        }}
      >
        {layoutStyle !== "retail" ? (
          <>
            {showStoreName && (
              <div className="relative w-full group/mark px-0.5 shrink-0">
                <input
                  type="text"
                  value={activeStoreName}
                  onChange={(e) => setCustomStoreName(e.target.value)}
                  placeholder="MARK / STORE"
                  className="text-[8px] font-bold uppercase tracking-wider text-slate-700 truncate w-full leading-tight shrink-0 text-center bg-transparent hover:bg-slate-100/90 focus:bg-amber-50 focus:text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500/50 rounded px-1 py-0.5 border-none transition-colors cursor-text"
                  title="Click to edit mark / store name directly on tag"
                />
              </div>
            )}
            {showProductName && (
              <div className="relative w-full group/name px-0.5 shrink-0">
                <input
                  type="text"
                  value={activeProductName}
                  onChange={(e) => setCustomProductName(e.target.value)}
                  placeholder="Product Name"
                  className="font-semibold text-slate-900 truncate w-full leading-tight shrink-0 px-0.5 text-center bg-transparent hover:bg-slate-100/90 focus:bg-primary/5 focus:outline-none focus:ring-1 focus:ring-primary/40 rounded border-none transition-colors cursor-text"
                  style={{ fontSize: `${productNameSize * 1.15}px` }}
                  title="Click to edit product name on tag"
                />
              </div>
            )}
            {showPrice && (
              <div
                className="font-black text-slate-900 font-display leading-tight shrink-0 px-0.5"
                style={{ fontSize: `${priceSize * 1.15}px` }}
              >
                {previewFormattedPrice}
              </div>
            )}
            {showBarcode && (
              <div className="w-full flex flex-col items-center justify-center shrink-0">
                <svg
                  viewBox={`0 0 ${barcodeSvgData.totalWidth} ${barcodeHeight}`}
                  className="max-w-[94%] w-auto"
                  style={{ height: `${Math.min(barcodeHeight, 26)}px` }}
                >
                  <path d={barcodeSvgData.svgPaths} fill="#000000" />
                </svg>
                {showSku && (
                  <div className="font-mono text-[8.5px] font-bold tracking-wider text-slate-800 leading-tight mt-0.5">
                    {activeBarcode || product.sku}
                  </div>
                )}
              </div>
            )}
            {!showBarcode && showSku && (
              <div className="font-mono text-[8.5px] font-bold tracking-wider text-slate-800 leading-tight shrink-0">
                {activeBarcode || product.sku}
              </div>
            )}
          </>
        ) : (
          <>
            {showStoreName && (
              <div className="relative w-full group/mark px-0.5 shrink-0">
                <input
                  type="text"
                  value={activeStoreName}
                  onChange={(e) => setCustomStoreName(e.target.value)}
                  placeholder="MARK / STORE"
                  className="text-[8px] font-bold uppercase tracking-wider text-slate-700 truncate w-full leading-tight shrink-0 text-center bg-transparent hover:bg-slate-100/90 focus:bg-amber-50 focus:text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500/50 rounded px-1 py-0.5 border-none transition-colors cursor-text"
                  title="Click to edit mark / store name directly on tag"
                />
              </div>
            )}
            {showProductName && (
              <div className="relative w-full group/name px-0.5 shrink-0">
                <input
                  type="text"
                  value={activeProductName}
                  onChange={(e) => setCustomProductName(e.target.value)}
                  placeholder="Product Name"
                  className="font-semibold text-slate-900 truncate w-full leading-tight shrink-0 px-0.5 text-center bg-transparent hover:bg-slate-100/90 focus:bg-primary/5 focus:outline-none focus:ring-1 focus:ring-primary/40 rounded border-none transition-colors cursor-text"
                  style={{ fontSize: `${productNameSize * 1.15}px` }}
                  title="Click to edit product name on tag"
                />
              </div>
            )}
            {showBarcode && (
              <div className="w-full flex flex-col items-center justify-center shrink-0">
                <svg
                  viewBox={`0 0 ${barcodeSvgData.totalWidth} ${barcodeHeight}`}
                  className="max-w-[94%] w-auto"
                  style={{ height: `${Math.min(barcodeHeight, 26)}px` }}
                >
                  <path d={barcodeSvgData.svgPaths} fill="#000000" />
                </svg>
                {showSku && (
                  <div className="font-mono text-[8.5px] font-bold tracking-wider text-slate-800 leading-tight mt-0.5">
                    {activeBarcode || product.sku}
                  </div>
                )}
              </div>
            )}
            {showPrice && (
              <div
                className="font-black text-slate-900 font-display leading-tight shrink-0 px-0.5"
                style={{ fontSize: `${priceSize * 1.15}px` }}
              >
                {previewFormattedPrice}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-2xl p-0 overflow-hidden bg-background border-border flex flex-col max-h-[92vh] rounded-xl shadow-2xl">
        <DialogHeader className="p-4 sm:p-5 pb-3 border-b border-border bg-muted/20 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary font-bold text-base">
              <Barcode className="h-5 w-5" />
              <DialogTitle>Price Tags & Barcode Designer</DialogTitle>
            </div>
            <div className="flex items-center gap-1.5 mr-6">
              {isOnlineMode && (
                <div
                  className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground mr-1 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full"
                  title="Online Cloud Sync Active: preferences are saved to your account in the cloud"
                >
                  <Cloud className="h-3 w-3 text-sky-500" />
                  <span className="text-sky-600 dark:text-sky-400 font-medium">Cloud Synced</span>
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "h-7 text-xs gap-1.5 transition-colors",
                  savedIndicator
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={handleSaveDefaults}
                title="Save current layout, sizing, and toggles as your default locally and online in the cloud"
              >
                {savedIndicator ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    <span>Saved Defaults ✓</span>
                  </>
                ) : (
                  <>
                    <Save className="h-3 w-3" />
                    <span>Save Choices</span>
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                onClick={handleResetDefaults}
                title="Reset to 40×25mm defaults"
              >
                <RotateCcw className="h-3 w-3" /> Reset Defaults
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Custom dimensions, compact barcode heights, typography sliders, and multi-column printing.
          </p>
        </DialogHeader>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Top Bar: Barcode Assignment / Generation & Editable Product Label Name & Mark Name */}
          <div className="p-3 rounded-lg border border-border bg-card space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Label Product Name
                </div>
                <Input
                  value={customProductName}
                  onChange={(e) => setCustomProductName(e.target.value)}
                  placeholder="Product name on tag"
                  className="font-semibold text-xs sm:text-sm text-foreground h-8 bg-background border-border/80 focus:border-primary w-full"
                  title="Edit the product text printed on this price tag"
                />
              </div>

              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center justify-between">
                  <span>Mark Name (Store Header)</span>
                  <div className="flex items-center gap-1.5">
                    {!showStoreName ? (
                      <button
                        type="button"
                        onClick={() => setShowStoreName(true)}
                        className="text-[10px] text-amber-600 dark:text-amber-400 font-medium hover:underline cursor-pointer"
                        title="Click to show mark name on label"
                      >
                        + Show on Tag
                      </button>
                    ) : (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        ✓ Visible on Tag
                      </span>
                    )}
                  </div>
                </div>
                <Input
                  value={customStoreName}
                  onChange={(e) => {
                    setCustomStoreName(e.target.value);
                    if (!showStoreName && e.target.value.trim()) {
                      setShowStoreName(true);
                    }
                  }}
                  placeholder={resolvedDefaultStoreName || "Store or Brand Header"}
                  className="font-semibold text-xs sm:text-sm text-foreground h-8 bg-background border-border/80 focus:border-primary w-full"
                  title="Edit the mark or store name printed on this tag"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1.5 border-t border-border/60">
              <div className="text-[11px] text-muted-foreground font-mono">
                SKU: <span className="text-foreground">{product.sku}</span> | Price:{" "}
                <span className="font-bold text-primary">{formattedPrice}</span>
              </div>

              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
                  Barcode:
                </span>
                <Input
                  value={activeBarcode}
                  onChange={(e) => setCurrentBarcode(e.target.value)}
                  placeholder="Barcode digits"
                  className="font-mono text-xs h-7.5 w-36"
                />
                {!activeBarcode ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7.5 text-xs px-2 gap-1 border-primary/30 text-primary hover:bg-primary/10"
                    onClick={handleGenerateBarcode}
                    disabled={savingBarcode}
                  >
                    <Sparkles className="h-3 w-3" /> Auto
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7.5 w-7.5 shrink-0"
                    title="Copy barcode"
                    onClick={() => {
                      navigator.clipboard.writeText(activeBarcode);
                      toast.success(`Copied: ${activeBarcode}`);
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Interactive Live Sticker Preview Canvas */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-muted-foreground uppercase tracking-wider">
                Live Tag Preview ({widthMm}×{heightMm} mm)
              </span>
              <span className="font-mono text-muted-foreground">
                {columns === 2 ? "2 Columns (Dual Tag)" : "1 Column (Single)"} • {layoutStyle !== "retail" ? "Standard Order" : "Retail Order"}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-dashed border-border bg-slate-100 dark:bg-slate-900/60 flex items-center justify-center min-h-[145px]">
              <div className="flex items-center justify-center gap-2 max-w-full overflow-x-auto p-1">
                {renderPreviewCell()}
                {columns === 2 && renderPreviewCell()}
              </div>
            </div>
          </div>

          {/* Configuration Tabs */}
          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
            <TabsList className="grid grid-cols-3 h-8 text-xs bg-muted/60">
              <TabsTrigger value="layout" className="text-xs gap-1.5">
                <Layout className="h-3.5 w-3.5" /> Layout & Size
              </TabsTrigger>
              <TabsTrigger value="display" className="text-xs gap-1.5">
                <Eye className="h-3.5 w-3.5" /> Display Toggles
              </TabsTrigger>
              <TabsTrigger value="sizes" className="text-xs gap-1.5">
                <Sliders className="h-3.5 w-3.5" /> Sizing Sliders
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: LAYOUT & SIZE */}
            <TabsContent value="layout" className="space-y-3 pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-[11px]">Paper Size Preset</Label>
                  <Select value={preset} onValueChange={(v: any) => setPreset(v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="40x25">40×25 mm (Standard BD)</SelectItem>
                      <SelectItem value="50x30">50×30 mm (Standard)</SelectItem>
                      <SelectItem value="50x25">50×25 mm (2"×1")</SelectItem>
                      <SelectItem value="38x25">38×25 mm (Small Tag)</SelectItem>
                      <SelectItem value="custom">Custom Size (mm)</SelectItem>
                      <SelectItem value="a4">A4 Sheet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Layout Style</Label>
                  <Select value={layoutStyle === "retail" ? "retail" : "compact"} onValueChange={(v: any) => setLayoutStyle(v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compact">Standard (Name→Price→Code)</SelectItem>
                      <SelectItem value="retail">Retail (Store→Name→Code→Price)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Columns</Label>
                  <Select value={String(columns)} onValueChange={(v) => setColumns(Number(v) as 1 | 2)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Column (Single Roll)</SelectItem>
                      <SelectItem value="2">2 Columns (Dual Tag)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Orientation</Label>
                  <Select value={orientation} onValueChange={(v: any) => setOrientation(v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="horizontal">Horizontal (Normal)</SelectItem>
                      <SelectItem value="vertical">Vertical (90° Inverted)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Custom mm inputs when Custom Preset selected */}
              {preset === "custom" && (
                <div className="grid grid-cols-2 gap-2.5 p-2.5 rounded-lg border border-border bg-muted/20">
                  <div className="space-y-1">
                    <Label className="text-xs">Custom Width (mm)</Label>
                    <Input
                      type="number"
                      min={20}
                      max={120}
                      value={customWidth}
                      onChange={(e) => setCustomWidth(Number(e.target.value) || 40)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Custom Height (mm)</Label>
                    <Input
                      type="number"
                      min={15}
                      max={120}
                      value={customHeight}
                      onChange={(e) => setCustomHeight(Number(e.target.value) || 25)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              )}
            </TabsContent>

            {/* TAB 2: DISPLAY TOGGLES */}
            <TabsContent value="display" className="space-y-3 pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-2.5 rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-muted/30">
                  <Label className="text-xs cursor-pointer">Product Name</Label>
                  <Switch checked={showProductName} onCheckedChange={setShowProductName} />
                </div>

                <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-muted/30">
                  <Label className="text-xs cursor-pointer">Price</Label>
                  <Switch checked={showPrice} onCheckedChange={setShowPrice} />
                </div>

                <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-muted/30">
                  <Label className="text-xs cursor-pointer">Barcode</Label>
                  <Switch checked={showBarcode} onCheckedChange={setShowBarcode} />
                </div>

                <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-muted/30">
                  <Label className="text-xs cursor-pointer">Code (SKU)</Label>
                  <Switch checked={showSku} onCheckedChange={setShowSku} />
                </div>

                <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-muted/30">
                  <Label className="text-xs cursor-pointer">Store Header (Mark)</Label>
                  <Switch checked={showStoreName} onCheckedChange={setShowStoreName} />
                </div>

                <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-muted/30">
                  <Label className="text-xs cursor-pointer">Tag Borders</Label>
                  <Switch checked={showBorders} onCheckedChange={setShowBorders} />
                </div>
              </div>

              {showStoreName && (
                <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/20">
                  <Label className="text-xs font-medium shrink-0 text-muted-foreground">Mark / Store Name:</Label>
                  <Input
                    value={customStoreName}
                    onChange={(e) => setCustomStoreName(e.target.value)}
                    placeholder={resolvedDefaultStoreName || "Store or Brand Header"}
                    className="h-7 text-xs bg-background font-medium flex-1"
                  />
                  {customStoreName && customStoreName !== resolvedDefaultStoreName && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] text-muted-foreground px-2"
                      onClick={() => setCustomStoreName(resolvedDefaultStoreName)}
                      title="Reset to default store name"
                    >
                      Reset
                    </Button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <Label className="text-xs font-semibold">Currency Prefix:</Label>
                <div className="flex items-center gap-1.5">
                  {(["TK", "৳", "BDT"] as const).map((sym) => (
                    <Button
                      key={sym}
                      type="button"
                      variant={currencySymbol === sym ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs px-2.5"
                      onClick={() => setCurrencySymbol(sym)}
                    >
                      {sym}
                    </Button>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* TAB 3: SIZING SLIDERS */}
            <TabsContent value="sizes" className="space-y-3.5 pt-2">
              <div className="space-y-3 p-3 rounded-lg border border-border bg-card">
                {/* Product Name Size */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <Label className="text-xs font-medium">Product Name Font Size</Label>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 text-xs"
                        onClick={() => setProductNameSize((v) => Math.max(5, Math.round((v - 0.5) * 10) / 10))}
                        title="Decrease size"
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="font-mono text-foreground font-semibold w-14 text-center text-xs bg-muted/40 py-0.5 rounded border border-border/50">
                        {productNameSize} pt
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 text-xs"
                        onClick={() => setProductNameSize((v) => Math.min(14, Math.round((v + 0.5) * 10) / 10))}
                        title="Increase size"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <Slider
                    min={5}
                    max={14}
                    step={0.5}
                    value={[productNameSize || 7.5]}
                    onValueChange={(val) => {
                      if (val && val[0] !== undefined) setProductNameSize(val[0]);
                    }}
                  />
                </div>

                {/* Price Font Size */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <Label className="text-xs font-medium">Price Font Size</Label>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 text-xs"
                        onClick={() => setPriceSize((v) => Math.max(5, Math.round((v - 0.5) * 10) / 10))}
                        title="Decrease size"
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="font-mono text-foreground font-semibold w-14 text-center text-xs bg-muted/40 py-0.5 rounded border border-border/50">
                        {priceSize} pt
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 text-xs"
                        onClick={() => setPriceSize((v) => Math.min(16, Math.round((v + 0.5) * 10) / 10))}
                        title="Increase size"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <Slider
                    min={5}
                    max={16}
                    step={0.5}
                    value={[priceSize || 8.5]}
                    onValueChange={(val) => {
                      if (val && val[0] !== undefined) setPriceSize(val[0]);
                    }}
                  />
                </div>

                {/* Barcode Height Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <Label className="text-xs font-medium">Barcode Height (Compact Tag)</Label>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 text-xs"
                        onClick={() => setBarcodeHeight((v) => Math.max(10, v - 1))}
                        title="Decrease height"
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="font-mono text-foreground font-semibold w-14 text-center text-xs bg-muted/40 py-0.5 rounded border border-border/50">
                        {barcodeHeight} px
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 text-xs"
                        onClick={() => setBarcodeHeight((v) => Math.min(40, v + 1))}
                        title="Increase height"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <Slider
                    min={10}
                    max={40}
                    step={1}
                    value={[barcodeHeight || 18]}
                    onValueChange={(val) => {
                      if (val && val[0] !== undefined) setBarcodeHeight(val[0]);
                    }}
                  />
                </div>

                {/* Barcode Width Scale */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <Label className="text-xs font-medium">Barcode Bar Width Scale</Label>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 text-xs"
                        onClick={() => setBarcodeWidthScale((v) => Math.max(0.8, Math.round((v - 0.05) * 100) / 100))}
                        title="Decrease scale"
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="font-mono text-foreground font-semibold w-14 text-center text-xs bg-muted/40 py-0.5 rounded border border-border/50">
                        {barcodeWidthScale.toFixed(2)}x
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 text-xs"
                        onClick={() => setBarcodeWidthScale((v) => Math.min(1.8, Math.round((v + 0.05) * 100) / 100))}
                        title="Increase scale"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <Slider
                    min={0.8}
                    max={1.8}
                    step={0.05}
                    value={[barcodeWidthScale || 1.2]}
                    onValueChange={(val) => {
                      if (val && val[0] !== undefined) setBarcodeWidthScale(val[0]);
                    }}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Copies Selector */}
          <div className="flex items-center justify-between gap-3 pt-1 border-t border-border">
            <Label className="text-xs font-semibold">Number of Copies:</Label>
            <div className="flex items-center gap-1.5">
              {[1, 5, 10, 24].map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant={qty === n ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => setQty(n)}
                >
                  {n}
                </Button>
              ))}
              <Input
                type="number"
                min={1}
                max={999}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                className="h-7 w-16 text-xs text-center font-mono"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="p-3 sm:p-4 border-t border-border bg-muted/10 shrink-0 flex flex-row items-center justify-between gap-2">
          <div className="text-[11px] text-muted-foreground hidden sm:flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-emerald-600" />
            <span>Preferences auto-saved for next print</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 bg-primary text-primary-foreground font-semibold shadow"
              onClick={handlePrint}
              disabled={!activeBarcode}
            >
              <Printer className="h-4 w-4" /> Print {qty} {qty === 1 ? "Label" : "Labels"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef, memo, type ReactNode } from "react";
import { cn, resolveImageUrl } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Minus,
  Pause,
  Plus,
  Printer,
  ShoppingBag,
  Trash2,
  X,
  CreditCard,
  Banknote,
  Smartphone,
  Receipt,
  User,
  Download,
  Wifi,
  WifiOff,
  Play,
  List,
  Lock,
  RefreshCw,
  Clock,
  Calendar,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowLeft,
  Barcode,
  Tag,
  Camera,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { getProductFallbackImage } from "@/lib/product-images";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateElectronicsEmi } from "@/hooks/use-industry-backoffice";
import { useReceiptBrand } from "@/hooks/use-receipt-brand";

export function ScrollableRow({ children, className }: { children: ReactNode; className?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setHasOverflow(el.scrollWidth > el.clientWidth + 2);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    const timer = setTimeout(checkScroll, 200);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
      clearTimeout(timer);
    };
  }, [children]);

  const scrollBy = (offset: number) => {
    scrollRef.current?.scrollBy({ left: offset, behavior: "smooth" });
  };

  return (
    <div className="flex items-center min-w-0 flex-1 gap-1">
      {hasOverflow && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => scrollBy(-180)}
          className="h-7 w-7 shrink-0 rounded-full bg-background shadow-xs border-primary/40 text-primary hover:bg-primary/10 cursor-pointer"
          title="Scroll Left (◀)"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}
      <div
        ref={scrollRef}
        onWheel={(e) => {
          if (e.deltaY !== 0 && scrollRef.current) {
            scrollRef.current.scrollLeft += e.deltaY;
          }
        }}
        className={cn(
          "flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 min-w-0 flex-1 scroll-smooth",
          className
        )}
      >
        {children}
      </div>
      {hasOverflow && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => scrollBy(180)}
          className="h-7 w-7 shrink-0 rounded-full bg-background shadow-xs border-primary/40 text-primary hover:bg-primary/10 cursor-pointer"
          title="Scroll Right (▶)"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
import { useApp, cartTotals, lineAmount, lineDiscountAmount, type CartLine } from "@/lib/app-store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/lib/auth-provider";
import { shouldUseBackend } from "@/lib/demo-mode";
import { buildSalePayload, buildSplitPayments, postSale } from "@/lib/sales-api";
import { useCartReservations } from "@/hooks/use-cart-reservations";
import { PosReturnExchange } from "@/features/pos/PosReturnExchange";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { PosMode } from "@/lib/industry-registry";
import { fmtBDT } from "@/lib/pos-data";
import { ThermalReceipt, buildReceiptPdf, tryPrint, type ReceiptData } from "@/lib/receipt";
import { CustomerPicker, CustomerTypeBadge, type CustomerSelection } from "@/features/sales/CustomerPicker";
import { loadCustomerDiscountPolicy, resolveCustomerDiscount, type ResolvedCustomerDiscount, type CustomerDiscountPolicy } from "@/lib/customer-discount-policy";
import {
  useHeldSales,
  useCompleteHeldSale,
  useCancelHeldSale,
  useBarcodeLookup,
  useValidatePromoCode,
  useSubscriptionCurrent,
  type ApiSale,
} from "@/hooks/use-api-config";
import { CameraBarcodeScannerDialog, playScannerBeep } from "@/components/scanner/CameraBarcodeScannerDialog";
import { barcodeLookupToCatalogItem } from "@/lib/barcode-pos";
import { subscribeCatalogSync } from "@/lib/broadcast-sync";

export function CartPill({
  children,
  variant = "neutral",
}: {
  children: React.ReactNode;
  variant?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const colors = {
    neutral: "bg-secondary/40 border-border text-muted-foreground",
    success: "bg-success/10 border-success/20 text-success",
    warning: "bg-warning/10 border-warning/20 text-warning",
    danger: "bg-destructive/10 border-destructive/20 text-destructive",
    info: "bg-primary/10 border-primary/20 text-primary",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none ${colors[variant]}`}
    >
      {children}
    </span>
  );
}

export type PosShellProps = {
  industry: PosMode;
  title: string;
  subtitle?: string;
  catalog: ReactNode;
  headerBadges?: ReactNode;
  cartLineExtra?: (line: CartLine) => ReactNode;
  receiptNote?: string;
  taxRate?: number;
  /** Overrides the "VAT (n%)" cart label when the rate bundles more than VAT. */
  taxLabel?: string;
  qtyStep?: number;
  /** Return false to abort the sale. May be async so a vertical can register a
   * dependent record (e.g. an EMI agreement) and refuse to close the sale if
   * that write fails. */
  onBeforeComplete?: () => boolean | Promise<boolean>;
  /** Fired whenever the selected customer changes (including cleared). Lets a
   * caller show customer-scoped POS features (e.g. loyalty points) without
   * lifting the whole customer-selection state out of PosShell. */
  onCustomerChange?: (customer?: CustomerSelection) => void;
  /** When set, the cart's qty stepper calls this instead of mutating local cart
   * state. Required by any vertical whose cart mirrors a server-side order —
   * a local-only edit there is silently reverted by the next refetch. */
  onLineQtyChange?: (line: CartLine, nextQty: number) => void | Promise<void>;
  /** When set, the cart's remove button calls this instead of `app.removeLine`.
   * Same reason as `onLineQtyChange`. */
  onLineRemove?: (line: CartLine) => void | Promise<void>;
  /** When set, PosShell runs its payment UI but delegates sale creation to the
   * caller, then shows its normal receipt using the returned id. For verticals
   * that own their settlement endpoint (restaurant bills via bill_and_pay_order).
   * Return null to abort without clearing the cart. */
  onCompleteSale?: (args: {
    tender: string;
    payments: Array<{ method: string; amount: number }>;
    totals: { subtotal: number; discount: number; tax: number; total: number };
  }) => Promise<{ id: string } | null>;
  /** Server-authoritative bill, overriding the totals PosShell derives from the
   * cart. Keeps the amount quoted and the amount charged identical. */
  totalsOverride?: { subtotal: number; discount: number; tax: number; total: number };
  /** Fired whenever the derived bill changes. Lets a vertical price a
   * cart-dependent instrument (e.g. the electronics EMI plan) off the same
   * number PosShell will actually charge, instead of re-deriving discount and
   * tax itself and drifting from the invoice. */
  onTotalsChange?: (totals: {
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
  }) => void;
  /** Optional controlled state for the payment dialog, so a vertical can open
   * checkout from its own button instead of shipping a second payment UI. */
  paymentOpen?: boolean;
  onPaymentOpenChange?: (open: boolean) => void;
  /** Non-cash credit the customer has already tendered — the jewelry old-gold
   * trade-in. Applied AFTER tax, because it settles the bill rather than
   * reducing the taxable value of the goods: routing it through the discount
   * would understate VAT on the invoice. It lowers what is collected, never the
   * invoice total, and is recorded as its own payment line so payments still
   * reconcile to that total. */
  creditAmount?: number;
  /** Label for the credit line in the cart summary and on the receipt. */
  creditLabel?: string;
  /** Optional custom barcode callback from camera scanner. */
  onCameraScan?: (barcode: string) => void;
  /** Optional custom sync callback. If omitted, PosShell invalidates ["products"] and ["inventory"] queries automatically. */
  onSyncCatalog?: () => void | Promise<void>;
  isSyncing?: boolean;
};

function LineItemPricingPopover({
  line,
  isAdmin,
  onUpdate,
}: {
  line: CartLine;
  isAdmin: boolean;
  onUpdate: (patch: Partial<CartLine>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [discMode, setDiscMode] = useState<"percent" | "fixed">(line.discountFixed ? "fixed" : "percent");
  const [discVal, setDiscVal] = useState(
    line.discountPct ? String(line.discountPct) : line.discountFixed ? String(line.discountFixed) : ""
  );
  const [overridePrice, setOverridePrice] = useState(String(line.price));
  const [overrideReason, setOverrideReason] = useState(line.priceOverrideReason || "");

  const handleApply = () => {
    const patch: Partial<CartLine> = {};
    const dVal = parseFloat(discVal);
    if (isNaN(dVal) || dVal <= 0) {
      patch.discountPct = undefined;
      patch.discountFixed = undefined;
    } else if (discMode === "percent") {
      patch.discountPct = Math.min(100, dVal);
      patch.discountFixed = undefined;
    } else {
      patch.discountFixed = dVal;
      patch.discountPct = undefined;
    }

    if (isAdmin) {
      const pVal = parseFloat(overridePrice);
      if (!isNaN(pVal) && pVal >= 0 && pVal !== line.price) {
        if (!line.originalPrice) {
          patch.originalPrice = line.price;
        }
        patch.price = pVal;
        patch.priceOverrideReason = overrideReason.trim() || "Admin price override";
      }
    }

    onUpdate(patch);
    setOpen(false);
    toast.success(`Updated ${line.name}`);
  };

  const handleResetPrice = () => {
    if (line.originalPrice != null) {
      onUpdate({
        price: line.originalPrice,
        originalPrice: undefined,
        priceOverrideReason: undefined,
      });
      setOverridePrice(String(line.originalPrice));
      toast.info("Unit price reset to original");
    }
  };

  const handleRemoveDiscount = () => {
    onUpdate({
      discountPct: undefined,
      discountFixed: undefined,
    });
    setDiscVal("");
    toast.info("Line discount removed");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer",
            line.discountPct || line.discountFixed || (line.originalPrice && line.originalPrice !== line.price)
              ? "bg-primary/10 text-primary hover:bg-primary/20"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
          title="Item Discount & Price Override"
        >
          <Tag className="h-3 w-3" />
          <span>Edit Price/Disc</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3.5 space-y-3" align="end">
        <div className="border-b pb-2">
          <div className="text-xs font-semibold text-foreground line-clamp-1">{line.name}</div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {line.sku} · Base Price: {fmtBDT(line.originalPrice ?? line.price)}
          </div>
        </div>

        {/* Item Discount Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-semibold text-foreground">Line Discount</Label>
            <div className="flex items-center rounded-md border border-border bg-secondary/50 p-0.5 text-[10px]">
              <button
                type="button"
                onClick={() => setDiscMode("percent")}
                className={cn(
                  "px-2 py-0.5 rounded cursor-pointer transition-colors",
                  discMode === "percent" ? "bg-background font-semibold shadow-xs text-foreground" : "text-muted-foreground"
                )}
              >
                % Percent
              </button>
              <button
                type="button"
                onClick={() => setDiscMode("fixed")}
                className={cn(
                  "px-2 py-0.5 rounded cursor-pointer transition-colors",
                  discMode === "fixed" ? "bg-background font-semibold shadow-xs text-foreground" : "text-muted-foreground"
                )}
              >
                ৳ Fixed
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0"
              step={discMode === "percent" ? "1" : "10"}
              value={discVal}
              onChange={(e) => setDiscVal(e.target.value)}
              placeholder={discMode === "percent" ? "e.g. 10%" : "e.g. 50"}
              className="h-8 text-xs font-mono"
            />
            {(line.discountPct || line.discountFixed) ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemoveDiscount}
                className="h-8 px-2 text-[10px] text-destructive hover:bg-destructive/10"
              >
                Remove
              </Button>
            ) : null}
          </div>

          {/* Quick preset buttons */}
          {discMode === "percent" ? (
            <div className="flex gap-1.5">
              {[5, 10, 15, 20].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setDiscVal(String(pct))}
                  className="rounded border border-border/80 bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:border-primary hover:text-foreground cursor-pointer"
                >
                  {pct}%
                </button>
              ))}
            </div>
          ) : (
            <div className="flex gap-1.5">
              {[20, 50, 100, 200].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setDiscVal(String(amt))}
                  className="rounded border border-border/80 bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:border-primary hover:text-foreground cursor-pointer"
                >
                  ৳{amt}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Admin Unit Price Override Section */}
        <div className="space-y-2 border-t pt-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Label className="text-[11px] font-semibold text-foreground">Unit Price (Admin)</Label>
              {!isAdmin && <Lock className="h-3 w-3 text-muted-foreground" />}
            </div>
            {line.originalPrice && line.originalPrice !== line.price && isAdmin ? (
              <button
                type="button"
                onClick={handleResetPrice}
                className="text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer"
              >
                Reset Price
              </button>
            ) : null}
          </div>

          {isAdmin ? (
            <div className="space-y-2">
              <Input
                type="number"
                min="0"
                step="1"
                value={overridePrice}
                onChange={(e) => setOverridePrice(e.target.value)}
                className="h-8 text-xs font-mono font-bold"
              />
              <Input
                type="text"
                placeholder="Reason (e.g. Special Deal)"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="h-7 text-[10px]"
              />
            </div>
          ) : (
            <div className="rounded bg-muted/60 px-2 py-1.5 text-[10px] text-muted-foreground">
              Direct price editing is restricted to Admin & Manager roles.
            </div>
          )}
        </div>

        <div className="pt-1 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
            className="h-7 text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleApply}
            className="h-7 text-xs font-semibold"
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AdminTotalOverridePopover({
  totals,
  taxRate,
  onSetTotal,
  onReset,
  isOverridden,
}: {
  totals: { subtotal: number; discount: number; tax: number; total: number; lineDiscounts?: number };
  taxRate: number;
  onSetTotal: (targetTotal: number) => void;
  onReset: () => void;
  isOverridden: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [targetVal, setTargetVal] = useState(String(totals.total));

  useEffect(() => {
    if (open) {
      setTargetVal(String(totals.total));
    }
  }, [open, totals.total]);

  const handleSave = () => {
    const val = parseFloat(targetVal);
    if (isNaN(val) || val < 0) {
      toast.error("Enter a valid total amount");
      return;
    }
    onSetTotal(val);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer",
            isOverridden
              ? "bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          )}
          title="Admin: Set Target Total Bill"
        >
          <Sparkles className="h-3 w-3" />
          <span>{isOverridden ? "Total Set" : "Override"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-3" align="end">
        <div className="border-b pb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <Lock className="h-3.5 w-3.5 text-amber-600" />
            <span>Admin Total Bill Override</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Directly set the final total amount payable. The difference is applied as a bill discount.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Calculated Total:</span>
            <span className="font-mono font-bold text-foreground">{fmtBDT(totals.total)}</span>
          </div>

          <Label className="text-[11px] font-semibold text-foreground">Target Total (৳)</Label>
          <Input
            type="number"
            min="0"
            step="10"
            value={targetVal}
            onChange={(e) => setTargetVal(e.target.value)}
            className="h-9 text-base font-bold font-mono text-primary"
            autoFocus
          />

          <div className="flex gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setTargetVal(String(Math.floor(totals.total / 100) * 100))}
              className="rounded border border-border bg-background px-2 py-0.5 text-[10px] font-mono hover:border-primary cursor-pointer text-muted-foreground hover:text-foreground"
            >
              Round ৳{Math.floor(totals.total / 100) * 100}
            </button>
            <button
              type="button"
              onClick={() => setTargetVal(String(Math.floor(totals.total / 50) * 50))}
              className="rounded border border-border bg-background px-2 py-0.5 text-[10px] font-mono hover:border-primary cursor-pointer text-muted-foreground hover:text-foreground"
            >
              Round ৳{Math.floor(totals.total / 50) * 50}
            </button>
          </div>
        </div>

        <div className="pt-2 border-t flex items-center justify-between">
          {isOverridden ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onReset();
                setOpen(false);
              }}
              className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
            >
              Clear Override
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              className="h-7 text-xs font-semibold"
            >
              Apply Total
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PosShell({
  industry,
  title,
  subtitle,
  catalog,
  headerBadges,
  cartLineExtra,
  receiptNote,
  taxRate = 0,
  taxLabel,
  qtyStep = 1,
  onBeforeComplete,
  onCustomerChange,
  onLineQtyChange,
  onLineRemove,
  onCompleteSale,
  totalsOverride,
  onTotalsChange,
  paymentOpen,
  onPaymentOpenChange,
  creditAmount = 0,
  creditLabel = "Credit applied",
  onCameraScan,
  onSyncCatalog,
  isSyncing,
}: PosShellProps) {
  const [internalSyncing, setInternalSyncing] = useState(false);
  const isSyncingActive = Boolean(isSyncing || internalSyncing);

  const handleCatalogSync = async () => {
    if (onSyncCatalog) {
      await onSyncCatalog();
      return;
    }
    setInternalSyncing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["products"] }),
        qc.invalidateQueries({ queryKey: ["inventory"] }),
      ]);
      toast.success("Catalog & stock synchronized");
    } catch {
      toast.error("Failed to sync catalog");
    } finally {
      setTimeout(() => setInternalSyncing(false), 400);
    }
  };
  const app = useApp();
  const qc = useQueryClient();
  const { user, can } = useAuth();
  const currentSub = useSubscriptionCurrent(!app.offline && shouldUseBackend());
  const isPlatformAdmin = Boolean(user?.is_platform_admin);

  const subExpiresAt = currentSub.data?.expires_at ? new Date(currentSub.data.expires_at) : null;
  const nowMs = Date.now();
  const subExpiresMs = subExpiresAt ? subExpiresAt.getTime() : null;
  const isSubExpired = Boolean(subExpiresMs && subExpiresMs < nowMs);
  const isSubSuspended = currentSub.data?.status === "suspended";
  const subDaysLeft = subExpiresMs ? Math.ceil((subExpiresMs - nowMs) / (1000 * 60 * 60 * 24)) : null;
  const isSubNearExpiry = Boolean(subDaysLeft !== null && subDaysLeft > 0 && subDaysLeft <= 7);

  // Normal merchants cannot complete checkout if subscription is expired or suspended (platform admin has bypass)
  const isCheckoutLocked = Boolean((isSubExpired || isSubSuspended) && !isPlatformAdmin && shouldUseBackend());

  const isAdmin = Boolean(
    user?.is_platform_admin ||
    ["ADMIN", "OWNER", "SUPER_ADMIN", "MANAGER"].includes(user?.role_code?.toUpperCase() ?? "") ||
    user?.permissions?.includes("pos.price_override") ||
    user?.permissions?.includes("pos.manager_discount") ||
    app.role === "Admin" ||
    app.role === "Store Manager"
  );
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);
  const barcodeLookup = useBarcodeLookup();

  const handleCameraScan = async (scannedBarcode: string) => {
    if (onCameraScan) {
      onCameraScan(scannedBarcode);
      return;
    }
    const trimmed = scannedBarcode.trim();
    if (!trimmed) return;
    try {
      if (shouldUseBackend()) {
        const hit = await barcodeLookup.mutateAsync(trimmed);
        const item = barcodeLookupToCatalogItem(hit, 100);
        app.addToCart({
          sku: item.sku,
          name: item.name,
          price: item.price,
          qty: 1,
          industry,
        });
        playScannerBeep(true);
        toast.success(`Scanned: ${item.name}`);
      } else {
        toast.info(`Barcode scanned: ${trimmed}`);
      }
    } catch {
      playScannerBeep(false);
      toast.error(`Barcode "${trimmed}" not found in catalog`);
    }
  };
  // Controllable so a vertical can open checkout from its own affordance (the
  // restaurant's "Pay & Release Table" banner) without duplicating the dialog.
  const [mobileTab, setMobileTab] = useState<"catalog" | "cart">("catalog");
  const [payOpenInternal, setPayOpenInternal] = useState(false);
  const payOpen = paymentOpen ?? payOpenInternal;
  const setPayOpen = (open: boolean) => {
    setPayOpenInternal(open);
    onPaymentOpenChange?.(open);
  };
  const [receiptOpen, setReceiptOpen] = useState<null | {
    id: string;
    total: number;
    tender: string;
    lines: CartLine[];
    ts: number;
    subtotal: number;
    discount: number;
    tax: number;
    customer?: string;
    note?: string;
  }>(null);
  const [tender, setTender] = useState<"Cash" | "Card" | "Mobile" | "Split" | "Due" | "Installment">("Cash");
  const [cashAmt, setCashAmt] = useState("");
  const [cardAmt, setCardAmt] = useState("");
  const [mobAmt, setMobAmt] = useState("");
  const [activeSplitField, setActiveSplitField] = useState<"Cash" | "Card" | "Mobile">("Cash");

  // Due / Credit Sale state
  const [duePaidAmt, setDuePaidAmt] = useState("0");
  const [dueMethod, setDueMethod] = useState<"Cash" | "Card" | "Mobile">("Cash");

  // Installment / EMI state
  const [emiDownPayment, setEmiDownPayment] = useState("0");
  const [emiMethod, setEmiMethod] = useState<"Cash" | "Card" | "Mobile">("Cash");
  const [emiTenure, setEmiTenure] = useState(() => localStorage.getItem("pulse.default_emi_tenure") || "6");
  const [emiBank, setEmiBank] = useState("Direct Store Financing");

  const createEmiMutation = useCreateElectronicsEmi();

  const allowDueSales = useMemo(() => {
    return localStorage.getItem("pulse.allow_due_sales") !== "false";
  }, [payOpen]);

  const allowInstallmentSales = useMemo(() => {
    return localStorage.getItem("pulse.allow_installment_sales") !== "false";
  }, [payOpen]);

  const enforceCreditLimit = useMemo(() => {
    return localStorage.getItem("pulse.enforce_credit_limit") !== "false";
  }, [payOpen]);

  const [customerSelect, setCustomerSelect] = useState(false);
  const [heldListOpen, setHeldListOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSelection | undefined>();
  const [activeCustomerDiscount, setActiveCustomerDiscount] = useState<ResolvedCustomerDiscount | null>(null);
  const [pendingPayAfterCustomer, setPendingPayAfterCustomer] = useState(false);

  const syncCustomer = (c?: CustomerSelection) => {
    setSelectedCustomer(c);
    app.setCustomer(c?.name);
    onCustomerChange?.(c);
    setCustomerSelect(false);

    if (c) {
      const policy = loadCustomerDiscountPolicy();
      const resolved = resolveCustomerDiscount(c, policy);
      setActiveCustomerDiscount(resolved.discountPct > 0 ? resolved : null);
      if (policy.autoApplyInPos && resolved.discountPct > 0) {
        app.setDiscountMode("percent");
        app.setDiscountPct(resolved.discountPct);
        toast.success(`Applied ${resolved.label}`);
      }
    } else {
      setActiveCustomerDiscount(null);
    }

    if (pendingPayAfterCustomer) {
      setPendingPayAfterCustomer(false);
      setPayOpen(true);
    }
  };

  const handlePayStart = () => {
    if (app.cart.length === 0) return;
    if (!selectedCustomer && !app.customer) {
      setPendingPayAfterCustomer(true);
      setCustomerSelect(true);
    } else {
      setPayOpen(true);
    }
  };
  const [resumingHeldId, setResumingHeldId] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [posFieldValues, setPosFieldValues] = useState<Record<string, string>>({});
  const [managerAuthOpen, setManagerAuthOpen] = useState(false);
  const [pendingDiscount, setPendingDiscount] = useState<number | null>(null);
  const [managerApproved, setManagerApproved] = useState(false);
  const [managerPasscode, setManagerPasscode] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("pos_header_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleHeaderCollapse = () => {
    setIsHeaderCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("pos_header_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        toggleHeaderCollapse();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const validatePromo = useValidatePromoCode();
  const completeHeldSale = useCompleteHeldSale();
  const cancelHeldSale = useCancelHeldSale();
  const heldSalesQuery = useHeldSales(shouldUseBackend() ? undefined : undefined);
  const { holdStock, releaseStock, reservationIds, holding } = useCartReservations(app.cart);

  // Receipt identity, most specific first: a receipt template the tenant configured,
  // then their own company profile. The old fallback was a hardcoded brand belonging
  // to one real tenant, so every unconfigured company printed that company's name,
  // address and BIN on its customer receipts. Shared with the restaurant's split
  // bill so both print the same letterhead.
  const activeReceiptBrand = useReceiptBrand(industry);

  const posDynamicFields = useMemo(
    () =>
      app.getVisibleFields({
        pack: industry,
        store: app.store,
        counter: app.counter,
        surface: "pos",
      }),
    [app, industry],
  );

  const manualDiscountPct = app.discountMode === "percent" ? app.discountPct : 0;
  const manualDiscountFixed = app.discountMode === "fixed" ? app.discountFixed : 0;

  const totals = useMemo(() => {
    const base = cartTotals(
      app.cart,
      manualDiscountPct,
      taxRate,
      app.campaignDiscountAmt,
      manualDiscountFixed,
    );
    const pctDiscount = Math.round(base.subtotal * (manualDiscountPct / 100));
    const merged = {
      ...base,
      subtotal: Math.round(base.subtotal),
      discount: Math.round(base.discount),
      tax: Math.round(base.tax),
      total: Math.round(base.total),
      // When the server owns the bill, its figures win — otherwise the dialog can
      // quote one number while the invoice records another.
      ...(totalsOverride
        ? {
            subtotal: Math.round(totalsOverride.subtotal ?? base.subtotal),
            discount: Math.round(totalsOverride.discount ?? base.discount),
            tax: Math.round(totalsOverride.tax ?? base.tax),
            total: Math.round(totalsOverride.total ?? base.total),
          }
        : {}),
    };
    // `total` stays the invoice value so VAT and the printed bill are unaffected;
    // `amountDue` is what the cashier actually collects after the credit.
    const creditApplied = Math.min(Math.max(0, Math.round(creditAmount)), merged.total);
    return {
      ...merged,
      pctDiscount,
      fixedDiscount: Math.round(manualDiscountFixed),
      campaignDisc: Math.round(app.campaignDiscountAmt),
      creditApplied,
      // A trade-in worth more than the basket does not become change — it is
      // surfaced so the counter can settle the remainder deliberately.
      creditUnused: Math.max(0, Math.round(creditAmount) - creditApplied),
      amountDue: Math.max(0, merged.total - creditApplied),
    };
  }, [
    app.cart,
    manualDiscountPct,
    manualDiscountFixed,
    app.campaignDiscountAmt,
    taxRate,
    totalsOverride,
    creditAmount,
  ]);

  // Primitive deps only: an inline arrow in the parent would re-fire this on
  // every render if the callback itself were a dependency.
  useEffect(() => {
    onTotalsChange?.({
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals.subtotal, totals.discount, totals.tax, totals.total]);

  const discountSaleOpts = () => ({
    discountPct: manualDiscountPct,
    discountFixed: manualDiscountFixed,
    extraDiscount: app.campaignDiscountAmt,
  });

  const appliedPromoCode = app.appliedCampaign?.id.startsWith("promo:")
    ? app.appliedCampaign
    : undefined;

  const applyPromoCode = () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    const subtotal = app.cart.reduce((s, l) => s + lineAmount(l), 0);
    validatePromo.mutate(
      { code, subtotal },
      {
        onSuccess: (promo) => {
          app.setAppliedCampaign({
            id: `promo:${promo.code}`,
            name: `Promo: ${promo.code}`,
            discountPct: promo.discount_type === "percent" ? promo.value : 0,
            discountAmt: promo.discount_type === "fixed" ? promo.value : undefined,
          });
          toast.success(`Promo code ${promo.code} applied`);
          setPromoInput("");
        },
      },
    );
  };

  const removePromoCode = () => {
    app.setAppliedCampaign(undefined);
    toast("Promo code removed");
  };

  const splitEnabled = app.isFeatureEnabled("pos.split_tender");
  // Everything the cashier collects is measured against amountDue, which equals
  // total when no credit is applied.
  const tendered =
    tender === "Cash"
      ? Number(cashAmt) || totals.amountDue
      : tender === "Card"
        ? Number(cardAmt) || totals.amountDue
        : tender === "Mobile"
          ? Number(mobAmt) || totals.amountDue
          : tender === "Due"
            ? Number(duePaidAmt) || 0
            : tender === "Installment"
              ? Number(emiDownPayment) || 0
              : (Number(cashAmt) || 0) + (Number(cardAmt) || 0) + (Number(mobAmt) || 0);
  const change = Math.max(0, tendered - totals.amountDue);
  const due = Math.max(0, totals.amountDue - tendered);
  const canManagerDiscount = Boolean(
    isAdmin ||
    can("pos.manager_discount") ||
    user?.permissions?.includes("pos.manager_discount") ||
    app.can("pos.manager_discount")
  );

  const [discountPolicy, setDiscountPolicy] = useState<CustomerDiscountPolicy>(loadCustomerDiscountPolicy);

  useEffect(() => {
    const refreshPolicy = () => {
      setDiscountPolicy(loadCustomerDiscountPolicy());
    };
    window.addEventListener("storage", refreshPolicy);
    window.addEventListener("pulse_policy_updated", refreshPolicy);
    const unsub = subscribeCatalogSync((type) => {
      if (type === "settings" || type === "all") {
        refreshPolicy();
      }
    });
    return () => {
      window.removeEventListener("storage", refreshPolicy);
      window.removeEventListener("pulse_policy_updated", refreshPolicy);
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!payOpen) return;
    // Pre-fill cash amount with what is actually collectable so banknote buttons
    // and change calculation work immediately without the cashier typing first.
    setCashAmt(String(totals.amountDue));
    if (shouldUseBackend() && !app.offline) {
      holdStock().catch(() =>
        toast.warning("Could not reserve stock — sale may fail if stock sells out"),
      );
    }
  }, [payOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const closePayment = async (completed = false) => {
    if (!completed && shouldUseBackend()) await releaseStock().catch(() => undefined);
    setPayOpen(false);
  };

  useEffect(() => {
    if (app.customer && !selectedCustomer) {
      setSelectedCustomer({ name: app.customer });
    }
  }, [app.customer]); // eslint-disable-line react-hooks/exhaustive-deps

  const salePayments = (): Array<{ method: string; amount: number }> | undefined => {
    const collectable = totals.amountDue;
    const tenderPayments = ((): Array<{ method: string; amount: number }> | undefined => {
      if (tender === "Split" && splitEnabled) {
        return buildSplitPayments(collectable, {
          cash: Number(cashAmt) || 0,
          card: Number(cardAmt) || 0,
          mobile: Number(mobAmt) || 0,
        });
      }
      if (tender === "Cash") {
        const paid = Number(cashAmt) || collectable;
        return [{ method: "cash", amount: Math.min(paid, collectable) }];
      }
      if (tender === "Card") {
        return [{ method: "card", amount: Number(cardAmt) || collectable }];
      }
      if (tender === "Mobile") {
        return [{ method: "mobile", amount: Number(mobAmt) || collectable }];
      }
      if (tender === "Due") {
        const paid = Number(duePaidAmt) || 0;
        return paid > 0
          ? [{ method: dueMethod.toLowerCase(), amount: Math.min(paid, collectable) }]
          : [{ method: "due", amount: 0 }];
      }
      if (tender === "Installment") {
        const down = Number(emiDownPayment) || 0;
        return down > 0
          ? [{ method: emiMethod.toLowerCase(), amount: Math.min(down, collectable) }]
          : [{ method: "installment", amount: 0 }];
      }
      return undefined;
    })();
    if (!totals.creditApplied) return tenderPayments;
    // Recorded as a tender, not a discount, so the payment lines add up to the
    // invoice total and the trade-in is auditable against its buyback ticket.
    return [{ method: "tradein", amount: totals.creditApplied }, ...(tenderPayments ?? [])];
  };

  const holdCurrentSale = async () => {
    if (app.cart.length === 0 || isHolding) return;
    if (shouldUseBackend()) {
      if (!selectedCustomer?.id) {
        toast.error("Customer required", {
          description: "Attach a customer to hold this sale on the server.",
        });
        return;
      }
      setIsHolding(true);
      try {
        const payload = buildSalePayload(app.cart, industry, tender, {
          ...discountSaleOpts(),
          taxRate,
          priceMode: app.groceryPriceMode,
          campaignName: app.appliedCampaign?.name,
          loyaltyRedeemPoints: app.appliedCampaign?.loyaltyRedeemPoints,
          customerId: selectedCustomer.id,
          status: "held",
          payments: [{ method: tender.toLowerCase(), amount: 0 }],
          reservationIds,
          totals: {
            subtotal: totals.subtotal,
            discount: totals.discount,
            tax: totals.tax,
            total: totals.total,
          },
        });
        await postSale(payload);
        await releaseStock().catch(() => undefined);
        qc.invalidateQueries({ queryKey: ["sales"] });
        app.clearCart();
        syncCustomer(undefined);
        toast.success("Sale held on server");
      } catch (e: unknown) {
        toast.error("Hold failed", {
          description: String((e as { detail?: string }).detail ?? "Backend error"),
        });
      } finally {
        setIsHolding(false);
      }
      return;
    }
    app.holdSale(industry);
    syncCustomer(undefined);
    toast.success("Sale held");
  };

  const resumeBackendHeld = (sale: ApiSale) => {
    const lines = sale.lines.map((l) => {
      const meta = (l.meta ?? {}) as Record<string, unknown>;
      const productId =
        l.product_id || (typeof meta.productId === "string" ? meta.productId : undefined);
      const extras: CartLine["extras"] = {};
      for (const [k, v] of Object.entries(meta)) {
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          extras![k] = v;
        } else if (v != null) {
          extras![k] = String(v);
        }
      }
      if (productId) extras!.productId = productId;
      return {
        sku: l.sku,
        name: l.name,
        qty: l.qty,
        price: l.unit_price,
        industry: sale.industry_pack as CartLine["industry"],
        extras,
      };
    });
    app.clearCart();
    lines.forEach((line) => app.addToCart(line));
    syncCustomer(
      sale.customer_id && sale.customer_name
        ? { id: sale.customer_id, name: sale.customer_name }
        : undefined,
    );
    setResumingHeldId(sale.id);
    setHeldListOpen(false);
    toast.success("Held sale loaded", { description: sale.invoice_number });
  };

  const completeSale = async () => {
    if (app.cart.length === 0 || isCompleting) return;
    if (isCheckoutLocked) {
      toast.error("Checkout Locked — Subscription Expired", {
        description: isSubSuspended
          ? "Store subscription is suspended. Please contact platform support."
          : `Subscription ended on ${subExpiresAt?.toLocaleDateString() ?? "recently"}. Please renew to checkout sales.`,
      });
      return;
    }
    if (onBeforeComplete && !(await onBeforeComplete())) return;

    if (tender === "Due" || tender === "Installment" || due > 0) {
      if (!allowDueSales && tender !== "Installment") {
        toast.error("Due sales disabled", {
          description: "100% full payment is required by store policy. Please tender the exact amount.",
        });
        return;
      }
      if (!selectedCustomer?.id) {
        toast.error("Customer required", {
          description: `Attach a customer to complete this ${tender === "Installment" ? "installment" : "due / credit"} sale. Opening customer selector…`,
        });
        setPendingPayAfterCustomer(true);
        setPayOpen(false);
        setTimeout(() => setCustomerSelect(true), 150);
        return;
      }
    }

    const missingPos = posDynamicFields.filter(
      (f) => f.required && !String(posFieldValues[f.name] ?? "").trim(),
    );
    if (missingPos.length) {
      toast.error("Required POS fields", { description: missingPos.map((f) => f.name).join(", ") });
      return;
    }
    setIsCompleting(true);
    try {
      let id: string;
      let payments: Array<{ method: string; amount: number }> | undefined;
      try {
        payments = salePayments();
      } catch {
        toast.error("Split payment must equal total");
        return;
      }

      const cartWithPosFields = app.cart.map((line) => ({
        ...line,
        extras: {
          ...(line.extras ?? {}),
          ...Object.fromEntries(
            Object.entries(posFieldValues)
              .filter(([, v]) => String(v).trim() !== "")
              .map(([k, v]) => [k, v]),
          ),
        },
      }));

      if (onCompleteSale) {
        // The caller owns settlement (restaurant bills through its own endpoint).
        // PosShell still runs the payment UI and the receipt around it.
        const settled = await onCompleteSale({
          tender,
          payments: payments ?? [],
          totals: {
            subtotal: totals.subtotal,
            discount: totals.discount,
            tax: totals.tax,
            total: totals.total,
          },
        });
        if (!settled) return;
        id = settled.id;
      } else if (app.offline) {
        id = app.queueSale({
          total: totals.total,
          tender,
          lines: [...cartWithPosFields],
          payments,
          reservationIds,
          customer: selectedCustomer?.name ?? app.customer,
          industry,
          ...discountSaleOpts(),
        });
        toast.warning("Queued offline", { description: `${id} · will sync when online.` });
      } else if (shouldUseBackend()) {
        try {
          if (resumingHeldId) {
            const res = await completeHeldSale.mutateAsync({
              id: resumingHeldId,
              body: { payments, tender: tender.toLowerCase() },
            });
            id = res.invoice_number;
            setResumingHeldId(null);
          } else {
            const payload = buildSalePayload(cartWithPosFields, industry, tender, {
              ...discountSaleOpts(),
              taxRate,
              priceMode: app.groceryPriceMode,
              campaignName: app.appliedCampaign?.name,
              loyaltyRedeemPoints: app.appliedCampaign?.loyaltyRedeemPoints,
              payments,
              reservationIds,
              customerId: selectedCustomer?.id,
              totals: {
                subtotal: totals.subtotal,
                discount: totals.discount,
                tax: totals.tax,
                total: totals.total,
              },
            });
            const res = await postSale(payload);
            id = res.invoice_number;
          }

          if (tender === "Installment" && shouldUseBackend()) {
            try {
              const down = Math.min(Number(emiDownPayment) || 0, totals.amountDue);
              const principal = totals.amountDue;
              const tenureMonths = Number(emiTenure) || 6;
              await createEmiMutation.mutateAsync({
                principal_amount: principal,
                down_payment: down,
                tenure_months: tenureMonths,
                processing_fee: 0,
                interest_rate: 0,
                customer_id: selectedCustomer?.id,
                customer_name: selectedCustomer?.name || app.customer || "Customer",
                customer_phone: selectedCustomer?.phone || "",
                product_name: app.cart.map((l) => l.name).join(", "),
                bank_financier: emiBank,
                invoice_number: id,
                sale_id: id,
              });
              toast.success("Installment schedule created", {
                description: `${tenureMonths} monthly installments recorded for ${selectedCustomer?.name || "customer"}`,
              });
            } catch (err: unknown) {
              console.warn("Installment schedule creation notice:", err);
            }
          }

          qc.invalidateQueries({ queryKey: ["sales"] });
          qc.invalidateQueries({ queryKey: ["reports"] });
          qc.invalidateQueries({ queryKey: ["inventory"] });
          qc.invalidateQueries({ queryKey: ["industry"] });
          qc.invalidateQueries({ queryKey: queryKeys.industry.fashionVariants });
          qc.invalidateQueries({ queryKey: queryKeys.industry.goldRate });
          qc.invalidateQueries({ queryKey: queryKeys.industry.electronicsEmi });
          toast.success("Sale saved", { description: `${id} · ${fmtBDT(totals.total)}` });
        } catch (e: unknown) {
          toast.error("Sale failed", {
            description: String((e as { detail?: string }).detail ?? "Backend error"),
          });
          return;
        }
      } else {
        id = app.recordTransaction({
          total: totals.total,
          tender,
          lines: app.cart.length,
          industry,
        });
        toast.success("Sale complete", { description: `${id} · ${fmtBDT(totals.total)}` });
      }
      const receiptNoteText =
        [
          receiptNote,
          app.appliedCampaign?.name ?? "",
          app.groceryPriceMode === "wholesale" ? "Wholesale pricing" : "",
          // The customer paid less than the printed total, so the receipt has to
          // say why the two differ.
          totals.creditApplied > 0
            ? `${creditLabel} ${fmtBDT(totals.creditApplied)} · Paid ${fmtBDT(totals.amountDue)}`
            : "",
        ]
          .filter(Boolean)
          .join(" · ") || receiptNote;
      setReceiptOpen({
        id,
        total: totals.total,
        tender,
        lines: [...cartWithPosFields],
        ts: Date.now(),
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        customer: selectedCustomer?.name ?? app.customer,
        note: receiptNoteText,
      });
      app.clearCart();
      setManagerApproved(false);
      setPosFieldValues({});
      syncCustomer(undefined);
      setMobileTab("catalog");
      setCashAmt("");
      setCardAmt("");
      setMobAmt("");
      await closePayment(true);
    } finally {
      setIsCompleting(false);
    }
  };

  const buildReceiptData = (snap: NonNullable<typeof receiptOpen>): ReceiptData => ({
    id: snap.id,
    ts: snap.ts,
    tender: snap.tender,
    total: snap.total,
    subtotal: snap.subtotal,
    discount: snap.discount,
    tax: snap.tax,
    lines: snap.lines,
    customer: snap.customer,
    note: snap.note,
  });

  const requestDiscountValue = (raw: number) => {
    const policy = loadCustomerDiscountPolicy();
    const maxWithoutPin = policy.allowCashierOverride
      ? (typeof policy.maxDiscountWithoutPin === "number" ? policy.maxDiscountWithoutPin : 20)
      : 0;

    if (app.discountMode === "percent") {
      const n = Math.min(100, Math.max(0, raw));
      if (n > maxWithoutPin && !canManagerDiscount && !managerApproved) {
        setPendingDiscount(n);
        setManagerAuthOpen(true);
        return;
      }
      app.setDiscountPct(n);
      return;
    }
    const n = Math.max(0, Math.round(raw));
    const capped = Math.min(n, totals.subtotal || n);
    const pctEq = totals.subtotal > 0 ? (capped / totals.subtotal) * 100 : 0;
    if (pctEq > maxWithoutPin && !canManagerDiscount && !managerApproved) {
      setPendingDiscount(capped);
      setManagerAuthOpen(true);
      return;
    }
    app.setDiscountFixed(capped);
  };

  const authorizePendingDiscount = () => {
    if (pendingDiscount === null) return;
    if (app.discountMode === "percent") app.setDiscountPct(pendingDiscount);
    else app.setDiscountFixed(pendingDiscount);
  };

  const suggestedNotes = useMemo(() => {
    const due = totals.amountDue;
    if (due <= 0) return [100, 500, 1000];
    const standardNotes = [20, 50, 100, 200, 500, 1000, 2000];
    const higherNotes = standardNotes.filter((n) => n > due).slice(0, 3);
    const set = new Set<number>([due, ...higherNotes]);
    return Array.from(set).sort((a, b) => a - b);
  }, [totals.amountDue]);

  const setAmtField = (val: string) => {
    const activeField = tender === "Split" ? activeSplitField : tender;
    if (activeField === "Cash") setCashAmt(val);
    else if (activeField === "Card") setCardAmt(val);
    else if (activeField === "Mobile") setMobAmt(val);
  };

  const handleKeypadPress = (val: string) => {
    if (tender === "Due") {
      const current = duePaidAmt;
      if (val === "C") setDuePaidAmt("");
      else if (val === "⌫") setDuePaidAmt(current.slice(0, -1));
      else if (val !== "." && current.length < 10) setDuePaidAmt((current === "0" ? "" : current) + val);
      return;
    }
    if (tender === "Installment") {
      const current = emiDownPayment;
      if (val === "C") setEmiDownPayment("");
      else if (val === "⌫") setEmiDownPayment(current.slice(0, -1));
      else if (val !== "." && current.length < 10) setEmiDownPayment((current === "0" ? "" : current) + val);
      return;
    }

    const activeField = tender === "Split" ? activeSplitField : tender;
    const setAmt =
      activeField === "Cash" ? setCashAmt : activeField === "Card" ? setCardAmt : setMobAmt;
    const current = activeField === "Cash" ? cashAmt : activeField === "Card" ? cardAmt : mobAmt;

    if (val === "C") {
      setAmt("");
    } else if (val === "⌫") {
      setAmt(current.slice(0, -1));
    } else if (val === ".") {
      if (!current.includes(".")) {
        setAmt(current + ".");
      }
    } else {
      // If the current value is the default unmodified prefilled amountDue, replace it with the typed digit
      if (current === String(totals.amountDue) && current !== "") {
        setAmt(val);
      } else if (current.length < 10) {
        setAmt(current + val);
      }
    }
  };

  return (
    <div className="flex h-[calc(100dvh-4rem)] max-h-[calc(100dvh-4rem)] w-full min-w-0 overflow-hidden bg-secondary/30 flex-col lg:flex-row">
      {/* Mobile Tab Switcher Bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-background p-1.5 lg:hidden">
        <div className="flex w-full rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setMobileTab("catalog")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-xs font-semibold transition-all",
              mobileTab === "catalog"
                ? "bg-background text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            Products
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("cart")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-xs font-semibold transition-all relative",
              mobileTab === "cart"
                ? "bg-background text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Receipt className="h-3.5 w-3.5" />
            Cart
            {app.cart.length > 0 && (
              <Badge variant="default" className="h-4 min-w-[16px] px-1 text-[10px] justify-center ml-1">
                {app.cart.length}
              </Badge>
            )}
          </button>
        </div>
      </div>

      {/* Catalog pane — must shrink (min-w-0) so cart stays on-screen without horizontal scroll */}
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          mobileTab !== "catalog" && "hidden lg:flex",
        )}
      >
        {isHeaderCollapsed ? (
          <div className="shrink-0 flex items-center justify-between border-b border-border bg-background/95 px-2.5 py-1 sm:px-3 text-xs select-none animate-in fade-in duration-150">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-xs truncate text-foreground">{title}</span>
              {subtitle && (
                <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
                  · {subtitle}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {app.offline && (
                <Badge
                  variant="outline"
                  className="gap-1 border-warning/40 bg-warning/10 text-warning shrink-0 text-[10px] h-5.5 px-1.5"
                >
                  <WifiOff className="h-2.5 w-2.5" /> Offline
                </Badge>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCameraScannerOpen(true)}
                className="h-6.5 px-2 text-[11px] gap-1 font-semibold rounded-lg border-primary/40 text-primary hover:bg-primary/10 cursor-pointer shadow-2xs transition-colors"
                title="Scan Barcode with Camera"
              >
                <Camera className="h-3 w-3" />
                <span>Camera</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleHeaderCollapse}
                className="h-6.5 px-2.5 text-[11px] gap-1 font-semibold rounded-lg border-primary/40 text-primary hover:bg-primary/10 cursor-pointer shadow-2xs transition-colors"
                title="Expand Header (Alt+H)"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                <span>Expand Header</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="shrink-0 border-b border-border bg-background px-2.5 py-1 sm:px-3 sm:py-1.5 lg:px-6 lg:py-2.5 animate-in fade-in duration-150">
            <div className="flex flex-nowrap items-center justify-between gap-2 overflow-x-auto no-scrollbar">
              <div className="min-w-0 shrink-0">
                <div className="font-display text-sm lg:text-base font-semibold truncate hidden sm:block">{title}</div>
                {subtitle && <div className="text-[11px] lg:text-xs text-muted-foreground truncate hidden sm:block">{subtitle}</div>}
              </div>
              <div className="flex items-center gap-1 min-w-0 flex-1 justify-end">
                <ScrollableRow>
                  {headerBadges}
                  <Badge
                    variant="outline"
                    className="gap-1.5 border-primary/30 bg-primary/5 text-primary shrink-0 text-[10px] h-7 px-2 font-medium"
                    title="Hardware Barcode Scanner Active"
                  >
                    <Barcode className="h-3.5 w-3.5 text-primary animate-pulse" />
                    <span className="hidden xs:inline">Scanner Ready</span>
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCameraScannerOpen(true)}
                    className="gap-1.5 border-dashed border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 shrink-0 text-[10px] h-7 px-2.5 font-medium cursor-pointer"
                    title="Scan barcode using device camera"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>Camera</span>
                  </Button>
                  {/* Built in rather than passed via headerBadges: lanes override
                      that prop freely, so returns would silently disappear from any
                      lane that set it (which is exactly how the fashion Exchange
                      button was lost). Rendered here, every pack gets it. */}
                  <PosReturnExchange industry={industry} />
                  {app.offline ? (
                    <Badge
                      variant="outline"
                      className="gap-1 border-warning/40 bg-warning/10 text-warning shrink-0 text-[10px] h-7 px-2"
                    >
                      <WifiOff className="h-3.5 w-3.5" /> Offline
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="gap-1 border-success/30 bg-success/10 text-success shrink-0 text-[10px] h-7 px-2"
                    >
                      <Wifi className="h-3.5 w-3.5" /> Online · {app.store}
                    </Badge>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSyncingActive}
                    onClick={handleCatalogSync}
                    className="gap-1.5 h-7 px-2 text-[11px] font-medium border-border/60 hover:bg-secondary/60 shrink-0 cursor-pointer"
                    title="Sync Catalog & Stock (Instant live refresh)"
                  >
                    <RefreshCw className={cn("h-3 w-3 text-primary", isSyncingActive && "animate-spin")} />
                    <span>{isSyncingActive ? "Syncing..." : "Sync"}</span>
                  </Button>
                  {isPlatformAdmin && (
                    <Link to="/super-admin/subscriptions">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 h-7 px-2.5 text-[11px] font-semibold border-amber-500/50 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 shrink-0 cursor-pointer shadow-xs"
                        title="Super Admin Portal (Subscriptions, Tenants & Extensions)"
                      >
                        <ShieldCheck className="h-3.5 w-3.5 text-amber-500" />
                        <span>Super Admin</span>
                      </Button>
                    </Link>
                  )}
                </ScrollableRow>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={toggleHeaderCollapse}
                  className="h-7 w-7 shrink-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary border border-border/50 cursor-pointer"
                  title="Collapse Header (Alt+H) - More space for items"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
                {/* Subscription Expired / Suspended Banner */}
        {(isSubExpired || isSubSuspended) && (
          <div
            className={cn(
              "px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs border-b shrink-0 transition-all font-medium",
              isPlatformAdmin
                ? "bg-purple-100/90 border-purple-300 text-purple-950 dark:bg-purple-950/80 dark:border-purple-800 dark:text-purple-100 shadow-xs"
                : "bg-red-50 border-red-300 text-red-950 dark:bg-red-950/70 dark:border-red-800 dark:text-red-100 shadow-xs"
            )}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className={cn("h-4 w-4 shrink-0", isPlatformAdmin ? "text-purple-700 dark:text-purple-400" : "text-red-600 dark:text-red-400")} />
              <span>
                {isSubSuspended ? (
                  <><strong>Subscription Suspended:</strong> Store access has been suspended.</>
                ) : (
                  <>
                    <strong className="font-bold">Subscription Expired:</strong> Plan expired on <strong className="font-bold underline decoration-purple-400 dark:decoration-purple-600">{subExpiresAt?.toLocaleDateString() ?? "recently"}</strong>.
                    {!isPlatformAdmin && " Checkout is locked. Please renew to resume POS transactions."}
                  </>
                )}
                {isPlatformAdmin && (
                  <Badge variant="outline" className="ml-2 text-[10px] font-semibold border-purple-400 bg-purple-200/90 text-purple-900 dark:border-purple-700 dark:bg-purple-900/60 dark:text-purple-200">
                    Super Admin Bypass Active
                  </Badge>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isPlatformAdmin && (
                <Link to="/super-admin/subscriptions">
                  <Button size="sm" variant="outline" className="h-6 px-2.5 text-[11px] font-semibold border-purple-400 bg-white hover:bg-purple-50 text-purple-900 dark:border-purple-700 dark:bg-purple-900/50 dark:text-purple-100 dark:hover:bg-purple-900/80 cursor-pointer shadow-xs">
                    Super Admin Extend
                  </Button>
                </Link>
              )}
              <Link to="/app/subscription/plans">
                <Button size="sm" variant="destructive" className="h-6 px-2.5 text-[11px] font-bold cursor-pointer shadow-xs">
                  Renew Plan →
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Subscription Near-Expiry Warning Banner (7 days or less) */}
        {!isSubExpired && !isSubSuspended && isSubNearExpiry && (
          <div className="bg-amber-50 dark:bg-amber-950/60 border-b border-amber-300 dark:border-amber-800 px-3.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950 dark:text-amber-100 shrink-0 font-medium shadow-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong className="font-bold">Subscription Notice:</strong> Plan expires in <strong className="font-bold">{subDaysLeft} day{subDaysLeft === 1 ? "" : "s"}</strong> ({subExpiresAt?.toLocaleDateString()}). Please renew before expiry to prevent interruption.
              </span>
            </div>
            <Link to="/app/subscription/plans">
              <Button size="sm" variant="outline" className="h-6 px-2.5 text-[11px] font-semibold border-amber-400 bg-white hover:bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/50 dark:text-amber-100 dark:hover:bg-amber-900/80 cursor-pointer shadow-xs">
                Renew Plan →
              </Button>
            </Link>
          </div>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{catalog}</div>

        {/* Mobile Floating Cart Action Bar */}
        {mobileTab === "catalog" && (
          app.cart.length > 0 ? (
            <div className="flex shrink-0 items-center justify-between border-t border-primary/30 bg-card/95 backdrop-blur px-4 py-2.5 shadow-xl lg:hidden animate-in slide-in-from-bottom-2">
              <div className="flex items-center gap-3">
                <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold shadow-xs">
                  <ShoppingBag className="h-4.5 w-4.5" />
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-extrabold text-white ring-2 ring-background">
                    {app.cart.length}
                  </span>
                </div>
                <div>
                  <div className="text-xs font-bold text-foreground tabular-nums">
                    {fmtBDT(totals.total)}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-medium">
                    {app.cart.length} item{app.cart.length === 1 ? "" : "s"} selected
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-semibold rounded-xl px-2.5 border-border/80"
                  onClick={() => setMobileTab("cart")}
                >
                  Cart ({app.cart.length})
                </Button>
                <Button
                  size="sm"
                  className="h-8 gap-1 text-xs font-bold rounded-xl px-3 shadow-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => {
                    handlePayStart();
                  }}
                >
                  Pay {fmtBDT(totals.total)}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex shrink-0 items-center justify-between border-t border-border/40 bg-background/80 backdrop-blur px-4 py-1.5 lg:hidden">
              <div className="flex items-center gap-2 text-muted-foreground">
                <ShoppingBag className="h-3.5 w-3.5 opacity-50" />
                <span className="text-[11px]">Cart is empty</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] text-muted-foreground gap-1 px-2 hover:bg-secondary"
                onClick={() => setMobileTab("cart")}
              >
                View Cart <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          )
        )}
      </div>

      {/* Cart always visible beside catalog on desktop; full view tab on small screens */}
      <aside
        className={cn(
          "flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-t border-border bg-background lg:max-h-none lg:h-auto lg:w-[360px] xl:w-[400px] lg:border-l lg:border-t-0",
          mobileTab !== "cart" ? "hidden lg:flex" : "flex-1 h-full max-h-none border-t-0",
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3 lg:px-5">
          <div className="min-w-0 flex items-center gap-2">
            {mobileTab === "cart" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 lg:hidden"
                onClick={() => setMobileTab("catalog")}
                title="Back to products"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="min-w-0">
              <div className="font-display text-base font-semibold">Current sale</div>
              <div className="text-[11px] text-muted-foreground leading-normal">
                {app.cart.length} items · {industry}
                {(selectedCustomer?.name ?? app.customer) && (
                  <>
                    {" · "}
                    <span className="text-foreground font-medium">
                      {selectedCustomer?.name ?? app.customer}
                    </span>
                    {selectedCustomer?.customer_type && (
                      <span className="ml-1.5 inline-block align-middle">
                        <CustomerTypeBadge type={selectedCustomer.customer_type} />
                      </span>
                    )}
                    {selectedCustomer?.phone && (
                      <span className="text-muted-foreground ml-1">({selectedCustomer.phone})</span>
                    )}
                    {selectedCustomer?.outstanding != null && selectedCustomer.outstanding > 0 && (
                      <span className="ml-1 text-destructive font-mono text-[10px] bg-destructive/10 px-1 rounded">
                        Due: {fmtBDT(selectedCustomer.outstanding)}
                      </span>
                    )}
                  </>
                )}
                {resumingHeldId && <span className="ml-1 text-warning">· resuming held</span>}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2 text-xs"
              onClick={() => setCustomerSelect(true)}
            >
              <User className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Customer</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2 text-xs"
              onClick={() => setHeldListOpen(true)}
            >
              <List className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Held</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2 text-xs"
              onClick={() => void holdCurrentSale()}
              disabled={app.cart.length === 0 || isHolding}
            >
              <Pause className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Hold</span>
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain no-scrollbar scroll-smooth">
          {posDynamicFields.length > 0 && (
            <div className="space-y-2 border-b border-border px-5 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                POS fields
              </div>
              {posDynamicFields.map((f) => (
                <div key={f.id} className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    {f.name}
                    {f.required ? " *" : ""}
                  </label>
                  {f.type === "dropdown" ? (
                    <select
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                      value={posFieldValues[f.name] ?? ""}
                      onChange={(e) =>
                        setPosFieldValues((p) => ({ ...p, [f.name]: e.target.value }))
                      }
                    >
                      <option value="">Select…</option>
                      {(f.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "checkbox" ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={posFieldValues[f.name] === "true"}
                        onChange={(e) =>
                          setPosFieldValues((p) => ({
                            ...p,
                            [f.name]: e.target.checked ? "true" : "",
                          }))
                        }
                      />
                      {f.name}
                    </label>
                  ) : (
                    <Input
                      className="h-8"
                      type={
                        f.type === "number" || f.type === "currency" || f.type === "weight"
                          ? "number"
                          : "text"
                      }
                      value={posFieldValues[f.name] ?? ""}
                      onChange={(e) =>
                        setPosFieldValues((p) => ({ ...p, [f.name]: e.target.value }))
                      }
                      placeholder={f.name}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {app.cart.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center animate-cart-item">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-secondary/50 border border-dashed border-border mb-4">
                <ShoppingBag className="h-8 w-8 text-muted-foreground/50" />
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/20 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-primary/30"></span>
                </span>
              </div>
              <div className="text-sm font-semibold text-foreground">Your cart is empty</div>
              <p className="mt-1 max-w-[200px] text-xs text-muted-foreground leading-normal">
                Scan a barcode or select products from the catalog to begin
              </p>
              {app.held.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 h-8 text-[11px] gap-1 px-3"
                  onClick={() => setHeldListOpen(true)}
                >
                  <RefreshCw className="h-3 w-3" /> Resume held sale ({app.held.length})
                </Button>
              )}
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {app.cart.map((l, i) => (
                <div
                  key={l.id || `${l.sku}-${i}`}
                  className="bg-card border border-border/50 rounded-xl p-3.5 shadow-sm hover:shadow-md hover:border-border transition-all animate-cart-item flex flex-col justify-between gap-3 relative group"
                >
                  {/* Top: Name, SKU, badges and Delete button */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground/90 leading-snug line-clamp-2">
                        {l.name}
                      </div>

                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[9px] bg-secondary/80 text-muted-foreground px-1.5 py-0.5 rounded font-medium">
                          {l.sku}
                        </span>

                        {l.extras?.isMarkdownActive ? (
                          <CartPill variant="warning">
                            {String(l.extras.markdownBadge || "⚡ Fresh Markdown")}
                          </CartPill>
                        ) : null}

                        {l.extras?.size || l.extras?.color ? (
                          <>
                            {l.extras?.size && (
                              <CartPill variant="neutral">S: {String(l.extras.size)}</CartPill>
                            )}
                            {l.extras?.color && (
                              <CartPill variant="neutral">
                                <span
                                  className="inline-block h-2 w-2 rounded-full border border-border/80"
                                  style={{
                                    backgroundColor:
                                      {
                                        white: "#f4f4f5",
                                        black: "#18181b",
                                        charcoal: "#3f3f46",
                                        grey: "#a1a1aa",
                                        gray: "#a1a1aa",
                                        navy: "#1e3a5f",
                                        indigo: "#4338ca",
                                        blue: "#2563eb",
                                        teal: "#0d9488",
                                        green: "#16a34a",
                                        red: "#dc2626",
                                        pink: "#ec4899",
                                        orange: "#f97316",
                                        yellow: "#eab308",
                                      }[String(l.extras.color).trim().toLowerCase()] ||
                                      String(l.extras.color),
                                  }}
                                />{" "}
                                {String(l.extras.color)}
                              </CartPill>
                            )}
                          </>
                        ) : null}
                      </div>

                      {cartLineExtra?.(l)}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (onLineRemove) void onLineRemove(l);
                        else app.removeLine(l.id || l.sku);
                      }}
                      className="text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-lg p-1 transition-all cursor-pointer"
                      title="Remove item"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Bottom: Qty controls and Price */}
                  <div className="flex items-center justify-between border-t border-border/30 pt-2.5">
                    <div className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-secondary/20 p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (onLineQtyChange) void onLineQtyChange(l, l.qty - qtyStep);
                          else app.updateQty(l.id || l.sku, -qtyStep);
                        }}
                        className="grid h-7 w-7 place-items-center hover:bg-background rounded-lg transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span
                        key={l.qty}
                        className="min-w-[1.75rem] text-center text-xs font-semibold tabular-nums font-mono animate-qty-pulse"
                      >
                        {qtyStep >= 1 && Number.isInteger(qtyStep) ? Math.round(l.qty) : l.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (onLineQtyChange) void onLineQtyChange(l, l.qty + qtyStep);
                          else app.updateQty(l.id || l.sku, qtyStep);
                        }}
                        className="grid h-7 w-7 place-items-center hover:bg-background rounded-lg transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="text-right">
                      {l.originalPrice && l.originalPrice !== l.price ? (
                        <div className="text-[10px] line-through text-muted-foreground tabular-nums font-mono">
                          {fmtBDT(l.originalPrice * l.qty)}
                        </div>
                      ) : l.extras?.isMarkdownActive && l.extras?.originalPrice ? (
                        <div className="text-[10px] line-through text-muted-foreground tabular-nums font-mono">
                          {fmtBDT(Number(l.extras.originalPrice) * l.qty)}
                        </div>
                      ) : lineDiscountAmount(l) > 0 ? (
                        <div className="text-[10px] line-through text-muted-foreground tabular-nums font-mono">
                          {fmtBDT(l.price * l.qty)}
                        </div>
                      ) : null}
                      <div
                        key={l.qty}
                        className="text-sm font-bold text-foreground tabular-nums font-mono animate-qty-pulse"
                      >
                        {fmtBDT(lineAmount(l))}
                      </div>
                    </div>
                  </div>

                  {/* Line Discount & Price Override Controls */}
                  <div className="flex items-center justify-between gap-2 border-t border-border/20 pt-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {lineDiscountAmount(l) > 0 && (
                        <Badge variant="outline" className="text-[10px] text-emerald-600 bg-emerald-500/10 border-emerald-500/20 px-1.5 py-0 font-medium">
                          Disc: {l.discountPct ? `${l.discountPct}%` : `\xe0\xa7\xb3${l.discountFixed}`} (−{fmtBDT(lineDiscountAmount(l))})
                        </Badge>
                      )}
                      {l.originalPrice && l.originalPrice !== l.price && (
                        <Badge variant="outline" className="text-[10px] text-amber-600 bg-amber-500/10 border-amber-500/20 px-1.5 py-0 font-medium">
                          Price: ৳{l.price} (was ৳{l.originalPrice})
                        </Badge>
                      )}
                    </div>
                    <LineItemPricingPopover
                      line={l}
                      isAdmin={isAdmin}
                      onUpdate={(patch) => app.updateLine(l.id || l.sku, patch)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Area: Discount inputs, Summary and Checkout action */}
        <div className="shrink-0 border-t border-border/50 bg-secondary/15 px-4 py-4 lg:px-5">
          <div className="mb-3">
            {appliedPromoCode ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-success">
                  <Tag className="h-3.5 w-3.5" /> {appliedPromoCode.name}
                </div>
                <button
                  type="button"
                  onClick={removePromoCode}
                  className="text-success/70 hover:text-success transition-colors cursor-pointer"
                  title="Remove promo code"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Tag className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                  <Input
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyPromoCode();
                    }}
                    placeholder="Promo code"
                    className="h-9 rounded-xl bg-background border-border/60 pl-8 text-xs uppercase"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 rounded-xl border-border/60"
                  onClick={applyPromoCode}
                  disabled={!promoInput.trim() || validatePromo.isPending || app.cart.length === 0}
                >
                  Apply
                </Button>
              </div>
            )}
          </div>

          <div className="mb-3 flex items-center gap-2">
            <div className="flex shrink-0 overflow-hidden rounded-xl border border-border/60 bg-background">
              <button
                type="button"
                onClick={() => app.setDiscountMode("percent")}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  app.discountMode === "percent"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary/40"
                }`}
              >
                %
              </button>
              <button
                type="button"
                onClick={() => app.setDiscountMode("fixed")}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  app.discountMode === "fixed"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary/40"
                }`}
              >
                ৳
              </button>
            </div>

            <div className="relative flex-1">
              <Input
                type="text"
                inputMode="numeric"
                value={
                  app.discountMode === "percent"
                    ? app.discountPct ? String(app.discountPct) : ""
                    : app.discountFixed ? String(app.discountFixed) : ""
                }
                onChange={(e) => requestDiscountValue(Math.round(Number(e.target.value.replace(/[^0-9]/g, "")) || 0))}
                placeholder={app.discountMode === "percent" ? "Discount %" : "Discount ৳"}
                className={`h-9 text-xs rounded-xl bg-background border-border/60 focus:bg-background transition-colors ${
                  !canManagerDiscount && !managerApproved ? "pr-8" : ""
                }`}
              />
              {!canManagerDiscount && (
                <button
                  type="button"
                  onClick={() => {
                    const policy = loadCustomerDiscountPolicy();
                    const maxWithoutPin = policy.allowCashierOverride ? policy.maxDiscountWithoutPin : 0;
                    setPendingDiscount(
                      app.discountMode === "percent"
                        ? app.discountPct || Math.max(10, maxWithoutPin)
                        : app.discountFixed || Math.round(totals.subtotal * (maxWithoutPin / 100)),
                    );
                    setManagerAuthOpen(true);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer"
                  title={
                    managerApproved
                      ? "Manager authorized"
                      : discountPolicy.allowCashierOverride
                        ? `Cashier limit: ${discountPolicy.maxDiscountWithoutPin}%. Click to authorize higher discount.`
                        : "Manager authorization required"
                  }
                >
                  <Lock className={`h-3.5 w-3.5 ${managerApproved ? "text-success" : ""}`} />
                </button>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0 rounded-xl border-border/60 hover:bg-secondary/40"
              onClick={() => {
                app.clearCart();
                setManagerApproved(false);
                toast("Cart cleared");
              }}
              disabled={app.cart.length === 0}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground/80" />
            </Button>
          </div>

          {activeCustomerDiscount && activeCustomerDiscount.discountPct > 0 && (
            <div className="mb-2 flex items-center justify-between py-1 px-2.5 rounded-lg bg-primary/10 border border-primary/20 text-[11px]">
              <div className="flex items-center gap-1.5 text-primary font-semibold">
                <Sparkles className="h-3 w-3 shrink-0" />
                <span>{activeCustomerDiscount.label}</span>
              </div>
              {app.discountPct !== activeCustomerDiscount.discountPct && (
                <button
                  type="button"
                  onClick={() => {
                    app.setDiscountMode("percent");
                    app.setDiscountPct(activeCustomerDiscount.discountPct);
                    toast.success(`Applied ${activeCustomerDiscount.label}`);
                  }}
                  className="text-[10px] font-bold text-primary hover:underline cursor-pointer"
                >
                  Apply {activeCustomerDiscount.discountPct}%
                </button>
              )}
            </div>
          )}

          <div className="space-y-1.5 text-xs px-1">
            <div className="flex justify-between text-muted-foreground font-medium">
              <span>Subtotal</span>
              <span className="tabular-nums font-mono">{fmtBDT(totals.subtotal)}</span>
            </div>

            <div className="flex justify-between text-muted-foreground font-medium">
              <span>
                Discount
                {app.discountMode === "percent" && app.discountPct > 0
                  ? ` (${app.discountPct}%)`
                  : ""}
                {app.discountMode === "fixed" && app.discountFixed > 0 ? " (fixed)" : ""}
              </span>
              <span className="tabular-nums font-mono text-emerald-600 dark:text-emerald-400">
                − {fmtBDT(totals.discount)}
              </span>
            </div>

            {totals.campaignDisc > 0 && (
              <div className="flex justify-between text-[11px] text-muted-foreground font-medium">
                <span>{app.appliedCampaign?.name}</span>
                <span className="tabular-nums font-mono text-emerald-600 dark:text-emerald-400">
                  − {fmtBDT(totals.campaignDisc)}
                </span>
              </div>
            )}

            {taxRate > 0 && (
              <div className="flex justify-between text-muted-foreground font-medium">
                {/* A vertical whose rate bundles more than VAT must say so — the
                    restaurant's compounded 15.5% would otherwise read "VAT (16%)"
                    when VAT is 5% and the rest is a service charge. */}
                <span>{taxLabel ?? `VAT (${Math.round(taxRate * 100)}%)`}</span>
                <span className="tabular-nums font-mono">{fmtBDT(totals.tax)}</span>
              </div>
            )}

            <div className="mt-2.5 flex items-baseline justify-between border-t border-border/40 pt-2.5">
              <div className="flex items-center gap-1.5">
                <span className="font-display text-sm font-bold text-foreground/80">Total</span>
                {isAdmin && (
                  <AdminTotalOverridePopover
                    totals={totals}
                    taxRate={taxRate}
                    onSetTotal={(targetTotal) => {
                      const grossSubtotal = totals.subtotal;
                      const lineDiscounts = totals.lineDiscounts ?? 0;
                      const grossTaxable = Math.max(0, grossSubtotal - lineDiscounts);
                      let neededDiscount = 0;
                      if (taxRate > 0) {
                        const targetTaxable = targetTotal / (1 + taxRate);
                        neededDiscount = Math.max(0, Math.round(grossTaxable - targetTaxable));
                      } else {
                        neededDiscount = Math.max(0, Math.round(grossTaxable - targetTotal));
                      }
                      app.setDiscountMode("fixed");
                      app.setDiscountFixed(neededDiscount);
                      toast.success(`Total adjusted to ${fmtBDT(targetTotal)}`);
                    }}
                    onReset={() => {
                      app.setDiscountFixed(0);
                      app.setDiscountPct(0);
                      toast.info("Total override cleared");
                    }}
                    isOverridden={app.discountMode === "fixed" && app.discountFixed > 0}
                  />
                )}
              </div>
              <span
                className={cn(
                  "font-display font-bold tabular-nums font-mono text-foreground",
                  totals.creditApplied > 0 ? "text-lg" : "text-2xl",
                )}
              >
                {fmtBDT(totals.total)}
              </span>
            </div>

            {totals.creditApplied > 0 && (
              <>
                <div className="flex justify-between font-medium text-amber-600 dark:text-amber-400">
                  <span>{creditLabel}</span>
                  <span className="tabular-nums font-mono">− {fmtBDT(totals.creditApplied)}</span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between border-t border-border/40 pt-2">
                  <span className="font-display text-sm font-bold text-foreground/80">
                    Amount due
                  </span>
                  <span className="font-display text-2xl font-bold tabular-nums font-mono text-foreground">
                    {fmtBDT(totals.amountDue)}
                  </span>
                </div>
                {totals.creditUnused > 0 && (
                  <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                    {fmtBDT(totals.creditUnused)} of the credit is unused — settle it separately, it
                    is not paid out as change.
                  </p>
                )}
              </>
            )}
          </div>

          <Button
            size="lg"
            className={cn(
              "mt-3.5 h-11 w-full text-sm font-semibold rounded-xl shadow-md active:scale-98 transition-all cursor-pointer",
              isCheckoutLocked
                ? "bg-destructive hover:bg-destructive/90 text-white"
                : "bg-gradient-to-r from-primary to-primary/95"
            )}
            onClick={handlePayStart}
            disabled={app.cart.length === 0}
          >
            {isCheckoutLocked ? "Locked (Subscription Expired)" : `Charge ${fmtBDT(totals.amountDue)}`}
          </Button>
        </div>
      </aside>

      <CustomerPicker
        open={customerSelect}
        onOpenChange={(open) => {
          setCustomerSelect(open);
          if (!open && pendingPayAfterCustomer) {
            setPendingPayAfterCustomer(false);
            setPayOpen(true);
          }
        }}
        value={selectedCustomer}
        onSelect={syncCustomer}
      />

      <Dialog open={heldListOpen} onOpenChange={setHeldListOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Held sales</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {shouldUseBackend() ? (
              (heldSalesQuery.data ?? []).length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No held sales on server
                </div>
              ) : (
                (heldSalesQuery.data ?? []).map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between rounded-lg border border-border p-3"
                  >
                    <div>
                      <div className="font-mono text-xs font-medium">{sale.invoice_number}</div>
                      <div className="text-xs text-muted-foreground">
                        {sale.customer_name ?? "Walk-in"} · {fmtBDT(sale.total)}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1"
                        onClick={() => resumeBackendHeld(sale)}
                      >
                        <Play className="h-3 w-3" /> Resume
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-destructive"
                        disabled={cancelHeldSale.isPending}
                        onClick={() =>
                          cancelHeldSale.mutate(sale.id, {
                            onSuccess: () => heldSalesQuery.refetch(),
                          })
                        }
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ))
              )
            ) : app.held.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No locally held sales
              </div>
            ) : (
              app.held.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div>
                    <div className="font-mono text-xs font-medium">{h.id}</div>
                    <div className="text-xs text-muted-foreground">
                      {h.customer ?? "Walk-in"} · {h.lines.length} items
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1"
                    onClick={() => {
                      app.resumeSale(h.id);
                      setHeldListOpen(false);
                    }}
                  >
                    <Play className="h-3 w-3" /> Resume
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={payOpen}
        onOpenChange={async (open) => {
          if (!open) await closePayment(false);
          else setPayOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[92dvh] flex flex-col p-0 overflow-y-auto rounded-2xl border-border/60 shadow-2xl">
          {/* Premium Header */}
          <div className="relative bg-gradient-to-br from-primary/90 to-primary pl-6 pr-14 pt-5 pb-4">
            <div className="flex items-center justify-between text-primary-foreground">
              <div>
                <div className="text-primary-foreground/70 text-xs font-medium uppercase tracking-widest mb-1">
                  Take Payment
                </div>
                <div className="font-display text-3xl font-bold tabular">
                  {fmtBDT(totals.amountDue)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPayOpen(false);
                  setTimeout(() => setCustomerSelect(true), 50);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 text-xs font-semibold backdrop-blur transition-all cursor-pointer"
                title="Change attached customer"
              >
                <User className="h-3.5 w-3.5" />
                <span>{selectedCustomer?.name || app.customer || "Walk-in Guest"}</span>
                {selectedCustomer?.customer_type && (
                  <CustomerTypeBadge type={selectedCustomer.customer_type} className="border-white/30 text-white bg-white/20" />
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-0 divide-x divide-border/50">
            {/* Left — payment method */}
            <div className="md:col-span-8 p-5 space-y-4">
              <Tabs
                value={tender}
                onValueChange={(v: string) => {
                  const nextTender = v as typeof tender;
                  setTender(nextTender);
                  if (nextTender === "Cash" || nextTender === "Card" || nextTender === "Mobile") {
                    setActiveSplitField(nextTender);
                  }
                }}
              >
                <TabsList
                  className={cn(
                    "grid w-full h-10 rounded-xl bg-secondary/60 gap-1 p-1",
                    (() => {
                      let count = 3;
                      if (splitEnabled) count++;
                      if (allowDueSales) count++;
                      if (allowInstallmentSales) count++;
                      if (count === 6) return "grid-cols-6";
                      if (count === 5) return "grid-cols-5";
                      if (count === 4) return "grid-cols-4";
                      return "grid-cols-3";
                    })()
                  )}
                >
                  <TabsTrigger
                    value="Cash"
                    className="rounded-lg text-xs gap-1 data-[state=active]:shadow-sm px-1.5"
                  >
                    <Banknote className="h-3.5 w-3.5" /> Cash
                  </TabsTrigger>
                  <TabsTrigger
                    value="Card"
                    className="rounded-lg text-xs gap-1 data-[state=active]:shadow-sm px-1.5"
                  >
                    <CreditCard className="h-3.5 w-3.5" /> Card
                  </TabsTrigger>
                  <TabsTrigger
                    value="Mobile"
                    className="rounded-lg text-xs gap-1 data-[state=active]:shadow-sm px-1.5"
                  >
                    <Smartphone className="h-3.5 w-3.5" /> Mobile
                  </TabsTrigger>
                  {splitEnabled && (
                    <TabsTrigger
                      value="Split"
                      className="rounded-lg text-xs data-[state=active]:shadow-sm px-1.5"
                    >
                      Split
                    </TabsTrigger>
                  )}
                  {allowDueSales && (
                    <TabsTrigger
                      value="Due"
                      className="rounded-lg text-xs gap-1 data-[state=active]:shadow-sm px-1.5 text-amber-600 dark:text-amber-400 font-semibold"
                    >
                      <Clock className="h-3.5 w-3.5" /> Due
                    </TabsTrigger>
                  )}
                  {allowInstallmentSales && (
                    <TabsTrigger
                      value="Installment"
                      className="rounded-lg text-xs gap-1 data-[state=active]:shadow-sm px-1.5 text-indigo-600 dark:text-indigo-400 font-semibold"
                    >
                      <Calendar className="h-3.5 w-3.5" /> EMI
                    </TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="Cash" className="space-y-3.5 pt-3">
                  {/* Amount input */}
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-bold text-muted-foreground">
                      ৳
                    </span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={cashAmt}
                      onChange={(e) => setCashAmt(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder={String(totals.amountDue)}
                      className="h-14 pl-8 text-2xl font-mono font-semibold rounded-xl border-border/60 bg-secondary/30 focus:bg-background transition-colors"
                    />
                  </div>

                  {/* Smart Suggested Banknotes */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
                      Suggested Banknotes
                    </span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {suggestedNotes.map((noteAmt) => {
                        const isSelected = Number(cashAmt) === noteAmt;
                        const isExact = noteAmt === totals.amountDue;
                        return (
                          <button
                            key={noteAmt}
                            type="button"
                            onClick={() => setCashAmt(String(noteAmt))}
                            className={cn(
                              "h-9 rounded-xl border font-bold text-xs shadow-xs transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1",
                              isSelected
                                ? "bg-primary text-primary-foreground border-primary shadow-sm ring-2 ring-primary/20"
                                : "bg-background hover:bg-secondary border-border/70 text-foreground",
                            )}
                          >
                            {isExact ? `Exact ৳${noteAmt}` : `৳${noteAmt}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Quick Add denomination chips */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
                      Add Amount
                    </span>
                    <div className="grid grid-cols-6 gap-1.5">
                      {[
                        { value: 10, label: "+10" },
                        { value: 20, label: "+20" },
                        { value: 50, label: "+50" },
                        { value: 100, label: "+100" },
                        { value: 500, label: "+500" },
                        { value: 1000, label: "+1k" },
                      ].map((note) => (
                        <button
                          key={note.value}
                          type="button"
                          onClick={() => {
                            const current = Math.round(Number(cashAmt) || 0);
                            setCashAmt(String(current + note.value));
                          }}
                          className="h-8 rounded-xl border border-border/60 bg-secondary/40 hover:bg-secondary text-foreground font-semibold text-[11px] transition-all active:scale-95 cursor-pointer"
                        >
                          {note.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Actions row */}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCashAmt("")}
                      className="flex-1 h-8 text-xs rounded-xl border-border/60"
                    >
                      Clear
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setCashAmt(String(totals.amountDue))}
                      className="flex-1 h-8 text-xs font-semibold rounded-xl"
                    >
                      Exact Amount
                    </Button>
                  </div>

                  {/* Change display */}
                  <div
                    className={cn(
                      "flex items-center justify-between rounded-xl px-4 py-3 transition-all",
                      change > 0
                        ? "bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800"
                        : "bg-secondary/40 border border-border/50",
                    )}
                  >
                    <span
                      className={cn(
                        "text-sm font-medium",
                        change > 0
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-muted-foreground",
                      )}
                    >
                      Change due
                    </span>
                    <span
                      className={cn(
                        "text-lg font-bold tabular font-mono",
                        change > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-foreground",
                      )}
                    >
                      {fmtBDT(change)}
                    </span>
                  </div>
                </TabsContent>

                <TabsContent value="Card" className="pt-3 space-y-4">
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-bold text-muted-foreground">
                      ৳
                    </span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={cardAmt}
                      onChange={(e) => setAmtField(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder={String(totals.amountDue)}
                      className="h-14 pl-8 text-2xl font-mono font-semibold rounded-xl border-border/60 bg-secondary/30"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setAmtField(String(totals.amountDue))}
                    className="w-full h-9 text-xs rounded-xl"
                  >
                    Tender Exact Amount
                  </Button>
                </TabsContent>

                <TabsContent value="Mobile" className="pt-3 space-y-4">
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-bold text-muted-foreground">
                      ৳
                    </span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={mobAmt}
                      onChange={(e) => setAmtField(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder={String(totals.amountDue)}
                      className="h-14 pl-8 text-2xl font-mono font-semibold rounded-xl border-border/60 bg-secondary/30"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setAmtField(String(totals.amountDue))}
                    className="w-full h-9 text-xs rounded-xl"
                  >
                    Tender Exact Amount
                  </Button>
                </TabsContent>

                {splitEnabled && (
                  <TabsContent value="Split" className="space-y-3 pt-3">
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        {
                          label: "Cash",
                          value: cashAmt,
                          field: "Cash" as const,
                          onChange: (v: string) => setCashAmt(v.replace(/[^0-9]/g, "")),
                        },
                        {
                          label: "Card",
                          value: cardAmt,
                          field: "Card" as const,
                          onChange: (v: string) => setCardAmt(v.replace(/[^0-9]/g, "")),
                        },
                        {
                          label: "Mobile",
                          value: mobAmt,
                          field: "Mobile" as const,
                          onChange: (v: string) => setMobAmt(v.replace(/[^0-9]/g, "")),
                        },
                      ].map((f) => (
                        <div key={f.label} className="space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                            {f.label}
                          </label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={f.value}
                            onChange={(e) => f.onChange(e.target.value)}
                            onFocus={() => setActiveSplitField(f.field)}
                            className={cn(
                              "h-10 text-sm font-mono rounded-xl transition-all",
                              activeSplitField === f.field && "ring-2 ring-primary border-primary",
                            )}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setCashAmt("");
                          setCardAmt("");
                          setMobAmt("");
                        }}
                        className="flex-1 h-8 text-[11px] rounded-xl"
                      >
                        Clear All
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          if (tender === "Split") {
                            const rem = Math.max(
                              0,
                              totals.amountDue - (Number(cardAmt) || 0) - (Number(mobAmt) || 0),
                            );
                            setCashAmt(String(rem));
                          }
                        }}
                        className="flex-1 h-8 text-[11px] rounded-xl"
                      >
                        Fill Cash Due
                      </Button>
                    </div>
                    <div
                      className={cn(
                        "flex justify-between rounded-xl p-3 text-xs font-semibold border transition-all",
                        due === 0 && change === 0
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800 animate-qty-pulse"
                          : change > 0
                            ? "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800"
                            : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800",
                      )}
                    >
                      <span>Allocation Status</span>
                      <span>
                        {due === 0 && change === 0
                          ? "✓ Perfect Balance!"
                          : change > 0
                            ? `Overallocated by ${fmtBDT(change)}`
                            : `Remaining: ${fmtBDT(due)}`}
                      </span>
                    </div>
                  </TabsContent>
                )}

                {allowDueSales && (
                  <TabsContent value="Due" className="space-y-3.5 pt-3">
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/20 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          <span className="text-xs font-semibold text-amber-900 dark:text-amber-300">
                            Due / Credit Sale (বকেয়া বিক্রয়)
                          </span>
                        </div>
                        {selectedCustomer?.name ? (
                          <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:text-amber-400 bg-amber-100/50">
                            {selectedCustomer.name}
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            Customer Required
                          </Badge>
                        )}
                      </div>

                      {!selectedCustomer?.name ? (
                        <div className="space-y-2 pt-1">
                          <p className="text-xs text-amber-800 dark:text-amber-300/90">
                            To record a due balance, attach a customer to track in their ledger.
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setPendingPayAfterCustomer(true);
                              setPayOpen(false);
                              setTimeout(() => setCustomerSelect(true), 50);
                            }}
                            className="w-full h-8 text-xs border-amber-300 bg-white dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 font-semibold cursor-pointer"
                          >
                            <User className="h-3.5 w-3.5 mr-1.5" /> Attach / Search Customer
                          </Button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 text-xs text-amber-900 dark:text-amber-200 pt-1 border-t border-amber-200/60 dark:border-amber-900/40">
                          <div>
                            <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Current Due</span>
                            <span className="font-mono font-bold">{fmtBDT(selectedCustomer.outstanding ?? 0)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Customer Phone</span>
                            <span className="font-mono">{selectedCustomer.phone || "—"}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Advance / Cash Paid Now (ঐচ্ছিক জমা)</Label>
                        <div className="flex gap-1">
                          {(["Cash", "Card", "Mobile"] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setDueMethod(m)}
                              className={cn(
                                "px-2 py-0.5 text-[10px] font-semibold rounded-md border transition-all cursor-pointer",
                                dueMethod === m ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/40 text-muted-foreground border-border/50"
                              )}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-bold text-muted-foreground">
                          ৳
                        </span>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={duePaidAmt}
                          onChange={(e) => setDuePaidAmt(e.target.value.replace(/[^0-9]/g, ""))}
                          placeholder="0"
                          className="h-12 pl-8 text-xl font-mono font-semibold rounded-xl border-border/60 bg-secondary/30"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-secondary/30 p-3 text-xs space-y-1.5 font-medium">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Invoice Total</span>
                        <span className="font-mono tabular font-bold text-foreground">{fmtBDT(totals.amountDue)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Paid Now ({dueMethod})</span>
                        <span className="font-mono tabular text-emerald-600 dark:text-emerald-400">− {fmtBDT(Number(duePaidAmt) || 0)}</span>
                      </div>
                      <div className="border-t border-border/40 pt-1.5 flex justify-between text-sm font-bold text-amber-600 dark:text-amber-400">
                        <span>New Due to Add (বকেয়া)</span>
                        <span className="font-mono tabular">{fmtBDT(Math.max(0, totals.amountDue - (Number(duePaidAmt) || 0)))}</span>
                      </div>
                    </div>
                  </TabsContent>
                )}

                {allowInstallmentSales && (
                  <TabsContent value="Installment" className="space-y-3 pt-3">
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 dark:border-indigo-900/50 dark:bg-indigo-950/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                          <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-300">
                            Installment / EMI Agreement (কিস্তি বিক্রয়)
                          </span>
                        </div>
                        {selectedCustomer?.name ? (
                          <Badge variant="outline" className="text-[10px] border-indigo-300 text-indigo-700 dark:text-indigo-400 bg-indigo-100/50">
                            {selectedCustomer.name}
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            Customer Required
                          </Badge>
                        )}
                      </div>

                      {!selectedCustomer?.name && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPayOpen(false);
                            setTimeout(() => setCustomerSelect(true), 50);
                          }}
                          className="w-full h-8 text-xs border-indigo-300 bg-white dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 font-semibold cursor-pointer"
                        >
                          <User className="h-3.5 w-3.5 mr-1.5" /> Attach Customer for Installment Plan
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Down Payment (ডাউন পেমেন্ট)</Label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                            ৳
                          </span>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={emiDownPayment}
                            onChange={(e) => setEmiDownPayment(e.target.value.replace(/[^0-9]/g, ""))}
                            placeholder="0"
                            className="h-9 pl-6 text-xs font-mono font-semibold rounded-xl"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Tenure (মেয়াদ)</Label>
                        <Select value={emiTenure} onValueChange={setEmiTenure}>
                          <SelectTrigger className="h-9 text-xs rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="3">3 Months (3 Installments)</SelectItem>
                            <SelectItem value="6">6 Months (6 Installments)</SelectItem>
                            <SelectItem value="12">12 Months (12 Installments)</SelectItem>
                            <SelectItem value="18">18 Months (18 Installments)</SelectItem>
                            <SelectItem value="24">24 Months (24 Installments)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Down Payment Method</Label>
                        <Select value={emiMethod} onValueChange={(v) => setEmiMethod(v as any)}>
                          <SelectTrigger className="h-9 text-xs rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Cash">Cash</SelectItem>
                            <SelectItem value="Card">Card</SelectItem>
                            <SelectItem value="Mobile">Mobile Banking</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Financing Scheme</Label>
                        <Input
                          value={emiBank}
                          onChange={(e) => setEmiBank(e.target.value)}
                          placeholder="Direct Store Financing"
                          className="h-9 text-xs rounded-xl"
                        />
                      </div>
                    </div>

                    {/* EMI Calculation Summary Card */}
                    {(() => {
                      const down = Math.min(Number(emiDownPayment) || 0, totals.amountDue);
                      const financed = Math.max(0, totals.amountDue - down);
                      const months = Number(emiTenure) || 6;
                      const monthly = Math.round(financed / months);
                      const firstDueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      });

                      return (
                        <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/40 dark:bg-indigo-950/20 p-2.5 text-xs space-y-1">
                          <div className="flex justify-between text-muted-foreground">
                            <span>Financed Balance</span>
                            <span className="font-mono tabular font-semibold text-foreground">{fmtBDT(financed)}</span>
                          </div>
                          <div className="flex justify-between text-indigo-700 dark:text-indigo-300 font-semibold">
                            <span>Monthly Installment ({months}x)</span>
                            <span className="font-mono tabular text-sm font-bold">{fmtBDT(monthly)} / mo</span>
                          </div>
                          <div className="flex justify-between text-[11px] text-muted-foreground border-t border-indigo-200/40 dark:border-indigo-900/40 pt-1">
                            <span>First Due Date</span>
                            <span className="font-medium text-foreground">{firstDueDate}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </TabsContent>
                )}
              </Tabs>
            </div>

            {/* Right — numpad */}
            <div className="md:col-span-4 p-4 flex flex-col gap-3 bg-secondary/20">
              <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
                Keypad
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleKeypadPress(key)}
                    className={cn(
                      "h-11 rounded-xl font-semibold text-base transition-all active:scale-90 shadow-sm border flex items-center justify-center cursor-pointer select-none",
                      key === "⌫"
                        ? "bg-red-50 hover:bg-red-100 text-red-500 border-red-100 dark:bg-red-950/30 dark:border-red-900 dark:text-red-400"
                        : "bg-background hover:bg-secondary border-border/50 text-foreground",
                    )}
                  >
                    {key === "⌫" ? <span className="text-base">⌫</span> : key}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleKeypadPress("C")}
                className="w-full h-8 rounded-xl border border-border/50 bg-background hover:bg-secondary text-xs text-muted-foreground font-medium transition-all active:scale-95"
              >
                Clear Field
              </button>
              <button
                type="button"
                onClick={completeSale}
                disabled={isCompleting || holding}
                className="w-full h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1 shadow-md flex items-center justify-center transition-all active:scale-95 cursor-pointer"
              >
                <Receipt className="h-3.5 w-3.5" />
                {isCompleting ? "Processing…" : `Complete Sale (${fmtBDT(totals.amountDue)})`}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Sticky Bottom Action Bar — Always visible at bottom of payment dialog */}
          <div className="sticky bottom-0 z-20 shrink-0 flex items-center justify-between gap-3 border-t border-border/80 px-5 py-3.5 bg-background/95 backdrop-blur shadow-lg">
            <Button
              variant="outline"
              onClick={() => closePayment(false)}
              disabled={holding}
              className="rounded-xl px-5 text-muted-foreground border-border/60"
            >
              Cancel
            </Button>
            <Button
              size="lg"
              onClick={completeSale}
              disabled={isCompleting || holding}
              className="gap-2 rounded-xl px-7 h-11 font-bold text-sm shadow-md bg-emerald-600 hover:bg-emerald-700 text-white transition-all active:scale-95 cursor-pointer"
            >
              <Receipt className="h-4.5 w-4.5" />
              {isCompleting
                ? "Processing…"
                : holding
                  ? "Reserving…"
                  : `Complete Sale (${fmtBDT(totals.amountDue)})`}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!receiptOpen} onOpenChange={(v) => !v && setReceiptOpen(null)}>
        <DialogContent className="sm:max-w-sm flex flex-col max-h-[90vh] p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
            <DialogTitle>Receipt · {receiptOpen?.id}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0 px-1 py-2">
            {receiptOpen && (
              <ThermalReceipt
                brand={activeReceiptBrand}
                idAttr="pulse-receipt-print"
                data={buildReceiptData(receiptOpen)}
              />
            )}
          </div>
          <DialogFooter className="px-5 py-3 border-t shrink-0 bg-background">
            <Button variant="outline" onClick={() => setReceiptOpen(null)}>
              Close
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                buildReceiptPdf(activeReceiptBrand, buildReceiptData(receiptOpen!)).save(
                  `${receiptOpen!.id}.pdf`,
                );
                toast.success("PDF downloaded");
              }}
              className="gap-1.5"
            >
              <Download className="h-4 w-4" /> PDF
            </Button>
            <Button
              onClick={() => {
                tryPrint(activeReceiptBrand, "pulse-receipt-print", receiptOpen!.id);
                toast.success("Print sent");
              }}
              className="gap-1.5"
            >
              <Printer className="h-4 w-4" /> Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={managerAuthOpen} onOpenChange={setManagerAuthOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning">
              <Lock className="h-5 w-5" /> Manager Approval Required
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground leading-normal">
              Enter manager passcode or supervisor PIN to authorize a discount of{" "}
              <strong className="text-foreground">
                {app.discountMode === "percent"
                  ? `${pendingDiscount}%`
                  : fmtBDT(pendingDiscount ?? 0)}
              </strong>
              {loadCustomerDiscountPolicy().allowCashierOverride ? (
                <> (exceeds cashier limit of {loadCustomerDiscountPolicy().maxDiscountWithoutPin}%)</>
              ) : (
                <> (cashier manual discounts disabled)</>
              )}
              .
            </p>
            <Input
              type="password"
              placeholder="Enter PIN / Passcode"
              value={managerPasscode}
              onChange={(e) => setManagerPasscode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (["manager123", "admin123", "1234", "0000"].includes(managerPasscode.trim())) {
                    setManagerApproved(true);
                    authorizePendingDiscount();
                    setManagerPasscode("");
                    setManagerAuthOpen(false);
                    toast.success("Manager discount authorized!");
                  } else {
                    toast.error("Invalid passcode");
                  }
                }
              }}
              className="h-10 text-center font-mono text-lg tracking-widest animate-qty-pulse"
              autoFocus
            />
            <div className="text-[10px] text-muted-foreground text-center">
              Hint: Enter <code className="bg-secondary px-1 rounded font-mono">manager123</code> or{" "}
              <code className="bg-secondary px-1 rounded font-mono">admin123</code>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setManagerPasscode("");
                setManagerAuthOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (["manager123", "admin123", "1234", "0000"].includes(managerPasscode.trim())) {
                  setManagerApproved(true);
                  authorizePendingDiscount();
                  setManagerPasscode("");
                  setManagerAuthOpen(false);
                  toast.success("Manager discount authorized!");
                } else {
                  toast.error("Invalid passcode");
                }
              }}
            >
              Authorize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CameraBarcodeScannerDialog
        open={cameraScannerOpen}
        onOpenChange={setCameraScannerOpen}
        title={`${title || "POS"} Camera Scanner`}
        subtitle="Point camera at product barcode or packaging"
        continuous={true}
        onScan={handleCameraScan}
      />
    </div>
  );
}

export function ProductGrid({
  items = [],
  onAdd,
  renderCard,
  className,
  disabled = false,
  pendingKey,
  children,
  loading = false,
}: {
  items?: unknown[];
  onAdd?: (item: unknown) => void;
  renderCard?: (item: unknown) => ReactNode;
  className?: string;
  /** Blocks taps while an add-to-order mutation is still in flight. */
  disabled?: boolean;
  /** sku/id of the single item being added, so only that card shows progress. */
  pendingKey?: string | null;
  children?: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth">
      <div
        className={cn(
          "grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 lg:p-3",
          className,
        )}
      >
        {children ? (
          children
        ) : (
          (items ?? []).map((item, i) => {
            // Keying by index made React reuse a card's DOM across different
            // products when the search or category filter changed, so lazy-loaded
            // images flashed the wrong dish before settling.
            const record = item as { sku?: unknown; id?: unknown };
            const key = String(record?.sku ?? record?.id ?? i);
            // Only the tapped card shows progress. Dimming every card via
            // `disabled:opacity-60` made the whole catalogue flash on each tap —
            // 75 tiles fading out and back looks like the screen is glitching.
            const isPending = pendingKey != null && pendingKey === key;
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                aria-busy={isPending}
                onClick={() => onAdd?.(item)}
                className={cn(
                  "min-w-0 text-left transition-all duration-150 active:scale-95 cursor-pointer disabled:pointer-events-none",
                  isPending && "opacity-60",
                )}
              >
                {renderCard?.(item)}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export const PosProductCard = memo(function PosProductCard({
  badge,
  title,
  subtitle,
  price,
  originalPrice,
  isMarkdown,
  imageUrl,
  count,
  footer,
  industry,
  sku,
}: {
  badge?: string;
  title: string;
  subtitle?: string;
  price: string;
  originalPrice?: string;
  isMarkdown?: boolean;
  imageUrl?: string;
  count?: number;
  footer?: ReactNode;
  industry?: string;
  sku?: string;
}) {
  const isSelected = count != null && count > 0;
  const fallbackImg = getProductFallbackImage(title, badge, sku, industry);
  const resolvedUrl = imageUrl ? resolveImageUrl(imageUrl) : "";
  const displayUrl = resolvedUrl || fallbackImg;

  return (
    <Card
      className={cn(
        "group flex h-full flex-col p-1.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md relative overflow-hidden bg-card border-border/80 rounded-xl",
        isSelected && "ring-2 ring-primary/50 border-primary/70 bg-primary/5",
        isMarkdown && "border-amber-500/40 dark:border-amber-500/30",
      )}
    >
      <div className="relative mb-1 flex h-24 sm:h-28 w-full items-center justify-center rounded-lg overflow-hidden bg-white dark:bg-muted/30 border border-border/40 p-1">
        <img
          src={displayUrl}
          alt={title}
          className="h-full w-full object-contain rounded-md group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
          onError={(e) => {
            if (fallbackImg && e.currentTarget.src !== fallbackImg) {
              e.currentTarget.src = fallbackImg;
            }
          }}
        />
        {badge && (
          <Badge
            variant="outline"
            className={cn(
              "absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 shadow-2xs",
              isMarkdown
                ? "bg-amber-500 text-white border-amber-600 font-extrabold shadow-sm"
                : "bg-background/90 backdrop-blur-md border-border/60"
            )}
          >
            {badge}
          </Badge>
        )}
        {count != null && count > 0 && (
          <div className="absolute top-1.5 left-1.5 bg-emerald-600 text-white font-extrabold text-[11px] px-2 py-0.5 rounded-full shadow-lg border border-white/20 animate-in zoom-in-75">
            {count}×
          </div>
        )}
        <div className="absolute bottom-1.5 right-1.5 bg-background/95 backdrop-blur-md text-foreground font-black text-xs px-2 py-0.5 rounded-md shadow-xs border border-border/50 flex items-center gap-1.5">
          {originalPrice && originalPrice !== price && (
            <span className="line-through text-[10px] text-muted-foreground font-normal">
              {originalPrice}
            </span>
          )}
          <span className={cn(isMarkdown && "text-emerald-600 dark:text-emerald-400 font-extrabold")}>
            {price}
          </span>
        </div>
      </div>
      <div className="px-1 py-0.5 flex flex-col flex-1">
        {/* Two lines, not one. Bilingual menu names ("Chicken Jhal Fry / চিকেন ঝাল
            ফ্রাই") were clipped to "Chicken Jhal Fry …", so several dishes on the
            grid were indistinguishable. min-h keeps the cards on an even baseline
            whether the name wraps or not; title= gives the full string on hover. */}
        <div
          title={title}
          className="text-xs font-bold leading-snug text-foreground transition-colors group-hover:text-primary break-words whitespace-normal font-sans tracking-tight py-0.5"
        >
          {title}
        </div>
        {subtitle && (
          <div
            className="mt-0.5 truncate text-[10px] font-medium text-muted-foreground"
            title={subtitle}
          >
            {subtitle}
          </div>
        )}
      </div>
      {footer}
    </Card>
  );
});

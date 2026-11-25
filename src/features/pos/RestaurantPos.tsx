import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ChefHat, UtensilsCrossed, Split, ArrowRightLeft, MessageSquare, Check,
  Settings, ChevronDown, Zap, Layers, Search, X, Users, User, Crown, Armchair, Clock, Receipt, Sparkles, Filter
} from "lucide-react";
import { toast } from "sonner";
import { useApp, cartTotals } from "@/lib/app-store";
import { restaurantMenu, restaurantTables as demoTables } from "@/lib/industry-mock";
import { fmtBDT } from "@/lib/pos-data";
import { cn, resolveImageUrl } from "@/lib/utils";
import { formatApiError } from "@/lib/api";
import { VAT_RATE, computeRestaurantBill, effectiveCartTaxRate, round2 } from "./restaurant-billing";
import { shouldUseBackend } from "@/lib/demo-mode";
import { PosShell, ProductGrid, PosProductCard, ScrollableRow } from "./PosShell";
import { usePosCatalog, catalogToCartExtras, type PosCatalogItem } from "@/hooks/use-pos-catalog";
import type { CartLine } from "@/lib/app-store";
import { useRestaurantKots, useRestaurantOrder, useRestaurantTables } from "@/hooks/use-api-config";
import {
  useAddRestaurantOrderLine,
  useCreateRestaurantKot,
  useCreateRestaurantOrder,
  useCreateRestaurantTable,
  useUpdateRestaurantTable,
  useDeleteRestaurantTable,
  useMoveRestaurantTable,
  usePayRestaurantOrder,
  useUpdateRestaurantOrderLine,
  useVoidRestaurantOrderLine,
  useUpdateRestaurantKot,
} from "@/hooks/use-industry-backoffice";
import { ManageTablesDialog } from "./restaurant/ManageTablesDialog";
import { ManageCombosDialog } from "./restaurant/ManageCombosDialog";
import type { ServiceMode, TableFormValues, TableRow, ComboRow, ComboFormValues } from "./restaurant/types";
import { VoidLineDialog, type VoidTarget } from "./restaurant/VoidLineDialog";
import { SplitBillDialog, type SplitPayment } from "./restaurant/SplitBillDialog";
import type { CustomerSelection } from "@/features/sales/CustomerPicker";
import { DeliveryDetailsDialog, type DeliveryDetails } from "./restaurant/DeliveryDetailsDialog";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";

function getTableStatusStyle(status: string, isSelected: boolean) {
  if (isSelected) return "border-primary bg-primary/10 ring-2 ring-primary/30 font-bold";
  switch (status) {
    case "occupied":
      return "border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-400 hover:bg-rose-500/20";
    // "billing" was styled here but is not one of the backend's TABLE_STATUSES,
    // so the branch never ran. "reserved" and "disabled" are real and were not
    // styled at all, leaving them indistinguishable from an available table.
    case "reserved":
      return "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20";
    case "disabled":
      return "border-border bg-muted/40 text-muted-foreground opacity-60";
    case "cleaning":
      return "border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-400 hover:bg-sky-500/20";
    case "available":
    default:
      return "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15";
  }
}

function useLocalState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw);
    } catch {}
    return initial;
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {}
  }, [key, v]);
  return [v, setV];
}

export function RestaurantPos() {
  const app = useApp();
  const navigate = useNavigate();
  const useApi = shouldUseBackend();
  const [tableId, setTableId] = useState("");
  const [waiter, setWaiter] = useState("Waiter");
  const [guestCount, setGuestCount] = useState("2");
  const [tableModeAllowed] = useLocalState<boolean>("pulse.restaurant.table_mode_allowed", true);
  const [tableModeEnabled, setTableModeEnabled] = useLocalState<boolean>("pulse.restaurant.table_mode", true);
  const [serviceMode, setServiceMode] = useLocalState<ServiceMode>(
    "pulse.restaurant.service_mode",
    "dine_in"
  );
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [kotOpen, setKotOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [targetTableId, setTargetTableId] = useState("");
  const [modifierOpen, setModifierOpen] = useState<PosCatalogItem | null>(null);
  const [mods, setMods] = useState<string[]>([]);
  const [lineNote, setLineNote] = useState("");
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null);
  const [pendingSku, setPendingSku] = useState<string | null>(null);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [delivery, setDelivery] = useState<DeliveryDetails>({ address: "", phone: "" });
  const [showTablesMobile, setShowTablesMobile] = useState(false);
  const [manageCombosOpen, setManageCombosOpen] = useState(false);
  const [localCombos, setLocalCombos] = useState<ComboRow[]>([]);
  const [configuredVatIncluded] = useLocalState<boolean>("pulse.vat_included", false);
  const [configuredVatRate] = useLocalState<number>("pulse.vat_rate", 5);
  const [configuredServicePct] = useLocalState<number>("pulse.service_charge_pct", 10);

  const vatRate = configuredVatIncluded ? 0 : (configuredVatRate ?? 5) / 100;
  const servicePct = app.isFeatureEnabled("restaurant.service_charge") ? (configuredServicePct ?? 10) : 0;

  useEffect(() => {
    if (!tableModeAllowed) {
      if (tableModeEnabled) setTableModeEnabled(false);
      if (serviceMode === "dine_in") setServiceMode("takeaway");
    }
  }, [tableModeAllowed, tableModeEnabled, serviceMode]);

  const switchToQuickCounter = (promptUnsaved = false) => {
    if (promptUnsaved && activeOrderId && app.cart.length > 0 && serviceMode === "dine_in") {
      const ok = window.confirm(
        `Table ${tableLabel} has an open order. Switch to Quick Counter mode and clear the screen for a new counter sale?`,
      );
      if (!ok) return;
    }
    setTableModeEnabled(false);
    setServiceMode("takeaway");
    setActiveOrderId(null);
    app.clearCart();
    setTableSelectModalOpen(false);
    toast.info("Switched to Quick Counter mode (Tables OFF)");
  };

  const switchToDineIn = (targetTable?: TableRow) => {
    if (!tableModeAllowed) {
      toast.error("Table mode is disabled in Settings");
      return;
    }
    setTableModeEnabled(true);
    setServiceMode("dine_in");
    setActiveOrderId(null);
    app.clearCart();
    if (targetTable) {
      void selectTable(targetTable);
    } else {
      setTableSelectModalOpen(true);
    }
    toast.info("Switched to Dine-in (Table Management ON)");
  };

  const switchToDelivery = () => {
    if (activeOrderId && app.cart.length > 0 && serviceMode === "dine_in") {
      const ok = window.confirm(
        `Table ${tableLabel} has an open order. Switch to Delivery and clear the screen for a new delivery order?`,
      );
      if (!ok) return;
    }
    setTableModeEnabled(false);
    setServiceMode("delivery");
    setActiveOrderId(null);
    app.clearCart();
    setDeliveryOpen(true);
    toast.info("Switched to Delivery mode");
  };

  const demoItems = useMemo(() => restaurantMenu.map(m => ({
    id: m.sku,
    sku: m.sku,
    name: m.name,
    price: m.price,
    stock: 99,
    meta: { category: m.category, station: m.station, image: m.image, modifiers: m.modifiers ?? [] },
  })), []);

  const catalog = usePosCatalog("restaurant", demoItems);
  const tablesQuery = useRestaurantTables();
  const orderQuery = useRestaurantOrder(useApi ? activeOrderId : null);
  // Without the enabled guard this fell back to an unfiltered request and pulled
  // the company's entire KOT history whenever no order was open.
  const kotsQuery = useRestaurantKots(
    activeOrderId ? { order_id: activeOrderId } : undefined,
    { enabled: Boolean(useApi && (kotOpen || activeOrderId)), refetchInterval: kotOpen ? 3000 : undefined },
  );
  const updateKot = useUpdateRestaurantKot();
  const createOrder = useCreateRestaurantOrder();
  const addLine = useAddRestaurantOrderLine();
  const sendKot = useCreateRestaurantKot();
  const payOrder = usePayRestaurantOrder();
  const moveTable = useMoveRestaurantTable();
  const updateLine = useUpdateRestaurantOrderLine();
  const voidLine = useVoidRestaurantOrderLine();
  const createTable = useCreateRestaurantTable();
  const updateTable = useUpdateRestaurantTable();
  const deleteTable = useDeleteRestaurantTable();

  const [manageTablesOpen, setManageTablesOpen] = useState(false);
  const [tableSelectModalOpen, setTableSelectModalOpen] = useState(false);
  const [tableStatusFilter, setTableStatusFilter] = useState<"all" | "available" | "occupied" | "vip">("all");

  const tables: TableRow[] = useMemo(() => {
    if (useApi && catalog.fromBackend) {
      return (tablesQuery.data ?? []).map(t => ({
        id: String(t.id),
        table_no: String(t.table_no ?? ""),
        table_name: String(t.table_name ?? t.table_no ?? ""),
        label: String(t.table_no ?? t.id),
        status: String(t.status ?? "available"),
        current_order_id: t.current_order_id ? String(t.current_order_id) : null,
        capacity: Number(t.capacity ?? 4),
        guest_count: t.current_guest_count != null ? Number(t.current_guest_count) : null,
        order_total: t.current_order_total != null ? Number(t.current_order_total) : null,
        zone: t.floor_or_zone ? String(t.floor_or_zone) : null,
      }));
    }
    return demoTables.map(t => ({
      id: t.id,
      table_no: t.id,
      table_name: t.id,
      label: t.id,
      status: t.status,
    }));
  }, [useApi, catalog.fromBackend, tablesQuery.data]);

  const tableLabel = tables.find(t => t.id === tableId)?.label ?? tableId;
  const menuItems = catalog.items;
  const order = orderQuery.data;
  const orderNo = order?.order_no != null ? String(order.order_no) : "";
  const orderLines = (order?.lines as Array<Record<string, unknown>> | undefined) ?? [];
  const unsentCount = orderLines.reduce((s, l) => s + Number(l.unsent_qty ?? 0), 0);

  // Instant 0ms bill computation directly from current in-memory cart
  const billPreview = useMemo(() => {
    const cart = cartTotals(app.cart, app.discountPct, 0, 0, app.discountFixed);
    return computeRestaurantBill({
      subtotal: cart.subtotal,
      discount: cart.discount,
      servicePct,
      vatRate,
    });
  }, [app.cart, app.discountPct, app.discountFixed, servicePct, vatRate]);

  useEffect(() => {
    if (tables.length && !tables.some(t => t.id === tableId)) {
      setTableId(tables[0].id);
    }
  }, [tables, tableId]);

  // Mirror backend order lines into cart when an occupied table is loaded
  useEffect(() => {
    if (!useApi || !activeOrderId || !order) return;
    const backendLines = orderLines
      .filter(line => String(line.status) !== "cancelled" && Math.max(0, Number(line.qty ?? 0) - Number(line.cancelled_qty ?? 0)) > 0)
      .map(line => ({
        id: String(line.id),
        sku: String(line.sku || line.product_id || "REST"),
        name: String(line.product_name),
        price: Number(line.unit_price ?? 0) + Number(line.modifier_price ?? 0),
        qty: Math.max(0, Number(line.qty ?? 0) - Number(line.cancelled_qty ?? 0)),
        industry: "restaurant" as const,
        extras: {
          table_id: tableId,
          table: serviceMode === "dine_in" ? tableLabel : "Counter",
          orderType: serviceMode,
          waiter,
          modifiers: Array.isArray(line.modifiers) ? (line.modifiers as string[]).join(", ") : "",
          notes: String(line.notes ?? ""),
          sent: Number(line.sent_to_kitchen_qty ?? 0),
          unsent: Number(line.unsent_qty ?? 0),
          line_status: String(line.status ?? ""),
        },
      }));

    if (backendLines.length > 0) {
      if (app.cart.length === 0) {
        app.setCart(backendLines);
      } else {
        // Optimistically preserve local cart lines while updating persisted line IDs
        app.setCart(
          app.cart.map((localLine: any) => {
            const match = backendLines.find(b => b.sku === localLine.sku && (!localLine.id || localLine.id === b.id));
            if (match && match.id) {
              return { ...localLine, id: match.id, extras: { ...localLine.extras, sent: match.extras?.sent, unsent: match.extras?.unsent } };
            }
            return localLine;
          })
        );
      }
    } else if (orderLines.length > 0 && backendLines.length === 0) {
      setActiveOrderId(null);
      app.clearCart();
      tablesQuery.refetch();
    }
  }, [useApi, activeOrderId, order?.updated_at, orderLines]);

  const ensureOrder = async (): Promise<string | null> => {
    if (!useApi) return null;
    if (activeOrderId) return activeOrderId;
    if (serviceMode === "dine_in" && !tableId) {
      toast.error("Select a table for dine-in");
      return null;
    }
    // The backend rejects a delivery order without both fields. Ask here, before
    // the guest orders, rather than letting the first dish tap return a 400.
    if (serviceMode === "delivery" && (!delivery.address.trim() || !delivery.phone.trim())) {
      setDeliveryOpen(true);
      return null;
    }
    const created = await createOrder.mutateAsync({
      service_mode: serviceMode,
      table_id: serviceMode === "dine_in" ? tableId : undefined,
      guest_count: Number(guestCount) || 1,
      waiter_name: waiter,
      store_id: undefined,
      ...(serviceMode === "delivery"
        ? { delivery_address: delivery.address.trim(), delivery_phone: delivery.phone.trim() }
        : {}),
    });
    const id = String(created.id);
    setActiveOrderId(id);

    // Sync any existing cart items to the new order
    if (app.cart.length > 0) {
      for (const item of app.cart) {
        try {
          await addLine.mutateAsync({
            orderId: id,
            body: {
              product_id: (item.extras?.productId as string) || item.sku,
              sku: item.sku,
              product_name: item.name,
              qty: item.qty,
              unit_price: item.price,
              modifiers: item.extras?.modifiers
                ? String(item.extras.modifiers).split(", ").filter(Boolean)
                : [],
              notes: item.extras?.notes ? String(item.extras.notes) : "",
              kitchen_station: item.meta,
            },
          });
        } catch (err) {
          console.warn("Cart line sync warning:", err);
        }
      }
    }

    toast.success(`Order ${created.order_no} opened`);
    return id;
  };

  const selectTable = async (t: TableRow) => {
    setTableId(t.id);
    if (!useApi) return;
    if (t.current_order_id && t.status === "occupied" && Number(t.order_total ?? 0) > 0) {
      setActiveOrderId(t.current_order_id);
      setServiceMode("dine_in");
      toast.success(`Active order loaded for Table ${t.label}`);
      return;
    }
    // Selecting a table must NOT open an order. Creating one here occupied the
    // table on the tap that merely looked at it, so walking the floor booked
    // every table touched — each holding an empty ৳0 order that nothing can
    // settle (bill_and_pay_order rejects "No billable lines") and that blocks
    // update_table from ever freeing the table again.
    //
    // addMenuItem already calls ensureOrder(), which creates the order with
    // this table_id on the first dish tapped. That is the only moment a table
    // is genuinely occupied.
    setServiceMode("dine_in");
    setActiveOrderId(null);
    app.clearCart();
  };

  const addMenuItem = async (item: PosCatalogItem, selectedMods: string[] = [], note: string = "") => {
    // 1. Instantly update cart and compute price calculations on UI (0ms delay!)
    app.addToCart({
      sku: item.sku,
      name: item.name,
      meta: String(item.meta?.station ?? ""),
      price: item.price,
      qty: 1,
      industry: "restaurant",
      extras: {
        ...catalogToCartExtras(item),
        table: serviceMode === "dine_in" ? tableLabel : "Counter",
        waiter,
        orderType: serviceMode,
        modifiers: selectedMods.join(", "),
        notes: note.trim(),
      },
    });
    toast.success(`Added ${item.name}`);

    // 2. Sync to backend in the background without freezing the UI
    if (useApi) {
      try {
        const orderId = await ensureOrder();
        if (!orderId) return;
        await addLine.mutateAsync({
          orderId,
          body: {
            product_id: item.id,
            sku: item.sku,
            product_name: item.name,
            qty: 1,
            unit_price: item.price,
            modifiers: selectedMods,
            notes: note.trim(),
            kitchen_station: item.meta?.station ?? item.meta?.kitchen_station,
          },
        });
        void orderQuery.refetch();
        void tablesQuery.refetch();
      } catch (e: any) {
        toast.error(formatApiError(e));
      }
    }
  };

  const addWithMods = async () => {
    if (!modifierOpen) return;
    await addMenuItem(modifierOpen, mods, lineNote);
    setModifierOpen(null);
    setMods([]);
    setLineNote("");
  };

  const handleMoveTable = async () => {
    if (!useApi || !activeOrderId || !targetTableId) return;
    await moveTable.mutateAsync({
      orderId: activeOrderId,
      body: { destination_table_id: targetTableId },
    });
    const targetLabel = tables.find(t => t.id === targetTableId)?.label ?? targetTableId;
    toast.success(`Moved order to Table ${targetLabel}`);
    setTableId(targetTableId);
    setMoveOpen(false);
    setTargetTableId("");
    await orderQuery.refetch();
    tablesQuery.refetch();
  };

  const handleSaveTable = async (values: TableFormValues, editingId: string | null) => {
    if (!useApi) {
      toast.success(`Table ${values.table_name || values.table_no} saved!`);
      return;
    }
    try {
      if (editingId) {
        await updateTable.mutateAsync({
          tableId: editingId,
          body: {
            table_name: values.table_name,
            capacity: values.capacity,
            floor_or_zone: values.floor_or_zone,
          },
        });
        toast.success(`Table ${values.table_name} updated`);
      } else {
        await createTable.mutateAsync({ ...values });
        toast.success(`Table ${values.table_name} added`);
      }
      tablesQuery.refetch();
    } catch (err: any) {
      toast.error(formatApiError(err));
    }
  };

  // window.confirm is unstyled, suppressible by the browser, and blocked outright
  // in sandboxed iframes — where it returns false and the delete silently no-ops.
  const [pendingDelete, setPendingDelete] = useState<TableRow | null>(null);

  const handleDeleteTable = async (t: TableRow) => {
    if (useApi) {
      try {
        await deleteTable.mutateAsync(t.id);
        toast.success(`Table ${t.label} deleted`);
        tablesQuery.refetch();
      } catch (err: any) {
        toast.error(formatApiError(err));
      }
    } else {
      toast.success(`Table ${t.label} deleted`);
    }
    setPendingDelete(null);
  };

  const handleSendKot = async (overrideOrderId?: string) => {
    if (!useApi) return;
    const targetId = overrideOrderId || activeOrderId || (await ensureOrder());
    if (!targetId) return;
    const result = await sendKot.mutateAsync({ orderId: targetId, body: {} });
    await orderQuery.refetch();
    kotsQuery.refetch();
    const kotNos = ((result.kots as Array<Record<string, unknown>>) ?? [])
      .map(k => String(k.kot_number))
      .join(", ");
    toast.success(kotNos ? `KOT sent: ${kotNos}` : "KOT sent to kitchen");
  };

  /**
   * Settle the order. Called by PosShell once the cashier has chosen a tender, so
   * the restaurant reuses the shared payment UI and receipt instead of the thin
   * cash-only dialog it used to carry.
   */
  const settleOrder = async (opts?: {
    tender?: string;
    payments?: SplitPayment[];
    customerId?: string;
    /** Leave the split dialog open so it can show its own receipt. */
    keepSplitOpen?: boolean;
  }): Promise<{ id: string } | null> => {
    if (!useApi || !activeOrderId) {
      setActiveOrderId(null);
      if (!opts?.keepSplitOpen) setSplitOpen(false);
      return { id: `RO-LOCAL-${Date.now().toString().slice(-6)}` };
    }

    // Ensure any unsaved cart lines are synced to backend order before paying
    if (app.cart.length > 0) {
      for (const item of app.cart) {
        if (!orderLines.some(l => l.sku === item.sku || l.id === item.id)) {
          try {
            await addLine.mutateAsync({
              orderId: activeOrderId,
              body: {
                product_id: (item.extras?.productId as string) || item.sku,
                sku: item.sku,
                product_name: item.name,
                qty: item.qty,
                unit_price: item.price,
                modifiers: item.extras?.modifiers
                  ? String(item.extras.modifiers).split(", ").filter(Boolean)
                  : [],
                notes: item.extras?.notes ? String(item.extras.notes) : "",
                kitchen_station: item.meta,
              },
            });
          } catch {}
        }
      }
    }

    try {
      const result = await payOrder.mutateAsync({
        orderId: activeOrderId,
        body: {
          tender: (opts?.tender ?? "cash").toLowerCase(),
          tax_rate: vatRate,
          service_charge: billPreview.serviceCharge,
          ...(opts?.payments?.length ? { payments: opts.payments } : {}),
          ...(opts?.customerId ? { customer_id: opts.customerId } : {}),
        },
      });
      const inv = result?.invoice as Record<string, unknown> | undefined;
      const invoiceNo = String(inv?.invoice_number ?? inv?.id ?? orderNo ?? `RO-${Date.now().toString().slice(-6)}`);
      setActiveOrderId(null);
      if (!opts?.keepSplitOpen) setSplitOpen(false);
      tablesQuery.refetch();
      kotsQuery.refetch();
      return { id: invoiceNo };
    } catch (e: any) {
      const msg = formatApiError(e);
      toast.error(msg);
      if (msg.toLowerCase().includes("already closed") || msg.toLowerCase().includes("closed")) {
        setActiveOrderId(null);
        if (!opts?.keepSplitOpen) setSplitOpen(false);
        tablesQuery.refetch();
        kotsQuery.refetch();
        toast.info("Order was already closed. Table updated.");
        return { id: `RO-CLOSED-${Date.now().toString().slice(-6)}` };
      }
      // If network / API error, allow offline local fallback so cashier gets the voucher
      const fallbackNo = `RO-OFFLINE-${Date.now().toString().slice(-6)}`;
      setActiveOrderId(null);
      if (!opts?.keepSplitOpen) setSplitOpen(false);
      return { id: fallbackNo };
    }
  };

  /**
   * Split settlement, driven by SplitBillDialog once every guest's share has been
   * collected. The dialog keeps the receipt on screen afterwards, so this only
   * posts the payments and clears the cart behind it.
   */
  const handleSplitSettle = async (args: {
    tender: string;
    payments: SplitPayment[];
    customer?: CustomerSelection;
  }) => {
    const settled = await settleOrder({
      tender: args.tender,
      payments: args.payments,
      customerId: args.customer?.id,
      keepSplitOpen: true,
    });
    if (settled) {
      toast.success(`Paid · Invoice ${settled.id}`, {
        description: `${args.payments.length} guest shares · ${fmtBDT(billPreview.total)}`,
      });
      app.clearCart();
    }
    return settled;
  };

  const findOrderLine = (lineId: string) =>
    orderLines.find(l => String(l.id) === lineId);

  /**
   * Qty stepper. The cart mirrors `order.lines`, so this must reach the backend —
   * a local-only edit is reverted by the next refetch without telling anyone.
   */
  const handleLineQtyChange = async (line: CartLine, nextQty: number) => {
    // 0ms instant local UI update
    app.updateQty(line.id || line.sku, nextQty - line.qty);

    if (!useApi || !activeOrderId) return;
    const lineId = line.id;
    if (!lineId) return;
    const sent = Number(line.extras?.sent ?? 0);

    if (nextQty <= 0 || nextQty < sent) {
      setVoidTarget({
        lineId,
        name: line.name,
        qty: nextQty <= 0 ? line.qty : line.qty - nextQty,
        sent,
      });
      return;
    }
    try {
      await updateLine.mutateAsync({ orderId: activeOrderId, lineId, body: { qty: nextQty } });
      void orderQuery.refetch();
      void tablesQuery.refetch();
    } catch (e: any) {
      toast.error(formatApiError(e));
    }
  };

  const handleLineRemove = async (line: CartLine) => {
    // 0ms instant local UI update
    app.removeLine(line.id || line.sku);

    if (!useApi || !activeOrderId) return;
    const lineId = line.id;
    if (!lineId) return;
    const sent = Number(line.extras?.sent ?? 0);
    if (sent > 0) {
      setVoidTarget({ lineId, name: line.name, qty: line.qty, sent });
      return;
    }
    try {
      await voidLine.mutateAsync({ orderId: activeOrderId, lineId, body: {} });
      void orderQuery.refetch();
      void tablesQuery.refetch();
      toast.success(`Removed ${line.name}`);
    } catch (e: any) {
      toast.error(formatApiError(e));
    }
  };

  const confirmVoid = async (reason: string) => {
    if (!activeOrderId || !voidTarget) return;
    try {
      await voidLine.mutateAsync({
        orderId: activeOrderId,
        lineId: voidTarget.lineId,
        body: { qty: voidTarget.qty, ...(reason ? { reason } : {}) },
      });
      await orderQuery.refetch();
      tablesQuery.refetch();
      kotsQuery.refetch();
      toast.success(`Voided ${voidTarget.name}`);
      setVoidTarget(null);
    } catch (e: any) {
      toast.error(formatApiError(e));
    }
  };

  const [selectedCat, setSelectedCat] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const cartQtyMap = useMemo(() => {
    return app.cart.reduce((acc, l) => {
      acc[l.sku] = (acc[l.sku] || 0) + l.qty;
      return acc;
    }, {} as Record<string, number>);
  }, [app.cart]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    menuItems.forEach(m => {
      const c = String(m.meta?.category ?? "").trim();
      if (c) set.add(c);
    });
    return ["All", ...Array.from(set)];
  }, [menuItems]);

  const filteredMenuItems = useMemo(() => {
    return menuItems.filter(m => {
      const matchesCat = selectedCat === "All" || String(m.meta?.category ?? "") === selectedCat;
      const matchesSearch = !searchQuery.trim() || m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.sku.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [menuItems, selectedCat, searchQuery]);

  return (
    <>
      <PosShell
        industry="restaurant"
        title="Restaurant POS"
        subtitle={
          useApi && order
            ? (serviceMode === "dine_in"
                ? `Dine-in · ${order.order_no} · Table ${tableLabel} · ${String(order.status)}`
                : `${serviceMode === "takeaway" ? "Quick Counter" : "Delivery"} · ${order.order_no} · ${String(order.status)}`)
            : (serviceMode === "dine_in"
                ? `Dine-in · Table ${tableLabel} · ${waiter}`
                : `${serviceMode === "takeaway" ? "Quick Counter (Takeaway)" : "Delivery"} · ${waiter}`)
        }
        taxRate={effectiveCartTaxRate(servicePct, vatRate)}
        taxLabel={
          configuredVatIncluded
            ? (servicePct > 0 ? `Service charge (${servicePct}%) · VAT included` : "VAT included in price")
            : (servicePct > 0 ? `VAT ${Math.round(vatRate * 100)}% + service ${servicePct}%` : `VAT (${Math.round(vatRate * 100)}%)`)
        }
        paymentOpen={payOpen}
        onPaymentOpenChange={setPayOpen}
        receiptNote={
          serviceMode === "delivery" && delivery.address
            ? `Delivery · ${delivery.address} · ${delivery.phone}`
            : serviceMode === "dine_in"
              ? `Table ${tableLabel} · Waiter ${waiter} · Dine-in`
              : `Quick Counter · Takeaway`
        }
        // The bill the backend will charge, so the payment dialog, the change due
        // and the receipt all quote the same number.
        // The shell's summary has no service-charge row, so the charge is folded
        // into the tax line that `taxLabel` names. Without this the breakdown does
        // not reconcile — subtotal ৳20 + VAT ৳1 against a ৳23 total, with the ৳2
        // service charge silently missing from the guest's bill.
        totalsOverride={
          useApi && (activeOrderId || app.cart.length > 0)
            ? {
                subtotal: billPreview.subtotal,
                discount: billPreview.discount,
                tax: round2(billPreview.tax + billPreview.serviceCharge),
                total: billPreview.total,
              }
            : undefined
        }
        // The cart mirrors order.lines, so edits must reach the backend.
        onLineQtyChange={handleLineQtyChange}
        onLineRemove={handleLineRemove}
        // Restaurant orders settle through bill_and_pay_order, not the generic sales API.
        onCompleteSale={
          useApi
            ? async ({ tender, payments }) => {
                let ordId = activeOrderId;
                if (!ordId && app.cart.length > 0) {
                  ordId = await ensureOrder();
                }
                if (ordId) {
                  return settleOrder({ tender, payments });
                }
                return null;
              }
            : undefined
        }
        headerBadges={
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 1. Compact Table Selector Pill / Mode Indicator */}
            {tableModeAllowed && tableModeEnabled && serviceMode === "dine_in" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setTableSelectModalOpen(true)}
                className={cn(
                  "h-7.5 px-2.5 text-xs font-bold gap-1.5 rounded-xl border shadow-2xs transition-all cursor-pointer",
                  activeOrderId
                    ? "border-rose-500/60 bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20"
                    : "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20",
                )}
                title="Click to select table, change guests, or switch to Quick Counter"
              >
                <UtensilsCrossed className="h-3.5 w-3.5" />
                <span>Table {tableLabel}</span>
                <span className="text-[10px] opacity-75 font-normal">({guestCount}p)</span>
                <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
              </Button>
            ) : tableModeAllowed ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => switchToDineIn()}
                className="h-7.5 px-2.5 text-xs font-bold gap-1.5 rounded-xl border border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 cursor-pointer"
                title="Quick Counter active (Tables OFF). Click to switch to Table Management"
              >
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                <span>Quick Counter</span>
                <span className="text-[10px] opacity-75 font-normal hidden sm:inline">(Click for Tables)</span>
              </Button>
            ) : (
              <Badge
                variant="outline"
                className="h-7.5 px-2.5 text-xs font-bold gap-1.5 rounded-xl border border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                title="Quick Counter mode active"
              >
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                <span>Quick Counter</span>
              </Badge>
            )}

            {/* 2. Highlighted Send KOT Button */}
            {app.isFeatureEnabled("restaurant.kot") && (
              <Button
                size="sm"
                variant={unsentCount > 0 || app.cart.length > 0 ? "default" : "outline"}
                className={cn(
                  "h-7.5 text-xs gap-1.5 font-bold shrink-0 rounded-xl transition-all cursor-pointer",
                  unsentCount > 0 || app.cart.length > 0
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs"
                    : "border-border/60 text-muted-foreground",
                )}
                disabled={app.cart.length === 0 && unsentCount <= 0}
                onClick={async () => {
                  if (useApi) {
                    await handleSendKot().catch(e => toast.error(formatApiError(e)));
                  } else {
                    const newTicket = {
                      id: `kot-${Date.now()}`,
                      orderNo: String(Math.floor(100 + Math.random() * 900)),
                      table: tableLabel,
                      waiter,
                      status: "sent",
                      ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                      elapsedMinutes: 0,
                      station: "Grill",
                      lines: app.cart.map((line, idx) => ({
                        id: `l-${idx}-${Date.now()}`,
                        product_name: line.name,
                        qty: line.qty,
                        notes: String(line.extras?.notes ?? ""),
                        modifiers: String(line.extras?.modifiers ?? ""),
                      })),
                    };
                    window.dispatchEvent(new CustomEvent("pos_kot_created", { detail: newTicket }));
                    toast.success(`Sent KOT to Kitchen! (${app.cart.length} items for Table ${tableLabel})`);
                  }
                  try {
                    const bc = new BroadcastChannel("pulse_pos_kots");
                    bc.postMessage({ type: "kot_created", table: tableLabel });
                    bc.close();
                  } catch {}
                }}
                title="Send order ticket to Kitchen Display System (KDS)"
              >
                <ChefHat className="h-3.5 w-3.5" />
                <span>Send KOT {app.cart.length > 0 ? `(${app.cart.length})` : ""}</span>
              </Button>
            )}

            {/* 3. Consolidated Actions Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7.5 px-2 text-xs gap-1 font-semibold rounded-xl border-border/60 hover:bg-secondary cursor-pointer"
                >
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  <span className="hidden sm:inline">Actions</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1.5 rounded-xl shadow-lg">
                <DropdownMenuItem
                  onClick={() => setKotOpen(true)}
                  className="cursor-pointer gap-2 py-2 text-xs font-medium"
                >
                  <ChefHat className="h-4 w-4 text-amber-500" />
                  <span>Kitchen KDS Queue</span>
                </DropdownMenuItem>

                {app.isFeatureEnabled("restaurant.split_bill") && (
                  <DropdownMenuItem
                    disabled={(app.cart.length === 0 && orderLines.length === 0) || (useApi && !activeOrderId)}
                    onClick={() => setSplitOpen(true)}
                    className="cursor-pointer gap-2 py-2 text-xs font-medium"
                  >
                    <Split className="h-4 w-4 text-primary" />
                    <span>Split Bill Among Guests</span>
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem
                  onClick={() => setManageCombosOpen(true)}
                  className="cursor-pointer gap-2 py-2 text-xs font-medium"
                >
                  <Layers className="h-4 w-4 text-violet-500" />
                  <span>Make Combo Packages</span>
                </DropdownMenuItem>

                {useApi && activeOrderId && serviceMode === "dine_in" && tableModeAllowed && (
                  <DropdownMenuItem
                    onClick={() => {
                      const available = tables.filter(t => t.id !== tableId && (t.status === "available" || t.status === "cleaning"));
                      if (available.length) setTargetTableId(available[0].id);
                      setMoveOpen(true);
                    }}
                    className="cursor-pointer gap-2 py-2 text-xs font-medium"
                  >
                    <ArrowRightLeft className="h-4 w-4 text-sky-500" />
                    <span>Transfer / Move Table</span>
                  </DropdownMenuItem>
                )}

                {tableModeAllowed && (
                  <DropdownMenuItem
                    onClick={() => setManageTablesOpen(true)}
                    className="cursor-pointer gap-2 py-2 text-xs font-medium"
                  >
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    <span>Manage Floor Tables</span>
                  </DropdownMenuItem>
                )}

                {tableModeAllowed && <DropdownMenuSeparator />}

                {tableModeAllowed && (
                  <DropdownMenuItem
                    onClick={() => {
                      if (tableModeEnabled && serviceMode === "dine_in") {
                        switchToQuickCounter(true);
                      } else {
                        switchToDineIn();
                      }
                    }}
                    className="cursor-pointer gap-2 py-2 text-xs font-medium"
                  >
                    {tableModeEnabled && serviceMode === "dine_in" ? (
                      <>
                        <Zap className="h-4 w-4 text-amber-500" />
                        <span>Switch to Quick Counter (Tables OFF)</span>
                      </>
                    ) : (
                      <>
                        <UtensilsCrossed className="h-4 w-4 text-emerald-500" />
                        <span>Switch to Dine-in (Tables ON)</span>
                      </>
                    )}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* 4. Service Mode Selector */}
            <Select
              value={serviceMode}
              onValueChange={v => {
                const mode = v as ServiceMode;
                if (mode === serviceMode) return;
                if (mode === "dine_in") {
                  switchToDineIn();
                } else if (mode === "takeaway") {
                  switchToQuickCounter(true);
                } else if (mode === "delivery") {
                  switchToDelivery();
                }
              }}
            >
              <SelectTrigger className="h-7.5 w-[115px] text-xs rounded-xl font-medium border-border/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {tableModeAllowed && <SelectItem value="dine_in">🍽️ Dine-in</SelectItem>}
                <SelectItem value="takeaway">⚡ Quick Counter</SelectItem>
                <SelectItem value="delivery">🛵 Delivery</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        cartLineExtra={l => l.extras ? (
          <div className="text-[10px] text-muted-foreground">
            {Number(l.extras.unsent) > 0 ? `Unsent ${l.extras.unsent}` : "Sent"}
            {l.extras.modifiers ? ` · ${String(l.extras.modifiers)}` : ""}
            {l.extras.notes ? ` · ${String(l.extras.notes)}` : ""}
          </div>
        ) : null}
        catalog={
          <>
            {/* Ultra-Slim Live Order Bar (Only shown when order is active) */}
            {useApi && activeOrderId && (
              <div className="flex items-center justify-between bg-primary/10 border-b border-primary/20 px-3 py-1 text-xs text-primary font-medium">
                <span className="flex items-center gap-1.5 text-[11px] truncate">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="font-bold">Live Order:</span> {
                    serviceMode === "dine_in"
                      ? `Table ${tableLabel} · ${guestCount} Guests · ${waiter}`
                      : `${serviceMode === "takeaway" ? "Quick Counter" : "Delivery"} · Order ${orderNo || activeOrderId}`
                  }
                </span>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {unsentCount > 0 && (
                    <Button
                      size="sm"
                      className="h-6 bg-amber-500 hover:bg-amber-600 text-white text-[10px] px-2 gap-1 font-bold shadow-2xs"
                      onClick={() => void handleSendKot().catch(e => toast.error(formatApiError(e)))}
                    >
                      <ChefHat className="h-3 w-3" /> Send KOT ({unsentCount})
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="h-6 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] px-2 gap-1 font-bold shadow-2xs"
                    onClick={() => setPayOpen(true)}
                  >
                    Pay &amp; Release
                  </Button>
                </div>
              </div>
            )}

            {/* Fast Food Search Bar */}
            <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 bg-background">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70" />
                <Input
                  placeholder="Search dishes, combos, beverages (e.g. Biryani, Burger)..."
                  className="h-8 pl-8 pr-7 text-xs rounded-xl bg-secondary/40 border-border/60 focus:bg-background transition-colors"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs p-1"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Fast Category Filter Pills */}
            <div className="border-b border-border/60 px-3 py-1 bg-background">
              <ScrollableRow>
                {categories.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCat(cat)}
                    className={cn(
                      "h-7 rounded-full text-xs font-semibold px-3 py-0.5 shrink-0 transition-all cursor-pointer",
                      selectedCat === cat
                        ? "bg-primary text-primary-foreground shadow-2xs font-bold ring-2 ring-primary/20"
                        : "bg-secondary/80 text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </ScrollableRow>
            </div>

            {/* Full-Height Large Food Item Grid */}
            <ProductGrid
              items={filteredMenuItems}
              pendingKey={pendingSku}
              onAdd={item => {
                const m = item as PosCatalogItem;
                const modifiers = m.meta?.modifiers as string[] | undefined;
                if (modifiers?.length && app.isFeatureEnabled("restaurant.modifiers")) {
                  setModifierOpen(m);
                  setMods([]);
                  setLineNote("");
                } else {
                  void addMenuItem(m).catch(e => toast.error(formatApiError(e)));
                }
              }}
              renderCard={item => {
                const m = item as PosCatalogItem;
                const catStr = String(m.meta?.category ?? "");
                const qty = cartQtyMap[m.sku] || 0;
                return (
                  <PosProductCard
                    badge={m.isMarkdownActive ? m.markdownBadge || "⚡ 50% Fresh Clearance" : catStr}
                    isMarkdown={m.isMarkdownActive}
                    originalPrice={m.originalPrice ? fmtBDT(m.originalPrice) : undefined}
                    title={m.name}
                    subtitle={String(m.meta?.station ?? "")}
                    price={fmtBDT(m.price)}
                    imageUrl={resolveImageUrl(String(m.meta?.image ?? "")) || undefined}
                    count={qty}
                    industry="restaurant"
                    sku={m.sku}
                  />
                );
              }}
            />
          </>
        }
      />

      <Dialog open={!!modifierOpen} onOpenChange={v => !v && setModifierOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifiers & Instructions · {modifierOpen?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <Label className="text-xs text-muted-foreground font-semibold">Select Modifiers</Label>
            <div className="flex flex-wrap gap-2">
              {(modifierOpen?.meta?.modifiers as string[] | undefined)?.map(m => (
                <Button
                  key={m}
                  size="sm"
                  variant={mods.includes(m) ? "default" : "outline"}
                  onClick={() => setMods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])}
                >
                  {m}
                </Button>
              ))}
            </div>
            <div className="pt-2">
              <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                <MessageSquare className="h-3.5 w-3.5" /> Special Instructions / Kitchen Note
              </Label>
              <Input
                placeholder="e.g. Extra spicy, No mayo, Allergies: Nuts"
                className="h-8 text-xs"
                value={lineNote}
                onChange={e => setLineNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void addWithMods().catch(e => toast.error(formatApiError(e)))}>
              Add to order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Move Table · Order {orderNo}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <Label className="text-xs">Select Target Table</Label>
            <Select value={targetTableId} onValueChange={setTargetTableId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose available table" /></SelectTrigger>
              <SelectContent>
                {tables.filter(t => t.id !== tableId && (t.status === "available" || t.status === "cleaning")).map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    Table {t.label} ({t.capacity ?? 4} seats)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground">
              Transfers active order {orderNo} from Table {tableLabel} to the new table. Current table will be released back to available.
            </p>
          </div>
          <DialogFooter>
            <Button
              disabled={moveTable.isPending || !targetTableId}
              onClick={() => void handleMoveTable().catch(e => toast.error(formatApiError(e)))}
            >
              Confirm Table Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Interactive Tablet Table Map & Guests Selector Modal */}
      <Dialog open={Boolean(tableModeAllowed && tableSelectModalOpen)} onOpenChange={setTableSelectModalOpen}>
        <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col p-4 sm:p-6 rounded-2xl border-border/80 shadow-2xl">
          {/* Header with clear spacing preventing close button collision */}
          <DialogHeader className="pb-3 border-b border-border/60 pr-10">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-foreground">
                  <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <UtensilsCrossed className="h-4.5 w-4.5" />
                  </div>
                  <span>Select Table &amp; Dining Guests</span>
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pick a table to seat guests, switch tables, or resume active orders
                </p>
              </div>

              {/* Status Counters */}
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {tables.filter(t => t.status === "available").length} Free
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  {tables.filter(t => t.status === "occupied").length} Occupied
                </span>
                <span className="px-2 py-1 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground">
                  {tables.length} Total
                </span>
              </div>
            </div>
          </DialogHeader>

          {/* Quick Guests & Waiter Configuration */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2.5 px-3.5 bg-secondary/40 rounded-xl border border-border/60 my-2">
            <div className="flex flex-wrap items-center gap-4">
              {/* Guests Count Stepper + Presets */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <span>Guests:</span>
                </div>
                <div className="flex items-center gap-1 bg-background rounded-lg border border-border/80 p-0.5 shadow-2xs">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 rounded-md text-xs font-bold hover:bg-muted"
                    onClick={() => setGuestCount(String(Math.max(1, (Number(guestCount) || 1) - 1)))}
                  >
                    -
                  </Button>
                  <span className="w-6 text-center font-bold text-xs tabular-nums text-foreground">{guestCount}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 rounded-md text-xs font-bold hover:bg-muted"
                    onClick={() => setGuestCount(String((Number(guestCount) || 1) + 1))}
                  >
                    +
                  </Button>
                </div>

                {/* Quick Guest Count Presets */}
                <div className="hidden sm:flex items-center gap-1">
                  {["1", "2", "4", "6", "8"].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setGuestCount(n)}
                      className={cn(
                        "h-6 px-1.5 text-[10px] font-semibold rounded-md border transition-all cursor-pointer",
                        guestCount === n
                          ? "bg-primary text-primary-foreground border-primary font-bold shadow-2xs"
                          : "bg-background text-muted-foreground border-border/60 hover:bg-muted",
                      )}
                    >
                      {n}p
                    </button>
                  ))}
                </div>
              </div>

              {/* Waiter Input */}
              {app.isFeatureEnabled("restaurant.waiter") && (
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
                    <User className="h-3.5 w-3.5 text-primary" />
                    <span>Waiter:</span>
                  </div>
                  <Input
                    className="h-7 w-28 text-xs bg-background rounded-lg px-2 border-border/80"
                    value={waiter}
                    onChange={e => setWaiter(e.target.value)}
                    placeholder="Waiter name"
                  />
                </div>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs font-semibold rounded-lg gap-1.5 border-primary/40 text-primary hover:bg-primary/10 shrink-0 cursor-pointer"
              onClick={() => {
                setTableSelectModalOpen(false);
                setManageTablesOpen(true);
              }}
            >
              <Settings className="h-3.5 w-3.5" /> Manage Floor Plan
            </Button>
          </div>

          {/* Table Category Filter Pills */}
          <div className="flex items-center gap-1.5 pb-2 overflow-x-auto no-scrollbar">
            <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 mr-1">
              <Filter className="h-3 w-3" /> Filter:
            </span>
            <button
              type="button"
              onClick={() => setTableStatusFilter("all")}
              className={cn(
                "h-6 px-2.5 text-[11px] font-semibold rounded-full border transition-all cursor-pointer",
                tableStatusFilter === "all"
                  ? "bg-primary text-primary-foreground border-primary font-bold"
                  : "bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted",
              )}
            >
              All Tables ({tables.length})
            </button>
            <button
              type="button"
              onClick={() => setTableStatusFilter("available")}
              className={cn(
                "h-6 px-2.5 text-[11px] font-semibold rounded-full border transition-all cursor-pointer",
                tableStatusFilter === "available"
                  ? "bg-emerald-600 text-white border-emerald-600 font-bold"
                  : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20",
              )}
            >
              🟢 Available ({tables.filter(t => t.status === "available").length})
            </button>
            <button
              type="button"
              onClick={() => setTableStatusFilter("occupied")}
              className={cn(
                "h-6 px-2.5 text-[11px] font-semibold rounded-full border transition-all cursor-pointer",
                tableStatusFilter === "occupied"
                  ? "bg-rose-600 text-white border-rose-600 font-bold"
                  : "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/20",
              )}
            >
              🔴 Occupied ({tables.filter(t => t.status === "occupied").length})
            </button>
            <button
              type="button"
              onClick={() => setTableStatusFilter("vip")}
              className={cn(
                "h-6 px-2.5 text-[11px] font-semibold rounded-full border transition-all cursor-pointer",
                tableStatusFilter === "vip"
                  ? "bg-amber-600 text-white border-amber-600 font-bold"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20",
              )}
            >
              👑 VIP / Large ({tables.filter(t => t.label.toLowerCase().includes("vip") || (t.capacity && t.capacity >= 8)).length})
            </button>
          </div>

          {/* Interactive Floor Tables Grid */}
          <div className="flex-1 overflow-y-auto min-h-[240px] max-h-[380px] py-2 pr-1 no-scrollbar">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {tables
                .filter(t => {
                  if (tableStatusFilter === "available") return t.status === "available";
                  if (tableStatusFilter === "occupied") return t.status === "occupied";
                  if (tableStatusFilter === "vip") return t.label.toLowerCase().includes("vip") || (t.capacity && t.capacity >= 8);
                  return true;
                })
                .map(t => {
                  const isSelected = tableId === t.id && serviceMode === "dine_in";
                  const isOccupied = t.status === "occupied";
                  const isVip = t.label.toLowerCase().includes("vip") || (t.capacity && t.capacity >= 8);

                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        void selectTable(t);
                        setTableSelectModalOpen(false);
                      }}
                      className={cn(
                        "group relative flex flex-col justify-between p-3.5 rounded-2xl border text-left transition-all duration-200 hover:-translate-y-0.5 active:scale-98 cursor-pointer min-h-[110px]",
                        isOccupied
                          ? "border-rose-500/40 bg-gradient-to-br from-rose-500/10 to-rose-500/5 hover:border-rose-500/60 hover:shadow-md"
                          : t.status === "reserved"
                          ? "border-amber-500/40 bg-amber-500/10 hover:border-amber-500/60"
                          : t.status === "cleaning"
                          ? "border-sky-500/40 bg-sky-500/10 hover:border-sky-500/60"
                          : isVip
                          ? "border-amber-500/50 bg-gradient-to-br from-amber-500/10 to-transparent hover:border-amber-500/70 hover:shadow-md"
                          : "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 hover:border-emerald-500/60 hover:shadow-md",
                        isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background border-primary bg-primary/10 shadow-md",
                      )}
                    >
                      {/* Top Row: Label & Status Badge */}
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5">
                          {isVip ? (
                            <Crown className="h-4 w-4 text-amber-500" />
                          ) : (
                            <UtensilsCrossed className="h-4 w-4 text-primary opacity-80" />
                          )}
                          <span className="font-bold text-sm text-foreground tracking-tight">
                            {t.label}
                          </span>
                        </div>

                        <span
                          className={cn(
                            "px-2 py-0.5 text-[9px] font-extrabold rounded-full uppercase tracking-wider flex items-center gap-1",
                            isOccupied
                              ? "bg-rose-500 text-white shadow-2xs"
                              : t.status === "reserved"
                              ? "bg-amber-500 text-white"
                              : t.status === "cleaning"
                              ? "bg-sky-500 text-white"
                              : "bg-emerald-500 text-white shadow-2xs",
                          )}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
                          {t.status === "occupied" ? "Occupied" : t.status === "available" ? "Free" : t.status}
                        </span>
                      </div>

                      {/* Middle Row: Capacity & Seating visual */}
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-medium flex items-center gap-1 text-[11px]">
                          <Armchair className="h-3 w-3 opacity-70" />
                          {t.capacity ? `${t.capacity} Seats` : "4 Seats"}
                        </span>
                        {isVip && (
                          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                            VIP Booth
                          </span>
                        )}
                      </div>

                      {/* Bottom Row: Bill total or Ready status */}
                      <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between">
                        {isOccupied && t.order_total != null && Number(t.order_total) > 0 ? (
                          <div className="flex items-center justify-between w-full">
                            <span className="text-[10px] font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1">
                              <Receipt className="h-3 w-3" /> Live Bill:
                            </span>
                            <span className="font-extrabold text-xs text-rose-600 dark:text-rose-400 tabular-nums">
                              {fmtBDT(t.order_total)}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between w-full">
                            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                              <Sparkles className="h-3 w-3" /> Ready to seat
                            </span>
                            {isSelected && (
                              <span className="text-[10px] font-bold text-primary flex items-center gap-0.5">
                                <Check className="h-3 w-3" /> Current
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs text-amber-700 dark:text-amber-300 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 gap-1.5 cursor-pointer font-semibold"
              onClick={() => switchToQuickCounter(false)}
            >
              <Zap className="h-3.5 w-3.5 text-amber-500" /> Switch to Quick Counter Mode
            </Button>
            <Button
              type="button"
              size="sm"
              className="px-5 rounded-xl font-bold"
              onClick={() => setTableSelectModalOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SplitBillDialog
        open={splitOpen}
        onOpenChange={setSplitOpen}
        orderLabel={orderNo ? `${orderNo} · Table ${tableLabel}` : `Table ${tableLabel}`}
        bill={billPreview}
        guestCount={Number(guestCount) || 2}
        lines={app.cart}
        receiptNote={
          serviceMode === "delivery" && delivery.address
            ? `Delivery · ${delivery.address} · ${delivery.phone}`
            : `Table ${tableLabel} · Waiter ${waiter} · ${serviceMode}`
        }
        isSettling={payOrder.isPending}
        onSettle={args =>
          handleSplitSettle(args).catch(e => {
            toast.error(formatApiError(e));
            return null;
          })
        }
      />

      <Dialog open={kotOpen} onOpenChange={setKotOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between pr-6">
            <DialogTitle className="flex items-center gap-2">
              <ChefHat className="h-5 w-5 text-amber-500" />
              Kitchen Display System (KDS)
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1 font-semibold text-primary border-primary/30 hover:bg-primary/10 cursor-pointer"
              onClick={() => {
                setKotOpen(false);
                navigate({ to: "/app/restaurant/kot" });
              }}
            >
              Full KDS View ↗
            </Button>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {!useApi && <p className="text-muted-foreground text-xs">Demo mode — backend connection active for live KDS sync.</p>}
            {useApi && (kotsQuery.data ?? []).length === 0 && (
              <div className="py-8 text-center text-muted-foreground">
                <ChefHat className="mx-auto h-8 w-8 opacity-40 mb-2" />
                <p>No active KOTs in kitchen queue.</p>
              </div>
            )}
            {(kotsQuery.data ?? []).map(k => {
              const kId = String(k.id);
              const status = String(k.status ?? "sent");
              const lines = ((k.lines as Array<Record<string, unknown>>) ?? []);
              return (
                <div key={kId} className="rounded-lg border border-border bg-card p-3.5 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-bold flex items-center gap-2">
                      <span className="text-base text-primary">#{String(k.kot_number ?? kId)}</span>
                      {k.table_no ? <Badge variant="outline" className="text-xs font-semibold">Table {String(k.table_no)}</Badge> : null}
                    </div>
                    <Badge
                      className={cn(
                        "text-xs capitalize font-bold",
                        status === "sent" && "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
                        status === "preparing" && "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
                        status === "ready" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
                        status === "served" && "bg-muted text-muted-foreground",
                      )}
                    >
                      {status}
                    </Badge>
                  </div>
                  <div className="text-xs space-y-1 bg-muted/30 p-2 rounded border border-border/50">
                    {lines.map((l, idx) => (
                      <div key={idx} className="flex justify-between font-medium">
                        <span>{Number(l.qty ?? 1)}× {String(l.product_name ?? "Item")}</span>
                        {l.notes ? <span className="text-[11px] italic text-muted-foreground">{String(l.notes)}</span> : null}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    {status === "sent" && (
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold"
                        onClick={() => {
                          updateKot.mutate(
                            { id: kId, body: { status: "preparing" } },
                            { onSuccess: () => void kotsQuery.refetch() }
                          );
                        }}
                      >
                        Start Cooking 🍳
                      </Button>
                    )}
                    {status === "preparing" && (
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                        onClick={() => {
                          updateKot.mutate(
                            { id: kId, body: { status: "ready" } },
                            { onSuccess: () => void kotsQuery.refetch() }
                          );
                        }}
                      >
                        Mark Ready ✅
                      </Button>
                    )}
                    {status === "ready" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-bold"
                        onClick={() => {
                          updateKot.mutate(
                            { id: kId, body: { status: "served" } },
                            { onSuccess: () => void kotsQuery.refetch() }
                          );
                        }}
                      >
                        Mark Served 🍽️
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <ManageTablesDialog
        open={manageTablesOpen}
        onOpenChange={setManageTablesOpen}
        tables={tables}
        isSaving={createTable.isPending || updateTable.isPending}
        isDeleting={deleteTable.isPending}
        onSave={handleSaveTable}
        onDelete={setPendingDelete}
      />

      <VoidLineDialog
        target={voidTarget}
        onOpenChange={v => !v && setVoidTarget(null)}
        isPending={voidLine.isPending}
        onConfirm={confirmVoid}
      />

      <DeliveryDetailsDialog
        open={deliveryOpen}
        onOpenChange={setDeliveryOpen}
        value={delivery}
        onChange={setDelivery}
        isPending={createOrder.isPending}
        onConfirm={async () => {
          setDeliveryOpen(false);
          await ensureOrder();
        }}
      />

      <ConfirmActionDialog
        open={!!pendingDelete}
        onOpenChange={v => !v && setPendingDelete(null)}
        title={`Delete Table ${pendingDelete?.label ?? ""}?`}
        description="The table is removed from the floor plan. Past orders and invoices are unaffected."
        confirmLabel="Delete table"
        destructive
        isPending={deleteTable.isPending}
        onConfirm={async () => {
          if (pendingDelete) await handleDeleteTable(pendingDelete);
        }}
      />

      <ManageCombosDialog
        open={manageCombosOpen}
        onOpenChange={setManageCombosOpen}
        combos={localCombos}
        menu={catalog.items.map((i) => ({ id: i.id, name: i.name, price: i.price }))}
        onSave={(values, editingId) => {
          const components = values.items.map((it, idx) => {
            const prod = catalog.items.find((i) => i.id === it.product_id);
            return {
              id: `${it.product_id}-${idx}`,
              product_id: it.product_id,
              item_role: it.item_role,
              product_name: prod?.name || "Item",
              base_price: prod?.price || 0,
              is_active: true,
            };
          });
          const compTotal = components.reduce((s, c) => s + c.base_price, 0);
          const savings = compTotal - values.combo_price;

          if (editingId) {
            setLocalCombos((prev) =>
              prev.map((c) => (c.id === editingId ? {
                ...c,
                name: values.name,
                combo_price: values.combo_price,
                items: components,
                components_total: compTotal,
                savings,
              } : c)),
            );
            toast.success("Combo updated");
          } else {
            const newCombo: ComboRow = {
              id: `COMBO-${Date.now()}`,
              name: values.name,
              combo_price: values.combo_price,
              components_total: compTotal,
              savings,
              items: components,
            };
            setLocalCombos((prev) => [newCombo, ...prev]);
            catalog.items.unshift({
              id: newCombo.id,
              sku: newCombo.id,
              name: `${newCombo.name} (Combo)`,
              price: newCombo.combo_price,
              stock: 99,
              meta: {
                category: "Combo Package",
                station: "Kitchen",
                image: "/food-images/EM-BOX-02.jpg",
              },
            });
            toast.success(`Combo "${values.name}" created & added to catalog!`);
          }
        }}
        onDelete={(combo) => {
          setLocalCombos((prev) => prev.filter((c) => c.id !== combo.id));
          toast.success(`Combo "${combo.name}" removed`);
        }}
      />
    </>
  );
}

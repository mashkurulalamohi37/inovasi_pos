import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChefHat,
  Package,
  Flame,
  RefreshCw,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
} from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useRestaurantKots } from "@/hooks/use-api-config";
import { useUpdateRestaurantKot } from "@/hooks/use-industry-backoffice";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { KitchenTicketCard, type KitchenTicket } from "@/features/pos/restaurant/KitchenTicketCard";
import { RecipeBomDialog } from "@/features/pos/restaurant/RecipeBomDialog";
import { KitchenStockDialog } from "@/features/pos/restaurant/KitchenStockDialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/restaurant/kot")({ component: Page });

/**
 * Mirror of KOT_TRANSITIONS in backend/app/services/restaurant_service.py.
 * The backend rejects any hop that is not in this map, so the UI has to walk
 * the legal path rather than jumping straight to the status the chef asked for
 * (striking every line on a NEW ticket means sent -> preparing -> ready).
 * Keep both copies in sync.
 */
const KOT_TRANSITIONS: Record<KitchenTicket["status"], KitchenTicket["status"][]> = {
  sent: ["accepted", "preparing"],
  accepted: ["preparing"],
  preparing: ["ready"],
  ready: ["served"],
  served: [],
  cancelled: [],
};

/** Shortest legal route from `from` to `to`, excluding `from`. Empty when already there, null when unreachable. */
function kotPath(
  from: KitchenTicket["status"],
  to: KitchenTicket["status"],
): KitchenTicket["status"][] | null {
  if (from === to) return [];
  const queue: Array<{ node: KitchenTicket["status"]; path: KitchenTicket["status"][] }> = [
    { node: from, path: [] },
  ];
  const seen = new Set<string>([from]);
  while (queue.length) {
    const { node, path } = queue.shift()!;
    for (const next of KOT_TRANSITIONS[node] ?? []) {
      if (seen.has(next)) continue;
      const nextPath = [...path, next];
      if (next === to) return nextPath;
      seen.add(next);
      queue.push({ node: next, path: nextPath });
    }
  }
  return null;
}

/** Statuses that no longer belong on an active kitchen board. */
const COMPLETED_STATUSES: ReadonlyArray<KitchenTicket["status"]> = ["served", "cancelled"];

/** The API sends modifiers as an array (of strings or objects); String() on it yields "[object Object]". */
function formatModifiers(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const parts = (Array.isArray(raw) ? raw : [raw])
    .map((m) => {
      if (m == null) return "";
      if (typeof m === "string") return m;
      if (typeof m === "object") {
        const o = m as Record<string, unknown>;
        return String(o.name ?? o.label ?? o.title ?? o.value ?? "");
      }
      return String(m);
    })
    .filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

const INITIAL_TICKETS: KitchenTicket[] = [
  {
    id: "kot-101",
    orderNo: "101",
    table: "T-04",
    waiter: "Robi",
    status: "preparing",
    ts: "14:28 PM",
    elapsedMinutes: 6,
    station: "Grill",
    lines: [
      { id: "l-1", product_name: "Student Special Combo (Rice, Veg, Chicken, Drink)", qty: 2, notes: "EXTRA CHEESE ON BURGER", modifiers: "Extra Cheese" },
      { id: "l-2", product_name: "Regular Combo (Rice, Veg, Chicken, Drink)", qty: 1, notes: "NO ONIONS" },
    ],
  },
  {
    id: "kot-102",
    orderNo: "102",
    table: "T-02",
    waiter: "Salim",
    status: "sent",
    ts: "14:32 PM",
    elapsedMinutes: 2,
    station: "Fryer",
    lines: [
      { id: "l-3", product_name: "Fried Chicken (4 Pcs)", qty: 1, notes: "SPICY DIP" },
      { id: "l-4", product_name: "French Fries (Large)", qty: 2 },
    ],
  },
  {
    id: "kot-103",
    orderNo: "103",
    table: "VIP-01",
    waiter: "Sumon",
    status: "ready",
    ts: "14:15 PM",
    elapsedMinutes: 19,
    station: "Beverage Bar",
    lines: [
      { id: "l-5", product_name: "Superior Combo (Rice, Veg, Chicken, Drink)", qty: 1 },
      { id: "l-6", product_name: "Cold Coffee Shake", qty: 2 },
    ],
  },
];

function Page() {
  const useApi = shouldUseBackend();
  const [stationFilter, setStationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  // Demo tickets only shown when NOT connected to backend
  const [localTickets, setLocalTickets] = useState<KitchenTicket[]>(useApi ? [] : INITIAL_TICKETS);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const [recipeOpen, setRecipeOpen] = useState(false);
  const [selectedDishForRecipe, setSelectedDishForRecipe] = useState("Chicken Burger");
  const [stockOpen, setStockOpen] = useState(false);

  const [statusOverrides, setStatusOverrides] = useState<Record<string, KitchenTicket["status"]>>({});
  // Served tickets the user has cleared off the board. View-only: the KOT itself stays in history.
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  // Auto-poll every 3 s in backend mode so the KDS stays live without manual refresh.
  // Filtering is deliberately client-side: the server filters on the raw kitchen_station
  // column, but the board displays a "Grill" fallback for tickets that have none, so a
  // server-side station filter would empty a board that just showed those tickets.
  const { data, refetch } = useRestaurantKots(
    {},
    { refetchInterval: useApi ? 3_000 : undefined },
  );

  const updateKot = useUpdateRestaurantKot();

  // Audio Chime notification
  const playChime = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 note
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3); // A5 note
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {
      // AudioContext fallback
    }
  };

  // Listen for live Send KOT events from POS screen (same tab)
  useEffect(() => {
    const handleNewKotEvent = (e: Event) => {
      const customEvent = e as CustomEvent<KitchenTicket>;
      if (customEvent.detail) {
        if (audioEnabled) playChime();
        toast.success(`🔔 New KOT received for Table ${customEvent.detail.table}!`);
        if (useApi) {
          // The authoritative ticket comes from the API. Appending the POS's
          // preview copy too would show the same order twice, since its
          // synthetic id never matches the real one.
          void refetch();
        } else {
          setLocalTickets(prev => [customEvent.detail, ...prev]);
        }
      }
    };
    window.addEventListener("pos_kot_created", handleNewKotEvent);
    return () => window.removeEventListener("pos_kot_created", handleNewKotEvent);
  }, [audioEnabled, useApi, refetch]);

  // Listen via BroadcastChannel for cross-tab KOT events (POS in one tab, KDS in another)
  useEffect(() => {
    if (!useApi) return;
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("pulse_pos_kots");
      bc.onmessage = (evt) => {
        if (evt.data?.type === "kot_created") {
          if (audioEnabled) playChime();
          toast.success(`🔔 New KOT received for Table ${evt.data?.table ?? ""}!`);
          void refetch();
        }
      };
    } catch {
      // BroadcastChannel not supported
    }
    return () => { try { bc?.close(); } catch { /* ignore */ } };
  }, [useApi, audioEnabled, refetch]);

  const apiTickets: KitchenTicket[] = useMemo(() => {
    if (!useApi || !data || data.length === 0) return [];
    return data.map(r => ({
      id: String(r.id),
      orderNo: String(r.kot_number ?? r.id),
      table: String(r.table_no ?? r.table_id ?? "—"),
      // sent_by_name is resolved from the user account by _serialize_kot; sent_by is a bare id.
      waiter: String(r.sent_by_name ?? "Staff"),
      status: (r.status as KitchenTicket["status"]) || "sent",
      ts: r.created_at ? new Date(String(r.created_at)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Just now",
      elapsedMinutes: r.elapsed_minutes != null ? Number(r.elapsed_minutes) : 0,
      station: String(r.kitchen_station ?? "Grill"),
      lines: ((r.lines as Array<Record<string, unknown>>) ?? []).map((l, i) => ({
        id: String(l.id ?? i),
        product_name: String(l.product_name ?? "Item"),
        qty: Number(l.qty ?? 1),
        notes: l.notes ? String(l.notes) : undefined,
        modifiers: formatModifiers(l.modifiers),
        station: l.kitchen_station ? String(l.kitchen_station) : undefined,
      })),
    }));
  }, [useApi, data]);

  const allTickets = useMemo(() => {
    if (useApi) {
      const mergedApi = apiTickets.map(at => ({
        ...at,
        status: statusOverrides[at.id] ?? at.status,
      }));
      const extraLocal = localTickets
        .filter(lt => !mergedApi.some(at => at.id === lt.id))
        .map(lt => ({ ...lt, status: statusOverrides[lt.id] ?? lt.status }));
      return [...mergedApi, ...extraLocal];
    }
    return localTickets.map(lt => ({ ...lt, status: statusOverrides[lt.id] ?? lt.status }));
  }, [useApi, apiTickets, localTickets, statusOverrides]);

  const clearOverride = (ticketId: string) =>
    setStatusOverrides(prev => {
      const copy = { ...prev };
      delete copy[ticketId];
      return copy;
    });

  const handleStatusChange = async (ticketId: string, nextStatus: KitchenTicket["status"]) => {
    const ticket = allTickets.find(t => t.id === ticketId);
    const current = ticket?.status ?? "sent";
    const label = ticket?.orderNo ?? ticketId.replace("kot-", "");

    const path = kotPath(current, nextStatus);
    if (!path || path.length === 0) {
      if (current !== nextStatus) {
        toast.error(`Cannot move ticket #${label} from ${current.toUpperCase()} to ${nextStatus.toUpperCase()}`);
      }
      return;
    }

    // Optimistic: show the new status immediately so the board feels instant.
    setStatusOverrides(prev => ({ ...prev, [ticketId]: nextStatus }));
    setLocalTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: nextStatus } : t));

    // Demo tickets have no server-side counterpart to PATCH.
    const isLocalOnly = !useApi || localTickets.some(t => t.id === ticketId);
    if (isLocalOnly) {
      toast.success(`Ticket #${label} marked ${nextStatus.toUpperCase()}`);
      return;
    }

    try {
      // Walk each hop so the backend state machine accepts the move.
      for (const step of path) {
        await updateKot.mutateAsync({ id: ticketId, body: { status: step } });
      }
      await refetch();
      // Server is authoritative again — drop the override so a change made on
      // another terminal is no longer masked by this screen's local guess.
      clearOverride(ticketId);
      toast.success(`Ticket #${label} marked ${nextStatus.toUpperCase()}`);
    } catch (err) {
      clearOverride(ticketId);
      void refetch();
      toast.error(formatApiError(err));
    }
  };

  const handleInspectRecipe = (dishName: string) => {
    setSelectedDishForRecipe(dishName);
    setRecipeOpen(true);
  };

  const handleAddTestKot = () => {
    // Never inject phantom tickets into a live kitchen: they have no server-side
    // KOT, so every status button on them would 404.
    if (useApi) {
      toast.error("Test tickets are disabled while connected to the backend");
      return;
    }
    const testNum = Math.floor(104 + Math.random() * 50);
    const testTable = `T-0${Math.floor(1 + Math.random() * 6)}`;
    const newTestTicket: KitchenTicket = {
      id: `kot-${testNum}`,
      orderNo: String(testNum),
      table: testTable,
      waiter: "Staff",
      status: "sent",
      ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      elapsedMinutes: 0,
      station: "Grill",
      lines: [
        { id: `l-${Date.now()}-1`, product_name: "Mini Burger Combo", qty: 2, notes: "EXTRA MAYO" },
        { id: `l-${Date.now()}-2`, product_name: "French Fries (Large)", qty: 1 },
      ],
    };
    setLocalTickets(prev => [newTestTicket, ...prev]);
    if (audioEnabled) playChime();
    toast.success(`Added Test KOT #${testNum} for ${testTable}`);
  };

  const handleClearServed = () => {
    const servedIds = allTickets.filter(t => t.status === "served").map(t => t.id);
    if (servedIds.length === 0) return;
    // API tickets can't be deleted from here, so hide them from the board instead.
    setDismissedIds(prev => [...new Set([...prev, ...servedIds])]);
    setLocalTickets(prev => prev.filter(t => t.status !== "served"));
    toast.info(`Cleared ${servedIds.length} served ticket${servedIds.length === 1 ? "" : "s"} from view`);
  };

  const visibleTickets = allTickets.filter(t => {
    if (dismissedIds.includes(t.id)) return false;
    const matchStation = stationFilter === "all" || t.station.toLowerCase() === stationFilter.toLowerCase();
    // "All" means the active queue. Served and cancelled tickets would otherwise pile
    // up all service long, since the API returns the 200 most recent regardless of status.
    const matchStatus = statusFilter === "all"
      ? !COMPLETED_STATUSES.includes(t.status)
      : t.status === statusFilter;
    return matchStation && matchStatus;
  });

  const cookingCount = allTickets.filter(t => t.status === "preparing").length;
  const readyCount = allTickets.filter(t => t.status === "ready").length;
  const activeCount = allTickets.filter(t => !COMPLETED_STATUSES.includes(t.status)).length;

  return (
    <BackOfficePage
      title="Kitchen Operations & KDS Display"
      eyebrow="Restaurant POS"
      subtitle="Real-time cooking queue, station routing, and dish recipe BOM management"
      stats={[
        { label: "Active KOTs", value: String(activeCount) },
        { label: "Cooking 🍳", value: String(cookingCount) },
        { label: "Ready to Serve ✅", value: String(readyCount) },
      ]}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "h-8 text-xs gap-1.5 font-bold border-border cursor-pointer",
              audioEnabled && "text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
            )}
            onClick={() => {
              setAudioEnabled(!audioEnabled);
              toast.info(audioEnabled ? "KDS Audio Chime Muted" : "KDS Audio Chime Enabled 🔔");
            }}
            title="Toggle Audio Bell Chime for new kitchen tickets"
          >
            {audioEnabled ? <Volume2 className="h-4 w-4 text-emerald-500" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
            <span>Chime: {audioEnabled ? "ON" : "OFF"}</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5 font-bold border-primary/40 text-primary hover:bg-primary/10 cursor-pointer"
            onClick={() => setStockOpen(true)}
          >
            <Package className="h-4 w-4" /> Raw Material Stock
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5 font-bold border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
            onClick={() => handleInspectRecipe("Chicken Burger")}
          >
            <ChefHat className="h-4 w-4" /> Recipe BOM Setup
          </Button>
          <Select value={stationFilter} onValueChange={setStationFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Station" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stations</SelectItem>
              <SelectItem value="Grill">Grill / Assembly</SelectItem>
              <SelectItem value="Fryer">Fryer Station</SelectItem>
              <SelectItem value="Beverage Bar">Beverage Bar</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Active Queue</SelectItem>
              <SelectItem value="sent">Sent / New</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="preparing">Cooking</SelectItem>
              <SelectItem value="ready">Ready to Serve</SelectItem>
              <SelectItem value="served">Served</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
    >
      {/* Interactive KDS Ticket Grid & Controls */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="text-xs font-bold text-muted-foreground flex items-center gap-2">
            <Flame className="h-4 w-4 text-amber-500" />
            <span>Active Kitchen Display Cards ({visibleTickets.length})</span>
            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
              ● Live Sync
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {!useApi && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 font-semibold text-primary border-primary/30 hover:bg-primary/10 cursor-pointer"
                onClick={handleAddTestKot}
                title="Simulate receiving a new order ticket from POS"
              >
                <Plus className="h-3.5 w-3.5" /> Test KOT
              </Button>
            )}

            {allTickets.some(t => t.status === "served") && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={handleClearServed}
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear Served
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => {
                void refetch();
                toast.info("Refreshed kitchen queue");
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        </div>

        {visibleTickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-border bg-card">
            <ChefHat className="h-10 w-10 text-muted-foreground/40 mb-2" />
            <h3 className="text-sm font-bold text-foreground">Kitchen Queue Empty</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              No active KOT orders matching the selected filters. New orders from POS appear here automatically.
            </p>
            {!useApi && (
              <Button
                size="sm"
                variant="outline"
                className="mt-3 text-xs gap-1 font-bold border-primary/40 text-primary"
                onClick={handleAddTestKot}
              >
                <Plus className="h-3.5 w-3.5" /> Create Test Order Ticket
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleTickets.map((ticket) => (
              <KitchenTicketCard
                key={ticket.id}
                ticket={ticket}
                onStatusChange={handleStatusChange}
                onInspectRecipe={handleInspectRecipe}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recipe BOM Dialog Modal */}
      <RecipeBomDialog
        open={recipeOpen}
        onOpenChange={setRecipeOpen}
        dishName={selectedDishForRecipe}
        sellingPrice={150}
      />

      {/* Kitchen Stock Dialog Modal */}
      <KitchenStockDialog
        open={stockOpen}
        onOpenChange={setStockOpen}
      />
    </BackOfficePage>
  );
}

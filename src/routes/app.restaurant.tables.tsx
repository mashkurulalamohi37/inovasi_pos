import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { restaurantTables } from "@/lib/industry-mock";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useRestaurantTables } from "@/hooks/use-api-config";
import { useCreateRestaurantTable } from "@/hooks/use-industry-backoffice";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { fmtBDT } from "@/lib/pos-data";
import { toast } from "sonner";

export const Route = createFileRoute("/app/restaurant/tables")({ component: Page });

type TableRow = {
  id: string;
  label: string;
  seats: number;
  status: string;
  zone?: string | null;
  orderId?: string | null;
  orderTotal?: number | null;
  guests?: number | null;
  occupiedMinutes?: number | null;
};

function Page() {
  const useApi = shouldUseBackend();
  const navigate = useNavigate();
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const { data, isLoading, isError, refetch } = useRestaurantTables(
    zoneFilter !== "all" ? { zone: zoneFilter } : undefined,
  );
  const createTable = useCreateRestaurantTable();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ table_no: "", table_name: "", capacity: "4", floor_or_zone: "" });

  const apiRows: TableRow[] = useApi
    ? (data ?? []).map(r => ({
        id: String(r.id),
        label: String(r.table_no ?? r.id),
        seats: Number(r.capacity ?? 4),
        status: String(r.status ?? "available"),
        zone: r.floor_or_zone ? String(r.floor_or_zone) : null,
        orderId: r.current_order_id ? String(r.current_order_id) : null,
        orderTotal: r.current_order_total != null ? Number(r.current_order_total) : null,
        guests: r.current_guest_count != null ? Number(r.current_guest_count) : null,
        occupiedMinutes: r.occupied_minutes != null ? Number(r.occupied_minutes) : null,
      }))
    : [];

  const demoRows: TableRow[] = restaurantTables.map(t => ({
    id: t.id,
    label: t.id,
    seats: t.seats,
    status: t.status,
  }));

  const rows = useApi ? apiRows : demoRows;
  const zones = useMemo(() => {
    const set = new Set(rows.map(r => r.zone).filter(Boolean) as string[]);
    return Array.from(set);
  }, [rows]);
  const occupied = rows.filter(t => t.status === "occupied").length;

  const submit = async () => {
    if (!form.table_no.trim()) {
      toast.error("Table code required");
      return;
    }
    await createTable.mutateAsync({
      table_no: form.table_no.trim(),
      table_name: form.table_name.trim() || form.table_no.trim(),
      capacity: Number(form.capacity) || 4,
      floor_or_zone: form.floor_or_zone.trim() || undefined,
    });
    toast.success(`Table ${form.table_no} created`);
    setOpen(false);
    setForm({ table_no: "", table_name: "", capacity: "4", floor_or_zone: "" });
  };

  return (
    <BackOfficePage
      title="Table Map"
      eyebrow="Restaurant"
      subtitle={`${rows.length} tables · ${occupied} occupied`}
      stats={[
        { label: "Total tables", value: String(rows.length) },
        { label: "Occupied", value: String(occupied) },
      ]}
      actions={
        useApi ? (
          <PermissionGate perm="restaurant.manage">
            <Button size="sm" className="gap-1" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add table
            </Button>
          </PermissionGate>
        ) : (
          <DisabledReasonButton label="Add table" reason="Connect backend to manage tables" />
        )
      }
    >
      <SectionCard
        title="Floor plan"
        actions={
          zones.length > 0 ? (
            <Select value={zoneFilter} onValueChange={setZoneFilter}>
              <SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="Zone" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All zones</SelectItem>
                {zones.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : null
        }
      >
        {useApi && isLoading ? (
          <LoadingState rows={4} label="Loading tables…" />
        ) : useApi && isError ? (
          <ErrorState title="Failed to load tables" onRetry={() => void refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No tables" description="Add tables for this store to start dine-in service." />
        ) : (
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  if (useApi) {
                    void navigate({ to: "/app/pos/restaurant" });
                  }
                }}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  t.status === "occupied"
                    ? "border-warning/40 bg-warning/5"
                    : t.status === "reserved"
                      ? "border-primary/30 bg-primary/5"
                      : "border-border hover:bg-secondary/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold">{t.label}</span>
                  <StatusBadge status={t.status} />
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {t.seats} seats
                  {t.zone ? ` · ${t.zone}` : ""}
                  {t.guests != null ? ` · ${t.guests} guests` : ""}
                </div>
                {t.orderTotal != null && (
                  <div className="mt-1 text-sm font-medium">{fmtBDT(t.orderTotal)}</div>
                )}
                {t.occupiedMinutes != null && (
                  <div className="mt-1 text-xs text-muted-foreground">{t.occupiedMinutes} min occupied</div>
                )}
                {useApi && (
                  <div className="mt-2 text-[10px] text-muted-foreground">
                    {t.orderId ? "Click to open POS (resume order)" : "Click to open POS"}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      <EntityFormDrawer
        open={open}
        onOpenChange={setOpen}
        title="Add table"
        description="Table status is managed by active dine-in orders."
        onSubmit={() => void submit().catch(e => toast.error(String((e as Error)?.message ?? e)))}
        isPending={createTable.isPending}
      >
        <div className="grid gap-3">
          <div>
            <Label>Table code</Label>
            <Input value={form.table_no} onChange={e => setForm(f => ({ ...f, table_no: e.target.value }))} placeholder="T03" />
          </div>
          <div>
            <Label>Name</Label>
            <Input value={form.table_name} onChange={e => setForm(f => ({ ...f, table_name: e.target.value }))} />
          </div>
          <div>
            <Label>Capacity</Label>
            <Input type="number" min={1} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
          </div>
          <div>
            <Label>Floor / zone</Label>
            <Input value={form.floor_or_zone} onChange={e => setForm(f => ({ ...f, floor_or_zone: e.target.value }))} placeholder="Main" />
          </div>
        </div>
      </EntityFormDrawer>
    </BackOfficePage>
  );
}

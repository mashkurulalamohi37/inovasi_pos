import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/pulse/primitives";
import { EmptyState } from "@/components/pulse/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Search } from "lucide-react";
import { fmtBDT } from "@/lib/pos-data";

export const Route = createFileRoute("/app/jewelry/repair")({
  component: JewelryRepair,
});

export type RepairJob = {
  id: string;
  job_no: string;
  customer_name: string;
  customer_phone: string;
  item_name: string;
  metal: string;
  karat: string;
  weight_grams: number;
  service_type: string; // "resizing" | "polishing" | "soldering" | "stone_setting" | "custom_order"
  estimated_cost: number;
  advance_paid: number;
  due_date: string;
  status: "received" | "in_progress" | "ready" | "delivered" | "cancelled";
  notes?: string;
};

const DEMO_REPAIR_JOBS: RepairJob[] = [
  {
    id: "rep-1",
    job_no: "REP-000001",
    customer_name: "Ayesha K.",
    customer_phone: "01711223344",
    item_name: "22K Gold Bangle",
    metal: "Gold",
    karat: "22K",
    weight_grams: 12.5,
    service_type: "resizing",
    estimated_cost: 1500,
    advance_paid: 500,
    due_date: "2026-08-14",
    status: "in_progress",
    notes: "Expand inner diameter by 2mm",
  },
  {
    id: "rep-2",
    job_no: "REP-000002",
    customer_name: "Rifat H.",
    customer_phone: "01819876543",
    item_name: "Diamond Solitaire Ring",
    metal: "Gold",
    karat: "18K",
    weight_grams: 4.2,
    service_type: "stone_setting",
    estimated_cost: 3500,
    advance_paid: 2000,
    due_date: "2026-08-12",
    status: "ready",
    notes: "Tighten 4-prong setting",
  },
  {
    id: "rep-3",
    job_no: "REP-000003",
    customer_name: "Nabila C.",
    customer_phone: "01912345678",
    item_name: "Silver Necklace",
    metal: "Silver",
    karat: "925",
    weight_grams: 25.0,
    service_type: "polishing",
    estimated_cost: 800,
    advance_paid: 800,
    due_date: "2026-08-10",
    status: "delivered",
    notes: "Rhodium rhodium polish",
  },
];

const SERVICE_TYPES: Record<string, string> = {
  resizing: "Ring / Bangle Resizing",
  polishing: "Gold / Rhodium Polish",
  soldering: "Chain / Joint Soldering",
  stone_setting: "Stone Setting & Repair",
  custom_order: "Custom Ornament Making",
};

const STATUS_BADGES: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
  }
> = {
  received: { label: "Received", variant: "outline" },
  in_progress: { label: "In Progress", variant: "warning" },
  ready: { label: "Ready for Pickup", variant: "success" },
  delivered: { label: "Delivered", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

/** Sentinel for "no status filter" — Radix Select cannot use "" as an item value. */
const ALL_STATUSES = "all";

function JewelryRepair() {
  const [jobs, setJobs] = useState<RepairJob[]>(DEMO_REPAIR_JOBS);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editJob, setEditJob] = useState<RepairJob | null>(null);

  const [form, setForm] = useState({
    customer_name: "",
    customer_phone: "",
    item_name: "",
    metal: "Gold",
    karat: "22K",
    weight_grams: "",
    service_type: "polishing",
    estimated_cost: "",
    advance_paid: "",
    due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    notes: "",
  });

  const filtered = jobs.filter((j) => {
    if (statusFilter && statusFilter !== ALL_STATUSES && j.status !== statusFilter) return false;
    if (q) {
      const hay = `${j.job_no} ${j.customer_name} ${j.customer_phone} ${j.item_name}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const resetForm = () =>
    setForm({
      customer_name: "",
      customer_phone: "",
      item_name: "",
      metal: "Gold",
      karat: "22K",
      weight_grams: "",
      service_type: "polishing",
      estimated_cost: "",
      advance_paid: "",
      due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      notes: "",
    });

  const handleCreate = () => {
    if (!form.customer_name || !form.item_name) {
      toast.error("Customer name and item name required");
      return;
    }
    const newJob: RepairJob = {
      id: `rep-${Date.now()}`,
      job_no: `REP-${String(jobs.length + 1).padStart(6, "0")}`,
      customer_name: form.customer_name,
      customer_phone: form.customer_phone,
      item_name: form.item_name,
      metal: form.metal,
      karat: form.karat,
      weight_grams: parseFloat(form.weight_grams) || 0,
      service_type: form.service_type,
      estimated_cost: parseFloat(form.estimated_cost) || 0,
      advance_paid: parseFloat(form.advance_paid) || 0,
      due_date: form.due_date,
      status: "received",
      notes: form.notes,
    };
    setJobs([newJob, ...jobs]);
    toast.success(`Repair Job ${newJob.job_no} created`);
    setDialogOpen(false);
    resetForm();
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Repair & Custom Order Job Cards"
        subtitle="Customer ornament repair, polishing, resizing & custom manufacturing tracking"
        eyebrow="Jewelry"
        actions={
          <Button
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="w-4 h-4" /> New Job Card
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search job no, customer, item…"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="ready">Ready for Pickup</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No repair job cards found"
          description="Create a job card when a customer leaves an ornament for repair, polishing or resizing."
        />
      ) : (
        <SectionCard title={`${filtered.length} job card${filtered.length !== 1 ? "s" : ""}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border/50 text-xs uppercase text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Job No.</th>
                  <th className="pb-3 pr-4 font-medium">Customer</th>
                  <th className="pb-3 pr-4 font-medium">Item & Spec</th>
                  <th className="pb-3 pr-4 font-medium">Service Type</th>
                  <th className="pb-3 pr-4 font-medium">Due Date</th>
                  <th className="pb-3 pr-4 font-medium">Est. Cost / Advance</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filtered.map((j) => (
                  <tr
                    key={j.id}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setEditJob(j);
                      }
                    }}
                    className="hover:bg-muted/30 cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
                    onClick={() => setEditJob(j)}
                  >
                    <td className="py-3 pr-4 font-mono text-xs font-semibold">{j.job_no}</td>
                    <td className="py-3 pr-4">
                      <p className="font-medium">{j.customer_name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{j.customer_phone}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p>{j.item_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {j.karat} {j.metal} · {j.weight_grams}g
                      </p>
                    </td>
                    <td className="py-3 pr-4 text-xs font-medium">
                      {SERVICE_TYPES[j.service_type] ?? j.service_type}
                    </td>
                    <td className="py-3 pr-4 text-xs font-mono">{j.due_date}</td>
                    <td className="py-3 pr-4 text-xs">
                      <p className="font-medium">{fmtBDT(j.estimated_cost)}</p>
                      <p className="text-emerald-500 font-mono text-[11px]">
                        Adv: {fmtBDT(j.advance_paid)}
                      </p>
                    </td>
                    <td className="py-3">
                      <Badge
                        variant={STATUS_BADGES[j.status]?.variant ?? "outline"}
                        className="text-xs"
                      >
                        {STATUS_BADGES[j.status]?.label ?? j.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* New Job Card Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Repair & Service Job Card</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Customer Name *</Label>
                <Input
                  placeholder="Ayesha K."
                  value={form.customer_name}
                  onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Customer Phone</Label>
                <Input
                  placeholder="01711223344"
                  value={form.customer_phone}
                  onChange={(e) => setForm((p) => ({ ...p, customer_phone: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>Item Description *</Label>
                <Input
                  placeholder="e.g. 22K Gold Bangle"
                  value={form.item_name}
                  onChange={(e) => setForm((p) => ({ ...p, item_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Weight (g)</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="12.5"
                  value={form.weight_grams}
                  onChange={(e) => setForm((p) => ({ ...p, weight_grams: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Service Type</Label>
                <Select
                  value={form.service_type}
                  onValueChange={(v) => setForm((p) => ({ ...p, service_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SERVICE_TYPES).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Target Due Date</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Estimated Charge (৳)</Label>
                <Input
                  type="number"
                  placeholder="1500"
                  value={form.estimated_cost}
                  onChange={(e) => setForm((p) => ({ ...p, estimated_cost: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Advance Paid (৳)</Label>
                <Input
                  type="number"
                  placeholder="500"
                  value={form.advance_paid}
                  onChange={(e) => setForm((p) => ({ ...p, advance_paid: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Work Instructions / Notes</Label>
              <Textarea
                placeholder="Specific instructions for goldsmith…"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create Job Card</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit / Detail Dialog */}
      <Dialog open={!!editJob} onOpenChange={() => setEditJob(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Job Card — {editJob?.job_no}</DialogTitle>
          </DialogHeader>
          {editJob && (
            <div className="space-y-3 py-2 text-sm">
              <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-medium">{editJob.customer_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="font-mono text-xs">{editJob.customer_phone || "—"}</p>
                </div>
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground">Item</p>
                  <p className="font-medium">
                    {editJob.item_name} ({editJob.weight_grams}g)
                  </p>
                </div>
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground">Service</p>
                  <p className="font-medium">{SERVICE_TYPES[editJob.service_type]}</p>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Job Status</Label>
                <Select
                  value={editJob.status}
                  onValueChange={(status: RepairJob["status"]) => {
                    setJobs(jobs.map((j) => (j.id === editJob.id ? { ...j, status } : j)));
                    setEditJob({ ...editJob, status });
                    toast.success(`Job status updated to ${status}`);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="received">Received</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="ready">Ready for Pickup</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editJob.notes && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">
                    Work Instructions
                  </p>
                  <p className="text-xs p-2.5 rounded bg-muted/40 text-muted-foreground">
                    {editJob.notes}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditJob(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

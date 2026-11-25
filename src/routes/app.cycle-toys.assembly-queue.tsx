import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { fmtBDT } from "@/lib/pos-data";
import { readStorage, writeStorage, downloadCsv } from "@/lib/pulse-storage";
import { shouldUseBackend } from "@/lib/demo-mode";
import {
  useCycleAssemblyOrders,
  useCreateCycleAssemblyOrder,
  useUpdateCycleAssemblyOrder,
  type ApiCycleAssemblyOrder,
} from "@/hooks/use-industry-backoffice";
import { formatApiError } from "@/lib/api";

export const Route = createFileRoute("/app/cycle-toys/assembly-queue")({ component: Page });

export interface CycleAssemblyRecord {
  id: string;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  bicycleModel: string;
  wheelSize: string;
  technician: string;
  assemblyFee: number;
  status: "Queue" | "In Progress" | "PDI Completed" | "Ready for Delivery";
  notes: string;
  createdAt: string;
}

const DEFAULT_RECORDS: CycleAssemblyRecord[] = [
  {
    id: "ASM-2026-001",
    orderNo: "ASM-2026-001",
    customerName: "Rahim Chowdhury",
    customerPhone: "01811223344",
    bicycleModel: 'Phoenix Dino 14" Kids Cycle',
    wheelSize: '14"',
    technician: "Kabir Hossain (Senior Mechanic)",
    assemblyFee: 300,
    status: "Ready for Delivery",
    notes: "Training wheels installed, brake tension calibrated.",
    createdAt: "2026-10-19 11:30",
  },
  {
    id: "ASM-2026-002",
    orderNo: "ASM-2026-002",
    customerName: "Dr. Farhana Yasmin",
    customerPhone: "01755667788",
    bicycleModel: 'Core Project 27.5" Hydraulic Disc MTB',
    wheelSize: '27.5"',
    technician: "Monirul Islam (Assembly Tech)",
    assemblyFee: 500,
    status: "In Progress",
    notes: "Front fork alignment, hydraulic fluid check.",
    createdAt: "2026-10-19 14:15",
  },
];

const STORAGE_KEY = "pulse_cycle_toys_assembly_queue";

function mapApiOrder(r: ApiCycleAssemblyOrder): CycleAssemblyRecord {
  return {
    id: r.id,
    orderNo: r.order_no || r.id,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    bicycleModel: r.bicycle_model,
    wheelSize: r.wheel_size,
    technician: r.technician,
    assemblyFee: Number(r.assembly_fee || 0),
    status: r.status,
    notes: r.notes || "",
    createdAt: r.created_at || "",
  };
}

function Page() {
  const useApi = shouldUseBackend();
  const ordersQuery = useCycleAssemblyOrders();
  const createMut = useCreateCycleAssemblyOrder();
  const updateMut = useUpdateCycleAssemblyOrder();

  const [demoRecords, setDemoRecords] = useState<CycleAssemblyRecord[]>(() =>
    readStorage<CycleAssemblyRecord[]>(STORAGE_KEY, DEFAULT_RECORDS).map((r) => ({
      ...r,
      orderNo: r.orderNo || r.id,
    }))
  );

  const records = useMemo<CycleAssemblyRecord[]>(() => {
    if (useApi) {
      return (ordersQuery.data ?? []).map(mapApiOrder);
    }
    return demoRecords;
  }, [useApi, ordersQuery.data, demoRecords]);

  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Form states
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [bicycleModel, setBicycleModel] = useState("");
  const [wheelSize, setWheelSize] = useState('16"');
  const [technician, setTechnician] = useState("Kabir Hossain");
  const [assemblyFee, setAssemblyFee] = useState("300");
  const [notes, setNotes] = useState("");

  const filtered = records.filter((r) => {
    if (statusFilter !== "All" && r.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        r.customerName.toLowerCase().includes(q) ||
        r.customerPhone.includes(q) ||
        r.bicycleModel.toLowerCase().includes(q) ||
        r.orderNo.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalFeeEarned = records.reduce((s, r) => s + r.assemblyFee, 0);
  const pendingCount = records.filter((r) => r.status === "Queue" || r.status === "In Progress").length;
  const readyCount = records.filter((r) => r.status === "Ready for Delivery" || r.status === "PDI Completed").length;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !bicycleModel.trim()) {
      toast.error("Please fill in customer name and bicycle model.");
      return;
    }

    const parsedFee = parseFloat(assemblyFee);
    const fee = Number.isNaN(parsedFee) ? 300 : Math.max(0, parsedFee);

    if (useApi) {
      try {
        const res = await createMut.mutateAsync({
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          bicycle_model: bicycleModel.trim(),
          wheel_size: wheelSize,
          technician: technician.trim(),
          assembly_fee: fee,
          notes: notes.trim(),
        });
        toast.success(`Assembly Order ${res.order_no} placed in queue!`);
      } catch (err) {
        toast.error(formatApiError(err));
        return;
      }
    } else {
      const code = `ASM-${Date.now().toString().slice(-4)}`;
      const newRecord: CycleAssemblyRecord = {
        id: code,
        orderNo: code,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        bicycleModel: bicycleModel.trim(),
        wheelSize,
        technician: technician.trim(),
        assemblyFee: fee,
        status: "Queue",
        notes: notes.trim(),
        createdAt: new Date().toISOString().replace("T", " ").slice(0, 16),
      };
      const next = [newRecord, ...demoRecords];
      setDemoRecords(next);
      writeStorage(STORAGE_KEY, next);
      toast.success(`Assembly Order ${newRecord.orderNo} placed in queue!`);
    }

    setDrawerOpen(false);
    setCustomerName("");
    setCustomerPhone("");
    setBicycleModel("");
    setNotes("");
  };

  const handleUpdateStatus = async (record: CycleAssemblyRecord, newStatus: CycleAssemblyRecord["status"]) => {
    if (useApi) {
      try {
        await updateMut.mutateAsync({ id: record.id, body: { status: newStatus } });
        toast.success(`Order ${record.orderNo} updated to ${newStatus}`);
      } catch (err) {
        toast.error(formatApiError(err));
      }
      return;
    }
    const next = demoRecords.map((r) => (r.id === record.id ? { ...r, status: newStatus } : r));
    setDemoRecords(next);
    writeStorage(STORAGE_KEY, next);
    toast.success(`Order ${record.orderNo} updated to ${newStatus}`);
  };

  const handleExport = () => {
    downloadCsv(
      "cycle_assembly_queue.csv",
      ["OrderNo", "Customer", "Phone", "Model", "WheelSize", "Technician", "Fee", "Status", "Notes", "CreatedAt"],
      records.map((r) => [
        r.orderNo,
        r.customerName,
        r.customerPhone,
        r.bicycleModel,
        r.wheelSize,
        r.technician,
        r.assemblyFee,
        r.status,
        r.notes,
        r.createdAt,
      ])
    );
    toast.success("Assembly queue exported to CSV");
  };

  return (
    <BackOfficePage
      title="Bicycle Assembly Workshop Queue"
      subtitle="Manage unboxed carton assemblies, technician workloads, and Pre-Delivery Inspections (PDI)"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Button size="sm" onClick={() => setDrawerOpen(true)} className="gap-1.5 text-xs bg-sky-600 hover:bg-sky-700 text-white">
            <Plus className="h-3.5 w-3.5" /> New Assembly Order
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <SectionCard>
            <div className="text-xs font-medium text-muted-foreground">Total Assembly Orders</div>
            <div className="text-xl font-bold mt-1 text-foreground">{records.length}</div>
          </SectionCard>
          <SectionCard>
            <div className="text-xs font-medium text-amber-600 dark:text-amber-400">In Workshop Queue</div>
            <div className="text-xl font-bold mt-1 text-amber-700 dark:text-amber-300">{pendingCount}</div>
          </SectionCard>
          <SectionCard>
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">PDI / Ready for Customer</div>
            <div className="text-xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">{readyCount}</div>
          </SectionCard>
          <SectionCard>
            <div className="text-xs font-medium text-sky-600 dark:text-sky-400">Total Assembly Revenue</div>
            <div className="text-xl font-bold mt-1 text-sky-700 dark:text-sky-300 font-mono">{fmtBDT(totalFeeEarned)}</div>
          </SectionCard>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <Input
              placeholder="Search by customer, phone, or model…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Status:</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                <SelectItem value="Queue">In Queue</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
                <SelectItem value="PDI Completed">PDI Completed</SelectItem>
                <SelectItem value="Ready for Delivery">Ready for Delivery</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="py-2.5 px-3 text-left font-medium">Order ID</th>
                <th className="py-2.5 px-3 text-left font-medium">Customer</th>
                <th className="py-2.5 px-3 text-left font-medium">Bicycle Model</th>
                <th className="py-2.5 px-3 text-left font-medium">Wheel</th>
                <th className="py-2.5 px-3 text-left font-medium">Technician</th>
                <th className="py-2.5 px-3 text-left font-medium">Fee</th>
                <th className="py-2.5 px-3 text-left font-medium">Status</th>
                <th className="py-2.5 px-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {useApi && ordersQuery.isLoading ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-muted-foreground">
                    Loading assembly orders…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-muted-foreground">
                    No assembly records found matching filters.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="py-2.5 px-3 font-mono font-medium text-foreground">{r.orderNo}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-foreground">{r.customerName}</div>
                      <div className="text-[10px] text-muted-foreground">{r.customerPhone}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium">{r.bicycleModel}</div>
                      {r.notes && <div className="text-[10px] text-muted-foreground">{r.notes}</div>}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">{r.wheelSize}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{r.technician || "—"}</td>
                    <td className="py-2.5 px-3 font-mono font-medium">{fmtBDT(r.assemblyFee)}</td>
                    <td className="py-2.5 px-3">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-2 py-0.5 ${
                          r.status === "Ready for Delivery"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                            : r.status === "PDI Completed"
                            ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20"
                            : r.status === "In Progress"
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                            : "bg-slate-500/10 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {r.status === "Queue" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px] text-sky-600"
                          disabled={updateMut.isPending}
                          onClick={() => handleUpdateStatus(r, "In Progress")}
                        >
                          Start Assembly
                        </Button>
                      )}
                      {r.status === "In Progress" && (
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[11px] text-sky-600"
                            disabled={updateMut.isPending}
                            onClick={() => handleUpdateStatus(r, "PDI Completed")}
                          >
                            Pass PDI
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[11px] text-emerald-600"
                            disabled={updateMut.isPending}
                            onClick={() => handleUpdateStatus(r, "Ready for Delivery")}
                          >
                            Mark Ready
                          </Button>
                        </div>
                      )}
                      {r.status === "PDI Completed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px] text-emerald-600"
                          disabled={updateMut.isPending}
                          onClick={() => handleUpdateStatus(r, "Ready for Delivery")}
                        >
                          Mark Ready
                        </Button>
                      )}
                      {r.status === "Ready for Delivery" && (
                        <span className="text-[11px] text-emerald-600 font-medium">✓ Ready</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Order Drawer */}
      <EntityFormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} title="New Bicycle Assembly Order">
        <form onSubmit={handleCreate} className="space-y-3 p-4">
          <div>
            <Label className="text-xs">Customer Name</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="h-8 text-xs mt-1" required />
          </div>
          <div>
            <Label className="text-xs">Customer Phone</Label>
            <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="h-8 text-xs mt-1" required />
          </div>
          <div>
            <Label className="text-xs">Bicycle Brand & Model</Label>
            <Input value={bicycleModel} onChange={(e) => setBicycleModel(e.target.value)} className="h-8 text-xs mt-1" required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Wheel Size</Label>
              <Select value={wheelSize} onValueChange={setWheelSize}>
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='12"'>12" Kids</SelectItem>
                  <SelectItem value='14"'>14" Kids</SelectItem>
                  <SelectItem value='16"'>16" Kids</SelectItem>
                  <SelectItem value='20"'>20" BMX</SelectItem>
                  <SelectItem value='26"'>26" MTB</SelectItem>
                  <SelectItem value='27.5"'>27.5" MTB</SelectItem>
                  <SelectItem value='29"'>29" MTB</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Assembly Fee (৳)</Label>
              <Input type="number" min="0" value={assemblyFee} onChange={(e) => setAssemblyFee(e.target.value)} className="h-8 text-xs mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Technician</Label>
            <Input value={technician} onChange={(e) => setTechnician(e.target.value)} className="h-8 text-xs mt-1" />
          </div>
          <div>
            <Label className="text-xs">PDI & Accessories Notes</Label>
            <Input placeholder="e.g. Fit training wheels, bell, front basket" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-8 text-xs mt-1" />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={createMut.isPending} className="bg-sky-600 hover:bg-sky-700 text-white">
              {createMut.isPending ? "Saving…" : "Save Order"}
            </Button>
          </div>
        </form>
      </EntityFormDrawer>
    </BackOfficePage>
  );
}

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
  useCycleServiceJobs,
  useCreateCycleServiceJob,
  useUpdateCycleServiceJob,
  type ApiCycleServiceJob,
} from "@/hooks/use-industry-backoffice";
import { formatApiError } from "@/lib/api";

export const Route = createFileRoute("/app/cycle-toys/service-jobs")({ component: Page });

export interface CycleServiceJobRecord {
  id: string;
  jobNo: string;
  customerName: string;
  customerPhone: string;
  bikeModel: string;
  serviceType: string;
  partsReplaced: string;
  laborFee: number;
  partsCost: number;
  totalCost: number;
  mechanic: string;
  status: "Intake" | "In Service" | "Completed" | "Delivered";
  notes: string;
  receivedDate: string;
}

const DEFAULT_RECORDS: CycleServiceJobRecord[] = [
  {
    id: "JOB-2026-081",
    jobNo: "JOB-2026-081",
    customerName: "Mahmud Hasan",
    customerPhone: "01922334455",
    bikeModel: 'Veloce Legion 26" MTB',
    serviceType: "Hydraulic Brake Bleed & Gear Indexing",
    partsReplaced: "Mineral Brake Fluid, Shimano Inner Cable",
    laborFee: 400,
    partsCost: 350,
    totalCost: 750,
    mechanic: "Master Mechanic Kabir",
    status: "Completed",
    notes: "Front brake pads adjusted, shifting tested on stand.",
    receivedDate: "2026-10-18 16:00",
  },
  {
    id: "JOB-2026-082",
    jobNo: "JOB-2026-082",
    customerName: "Sumi Akter",
    customerPhone: "01788990011",
    bikeModel: 'Hero Fairy 16" Kids Cycle',
    serviceType: "Tube Puncture & Chain Replacement",
    partsReplaced: '16" Kenda Inner Tube',
    laborFee: 150,
    partsCost: 250,
    totalCost: 400,
    mechanic: "Monirul Islam",
    status: "In Service",
    notes: "Replaced thorn-punctured tube, lubricated chain.",
    receivedDate: "2026-10-19 10:20",
  },
];

const STORAGE_KEY = "pulse_cycle_toys_service_jobs";

function mapApiJob(r: ApiCycleServiceJob): CycleServiceJobRecord {
  return {
    id: r.id,
    jobNo: r.job_no || r.id,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    bikeModel: r.bike_model,
    serviceType: r.service_type,
    partsReplaced: r.parts_replaced || "",
    laborFee: Number(r.labor_fee || 0),
    partsCost: Number(r.parts_cost || 0),
    totalCost: Number(r.total_cost || 0),
    mechanic: r.mechanic || "",
    status: r.status,
    notes: r.notes || "",
    receivedDate: r.received_date || "",
  };
}

function Page() {
  const useApi = shouldUseBackend();
  const jobsQuery = useCycleServiceJobs();
  const createMut = useCreateCycleServiceJob();
  const updateMut = useUpdateCycleServiceJob();

  const [demoRecords, setDemoRecords] = useState<CycleServiceJobRecord[]>(() =>
    readStorage<CycleServiceJobRecord[]>(STORAGE_KEY, DEFAULT_RECORDS).map((r) => ({
      ...r,
      jobNo: r.jobNo || r.id,
    }))
  );

  const records = useMemo<CycleServiceJobRecord[]>(() => {
    if (useApi) {
      return (jobsQuery.data ?? []).map(mapApiJob);
    }
    return demoRecords;
  }, [useApi, jobsQuery.data, demoRecords]);

  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Form states
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [bikeModel, setBikeModel] = useState("");
  const [serviceType, setServiceType] = useState("Complete Overhaul & Tuning");
  const [partsReplaced, setPartsReplaced] = useState("");
  const [laborFee, setLaborFee] = useState("400");
  const [partsCost, setPartsCost] = useState("200");
  const [mechanic, setMechanic] = useState("Master Mechanic Kabir");
  const [notes, setNotes] = useState("");

  const filtered = records.filter((r) => {
    if (statusFilter !== "All" && r.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        r.customerName.toLowerCase().includes(q) ||
        r.customerPhone.includes(q) ||
        r.bikeModel.toLowerCase().includes(q) ||
        r.jobNo.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalRevenue = records.reduce((s, r) => s + r.totalCost, 0);
  const activeJobs = records.filter((r) => r.status === "Intake" || r.status === "In Service").length;
  const readyJobs = records.filter((r) => r.status === "Completed").length;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !bikeModel.trim()) {
      toast.error("Please fill in customer name and bike model.");
      return;
    }

    const lFee = Math.max(0, parseFloat(laborFee) || 0);
    const pCost = Math.max(0, parseFloat(partsCost) || 0);

    if (useApi) {
      try {
        const res = await createMut.mutateAsync({
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          bike_model: bikeModel.trim(),
          service_type: serviceType,
          parts_replaced: partsReplaced.trim(),
          labor_fee: lFee,
          parts_cost: pCost,
          mechanic: mechanic.trim(),
          notes: notes.trim(),
        });
        toast.success(`Service Job Card ${res.job_no} recorded!`);
      } catch (err) {
        toast.error(formatApiError(err));
        return;
      }
    } else {
      const code = `JOB-${Date.now().toString().slice(-4)}`;
      const newRecord: CycleServiceJobRecord = {
        id: code,
        jobNo: code,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        bikeModel: bikeModel.trim(),
        serviceType,
        partsReplaced: partsReplaced.trim(),
        laborFee: lFee,
        partsCost: pCost,
        totalCost: lFee + pCost,
        mechanic: mechanic.trim(),
        status: "Intake",
        notes: notes.trim(),
        receivedDate: new Date().toISOString().replace("T", " ").slice(0, 16),
      };
      const next = [newRecord, ...demoRecords];
      setDemoRecords(next);
      writeStorage(STORAGE_KEY, next);
      toast.success(`Service Job Card ${newRecord.jobNo} recorded!`);
    }

    setDrawerOpen(false);
    setCustomerName("");
    setCustomerPhone("");
    setBikeModel("");
    setPartsReplaced("");
    setNotes("");
  };

  const handleUpdateStatus = async (record: CycleServiceJobRecord, newStatus: CycleServiceJobRecord["status"]) => {
    if (useApi) {
      try {
        await updateMut.mutateAsync({ id: record.id, body: { status: newStatus } });
        toast.success(`Job ${record.jobNo} updated to ${newStatus}`);
      } catch (err) {
        toast.error(formatApiError(err));
      }
      return;
    }
    const next = demoRecords.map((r) => (r.id === record.id ? { ...r, status: newStatus } : r));
    setDemoRecords(next);
    writeStorage(STORAGE_KEY, next);
    toast.success(`Job ${record.jobNo} updated to ${newStatus}`);
  };

  const handleExport = () => {
    downloadCsv(
      "cycle_service_jobs.csv",
      ["JobNo", "Customer", "Phone", "Model", "Service", "Parts", "Labor", "PartsCost", "Total", "Mechanic", "Status", "Date"],
      records.map((r) => [
        r.jobNo,
        r.customerName,
        r.customerPhone,
        r.bikeModel,
        r.serviceType,
        r.partsReplaced,
        r.laborFee,
        r.partsCost,
        r.totalCost,
        r.mechanic,
        r.status,
        r.receivedDate,
      ])
    );
    toast.success("Service jobs exported to CSV");
  };

  return (
    <BackOfficePage
      title="Bicycle Workshop & Repair Job Cards"
      subtitle="Track intake, tire punctures, gear tuning, and completed bike overhauls"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Button size="sm" onClick={() => setDrawerOpen(true)} className="gap-1.5 text-xs bg-sky-600 hover:bg-sky-700 text-white">
            <Plus className="h-3.5 w-3.5" /> New Job Card
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <SectionCard>
            <div className="text-xs font-medium text-muted-foreground">Total Service Jobs</div>
            <div className="text-xl font-bold mt-1 text-foreground">{records.length}</div>
          </SectionCard>
          <SectionCard>
            <div className="text-xs font-medium text-amber-600 dark:text-amber-400">Under Repair</div>
            <div className="text-xl font-bold mt-1 text-amber-700 dark:text-amber-300">{activeJobs}</div>
          </SectionCard>
          <SectionCard>
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Ready for Pickup</div>
            <div className="text-xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">{readyJobs}</div>
          </SectionCard>
          <SectionCard>
            <div className="text-xs font-medium text-sky-600 dark:text-sky-400">Total Service Income</div>
            <div className="text-xl font-bold mt-1 text-sky-700 dark:text-sky-300 font-mono">{fmtBDT(totalRevenue)}</div>
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
                <SelectItem value="All">All Jobs</SelectItem>
                <SelectItem value="Intake">Intake (Pending)</SelectItem>
                <SelectItem value="In Service">In Service</SelectItem>
                <SelectItem value="Completed">Completed (Ready)</SelectItem>
                <SelectItem value="Delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="py-2.5 px-3 text-left font-medium">Job Card ID</th>
                <th className="py-2.5 px-3 text-left font-medium">Customer</th>
                <th className="py-2.5 px-3 text-left font-medium">Bicycle Model</th>
                <th className="py-2.5 px-3 text-left font-medium">Service / Repair</th>
                <th className="py-2.5 px-3 text-left font-medium">Mechanic</th>
                <th className="py-2.5 px-3 text-left font-medium">Total Bill</th>
                <th className="py-2.5 px-3 text-left font-medium">Status</th>
                <th className="py-2.5 px-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {useApi && jobsQuery.isLoading ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-muted-foreground">
                    Loading workshop service jobs…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-muted-foreground">
                    No workshop service jobs found.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="py-2.5 px-3 font-mono font-medium text-foreground">{r.jobNo}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-foreground">{r.customerName}</div>
                      <div className="text-[10px] text-muted-foreground">{r.customerPhone}</div>
                    </td>
                    <td className="py-2.5 px-3 font-medium">{r.bikeModel}</td>
                    <td className="py-2.5 px-3">
                      <div>{r.serviceType}</div>
                      {r.partsReplaced && <div className="text-[10px] text-muted-foreground">Parts: {r.partsReplaced}</div>}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">{r.mechanic || "—"}</td>
                    <td className="py-2.5 px-3 font-mono font-medium">{fmtBDT(r.totalCost)}</td>
                    <td className="py-2.5 px-3">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-2 py-0.5 ${
                          r.status === "Delivered"
                            ? "bg-slate-500/10 text-slate-700 dark:text-slate-300"
                            : r.status === "Completed"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                            : r.status === "In Service"
                            ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                        }`}
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {r.status === "Intake" && (
                        <Button size="sm" variant="ghost" className="h-6 text-[11px] text-sky-600" disabled={updateMut.isPending} onClick={() => handleUpdateStatus(r, "In Service")}>
                          Start Repair
                        </Button>
                      )}
                      {r.status === "In Service" && (
                        <Button size="sm" variant="ghost" className="h-6 text-[11px] text-emerald-600" disabled={updateMut.isPending} onClick={() => handleUpdateStatus(r, "Completed")}>
                          Complete
                        </Button>
                      )}
                      {r.status === "Completed" && (
                        <Button size="sm" variant="ghost" className="h-6 text-[11px] text-slate-600" disabled={updateMut.isPending} onClick={() => handleUpdateStatus(r, "Delivered")}>
                          Deliver to Cust
                        </Button>
                      )}
                      {r.status === "Delivered" && (
                        <span className="text-[11px] text-muted-foreground">✓ Delivered</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Service Job Drawer */}
      <EntityFormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} title="New Bicycle Service Job Card">
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
            <Input value={bikeModel} onChange={(e) => setBikeModel(e.target.value)} className="h-8 text-xs mt-1" required />
          </div>
          <div>
            <Label className="text-xs">Service Type</Label>
            <Select value={serviceType} onValueChange={setServiceType}>
              <SelectTrigger className="h-8 text-xs mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Tube Puncture Patch & Air">Tube Puncture Patch & Air</SelectItem>
                <SelectItem value="Gear Indexing & Derailleur Tuning">Gear Indexing & Derailleur Tuning</SelectItem>
                <SelectItem value="Hydraulic Brake Bleed & Pad Fix">Hydraulic Brake Bleed & Pad Fix</SelectItem>
                <SelectItem value="Complete Overhaul & Tuning">Complete Overhaul & Tuning</SelectItem>
                <SelectItem value="Wheel Truing & Spoke Tensioning">Wheel Truing & Spoke Tensioning</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Parts Replaced (if any)</Label>
            <Input placeholder="e.g. 26x2.10 Kenda Tube, Brake Cable" value={partsReplaced} onChange={(e) => setPartsReplaced(e.target.value)} className="h-8 text-xs mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Labor Fee (৳)</Label>
              <Input type="number" min="0" value={laborFee} onChange={(e) => setLaborFee(e.target.value)} className="h-8 text-xs mt-1" />
            </div>
            <div>
              <Label className="text-xs">Parts Cost (৳)</Label>
              <Input type="number" min="0" value={partsCost} onChange={(e) => setPartsCost(e.target.value)} className="h-8 text-xs mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Assigned Mechanic</Label>
            <Input value={mechanic} onChange={(e) => setMechanic(e.target.value)} className="h-8 text-xs mt-1" />
          </div>
          <div>
            <Label className="text-xs">Diagnostic Notes</Label>
            <Input placeholder="e.g. Chain stretched, rear derailleur hanger bent" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-8 text-xs mt-1" />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={createMut.isPending} className="bg-sky-600 hover:bg-sky-700 text-white">
              {createMut.isPending ? "Saving…" : "Create Job Card"}
            </Button>
          </div>
        </form>
      </EntityFormDrawer>
    </BackOfficePage>
  );
}

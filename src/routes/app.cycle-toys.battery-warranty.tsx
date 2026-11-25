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
import { readStorage, writeStorage, downloadCsv } from "@/lib/pulse-storage";
import { shouldUseBackend } from "@/lib/demo-mode";
import {
  useCycleBatteryLogs,
  useCreateCycleBatteryLog,
  useUpdateCycleBatteryLog,
  type ApiCycleBatteryLog,
} from "@/hooks/use-industry-backoffice";
import { formatApiError } from "@/lib/api";

export const Route = createFileRoute("/app/cycle-toys/battery-warranty")({ component: Page });

export interface RideonBatteryLog {
  id: string;
  logNo: string;
  vehicleModel: string;
  customerName: string;
  customerPhone: string;
  batterySerial: string;
  voltageRating: "6V" | "12V" | "24V";
  measuredVoltage: string;
  remotePaired: boolean;
  warrantyMonths: number;
  chargerSerial: string;
  status: "Passed PDI" | "Charged 100%" | "Warranty Service" | "Replacement Issued";
  inspectedAt: string;
}

const DEFAULT_RECORDS: RideonBatteryLog[] = [
  {
    id: "BAT-2026-041",
    logNo: "BAT-2026-041",
    vehicleModel: "Mercedes-Benz G63 12V Ride-on Jeep",
    customerName: "Imran Khan",
    customerPhone: "01711223344",
    batterySerial: "BAT-12V7AH-90812",
    voltageRating: "12V",
    measuredVoltage: "12.7V",
    remotePaired: true,
    warrantyMonths: 12,
    chargerSerial: "CHG-12V-1000MA-89",
    status: "Passed PDI",
    inspectedAt: "2026-10-18 15:30",
  },
  {
    id: "BAT-2026-042",
    logNo: "BAT-2026-042",
    vehicleModel: "BMW S1000RR 6V Electric Superbike",
    customerName: "Nafisa Rahman",
    customerPhone: "01855667788",
    batterySerial: "BAT-6V4AH-43011",
    voltageRating: "6V",
    measuredVoltage: "6.4V",
    remotePaired: false,
    warrantyMonths: 6,
    chargerSerial: "CHG-6V-500MA-12",
    status: "Passed PDI",
    inspectedAt: "2026-10-19 11:00",
  },
];

const STORAGE_KEY = "pulse_cycle_toys_battery_logs";

function mapApiBatteryLog(r: ApiCycleBatteryLog): RideonBatteryLog {
  return {
    id: r.id,
    logNo: r.log_no || r.id,
    vehicleModel: r.vehicle_model,
    customerName: r.customer_name || "",
    customerPhone: r.customer_phone || "",
    batterySerial: r.battery_serial,
    voltageRating: r.voltage_rating,
    measuredVoltage: r.measured_voltage,
    remotePaired: Boolean(r.remote_paired),
    warrantyMonths: Number(r.warranty_months || 6),
    chargerSerial: r.charger_serial || "",
    status: r.status,
    inspectedAt: r.inspected_at || "",
  };
}

function Page() {
  const useApi = shouldUseBackend();
  const logsQuery = useCycleBatteryLogs();
  const createMut = useCreateCycleBatteryLog();
  const updateMut = useUpdateCycleBatteryLog();

  const [demoRecords, setDemoRecords] = useState<RideonBatteryLog[]>(() =>
    readStorage<RideonBatteryLog[]>(STORAGE_KEY, DEFAULT_RECORDS).map((r) => ({
      ...r,
      logNo: r.logNo || r.id,
    }))
  );

  const records = useMemo<RideonBatteryLog[]>(() => {
    if (useApi) {
      return (logsQuery.data ?? []).map(mapApiBatteryLog);
    }
    return demoRecords;
  }, [useApi, logsQuery.data, demoRecords]);

  const [voltageFilter, setVoltageFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Form states
  const [vehicleModel, setVehicleModel] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [batterySerial, setBatterySerial] = useState("");
  const [voltageRating, setVoltageRating] = useState<"6V" | "12V" | "24V">("12V");
  const [measuredVoltage, setMeasuredVoltage] = useState("12.6V");
  const [remotePaired, setRemotePaired] = useState(true);
  const [warrantyMonths, setWarrantyMonths] = useState("12");
  const [chargerSerial, setChargerSerial] = useState("");
  const [status, setStatus] = useState<RideonBatteryLog["status"]>("Passed PDI");

  const filtered = records.filter((r) => {
    if (voltageFilter !== "All" && r.voltageRating !== voltageFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        r.vehicleModel.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.batterySerial.toLowerCase().includes(q) ||
        r.customerPhone.includes(q) ||
        r.logNo.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleModel.trim() || !batterySerial.trim()) {
      toast.error("Please fill in vehicle model and battery serial number.");
      return;
    }

    const parsedMonths = parseInt(warrantyMonths, 10);
    const months = Number.isNaN(parsedMonths) ? 6 : Math.max(0, parsedMonths);

    if (useApi) {
      try {
        const res = await createMut.mutateAsync({
          vehicle_model: vehicleModel.trim(),
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          battery_serial: batterySerial.trim(),
          voltage_rating: voltageRating,
          measured_voltage: measuredVoltage.trim(),
          remote_paired: remotePaired,
          warranty_months: months,
          charger_serial: chargerSerial.trim(),
          status,
        });
        toast.success(`Battery Inspection Log ${res.log_no} recorded!`);
      } catch (err) {
        toast.error(formatApiError(err));
        return;
      }
    } else {
      const code = `BAT-${Date.now().toString().slice(-4)}`;
      const newRecord: RideonBatteryLog = {
        id: code,
        logNo: code,
        vehicleModel: vehicleModel.trim(),
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        batterySerial: batterySerial.trim(),
        voltageRating,
        measuredVoltage: measuredVoltage.trim(),
        remotePaired,
        warrantyMonths: months,
        chargerSerial: chargerSerial.trim(),
        status,
        inspectedAt: new Date().toISOString().replace("T", " ").slice(0, 16),
      };
      const next = [newRecord, ...demoRecords];
      setDemoRecords(next);
      writeStorage(STORAGE_KEY, next);
      toast.success(`Battery Inspection Log ${newRecord.logNo} recorded!`);
    }

    setDrawerOpen(false);
    setVehicleModel("");
    setCustomerName("");
    setCustomerPhone("");
    setBatterySerial("");
    setChargerSerial("");
    setStatus("Passed PDI");
  };

  const handleUpdateStatus = async (record: RideonBatteryLog, nextStatus: RideonBatteryLog["status"]) => {
    if (useApi) {
      try {
        await updateMut.mutateAsync({ id: record.id, body: { status: nextStatus } });
        toast.success(`Battery log ${record.logNo} updated to ${nextStatus}`);
      } catch (err) {
        toast.error(formatApiError(err));
      }
      return;
    }
    const next = demoRecords.map((r) => (r.id === record.id ? { ...r, status: nextStatus } : r));
    setDemoRecords(next);
    writeStorage(STORAGE_KEY, next);
    toast.success(`Battery log ${record.logNo} updated to ${nextStatus}`);
  };

  const handleExport = () => {
    downloadCsv(
      "rideon_battery_warranty.csv",
      ["LogNo", "Model", "Customer", "Phone", "BatterySerial", "Rating", "MeasuredVoltage", "RemotePaired", "WarrantyMonths", "ChargerSerial", "Status", "InspectedAt"],
      records.map((r) => [
        r.logNo,
        r.vehicleModel,
        r.customerName,
        r.customerPhone,
        r.batterySerial,
        r.voltageRating,
        r.measuredVoltage,
        r.remotePaired ? "Yes" : "No",
        r.warrantyMonths,
        r.chargerSerial,
        r.status,
        r.inspectedAt,
      ])
    );
    toast.success("Battery warranty logs exported to CSV");
  };

  return (
    <BackOfficePage
      title="Electric Ride-on Battery & Warranty"
      subtitle="Serial tracking, measured voltage verification, and 2.4G remote pairing logs"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Button size="sm" onClick={() => setDrawerOpen(true)} className="gap-1.5 text-xs bg-cyan-600 hover:bg-cyan-700 text-white">
            <Plus className="h-3.5 w-3.5" /> Log Battery Inspection
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <SectionCard>
            <div className="text-xs font-medium text-muted-foreground">Total Inspected Batteries</div>
            <div className="text-xl font-bold mt-1 text-foreground">{records.length}</div>
          </SectionCard>
          <SectionCard>
            <div className="text-xs font-medium text-cyan-600 dark:text-cyan-400">12V Dual Motor Jeeps</div>
            <div className="text-xl font-bold mt-1 text-cyan-700 dark:text-cyan-300">
              {records.filter((r) => r.voltageRating === "12V").length}
            </div>
          </SectionCard>
          <SectionCard>
            <div className="text-xs font-medium text-amber-600 dark:text-amber-400">Warranty Claims / Service</div>
            <div className="text-xl font-bold mt-1 text-amber-700 dark:text-amber-300">
              {records.filter((r) => r.status === "Warranty Service" || r.status === "Replacement Issued").length}
            </div>
          </SectionCard>
          <SectionCard>
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">PDI Certified & Passed</div>
            <div className="text-xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">
              {records.filter((r) => r.status === "Passed PDI" || r.status === "Charged 100%").length}
            </div>
          </SectionCard>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <Input
              placeholder="Search by vehicle model, serial, or customer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Voltage Rating:</span>
            <Select value={voltageFilter} onValueChange={setVoltageFilter}>
              <SelectTrigger className="h-8 text-xs w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Voltages</SelectItem>
                <SelectItem value="6V">6V Lead-Acid</SelectItem>
                <SelectItem value="12V">12V Dual Motor</SelectItem>
                <SelectItem value="24V">24V High Power</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="py-2.5 px-3 text-left font-medium">Log ID</th>
                <th className="py-2.5 px-3 text-left font-medium">Ride-on Vehicle</th>
                <th className="py-2.5 px-3 text-left font-medium">Battery Serial</th>
                <th className="py-2.5 px-3 text-left font-medium">Rating</th>
                <th className="py-2.5 px-3 text-left font-medium">Voltage Test</th>
                <th className="py-2.5 px-3 text-left font-medium">Remote Paired</th>
                <th className="py-2.5 px-3 text-left font-medium">Warranty</th>
                <th className="py-2.5 px-3 text-left font-medium">Status</th>
                <th className="py-2.5 px-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {useApi && logsQuery.isLoading ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted-foreground">
                    Loading battery warranty logs…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted-foreground">
                    No battery inspection records found.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="py-2.5 px-3 font-mono font-medium text-foreground">{r.logNo}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-foreground">{r.vehicleModel}</div>
                      <div className="text-[10px] text-muted-foreground">
                        Cust: {r.customerName || "Floor Stock"}{r.customerPhone ? ` · ${r.customerPhone}` : ""}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px]">{r.batterySerial}</td>
                    <td className="py-2.5 px-3">
                      <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-700 dark:text-cyan-300">
                        {r.voltageRating}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-medium text-emerald-600">{r.measuredVoltage}</td>
                    <td className="py-2.5 px-3">
                      <span className={r.remotePaired ? "text-emerald-600 font-medium" : "text-muted-foreground"}>
                        {r.remotePaired ? "✓ Paired" : "N/A"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">{r.warrantyMonths} Months</td>
                    <td className="py-2.5 px-3">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] border ${
                          r.status === "Replacement Issued"
                            ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20"
                            : r.status === "Warranty Service"
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20"
                            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                        }`}
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {(r.status === "Passed PDI" || r.status === "Charged 100%") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px] text-amber-600"
                          disabled={updateMut.isPending}
                          onClick={() => handleUpdateStatus(r, "Warranty Service")}
                        >
                          Log Claim
                        </Button>
                      )}
                      {r.status === "Warranty Service" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px] text-purple-600"
                          disabled={updateMut.isPending}
                          onClick={() => handleUpdateStatus(r, "Replacement Issued")}
                        >
                          Issue Replacement
                        </Button>
                      )}
                      {r.status === "Replacement Issued" && (
                        <span className="text-[11px] text-purple-600 font-medium">✓ Replaced</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Battery Inspection Drawer */}
      <EntityFormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} title="Log Ride-on Battery Inspection">
        <form onSubmit={handleCreate} className="space-y-3 p-4">
          <div>
            <Label className="text-xs">Ride-on Vehicle Model</Label>
            <Input value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} className="h-8 text-xs mt-1" required />
          </div>
          <div>
            <Label className="text-xs">Customer Name (optional if floor stock)</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="h-8 text-xs mt-1" />
          </div>
          <div>
            <Label className="text-xs">Customer Phone</Label>
            <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="h-8 text-xs mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Voltage Rating</Label>
              <Select value={voltageRating} onValueChange={(v: "6V" | "12V" | "24V") => setVoltageRating(v)}>
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6V">6V Lead-Acid</SelectItem>
                  <SelectItem value="12V">12V Dual Motor</SelectItem>
                  <SelectItem value="24V">24V High Power</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Measured Voltage</Label>
              <Input value={measuredVoltage} onChange={(e) => setMeasuredVoltage(e.target.value)} className="h-8 text-xs mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Battery Serial Number</Label>
            <Input placeholder="e.g. BAT-12V7AH-0982" value={batterySerial} onChange={(e) => setBatterySerial(e.target.value)} className="h-8 text-xs mt-1" required />
          </div>
          <div>
            <Label className="text-xs">Charger Serial / Model</Label>
            <Input placeholder="e.g. CHG-12V-1000MA-01" value={chargerSerial} onChange={(e) => setChargerSerial(e.target.value)} className="h-8 text-xs mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">2.4G Remote Paired?</Label>
              <Select value={remotePaired ? "yes" : "no"} onValueChange={(v) => setRemotePaired(v === "yes")}>
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes (Paired)</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Warranty (Months)</Label>
              <Input type="number" min="0" value={warrantyMonths} onChange={(e) => setWarrantyMonths(e.target.value)} className="h-8 text-xs mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Inspection / Warranty Status</Label>
            <Select value={status} onValueChange={(v: RideonBatteryLog["status"]) => setStatus(v)}>
              <SelectTrigger className="h-8 text-xs mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Passed PDI">Passed PDI</SelectItem>
                <SelectItem value="Charged 100%">Charged 100%</SelectItem>
                <SelectItem value="Warranty Service">Warranty Service</SelectItem>
                <SelectItem value="Replacement Issued">Replacement Issued</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={createMut.isPending} className="bg-cyan-600 hover:bg-cyan-700 text-white">
              {createMut.isPending ? "Saving…" : "Save Battery Log"}
            </Button>
          </div>
        </form>
      </EntityFormDrawer>
    </BackOfficePage>
  );
}

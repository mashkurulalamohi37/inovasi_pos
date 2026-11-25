import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard, StatCard, StatusBadge } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { ListPagination } from "@/components/pulse/ListPagination";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClientPagination } from "@/hooks/use-client-pagination";
import {
  Clock,
  LogOut,
  LogIn,
  Plus,
  RefreshCw,
  Search,
  FilterX,
  Store as StoreIcon,
  UserCheck,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Timer,
  UserX,
} from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useApiStores } from "@/hooks/use-api-config";
import {
  useBulkClockIn,
  useBulkClockOut,
  useBulkMarkAbsent,
  useClockIn,
  useClockOut,
  useCreateAttendance,
  useMiniHrAttendance,
  useMiniHrEmployees,
  type BulkAttendanceResult,
  type MiniHrAttendanceItem,
} from "@/hooks/use-mini-hr";
import { toast } from "sonner";
import { formatApiError, type ApiError } from "@/lib/api";

export const Route = createFileRoute("/app/hr/attendance")({ component: AttendancePage });

function AttendancePage() {
  const useApi = shouldUseBackend();
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  // Filter States
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [storeFilter, setStoreFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Drawer States
  const [openClockInDrawer, setOpenClockInDrawer] = useState(false);
  const [clockInEmployeeId, setClockInEmployeeId] = useState("");
  const [clockInStoreId, setClockInStoreId] = useState("");
  const [clockInNotes, setClockInNotes] = useState("");

  const [clockOutAtt, setClockOutAtt] = useState<MiniHrAttendanceItem | null>(null);
  const [clockOutNotes, setClockOutNotes] = useState("");

  // Roster multi-select (keyed by employee id)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState<"in" | "out" | "absent" | null>(null);

  const [openManualDrawer, setOpenManualDrawer] = useState(false);
  const [manualForm, setManualForm] = useState({
    employee_id: "",
    store_id: "",
    date: todayStr,
    clock_in: "",
    clock_out: "",
    status: "present",
    notes: "",
  });

  // Data Queries
  const employeesQuery = useMiniHrEmployees({}, useApi);
  const storesQuery = useApiStores();
  const attendanceQuery = useMiniHrAttendance(
    {
      date: selectedDate || undefined,
      store_id: storeFilter !== "all" ? storeFilter : undefined,
      employee_id: employeeFilter !== "all" ? employeeFilter : undefined,
    },
    useApi
  );

  // Mutations
  const clockInMut = useClockIn();
  const clockOutMut = useClockOut();
  const createAttMut = useCreateAttendance();
  const bulkClockInMut = useBulkClockIn();
  const bulkClockOutMut = useBulkClockOut();
  const bulkAbsentMut = useBulkMarkAbsent();

  // Maps for lookup
  const employeeMap = useMemo(() => {
    const map = new Map<string, { code: string; name: string; primaryStoreId?: string }>();
    (employeesQuery.data ?? []).forEach(e =>
      map.set(e.id, { code: e.employee_code, name: e.full_name, primaryStoreId: e.primary_store_id ?? undefined })
    );
    return map;
  }, [employeesQuery.data]);

  const storeMap = useMemo(() => {
    const map = new Map<string, string>();
    (storesQuery.data ?? []).forEach(s => map.set(s.id, s.name));
    return map;
  }, [storesQuery.data]);

  // Client filtering & statistics
  const filteredRecords = useMemo(() => {
    let rows = attendanceQuery.data ?? [];
    if (statusFilter !== "all") {
      rows = rows.filter(r => r.status === statusFilter);
    }
    if (search.trim() !== "") {
      const q = search.toLowerCase();
      rows = rows.filter(r => {
        const emp = employeeMap.get(r.employee_id);
        return (
          emp?.name.toLowerCase().includes(q) ||
          emp?.code.toLowerCase().includes(q) ||
          r.notes?.toLowerCase().includes(q)
        );
      });
    }
    return rows;
  }, [attendanceQuery.data, statusFilter, search, employeeMap]);

  const listPage = useClientPagination(
    filteredRecords,
    10,
    `${selectedDate}|${storeFilter}|${employeeFilter}|${statusFilter}|${search}`,
  );

  // Reads from filteredRecords so the Status/Search filters actually move the KPIs.
  const stats = useMemo(() => {
    const rows = filteredRecords;
    const totalCount = rows.length;
    const presentCount = rows.filter(r => r.status === "present").length;
    const lateCount = rows.filter(r => r.status === "late").length;
    const absentCount = rows.filter(r => r.status === "absent").length;
    // An absence has no clock_in, so exclude it from "still on shift".
    const activeShiftCount = rows.filter(r => r.clock_in && !r.clock_out).length;
    const totalMinutes = rows.reduce((acc, r) => acc + (r.duration_minutes || 0), 0);
    const totalHoursFormatted = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;

    return { totalCount, presentCount, lateCount, absentCount, activeShiftCount, totalHoursFormatted };
  }, [filteredRecords]);

  /**
   * Today's roster — one row per active employee joined against today's
   * attendance. The log table only shows people who already clocked in, so this
   * is what makes clocking a whole shift in a single action possible.
   */
  const isToday = selectedDate === todayStr;

  const rosterRows = useMemo(() => {
    if (!isToday) return [];
    const byEmployee = new Map<string, MiniHrAttendanceItem>();
    for (const r of attendanceQuery.data ?? []) {
      // Keep the open shift if there is one, else the latest record.
      const existing = byEmployee.get(r.employee_id);
      if (!existing || !r.clock_out) byEmployee.set(r.employee_id, r);
    }
    const q = search.trim().toLowerCase();
    return (employeesQuery.data ?? [])
      .filter(e => e.employee_status === "active")
      .filter(e => (storeFilter === "all" ? true : e.primary_store_id === storeFilter))
      .filter(e => (employeeFilter === "all" ? true : e.id === employeeFilter))
      .filter(e =>
        !q || e.full_name.toLowerCase().includes(q) || e.employee_code.toLowerCase().includes(q),
      )
      .map(e => {
        const att = byEmployee.get(e.id);
        const state: "not_in" | "active" | "done" | "absent" = !att
          ? "not_in"
          : att.status === "absent"
            ? "absent"
            : att.clock_out
              ? "done"
              : "active";
        return { employee: e, attendance: att, state };
      })
      .sort((a, b) => a.employee.full_name.localeCompare(b.employee.full_name));
  }, [isToday, attendanceQuery.data, employeesQuery.data, storeFilter, employeeFilter, search]);

  // Everyone is actionable: an open shift can be closed, and anyone else can be
  // clocked in — including staff who already finished a shift today, since the
  // backend allows a second entry once the previous one is closed (split shifts).
  const selectableIds = useMemo(() => rosterRows.map(r => r.employee.id), [rosterRows]);
  const allSelectableSelected =
    selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id));

  const toggleSelectAll = () => {
    setSelectedIds(allSelectableSelected ? new Set() : new Set(selectableIds));
  };

  const toggleRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedNotIn = rosterRows.filter(r => r.state !== "active" && selectedIds.has(r.employee.id));
  const selectedActive = rosterRows.filter(r => r.state === "active" && selectedIds.has(r.employee.id));
  // Only someone with no record at all can be marked absent.
  const selectedAbsentable = rosterRows.filter(r => r.state === "not_in" && selectedIds.has(r.employee.id));

  /** Reports all three buckets so a partial batch is never silently swallowed. */
  const reportBulk = (
    result: BulkAttendanceResult,
    doneCount: number,
    verb: string,
  ) => {
    const parts = [`${verb} ${doneCount}`];
    if (result.skipped.length) parts.push(`${result.skipped.length} already done`);
    if (result.failed.length) parts.push(`${result.failed.length} failed`);
    const message = parts.join(" · ");
    if (result.failed.length) toast.error(message);
    else toast.success(message);
  };

  const runBulkClockIn = async () => {
    const ids = selectedNotIn.map(r => r.employee.id);
    if (!ids.length) return;
    try {
      const result = await bulkClockInMut.mutateAsync({
        employee_ids: ids,
        store_id: storeFilter !== "all" ? storeFilter : undefined,
      });
      reportBulk(result, result.clocked_in?.length ?? 0, "Clocked in");
      setSelectedIds(new Set());
    } catch (err) {
      toast.error(formatApiError(err as ApiError));
    } finally {
      setConfirmBulk(null);
    }
  };

  const runBulkClockOut = async () => {
    const ids = selectedActive.map(r => r.attendance!.id);
    if (!ids.length) return;
    try {
      const result = await bulkClockOutMut.mutateAsync({ attendance_ids: ids });
      reportBulk(result, result.clocked_out?.length ?? 0, "Clocked out");
      setSelectedIds(new Set());
    } catch (err) {
      toast.error(formatApiError(err as ApiError));
    } finally {
      setConfirmBulk(null);
    }
  };

  const runBulkMarkAbsent = async () => {
    const ids = selectedAbsentable.map(r => r.employee.id);
    if (!ids.length) return;
    try {
      const result = await bulkAbsentMut.mutateAsync({ employee_ids: ids, date: selectedDate });
      reportBulk(result, result.marked_absent?.length ?? 0, "Marked absent");
      setSelectedIds(new Set());
    } catch (err) {
      toast.error(formatApiError(err as ApiError));
    } finally {
      setConfirmBulk(null);
    }
  };

  /** One-tap row actions — no drawer, no confirm, single record. */
  const quickClockIn = async (employeeId: string) => {
    try {
      await clockInMut.mutateAsync({
        employee_id: employeeId,
        store_id: storeFilter !== "all" ? storeFilter : undefined,
      });
      toast.success("Clock-in recorded");
    } catch (err) {
      toast.error(formatApiError(err as ApiError));
    }
  };

  const quickClockOut = async (attendanceId: string) => {
    try {
      await clockOutMut.mutateAsync({ attendance_id: attendanceId });
      toast.success("Clock-out recorded");
    } catch (err) {
      toast.error(formatApiError(err as ApiError));
    }
  };

  const handleClockIn = async () => {
    if (!clockInEmployeeId) {
      toast.error("Please select an employee");
      return;
    }
    try {
      await clockInMut.mutateAsync({
        employee_id: clockInEmployeeId,
        store_id: clockInStoreId || undefined,
        notes: clockInNotes.trim() || undefined,
      });
      toast.success("Clock-in recorded successfully");
      setOpenClockInDrawer(false);
      setClockInEmployeeId("");
      setClockInStoreId("");
      setClockInNotes("");
    } catch (err) {
      toast.error(formatApiError(err as ApiError));
    }
  };

  const handleClockOut = async () => {
    if (!clockOutAtt) return;
    try {
      await clockOutMut.mutateAsync({
        attendance_id: clockOutAtt.id,
        notes: clockOutNotes.trim() || undefined,
      });
      toast.success("Clock-out recorded successfully");
      setClockOutAtt(null);
      setClockOutNotes("");
    } catch (err) {
      toast.error(formatApiError(err as ApiError));
    }
  };

  const handleManualAttendanceSubmit = async () => {
    if (!manualForm.employee_id || !manualForm.store_id || !manualForm.clock_in) {
      toast.error("Employee, Store, and Clock-In time are required");
      return;
    }
    try {
      await createAttMut.mutateAsync({
        employee_id: manualForm.employee_id,
        store_id: manualForm.store_id,
        date: manualForm.date,
        clock_in: manualForm.clock_in.includes("T") ? manualForm.clock_in : `${manualForm.date}T${manualForm.clock_in}:00`,
        clock_out: manualForm.clock_out ? (manualForm.clock_out.includes("T") ? manualForm.clock_out : `${manualForm.date}T${manualForm.clock_out}:00`) : null,
        status: manualForm.status,
        notes: manualForm.notes.trim() || null,
      });
      toast.success("Manual attendance entry saved");
      setOpenManualDrawer(false);
      // Reset, otherwise reopening shows the previous employee and times.
      setManualForm({
        employee_id: "",
        store_id: "",
        date: todayStr,
        clock_in: "",
        clock_out: "",
        status: "present",
        notes: "",
      });
    } catch (err) {
      toast.error(formatApiError(err as ApiError));
    }
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title="Staff Attendance" subtitle="Backend required" />
        <PageBody><EmptyState title="Backend required" description="Sign in with API enabled to manage staff attendance." /></PageBody>
      </>
    );
  }

  return (
    <PermissionGate perm="hr.view" fallback={<PageBody><ErrorState title="Permission denied" description="Requires hr.view permission" /></PageBody>}>
      <PageHeader
        title="Staff Attendance & Clock-In Tracker"
        subtitle="Track real-time employee check-ins, shift durations, and daily store attendance"
        actions={
          <>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              {attendanceQuery.isFetching
                ? "Refreshing…"
                : attendanceQuery.dataUpdatedAt
                  ? `Updated ${new Date(attendanceQuery.dataUpdatedAt).toLocaleTimeString()}`
                  : ""}
            </span>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => attendanceQuery.refetch()} disabled={attendanceQuery.isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${attendanceQuery.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <PermissionGate perm="hr.employee_manage">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpenManualDrawer(true)}>
                <Plus className="h-3.5 w-3.5" /> Manual Entry
              </Button>
            </PermissionGate>
            <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setOpenClockInDrawer(true)}>
              <LogIn className="h-3.5 w-3.5" /> Quick Clock-In
            </Button>
          </>
        }
      />
      <PageBody>
        {/* KPI Summary Cards — follow the active filters */}
        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Total entries" value={String(stats.totalCount)} icon={<UserCheck className="h-4 w-4" />} />
          <StatCard label="On time" value={String(stats.presentCount)} icon={<CheckCircle2 className="h-4 w-4" />} />
          <StatCard label="Late arrivals" value={String(stats.lateCount)} icon={<AlertCircle className="h-4 w-4" />} />
          <StatCard label="Absent" value={String(stats.absentCount)} icon={<UserX className="h-4 w-4" />} />
          <StatCard label="Active shifts" value={String(stats.activeShiftCount)} icon={<Timer className="h-4 w-4" />} />
          <StatCard label="Total duration" value={stats.totalHoursFormatted} icon={<Clock className="h-4 w-4" />} />
        </div>

        {/* Multi-Filter Bar */}
        <div className="mb-4 rounded-xl border border-border/70 bg-card p-3 shadow-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Date Selector */}
            <div className="flex items-center gap-1.5 bg-background border border-input rounded-md px-2.5 h-9">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="bg-transparent text-xs font-medium focus:outline-none"
              />
            </div>

            {/* Store Filter */}
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 text-xs"
              value={storeFilter}
              onChange={e => setStoreFilter(e.target.value)}
            >
              <option value="all">All Stores</option>
              {(storesQuery.data ?? []).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            {/* Employee Filter */}
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 text-xs"
              value={employeeFilter}
              onChange={e => setEmployeeFilter(e.target.value)}
            >
              <option value="all">All Staff</option>
              {(employeesQuery.data ?? []).map(e => (
                <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 text-xs"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="present">Present (On Time)</option>
              <option value="late">Late Arrival</option>
              <option value="half_day">Half Day</option>
              <option value="absent">Absent</option>
            </select>

            {/* Search Input */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search staff name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>

            {selectedDate !== todayStr || storeFilter !== "all" || employeeFilter !== "all" || statusFilter !== "all" || search !== "" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedDate(todayStr);
                  setStoreFilter("all");
                  setEmployeeFilter("all");
                  setStatusFilter("all");
                  setSearch("");
                }}
                className="h-9 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
              >
                <FilterX className="h-3.5 w-3.5" /> Clear
              </Button>
            ) : null}
          </div>
        </div>

        {/* ── Today's roster — bulk clock-in / clock-out ──────────────────── */}
        <PermissionGate perm="hr.employee_manage">
          {isToday ? (
            <div className="mb-4">
              {selectedIds.size > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
                  <span className="text-sm font-medium">{selectedIds.size} selected</span>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={selectedNotIn.length === 0 || bulkClockInMut.isPending}
                      onClick={() => setConfirmBulk("in")}
                    >
                      <LogIn className="mr-1.5 h-3.5 w-3.5" /> Clock in {selectedNotIn.length}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={selectedActive.length === 0 || bulkClockOutMut.isPending}
                      onClick={() => setConfirmBulk("out")}
                    >
                      <LogOut className="mr-1.5 h-3.5 w-3.5" /> Clock out {selectedActive.length}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={selectedAbsentable.length === 0 || bulkAbsentMut.isPending}
                      onClick={() => setConfirmBulk("absent")}
                    >
                      <UserX className="mr-1.5 h-3.5 w-3.5" /> Mark absent {selectedAbsentable.length}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                      Clear
                    </Button>
                  </div>
                </div>
              )}

              <SectionCard title={`Today's roster — ${rosterRows.length} staff`}>
                {rosterRows.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                    No active staff match the current filters.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary/50">
                        <tr className="border-b text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <th className="w-10 py-2.5 pl-5">
                            <input
                              type="checkbox"
                              aria-label="Select all staff"
                              checked={allSelectableSelected}
                              onChange={toggleSelectAll}
                              disabled={selectableIds.length === 0}
                            />
                          </th>
                          <th className="py-2.5 pr-3">Employee</th>
                          <th className="py-2.5 pr-3">Shift</th>
                          <th className="py-2.5 pr-5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {rosterRows.map(({ employee, attendance, state }) => (
                          <tr key={employee.id} className="transition-colors hover:bg-muted/40">
                            <td className="py-2.5 pl-5">
                              <input
                                type="checkbox"
                                aria-label={`Select ${employee.full_name}`}
                                checked={selectedIds.has(employee.id)}
                                onChange={() => toggleRow(employee.id)}
                              />
                            </td>
                            <td className="py-2.5 pr-3">
                              <div className="font-medium text-foreground">{employee.full_name}</div>
                              <div className="font-mono text-xs text-muted-foreground">{employee.employee_code}</div>
                            </td>
                            <td className="py-2.5 pr-3 text-xs">
                              {state === "not_in" && <span className="text-muted-foreground">Not clocked in</span>}
                              {state === "active" && (
                                <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/10 px-2 py-0.5 font-medium text-blue-600 dark:text-blue-400">
                                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                                  Active since {attendance ? new Date(attendance.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                                </span>
                              )}
                              {state === "done" && (
                                <span className="text-muted-foreground">
                                  Completed{attendance?.duration_minutes != null
                                    ? ` · ${Math.floor(attendance.duration_minutes / 60)}h ${attendance.duration_minutes % 60}m`
                                    : ""}
                                </span>
                              )}
                              {state === "absent" && (
                                <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/10 px-2 py-0.5 font-medium text-rose-600 dark:text-rose-400">
                                  <UserX className="h-3 w-3" /> Absent
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 pr-5 text-right">
                              {state === "absent" ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : state === "active" && attendance ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 border-rose-600/30 px-2 text-xs text-rose-600 hover:bg-rose-500/10"
                                  disabled={clockOutMut.isPending}
                                  onClick={() => void quickClockOut(attendance.id)}
                                >
                                  <LogOut className="h-3 w-3" /> Clock out
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 px-2 text-xs"
                                  disabled={clockInMut.isPending}
                                  onClick={() => void quickClockIn(employee.id)}
                                >
                                  <LogIn className="h-3 w-3" /> Clock in
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            </div>
          ) : (
            <div className="mb-4 rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              Clock-in always records the current date, so the roster is only available for today. Use{" "}
              <span className="font-medium text-foreground">Manual Entry</span> to record attendance for {selectedDate}.
            </div>
          )}
        </PermissionGate>

        {/* States */}
        {attendanceQuery.isLoading ? <LoadingState /> : null}
        {attendanceQuery.isError ? (
          <ErrorState title="Failed to load attendance" description="Could not load attendance logs." onRetry={() => attendanceQuery.refetch()} />
        ) : null}
        {!attendanceQuery.isLoading && filteredRecords.length === 0 ? (
          <EmptyState
            title="No attendance records"
            description="No staff clock-in records logged for the selected date and filters."
          />
        ) : null}

        {/* Attendance Log Table */}
        {filteredRecords.length > 0 ? (
          <SectionCard title={`Attendance Logs — ${selectedDate}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50">
                  <tr className="border-b text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="py-2.5 pl-5 pr-3">Employee</th>
                    <th className="py-2.5 pr-3">Store Location</th>
                    <th className="py-2.5 pr-3">Clock In</th>
                    <th className="py-2.5 pr-3">Clock Out</th>
                    <th className="py-2.5 pr-3">Shift Duration</th>
                    <th className="py-2.5 pr-3">Status</th>
                    <th className="py-2.5 pr-3">Notes</th>
                    <th className="py-2.5 pr-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {listPage.pageItems.map(r => {
                    const emp = employeeMap.get(r.employee_id);
                    const storeName = storeMap.get(r.store_id) || "—";
                    // An absence has no times at all, so it must not render as an
                    // open shift ("Active" / "In Progress" / a Clock Out button).
                    const isAbsent = r.status === "absent" || !r.clock_in;
                    const clockInFormatted = r.clock_in ? new Date(r.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
                    const clockOutFormatted = r.clock_out ? new Date(r.clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Active Shift";
                    const durationText = isAbsent
                      ? "—"
                      : r.duration_minutes !== null && r.duration_minutes !== undefined
                        ? `${Math.floor(r.duration_minutes / 60)}h ${r.duration_minutes % 60}m`
                        : "In Progress";

                    return (
                      <tr key={r.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 pl-5 pr-3">
                          <div className="font-medium text-foreground">{emp?.name || "Unknown"}</div>
                          <div className="font-mono text-xs text-muted-foreground">{emp?.code || r.employee_id}</div>
                        </td>
                        <td className="py-3 pr-3 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1"><StoreIcon className="h-3.5 w-3.5 text-muted-foreground/70" />{storeName}</div>
                        </td>
                        <td className="py-3 pr-3 font-mono text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                          {clockInFormatted}
                        </td>
                        <td className="py-3 pr-3 font-mono text-xs">
                          {isAbsent ? (
                            <span className="text-muted-foreground">—</span>
                          ) : r.clock_out ? (
                            <span className="text-foreground font-medium">{clockOutFormatted}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                              <Timer className="h-3 w-3 animate-spin" /> Active
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-xs font-mono font-medium text-foreground">{durationText}</td>
                        <td className="py-3 pr-3"><StatusBadge status={r.status} /></td>
                        <td className="py-3 pr-3 text-xs text-muted-foreground">{r.notes || "—"}</td>
                        <td className="py-3 pr-5 text-right">
                          {!r.clock_out && !isAbsent ? (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 text-rose-600 border-rose-600/30 hover:bg-rose-500/10" onClick={() => setClockOutAtt(r)}>
                              <LogOut className="h-3 w-3" /> Clock Out
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">{isAbsent ? "—" : "Completed"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ListPagination
              page={listPage.page}
              pageSize={listPage.pageSize}
              total={listPage.total}
              onPageChange={listPage.setPage}
            />
          </SectionCard>
        ) : null}
      </PageBody>

      {/* Bulk confirmation — posting actions go through ConfirmActionDialog */}
      <ConfirmActionDialog
        open={confirmBulk !== null}
        onOpenChange={open => { if (!open) setConfirmBulk(null); }}
        title={
          confirmBulk === "out"
            ? "Clock out selected staff?"
            : confirmBulk === "absent"
              ? "Mark selected staff absent?"
              : "Clock in selected staff?"
        }
        description={
          confirmBulk === "out"
            ? `${selectedActive.length} open shift${selectedActive.length === 1 ? "" : "s"} will be closed at the current time. This is audited.`
            : confirmBulk === "absent"
              ? `${selectedAbsentable.length} employee${selectedAbsentable.length === 1 ? "" : "s"} will be recorded absent for ${selectedDate}. Absences carry no clock times and do not count towards shift hours. This is audited.`
              : `${selectedNotIn.length} employee${selectedNotIn.length === 1 ? "" : "s"} will be clocked in at the current time. Anyone already clocked in is skipped. This is audited.`
        }
        confirmLabel={
          confirmBulk === "out" ? "Clock out" : confirmBulk === "absent" ? "Mark absent" : "Clock in"
        }
        destructive={confirmBulk === "absent"}
        isPending={bulkClockInMut.isPending || bulkClockOutMut.isPending || bulkAbsentMut.isPending}
        onConfirm={async () => {
          if (confirmBulk === "out") await runBulkClockOut();
          else if (confirmBulk === "absent") await runBulkMarkAbsent();
          else await runBulkClockIn();
        }}
      />

      {/* Quick Clock-In Drawer */}
      <EntityFormDrawer
        open={openClockInDrawer}
        onOpenChange={setOpenClockInDrawer}
        title="Quick Clock-In — Store Staff"
        onSubmit={handleClockIn}
        isPending={clockInMut.isPending}
      >
        <div className="grid gap-3">
          <div>
            <Label>Select Employee *</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={clockInEmployeeId}
              onChange={e => {
                const empId = e.target.value;
                setClockInEmployeeId(empId);
                const emp = employeeMap.get(empId);
                if (emp?.primaryStoreId) setClockInStoreId(emp.primaryStoreId);
              }}
            >
              <option value="">— Select Employee —</option>
              {(employeesQuery.data ?? []).map(e => (
                <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Store Location</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={clockInStoreId}
              onChange={e => setClockInStoreId(e.target.value)}
            >
              <option value="">— Select Store —</option>
              {(storesQuery.data ?? []).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Notes / Shift Remarks</Label>
            <Input value={clockInNotes} onChange={e => setClockInNotes(e.target.value)} placeholder="Optional shift start remarks..." />
          </div>
        </div>
      </EntityFormDrawer>

      {/* Quick Clock-Out Drawer */}
      <EntityFormDrawer
        open={Boolean(clockOutAtt)}
        onOpenChange={o => { if (!o) setClockOutAtt(null); }}
        title={`Clock-Out — ${clockOutAtt ? employeeMap.get(clockOutAtt.employee_id)?.name : ""}`}
        onSubmit={handleClockOut}
        isPending={clockOutMut.isPending}
      >
        <div className="grid gap-3">
          <div>
            <Label>Clock-Out Notes / End of Shift Remarks</Label>
            <Input value={clockOutNotes} onChange={e => setClockOutNotes(e.target.value)} placeholder="e.g. Completed register closing balance..." />
          </div>
        </div>
      </EntityFormDrawer>

      {/* Manual Attendance Entry Drawer */}
      <EntityFormDrawer
        open={openManualDrawer}
        onOpenChange={setOpenManualDrawer}
        title="Manual Attendance Override"
        onSubmit={handleManualAttendanceSubmit}
        isPending={createAttMut.isPending}
      >
        <div className="grid gap-3">
          <div>
            <Label>Select Employee *</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={manualForm.employee_id}
              onChange={e => setManualForm(f => ({ ...f, employee_id: e.target.value }))}
            >
              <option value="">— Select Employee —</option>
              {(employeesQuery.data ?? []).map(e => (
                <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Select Store *</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={manualForm.store_id}
              onChange={e => setManualForm(f => ({ ...f, store_id: e.target.value }))}
            >
              <option value="">— Select Store —</option>
              {(storesQuery.data ?? []).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Attendance Date *</Label>
            <Input type="date" value={manualForm.date} onChange={e => setManualForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Clock In Time *</Label>
              <Input type="time" value={manualForm.clock_in} onChange={e => setManualForm(f => ({ ...f, clock_in: e.target.value }))} />
            </div>
            <div>
              <Label>Clock Out Time</Label>
              <Input type="time" value={manualForm.clock_out} onChange={e => setManualForm(f => ({ ...f, clock_out: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Attendance Status</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={manualForm.status}
              onChange={e => setManualForm(f => ({ ...f, status: e.target.value }))}
            >
              <option value="present">Present (On Time)</option>
              <option value="late">Late Arrival</option>
              <option value="half_day">Half Day</option>
              <option value="absent">Absent</option>
            </select>
          </div>
          <div>
            <Label>Override Notes</Label>
            <Input value={manualForm.notes} onChange={e => setManualForm(f => ({ ...f, notes: e.target.value }))} placeholder="Reason for manual entry..." />
          </div>
        </div>
      </EntityFormDrawer>
    </PermissionGate>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useMiniHrShiftRoster,
  useUpsertShift,
  useDeleteShift,
  useMiniHrEmployees,
  type MiniHrShiftRosterItem,
} from "@/hooks/use-mini-hr";
import { useApiStores } from "@/hooks/use-api-config";
import { shouldUseBackend } from "@/lib/demo-mode";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { ListPagination } from "@/components/pulse/ListPagination";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { ChevronLeft, ChevronRight, Building2, RefreshCw, Trash2, X, Printer } from "lucide-react";
import { openPrintDocument, escapeHtml } from "@/lib/print-document";
import { toast } from "sonner";

export const Route = createFileRoute("/app/hr/shifts")({
  component: ShiftRosterPage,
});

// Shift config
const SHIFT_TYPES = [
  { value: "morning", label: "Morning", emoji: "🌅", color: "#f59e0b", bg: "#fffbeb", border: "#fcd34d" },
  { value: "afternoon", label: "Afternoon", emoji: "🌤️", color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
  { value: "evening", label: "Evening", emoji: "🌆", color: "#4f46e5", bg: "#eef2ff", border: "#c7d2fe" },
  { value: "night", label: "Night", emoji: "🌙", color: "#1e3a8a", bg: "#eff6ff", border: "#bfdbfe" },
  { value: "off", label: "Day Off", emoji: "🔴", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
] as const;

const SHIFT_MAP = Object.fromEntries(SHIFT_TYPES.map((s) => [s.value, s]));

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0=Sun, 1=Mon
  const diff = (day === 0 ? -6 : 1 - day);
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatWeekRange(start: Date): string {
  const end = addDays(start, 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${start.toLocaleDateString("en-GB", opts)} – ${end.toLocaleDateString("en-GB", { ...opts, year: "numeric" })}`;
}

type Popover = { empId: string; date: string; existingId?: string; existingShift?: string } | null;

function ShiftRosterPage() {
  const useApi = shouldUseBackend();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [selectedStore, setSelectedStore] = useState("");
  const [popover, setPopover] = useState<Popover>(null);

  const weekStartIso = toIso(weekStart);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const rosterQuery = useMiniHrShiftRoster(
    { week_start: weekStartIso, store_id: selectedStore || undefined },
    useApi,
  );
  const empQuery = useMiniHrEmployees(undefined, useApi);
  const storesQuery = useApiStores();
  const upsertMutation = useUpsertShift();
  const deleteMutation = useDeleteShift();

  const employees = empQuery.data ?? [];
  const stores = storesQuery.data ?? [];
  const rosterItems = rosterQuery.data ?? [];
  const empPage = useClientPagination(employees, 10, `${selectedStore}|${weekStartIso}|${employees.length}`);

  // Build lookup: empId+date -> roster item
  const rosterMap = useMemo(() => {
    const m: Record<string, MiniHrShiftRosterItem> = {};
    rosterItems.forEach((r) => {
      m[`${r.employee_id}__${r.shift_date}`] = r;
    });
    return m;
  }, [rosterItems]);

  function prevWeek() { setWeekStart((d) => addDays(d, -7)); }
  function nextWeek() { setWeekStart((d) => addDays(d, 7)); }
  function goToday() { setWeekStart(getMonday(new Date())); }

  function openPopover(empId: string, date: string) {
    const existing = rosterMap[`${empId}__${date}`];
    setPopover({ empId, date, existingId: existing?.id, existingShift: existing?.shift_type });
  }

  function closePopover() { setPopover(null); }

  async function assignShift(shiftType: string) {
    if (!popover) return;
    await upsertMutation.mutateAsync({
      employee_id: popover.empId,
      shift_date: popover.date,
      shift_type: shiftType,
      store_id: selectedStore || undefined,
    });
    closePopover();
  }

  async function clearShift() {
    if (!popover?.existingId) return;
    await deleteMutation.mutateAsync(popover.existingId);
    closePopover();
  }

  function handlePrint() {
    const storeName = selectedStore
      ? stores.find((s) => s.id === selectedStore)?.name || "Store"
      : "All Stores";
    const rangeText = formatWeekRange(weekStart);

    let bodyHtml = `<table><thead><tr><th style="text-align:left;">Employee</th>`;
    weekDays.forEach((d, i) => {
      bodyHtml += `<th>${DAY_LABELS[i]}<br/><span style="font-weight:normal;font-size:9px;">${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></th>`;
    });
    bodyHtml += `</tr></thead><tbody>`;

    if (employees.length === 0) {
      bodyHtml += `<tr><td colspan="8" class="empty">No employees found</td></tr>`;
    } else {
      employees.forEach((emp) => {
        bodyHtml += `<tr><td><b>${escapeHtml(emp.full_name || emp.first_name)}</b><br/><span style="font-size:9px;color:#64748b;">${escapeHtml(emp.employee_code || "")}</span></td>`;
        weekDays.forEach((d) => {
          const iso = toIso(d);
          const entry = rosterMap[`${emp.id}__${iso}`];
          const shift = entry ? SHIFT_MAP[entry.shift_type] : null;
          if (shift) {
            bodyHtml += `<td style="text-align:center;background:${shift.bg};color:${shift.color};font-weight:600;">${shift.emoji} ${escapeHtml(shift.label)}</td>`;
          } else {
            bodyHtml += `<td style="text-align:center;color:#cbd5e1;">—</td>`;
          }
        });
        bodyHtml += `</tr>`;
      });
    }

    bodyHtml += `</tbody></table>`;

    const ok = openPrintDocument({
      title: "Shift Roster & Schedule",
      subtitle: "Weekly employee shift roster",
      orientation: "landscape",
      meta: [
        { label: "Week", value: rangeText },
        { label: "Store", value: storeName },
        { label: "Printed", value: new Date().toLocaleString() },
      ],
      bodyHtml,
    });

    if (!ok) {
      toast.error("Pop-up blocked. Please allow pop-ups to print the roster.");
    }
  }

  if (!useApi) {
    return (
      <>
        <PageHeader title="Shift Roster" subtitle="Connect backend to manage shifts." />
        <PageBody><EmptyState title="Backend required" description="Sign in with API enabled." /></PageBody>
      </>
    );
  }

  const isLoading = rosterQuery.isLoading || empQuery.isLoading;
  const isError = rosterQuery.isError || empQuery.isError;
  const isMutating = upsertMutation.isPending || deleteMutation.isPending;

  return (
    <>
      <PageHeader
        title="Shift Roster & Schedule"
        subtitle="Assign and manage weekly shift schedules across your stores"
        actions={
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button onClick={handlePrint} style={btnOutline}>
              <Printer size={13} />
              Print Roster
            </button>
            <button onClick={() => rosterQuery.refetch()} style={btnOutline}>
              <RefreshCw size={13} style={{ animation: rosterQuery.isFetching ? "spin 1s linear infinite" : "none" }} />
              Refresh
            </button>
          </div>
        }
      />

      <PageBody>
        {/* Controls */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", marginBottom: "1.25rem" }}>
          {/* Week nav */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "0.625rem", padding: "0.25rem" }}>
            <button onClick={prevWeek} style={iconBtn}><ChevronLeft size={16} /></button>
            <span style={{ padding: "0 0.625rem", fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-text-primary)", minWidth: "170px", textAlign: "center" }}>
              {formatWeekRange(weekStart)}
            </span>
            <button onClick={nextWeek} style={iconBtn}><ChevronRight size={16} /></button>
          </div>
          <button onClick={goToday} style={btnOutline}>Today</button>

          {/* Store filter */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Building2 size={14} style={{ color: "var(--color-text-muted)" }} />
            <select value={selectedStore} onChange={(e) => setSelectedStore(e.target.value)} style={selectStyle}>
              <option value="">All Stores</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* Shift legend */}
          <div style={{ display: "flex", gap: "0.5rem", marginLeft: "auto" }}>
            {SHIFT_TYPES.map((s) => (
              <span key={s.value} style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.7rem", fontWeight: 500, padding: "0.2rem 0.5rem", borderRadius: "0.375rem", background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                {s.emoji} {s.label}
              </span>
            ))}
          </div>
        </div>

        {/* Roster Grid */}
        <SectionCard className="p-0 overflow-hidden">
          {isLoading ? (
            <div style={{ padding: "4rem" }}><LoadingState /></div>
          ) : isError ? (
            <ErrorState title="Failed to load roster" description="Check backend connection." onRetry={() => rosterQuery.refetch()} />
          ) : employees.length === 0 ? (
            <EmptyState title="No employees found" description="Add employees to start building a roster." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                <thead>
                  <tr style={{ background: "rgba(0,0,0,0.025)", borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ ...thStyle, textAlign: "left", minWidth: "160px" }}>Employee</th>
                    {weekDays.map((d, i) => {
                      const iso = toIso(d);
                      const isToday = iso === toIso(new Date());
                      return (
                        <th key={iso} style={{ ...thStyle, minWidth: "110px", color: isToday ? "#4f46e5" : undefined, background: isToday ? "#eef2ff" : undefined }}>
                          <div>{DAY_LABELS[i]}</div>
                          <div style={{ fontSize: "0.7rem", fontWeight: 400, opacity: 0.75 }}>
                            {d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {empPage.pageItems.map((emp, idx) => (
                    <tr key={emp.id} style={{ borderBottom: idx < empPage.pageItems.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                      <td style={{ padding: "0.625rem 1rem" }}>
                        <div style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{emp.full_name || emp.first_name}</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>{emp.employee_code}</div>
                      </td>
                      {weekDays.map((d) => {
                        const iso = toIso(d);
                        const entry = rosterMap[`${emp.id}__${iso}`];
                        const shift = entry ? SHIFT_MAP[entry.shift_type] : null;
                        return (
                          <td
                            key={iso}
                            onClick={() => openPopover(emp.id, iso)}
                            style={{
                              padding: "0.5rem 0.625rem",
                              textAlign: "center",
                              cursor: "pointer",
                              transition: "background 0.1s",
                              background: shift ? shift.bg : "transparent",
                              borderLeft: "1px solid var(--color-border)",
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(0.97)"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ""; }}
                          >
                            {shift ? (
                              <span style={{
                                display: "inline-flex", alignItems: "center", gap: "0.25rem",
                                padding: "0.2rem 0.5rem", borderRadius: "0.375rem",
                                background: shift.bg, color: shift.color, border: `1px solid ${shift.border}`,
                                fontSize: "0.72rem", fontWeight: 600,
                              }}>
                                {shift.emoji} {shift.label}
                              </span>
                            ) : (
                              <span style={{ color: "var(--color-text-muted)", fontSize: "0.7rem", opacity: 0.4 }}>—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {employees.length > 0 ? (
            <ListPagination
              page={empPage.page}
              pageSize={empPage.pageSize}
              total={empPage.total}
              onPageChange={empPage.setPage}
            />
          ) : null}
        </SectionCard>

        {/* Shift Assignment Popover */}
        {popover && (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)" }}
            onClick={closePopover}
          >
            <div
              style={{ background: "var(--color-surface)", borderRadius: "1rem", padding: "1.5rem", width: "320px", boxShadow: "0 25px 60px rgba(0,0,0,0.25)", border: "1px solid var(--color-border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.9375rem" }}>Assign Shift</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.1rem" }}>
                    {new Date(popover.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                  </div>
                </div>
                <button onClick={closePopover} style={{ ...iconBtn, color: "var(--color-text-muted)" }}><X size={16} /></button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "1rem" }}>
                {SHIFT_TYPES.map((s) => (
                  <button
                    key={s.value}
                    disabled={isMutating}
                    onClick={() => assignShift(s.value)}
                    style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      padding: "0.625rem 0.875rem", borderRadius: "0.5rem",
                      background: popover.existingShift === s.value ? s.bg : "var(--color-surface)",
                      color: s.color, border: `1.5px solid ${popover.existingShift === s.value ? s.border : "var(--color-border)"}`,
                      fontWeight: 600, fontSize: "0.8125rem", cursor: "pointer",
                      transition: "all 0.15s",
                      boxShadow: popover.existingShift === s.value ? `0 0 0 2px ${s.border}` : "none",
                    }}
                  >
                    <span>{s.emoji}</span>{s.label}
                  </button>
                ))}
              </div>

              {popover.existingId && (
                <button
                  onClick={clearShift}
                  disabled={isMutating}
                  style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%", justifyContent: "center", padding: "0.5rem", borderRadius: "0.5rem", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" }}
                >
                  <Trash2 size={13} /> Clear Shift
                </button>
              )}
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}

// Styles
const btnOutline: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "0.375rem",
  padding: "0.4rem 0.75rem", borderRadius: "0.5rem",
  border: "1px solid var(--color-border)", background: "var(--color-surface)",
  color: "var(--color-text-secondary)", cursor: "pointer",
  fontSize: "0.8125rem", fontWeight: 500,
};

const iconBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: "28px", height: "28px", borderRadius: "0.375rem",
  border: "none", background: "transparent",
  cursor: "pointer", color: "var(--color-text-primary)",
};

const thStyle: React.CSSProperties = {
  padding: "0.625rem 0.75rem",
  fontWeight: 600, fontSize: "0.72rem",
  color: "var(--color-text-muted)", textTransform: "uppercase",
  letterSpacing: "0.04em", textAlign: "center",
};

const selectStyle: React.CSSProperties = {
  padding: "0.4rem 0.65rem", borderRadius: "0.5rem",
  border: "1px solid var(--color-border)", background: "var(--color-surface)",
  color: "var(--color-text-primary)", fontSize: "0.8125rem", cursor: "pointer",
};

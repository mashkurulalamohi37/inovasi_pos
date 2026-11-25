import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useMiniHrLeave,
  useCreateLeaveRequest,
  useApproveLeave,
  useRejectLeave,
  useCancelLeave,
  useMiniHrEmployees,
  type MiniHrLeaveItem,
} from "@/hooks/use-mini-hr";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { ListPagination } from "@/components/pulse/ListPagination";
import { useClientPagination } from "@/hooks/use-client-pagination";
import {
  CalendarDays,
  CheckCircle2,
  XCircle,
  Clock,
  Stethoscope,
  RefreshCw,
  Plus,
  Search,
  ThumbsUp,
  ThumbsDown,
  Ban,
  FileText,
  CalendarCheck,
} from "lucide-react";

export const Route = createFileRoute("/app/hr/leave")({
  component: LeaveManagementPage,
});

// ─── Constants ────────────────────────────────────────────────────────────────

const LEAVE_TYPES = [
  { value: "annual",    label: "Annual Leave", color: "#3b82f6", icon: "🏖️" },
  { value: "sick",      label: "Sick Leave",   color: "#ef4444", icon: "🤒" },
  { value: "emergency", label: "Emergency",    color: "#f97316", icon: "🚨" },
  { value: "unpaid",    label: "Unpaid Leave", color: "#8b5cf6", icon: "💼" },
  { value: "other",     label: "Other",        color: "#6b7280", icon: "📋" },
];

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending:   { bg: "rgba(245,158,11,0.12)",  color: "#d97706", label: "Pending"   },
  approved:  { bg: "rgba(16,185,129,0.12)",  color: "#059669", label: "Approved"  },
  rejected:  { bg: "rgba(239,68,68,0.12)",   color: "#dc2626", label: "Rejected"  },
  cancelled: { bg: "rgba(107,114,128,0.12)", color: "#6b7280", label: "Cancelled" },
};

function leaveTypeInfo(type: string) {
  return LEAVE_TYPES.find((t) => t.value === type) ?? { value: type, label: type, color: "#6b7280", icon: "📋" };
}

function fmtDateRange(start: string, end: string) {
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
  const s = new Date(start + "T00:00:00").toLocaleDateString("en-GB", opts);
  const e = new Date(end   + "T00:00:00").toLocaleDateString("en-GB", { ...opts, year: "numeric" });
  return start === end ? e : `${s} – ${e}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function LeaveManagementPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter,   setTypeFilter]   = useState("");
  const [empFilter,    setEmpFilter]    = useState("");
  const [search,       setSearch]       = useState("");
  const [fromDate,     setFromDate]     = useState("");
  const [toDate,       setToDate]       = useState("");

  const [submitOpen, setSubmitOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState<{ mode: "approve" | "reject"; item: MiniHrLeaveItem } | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const leaveQuery = useMiniHrLeave({
    status:      statusFilter || undefined,
    leave_type:  typeFilter   || undefined,
    employee_id: empFilter    || undefined,
    from_date:   fromDate     || undefined,
    to_date:     toDate       || undefined,
  });

  const empQuery = useMiniHrEmployees();
  const employees = empQuery.data ?? [];

  const summary = leaveQuery.data?.summary ?? { total: 0, pending: 0, approved: 0, rejected: 0, approved_days: 0, sick_days: 0 };
  const items   = leaveQuery.data?.items   ?? [];

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (r) =>
        r.employee_name?.toLowerCase().includes(q) ||
        r.employee_code?.toLowerCase().includes(q) ||
        r.reason?.toLowerCase().includes(q),
    );
  }, [items, search]);

  const listPage = useClientPagination(
    filtered,
    10,
    `${statusFilter}|${typeFilter}|${empFilter}|${search}|${fromDate}|${toDate}`,
  );

  const createLeave  = useCreateLeaveRequest();
  const approveLeave = useApproveLeave();
  const rejectLeave  = useRejectLeave();
  const cancelLeave  = useCancelLeave();

  const [form, setForm] = useState({ employee_id: "", leave_type: "annual", start_date: "", end_date: "", reason: "" });

  async function handleSubmitLeave() {
    if (!form.employee_id || !form.start_date || !form.end_date) return;
    await createLeave.mutateAsync({ ...form });
    setSubmitOpen(false);
    setForm({ employee_id: "", leave_type: "annual", start_date: "", end_date: "", reason: "" });
  }

  async function handleReview() {
    if (!reviewOpen) return;
    if (reviewOpen.mode === "approve") {
      await approveLeave.mutateAsync({ leave_id: reviewOpen.item.id, review_notes: reviewNotes });
    } else {
      await rejectLeave.mutateAsync({ leave_id: reviewOpen.item.id, review_notes: reviewNotes });
    }
    setReviewOpen(null);
    setReviewNotes("");
  }

  async function handleCancel(item: MiniHrLeaveItem) {
    if (!confirm(`Cancel leave request for ${item.employee_name}?`)) return;
    await cancelLeave.mutateAsync(item.id);
  }

  const autodays = form.start_date && form.end_date
    ? Math.max(1, Math.floor((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000) + 1)
    : null;

  return (
    <>
      <PageHeader
        title="Leave & Time-Off Management"
        subtitle="Review, approve, and track employee leave requests across all stores"
        actions={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              id="leave-refresh-btn"
              onClick={() => leaveQuery.refetch()}
              style={{
                display: "flex", alignItems: "center", gap: "0.375rem",
                padding: "0.5rem 0.875rem", borderRadius: "0.5rem",
                border: "1px solid var(--color-border)", background: "var(--color-surface)",
                color: "var(--color-text-secondary)", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 500,
              }}
            >
              <RefreshCw size={14} style={{ animation: leaveQuery.isFetching ? "spin 1s linear infinite" : "none" }} />
              Refresh
            </button>
            <button
              id="leave-submit-btn"
              onClick={() => setSubmitOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: "0.375rem",
                padding: "0.5rem 1rem", borderRadius: "0.5rem",
                background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
                color: "#fff", border: "none", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600,
                boxShadow: "0 2px 8px rgba(59,130,246,0.35)",
              }}
            >
              <Plus size={15} /> Submit Leave Request
            </button>
          </div>
        }
      />

      <PageBody>
        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
          <KpiCard icon={<FileText size={17} />}      label="Total Requests"     value={summary.total}         color="#6b7280" />
          <KpiCard icon={<Clock size={17} />}         label="Pending"            value={summary.pending}       color="#f59e0b" highlight={summary.pending > 0} />
          <KpiCard icon={<CheckCircle2 size={17} />}  label="Approved"           value={summary.approved}      color="#10b981" />
          <KpiCard icon={<XCircle size={17} />}       label="Rejected"           value={summary.rejected}      color="#ef4444" />
          <KpiCard icon={<CalendarDays size={17} />}  label="Approved Days"      value={summary.approved_days} color="#3b82f6" decimal />
          <KpiCard icon={<Stethoscope size={17} />}   label="Sick Days Used"     value={summary.sick_days}     color="#8b5cf6" decimal />
        </div>

        {/* Filters */}
        <SectionCard title="Filters" className="mb-5">
          <div className="grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <Label>From</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div>
              <Label>To</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>

            <div>
              <Label>Status</Label>
              <select
                className="mt-1 h-9 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <Label>Leave Type</Label>
              <select
                className="mt-1 h-9 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">All Leave Types</option>
                {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
              </select>
            </div>

            <div>
              <Label>Staff</Label>
              <select
                className="mt-1 h-9 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm"
                value={empFilter}
                onChange={(e) => setEmpFilter(e.target.value)}
              >
                <option value="">All Staff</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name || e.first_name} ({e.employee_code})</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search name or reason…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Table */}
        <SectionCard className="p-0 overflow-hidden">
          {leaveQuery.isLoading ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-text-muted)" }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <EmptyLeave />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8375rem" }}>
                <thead>
                  <tr style={{ background: "rgba(0,0,0,0.03)", borderBottom: "1px solid var(--color-border)" }}>
                    {["Employee", "Leave Type", "Date Range", "Days", "Reason", "Status", "Actions"].map((h) => (
                      <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", fontWeight: 600, fontSize: "0.72rem", color: "var(--color-text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.04em", whiteSpace: "nowrap" as const }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {listPage.pageItems.map((item, idx) => {
                    const lt  = leaveTypeInfo(item.leave_type);
                    const st  = STATUS_STYLES[item.status] ?? STATUS_STYLES.cancelled;
                    return (
                      <tr key={item.id} style={{ borderBottom: idx < listPage.pageItems.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                        {/* Employee */}
                        <td style={{ padding: "0.875rem 1rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                            <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${lt.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.8rem", color: lt.color, flexShrink: 0 }}>
                              {(item.employee_name || "?").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600 }}>{item.employee_name || "—"}</div>
                              <div style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>{item.employee_code}</div>
                            </div>
                          </div>
                        </td>

                        {/* Type */}
                        <td style={{ padding: "0.875rem 1rem" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", padding: "0.25rem 0.625rem", borderRadius: "99px", background: `${lt.color}18`, color: lt.color, fontWeight: 600, fontSize: "0.75rem" }}>
                            {lt.icon} {lt.label}
                          </span>
                        </td>

                        {/* Dates */}
                        <td style={{ padding: "0.875rem 1rem", color: "var(--color-text-secondary)", whiteSpace: "nowrap" as const }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            <CalendarDays size={13} style={{ color: "var(--color-text-muted)" }} />
                            {fmtDateRange(item.start_date, item.end_date)}
                          </div>
                        </td>

                        {/* Days */}
                        <td style={{ padding: "0.875rem 1rem" }}>
                          <span style={{ padding: "0.2rem 0.5rem", borderRadius: "0.375rem", background: "rgba(0,0,0,0.04)", fontWeight: 700, fontSize: "0.8rem" }}>
                            {item.total_days}d
                          </span>
                        </td>

                        {/* Reason */}
                        <td style={{ padding: "0.875rem 1rem", maxWidth: 200 }}>
                          {item.reason
                            ? <span style={{ color: "var(--color-text-secondary)" }}>{item.reason}</span>
                            : <span style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>—</span>}
                        </td>

                        {/* Status badge */}
                        <td style={{ padding: "0.875rem 1rem" }}>
                          <span style={{ display: "inline-block", padding: "0.25rem 0.625rem", borderRadius: "99px", background: st.bg, color: st.color, fontWeight: 600, fontSize: "0.75rem" }}>
                            {st.label}
                          </span>
                          {item.review_notes && (
                            <div style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", marginTop: "0.2rem" }} title={item.review_notes}>
                              💬 {item.review_notes.slice(0, 30)}{item.review_notes.length > 30 ? "…" : ""}
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: "0.875rem 1rem" }}>
                          {item.status === "pending" && (
                            <div style={{ display: "flex", gap: "0.375rem" }}>
                              <ABtn id={`approve-${item.id}`} icon={<ThumbsUp size={12} />} label="Approve" color="#10b981" onClick={() => setReviewOpen({ mode: "approve", item })} />
                              <ABtn id={`reject-${item.id}`}  icon={<ThumbsDown size={12} />} label="Reject"  color="#ef4444" onClick={() => setReviewOpen({ mode: "reject",  item })} />
                              <ABtn id={`cancel-${item.id}`}  icon={<Ban size={12} />}        label="Cancel"  color="#6b7280" onClick={() => handleCancel(item)} />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > 0 ? (
            <ListPagination
              page={listPage.page}
              pageSize={listPage.pageSize}
              total={listPage.total}
              onPageChange={listPage.setPage}
            />
          ) : null}
        </SectionCard>
      </PageBody>

      {/* ── Submit Leave Drawer ─────────────────── */}
      <EntityFormDrawer
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        title="Submit Leave Request"
        description="Fill in the leave details and submit for manager approval."
        onSubmit={handleSubmitLeave}
        isPending={createLeave.isPending}
        submitLabel="Submit Request"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <Field label="Employee *">
            <select id="lf-emp" value={form.employee_id} onChange={(e) => setForm((p) => ({ ...p, employee_id: e.target.value }))} style={drawerInput}>
              <option value="">Select Employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name || e.first_name} ({e.employee_code})</option>
              ))}
            </select>
          </Field>

          <Field label="Leave Type">
            <select id="lf-type" value={form.leave_type} onChange={(e) => setForm((p) => ({ ...p, leave_type: e.target.value }))} style={drawerInput}>
              {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
            </select>
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <Field label="Start Date *">
              <input id="lf-start" type="date" value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} style={drawerInput} />
            </Field>
            <Field label="End Date *">
              <input id="lf-end" type="date" value={form.end_date} onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))} style={drawerInput} />
            </Field>
          </div>

          {autodays !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.875rem", borderRadius: "0.5rem", background: "rgba(59,130,246,0.08)", color: "#3b82f6", fontSize: "0.8125rem", fontWeight: 600 }}>
              <CalendarCheck size={14} /> {autodays} day(s) of leave
            </div>
          )}

          <Field label="Reason / Notes">
            <textarea id="lf-reason" value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} placeholder="Describe the reason for leave…" rows={3} style={{ ...drawerInput, resize: "vertical" as const, minHeight: "4.5rem" }} />
          </Field>
        </div>
      </EntityFormDrawer>

      {/* ── Review Modal ────────────────────────── */}
      {reviewOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setReviewOpen(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--color-surface)", borderRadius: "1rem", padding: "2rem", width: "min(420px, 90vw)", boxShadow: "0 25px 60px rgba(0,0,0,0.25)", border: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: reviewOpen.mode === "approve" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {reviewOpen.mode === "approve" ? <ThumbsUp size={20} style={{ color: "#10b981" }} /> : <ThumbsDown size={20} style={{ color: "#ef4444" }} />}
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>{reviewOpen.mode === "approve" ? "Approve" : "Reject"} Leave Request</h3>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-text-muted)" }}>{reviewOpen.item.employee_name} · {leaveTypeInfo(reviewOpen.item.leave_type).label}</p>
              </div>
            </div>

            <div style={{ background: "rgba(0,0,0,0.03)", borderRadius: "0.625rem", padding: "0.875rem", marginBottom: "1.25rem", fontSize: "0.825rem", color: "var(--color-text-secondary)" }}>
              <div>📅 {fmtDateRange(reviewOpen.item.start_date, reviewOpen.item.end_date)}</div>
              <div>📆 {reviewOpen.item.total_days} day(s)</div>
              {reviewOpen.item.reason && <div style={{ marginTop: "0.3rem" }}>💬 {reviewOpen.item.reason}</div>}
            </div>

            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.375rem", color: "var(--color-text-secondary)" }}>Review Notes (optional)</label>
            <textarea id="review-notes" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Add a note for the employee…" rows={3} style={{ ...drawerInput, width: "100%", boxSizing: "border-box" as const, resize: "vertical" as const }} />

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem", justifyContent: "flex-end" }}>
              <button onClick={() => setReviewOpen(null)} style={{ padding: "0.5rem 1.25rem", borderRadius: "0.5rem", border: "1px solid var(--color-border)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer" }}>Cancel</button>
              <button
                id="review-confirm"
                onClick={handleReview}
                disabled={approveLeave.isPending || rejectLeave.isPending}
                style={{ padding: "0.5rem 1.5rem", borderRadius: "0.5rem", border: "none", background: reviewOpen.mode === "approve" ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff", cursor: "pointer", fontWeight: 600, opacity: approveLeave.isPending || rejectLeave.isPending ? 0.7 : 1 }}
              >
                {approveLeave.isPending || rejectLeave.isPending ? "Saving…" : reviewOpen.mode === "approve" ? "Confirm Approve" : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, color, highlight = false, decimal = false }: {
  icon: React.ReactNode; label: string; value: number; color: string; highlight?: boolean; decimal?: boolean;
}) {
  return (
    <div style={{ background: "var(--color-surface)", border: `1px solid ${highlight ? color + "40" : "var(--color-border)"}`, borderRadius: "0.875rem", padding: "1rem 1.25rem", boxShadow: highlight ? `0 0 0 2px ${color}22` : "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: "1.625rem", fontWeight: 800, color: highlight ? color : "var(--color-text-primary)" }}>
        {decimal ? value.toFixed(1) : value}
      </div>
    </div>
  );
}

function ABtn({ icon, label, color, onClick, id }: { icon: React.ReactNode; label: string; color: string; onClick: () => void; id: string }) {
  return (
    <button id={id} onClick={onClick} title={label}
      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", padding: "0.3rem 0.625rem", borderRadius: "0.375rem", border: "none", background: `${color}15`, color, cursor: "pointer", fontWeight: 600, fontSize: "0.72rem" }}>
      {icon} {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>{label}</label>
      {children}
    </div>
  );
}

function EmptyLeave() {
  return (
    <div style={{ padding: "4rem 2rem", textAlign: "center", color: "var(--color-text-muted)" }}>
      <CalendarDays size={40} style={{ marginBottom: "1rem", opacity: 0.4 }} />
      <div style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "0.375rem", color: "var(--color-text-secondary)" }}>No leave requests found</div>
      <div style={{ fontSize: "0.8375rem" }}>Submit a new leave request or adjust the filters.</div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const drawerInput: React.CSSProperties = {
  padding: "0.5rem 0.75rem", borderRadius: "0.5rem",
  border: "1px solid var(--color-border)", background: "var(--color-surface)",
  color: "var(--color-text-primary)", fontSize: "0.8375rem", width: "100%",
};

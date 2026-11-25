import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { Button } from "@/components/ui/button";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useMiniHrDashboard } from "@/hooks/use-mini-hr";
import {
  Users,
  UserCheck,
  UserX,
  KeyRound,
  Building2,
  Store,
  Clock,
  CalendarCheck,
  Activity,
  UserMinus,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";

export const Route = createFileRoute("/app/hr/")({ component: HrDashboard });

function SummaryCard({
  label,
  value,
  icon: Icon,
  colorClass = "text-muted-foreground",
  bgClass = "bg-card",
}: {
  label: string;
  value: number | string;
  icon: typeof Users;
  colorClass?: string;
  bgClass?: string;
}) {
  return (
    <div className={`rounded-xl border border-border/60 p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:border-border/95 ${bgClass}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
        <div className={`rounded-lg p-2 bg-muted/40 ${colorClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 font-display text-3xl font-extrabold tracking-tight">{value}</div>
    </div>
  );
}

function ProgressRow({ name, count, total }: { name: string; count: number; total: number }) {
  const percentage = total > 0 ? Math.min(100, Math.round((count / total) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs font-medium">
        <span className="text-foreground/90 truncate max-w-[170px]" title={name}>{name}</span>
        <span className="text-muted-foreground">{count} ({percentage}%)</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function HrDashboard() {
  const useApi = shouldUseBackend();
  const { data, isLoading, isError, refetch } = useMiniHrDashboard(useApi);

  if (!useApi) {
    return (
      <>
        <PageHeader title="HR" subtitle="Connect backend to manage employees." />
        <PageBody>
          <EmptyState title="Backend required" description="Sign in with API enabled to use Mini HR." />
        </PageBody>
      </>
    );
  }

  // Fallbacks for analytical data
  const dAny = data as any;
  const deptDist = dAny?.dept_distribution ?? [];
  const desigDist = dAny?.desig_distribution ?? [];
  const storeDist = dAny?.store_distribution ?? [];
  const attToday = dAny?.attendance_today ?? { total_present: 0, late: 0, active_shifts: 0 };
  const leaves = dAny?.leaves ?? { pending_count: 0, on_leave_today_count: 0, on_leave_today_list: [] };

  return (
    <PermissionGate perm="hr.view" fallback={<PageBody><ErrorState title="Permission denied" description="Requires hr.view" /></PageBody>}>
      <PageHeader
        title="HR Dashboard & Analytics"
        subtitle="Real-time employee statistics, attendance records, and leave management overview"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} className="shadow-sm">
            <RefreshCwIcon className="mr-1.5 h-3.5 w-3.5" />
            Refresh Data
          </Button>
        }
      />
      <PageBody>
        {isLoading ? <LoadingState /> : null}
        {isError ? (
          <ErrorState title="Failed to load" description="Could not load HR dashboard." onRetry={() => refetch()} />
        ) : null}
        
        {data ? (
          <div className="space-y-6">
            {/* Quick Links */}
            <SectionCard title="HR Panel Quick Links">
              <div className="flex flex-wrap gap-2.5 p-4 bg-muted/10">
                <Button asChild size="sm" className="shadow-sm">
                  <Link to="/app/hr/employees">Employees Master</Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="shadow-sm">
                  <Link to="/app/hr/attendance">Attendance Tracker</Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="shadow-sm">
                  <Link to="/app/hr/leave">Leave Management</Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="shadow-sm">
                  <Link to="/app/accounts/employee-salary">Payroll / Salary</Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="shadow-sm">
                  <Link to="/app/hr/departments">Departments</Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="shadow-sm">
                  <Link to="/app/hr/designations">Designations</Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="shadow-sm">
                  <Link to="/app/hr/store-assignments">Store Assignments</Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="shadow-sm">
                  <Link to="/app/hr/user-access">User Access Rules</Link>
                </Button>
              </div>
            </SectionCard>

            {/* Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard label="Total Employees" value={data.total_employees} icon={Users} colorClass="text-blue-500" />
              <SummaryCard label="Active Staff" value={data.active_employees} icon={UserCheck} colorClass="text-emerald-500" />
              <SummaryCard label="Suspended Staff" value={data.suspended_employees} icon={UserX} colorClass="text-rose-500" />
              <SummaryCard label="Stores Assigned" value={data.stores_with_employees} icon={Store} colorClass="text-amber-500" />
            </div>

            {/* Daily Operational Stats */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Today's Attendance Widget */}
              <SectionCard title="Today's Attendance Overview">
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-border/40 pb-3">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-indigo-500" />
                      <span className="text-sm font-semibold text-foreground/90">Daily Operations Status</span>
                    </div>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">
                      {new Date().toLocaleDateString("en-GB", { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <div className="text-xl font-bold text-foreground">{attToday.total_present}</div>
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">Checked In</div>
                    </div>
                    <div className="p-3 bg-rose-500/10 rounded-lg">
                      <div className="text-xl font-bold text-rose-600">{attToday.late}</div>
                      <div className="text-[10px] font-semibold text-rose-600/80 uppercase tracking-wider mt-0.5">Late Arrivals</div>
                    </div>
                    <div className="p-3 bg-emerald-500/10 rounded-lg">
                      <div className="text-xl font-bold text-emerald-600">{attToday.active_shifts}</div>
                      <div className="text-[10px] font-semibold text-emerald-600/80 uppercase tracking-wider mt-0.5">Active Shifts</div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-indigo-500/5 p-3 rounded-lg border border-indigo-500/10">
                    <div className="flex items-center gap-2 text-xs text-indigo-600">
                      <Activity className="h-3.5 w-3.5" />
                      <span>Track real-time check-ins inside the tracker.</span>
                    </div>
                    <Button asChild size="sm" variant="ghost" className="h-7 text-xs font-semibold text-indigo-600 p-0 hover:bg-transparent">
                      <Link to="/app/hr/attendance" className="flex items-center gap-0.5">
                        Open Tracker <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </SectionCard>

              {/* Leave & Time-Off Overview */}
              <SectionCard title="Leave & Time-Off Analytics">
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 border border-border/70 rounded-lg flex items-center justify-between bg-card">
                      <div>
                        <div className="text-xs text-muted-foreground">Pending Requests</div>
                        <div className={`text-xl font-extrabold mt-1 ${leaves.pending_count > 0 ? "text-amber-500" : "text-foreground"}`}>
                          {leaves.pending_count}
                        </div>
                      </div>
                      {leaves.pending_count > 0 && (
                        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                      )}
                    </div>

                    <div className="p-3 border border-border/70 rounded-lg bg-card">
                      <div className="text-xs text-muted-foreground">On Leave Today</div>
                      <div className="text-xl font-extrabold text-foreground mt-1">
                        {leaves.on_leave_today_count}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">On Leave Today</div>
                    {leaves.on_leave_today_list.length === 0 ? (
                      <div className="text-xs text-muted-foreground italic bg-muted/20 p-3 rounded-lg border border-dashed border-border/60">
                        No employees currently on leave today.
                      </div>
                    ) : (
                      <div className="max-h-[100px] overflow-y-auto space-y-2 border border-border/40 rounded-lg p-2 bg-card">
                        {leaves.on_leave_today_list.map((l: any) => (
                          <div key={l.id} className="flex justify-between items-center text-xs p-1 hover:bg-muted/30 rounded">
                            <span className="font-semibold text-foreground/90">{l.employee_name}</span>
                            <span className="text-muted-foreground">
                              {l.leave_type} · until {new Date(l.end_date).toLocaleDateString("en-GB", { day: 'numeric', month: 'short' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button asChild size="sm" variant="outline" className="text-xs font-semibold">
                      <Link to="/app/hr/leave">Manage Leave Requests</Link>
                    </Button>
                  </div>
                </div>
              </SectionCard>
            </div>

            {/* Distribution Breakdowns */}
            <div className="grid gap-6 md:grid-cols-3">
              {/* Department Headcount Breakdown */}
              <SectionCard title="Department Breakdowns">
                <div className="p-4 space-y-4 max-h-[280px] overflow-y-auto">
                  {deptDist.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">No department data.</div>
                  ) : (
                    deptDist
                      .sort((a: any, b: any) => b.count - a.count)
                      .map((d: any) => (
                        <ProgressRow key={d.name} name={d.name} count={d.count} total={data.total_employees} />
                      ))
                  )}
                </div>
              </SectionCard>

              {/* Store Distribution Breakdown */}
              <SectionCard title="Store Assignments">
                <div className="p-4 space-y-4 max-h-[280px] overflow-y-auto">
                  {storeDist.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">No store assignment data.</div>
                  ) : (
                    storeDist
                      .sort((a: any, b: any) => b.count - a.count)
                      .map((s: any) => (
                        <ProgressRow key={s.name} name={s.name} count={s.count} total={data.total_employees} />
                      ))
                  )}
                </div>
              </SectionCard>

              {/* Designation Densities */}
              <SectionCard title="Designation Densities">
                <div className="p-4 space-y-3 max-h-[280px] overflow-y-auto">
                  {desigDist.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">No designation data.</div>
                  ) : (
                    desigDist
                      .sort((a: any, b: any) => b.count - a.count)
                      .map((d: any) => (
                        <div key={d.name} className="flex justify-between items-center text-xs border-b border-border/30 pb-2 last:border-0 last:pb-0">
                          <span className="font-semibold text-foreground/80 truncate max-w-[180px]">{d.name}</span>
                          <span className="bg-muted px-2 py-0.5 rounded-full font-medium text-muted-foreground">
                            {d.count} {d.count === 1 ? "staff" : "staffs"}
                          </span>
                        </div>
                      ))
                  )}
                </div>
              </SectionCard>
            </div>
          </div>
        ) : null}
      </PageBody>
    </PermissionGate>
  );
}

function RefreshCwIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M16 3h5v5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 21H3v-5" />
    </svg>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import { PageHeader, PageBody, SectionCard, StatCard, StatusBadge } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { ListPagination } from "@/components/pulse/ListPagination";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  RefreshCw,
  Search,
  Users,
  MoreHorizontal,
  Edit,
  UserPlus,
  KeyRound,
  Store as StoreIcon,
  UserX,
  UserCheck,
  FilterX,
  Building2,
  Briefcase,
  Eye,
  History,
  User,
  Mail,
  Phone,
  Calendar,
  ShieldCheck,
  Clock,
  Activity,
  CheckCircle2,
  Camera,
  UploadCloud,
  Loader2,
} from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useApiStores } from "@/hooks/use-api-config";
import {
  useActivateEmployeeAccess,
  useAssignEmployeeStore,
  useCreateEmployee,
  useCreateEmployeeUser,
  useGenerateTempPassword,
  useCreateDepartment,
  useCreateDesignation,
  useMiniHrDepartments,
  useMiniHrDesignations,
  useMiniHrEmployeeActivity,
  useMiniHrEmployees,
  useMiniHrEmployeeStores,
  useMiniHrUserAccess,
  usePatchEmployee,
  useResetEmployeePassword,
  useSuspendEmployeeAccess,
  useUploadMiniHrPhoto,
  type MiniHrEmployee,
} from "@/hooks/use-mini-hr";
import { toast } from "sonner";
import { formatApiError, resolveMediaUrl, type ApiError } from "@/lib/api";
function SuggestionInput({
  label,
  value,
  onChange,
  suggestions,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  suggestions: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return suggestions;
    return suggestions.filter(s => s.name.toLowerCase().includes(term));
  }, [q, suggestions]);

  const displayValue = useMemo(() => {
    const match = suggestions.find(s => s.id === value);
    return match ? match.name : value;
  }, [value, suggestions]);

  return (
    <div className="relative" ref={containerRef}>
      <Label>{label}</Label>
      <Input
        value={open ? q : displayValue}
        onChange={e => {
          setQ(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQ("");
          setOpen(true);
        }}
        placeholder={`Select or type new ${label.toLowerCase()}…`}
        className="h-9"
      />
      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95">
          {filtered.length === 0 && q.trim() && (
            <button
              type="button"
              className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground text-left text-primary font-medium"
              onClick={() => {
                onChange(q.trim());
                setOpen(false);
              }}
            >
              Create new &ldquo;{q}&rdquo;
            </button>
          )}
          {filtered.map(s => (
            <button
              key={s.id}
              type="button"
              className={cn(
                "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground text-left font-normal",
                value === s.id && "bg-secondary text-foreground font-medium"
              )}
              onClick={() => {
                onChange(s.id);
                setOpen(false);
              }}
            >
              {s.name}
            </button>
          ))}
          {filtered.length === 0 && !q.trim() && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground text-center">No suggestions</div>
          )}
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/app/hr/employees")({ component: EmployeesPage });

type FormState = {
  employee_code: string;
  first_name: string;
  last_name: string;
  mobile: string;
  email: string;
  joining_date: string;
  department_id: string;
  designation_id: string;
  primary_store_id: string;
  employee_status: string;
};

const emptyForm = (): FormState => ({
  employee_code: "",
  first_name: "",
  last_name: "",
  mobile: "",
  email: "",
  joining_date: "",
  department_id: "",
  designation_id: "",
  primary_store_id: "",
  employee_status: "active",
});

/**
 * Directory cell for department / designation / store. An unset value drops the
 * icon and dims the dash — otherwise a column of icon-plus-dash reads as content
 * when it is really absence.
 */
function MetaCell({ icon, value }: { icon: ReactNode; value: string }) {
  if (!value || value === "—") {
    return <span className="text-muted-foreground/50">—</span>;
  }
  return (
    <div className="flex items-center gap-1">
      {icon}
      {value}
    </div>
  );
}

function EmployeeAvatar({ employee }: { employee: MiniHrEmployee }) {
  const [hasError, setHasError] = useState(false);

  if (employee.photo_url && !hasError) {
    return (
      <img
        src={resolveMediaUrl(employee.photo_url)}
        alt={employee.full_name}
        onError={() => setHasError(true)}
        className="h-8 w-8 rounded-full object-cover border border-border flex-shrink-0"
      />
    );
  }

  const initials = `${employee.first_name?.[0] ?? ""}${(employee.last_name || "")?.[0] ?? ""}`.toUpperCase() || "?";
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-display text-[10px] font-bold text-primary border border-primary/10 flex-shrink-0">
      {initials}
    </div>
  );
}

function EmployeesPage() {
  const useApi = shouldUseBackend();
  
  // Search and Filter States
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loginFilter, setLoginFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [desigFilter, setDesigFilter] = useState("all");
  const [storeFilter, setStoreFilter] = useState("all");

  // Profile Detail Drawer State
  const [viewingEmp, setViewingEmp] = useState<MiniHrEmployee | null>(null);
  const [detailTab, setDetailTab] = useState<"overview" | "access" | "stores" | "activity">("overview");

  // Drawers & Dialog States
  const [openEmpDrawer, setOpenEmpDrawer] = useState(false);
  const [editingEmp, setEditingEmp] = useState<MiniHrEmployee | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [drawerImgError, setDrawerImgError] = useState(false);

  useEffect(() => {
    setDrawerImgError(false);
  }, [viewingEmp]);

  // User Account & Store Drawer States
  const [loginEmp, setLoginEmp] = useState<MiniHrEmployee | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roleCode, setRoleCode] = useState("Cashier");

  const [resetEmp, setResetEmp] = useState<MiniHrEmployee | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const [storeEmp, setStoreEmp] = useState<MiniHrEmployee | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [isPrimaryStore, setIsPrimaryStore] = useState(false);

  const [suspendEmpId, setSuspendEmpId] = useState<string | null>(null);
  const [activateEmpId, setActivateEmpId] = useState<string | null>(null);

  // Queries & Mutations
  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useMiniHrEmployees(
    { q: search || undefined, status: statusFilter !== "all" ? statusFilter : undefined },
    useApi
  );
  const depts = useMiniHrDepartments(useApi);
  const desigs = useMiniHrDesignations(useApi);
  const stores = useApiStores();
  const userAccessQuery = useMiniHrUserAccess(useApi);

  const empActivityQuery = useMiniHrEmployeeActivity(viewingEmp?.id, Boolean(viewingEmp));
  const empStoresQuery = useMiniHrEmployeeStores(viewingEmp?.id, Boolean(viewingEmp));

  const createMut = useCreateEmployee();
  const patchMut = usePatchEmployee();
  const createDeptMut = useCreateDepartment();
  const createDesigMut = useCreateDesignation();
  const createUserMut = useCreateEmployeeUser();
  const resetPwMut = useResetEmployeePassword();
  const assignStoreMut = useAssignEmployeeStore();
  const suspendMut = useSuspendEmployeeAccess();
  const activateMut = useActivateEmployeeAccess();
  const genPwMut = useGenerateTempPassword();
  const uploadPhotoMut = useUploadMiniHrPhoto();

  // Maps for Labels
  const deptMap = useMemo(() => {
    const map = new Map<string, string>();
    (depts.data ?? []).forEach(d => map.set(d.id, d.department_name));
    return map;
  }, [depts.data]);

  const desigMap = useMemo(() => {
    const map = new Map<string, string>();
    (desigs.data ?? []).forEach(d => map.set(d.id, d.designation_name));
    return map;
  }, [desigs.data]);

  const storeMap = useMemo(() => {
    const map = new Map<string, string>();
    (stores.data ?? []).forEach(s => map.set(s.id, s.name));
    return map;
  }, [stores.data]);

  const userAccessMap = useMemo(() => {
    const map = new Map<string, NonNullable<typeof userAccessQuery.data>[number]>();
    (userAccessQuery.data ?? []).forEach(ua => map.set(ua.employee_id, ua));
    return map;
  }, [userAccessQuery.data]);

  // Client-side filtering
  const filteredEmployees = useMemo(() => {
    let rows = data ?? [];
    if (loginFilter === "with_login") {
      rows = rows.filter(e => e.has_login);
    } else if (loginFilter === "without_login") {
      rows = rows.filter(e => !e.has_login);
    }
    if (deptFilter !== "all") {
      rows = rows.filter(e => e.department_id === deptFilter);
    }
    if (desigFilter !== "all") {
      rows = rows.filter(e => e.designation_id === desigFilter);
    }
    if (storeFilter !== "all") {
      rows = rows.filter(e => e.primary_store_id === storeFilter);
    }
    return rows;
  }, [data, loginFilter, deptFilter, desigFilter, storeFilter]);

  const headcount = useMemo(() => {
    const rows = data ?? [];
    const withLogin = rows.filter((e) => e.has_login).length;
    return {
      total: rows.length,
      active: rows.filter((e) => e.employee_status === "active").length,
      withLogin,
      withoutLogin: rows.length - withLogin,
    };
  }, [data]);

  const filterKey = `${search}|${statusFilter}|${loginFilter}|${deptFilter}|${desigFilter}|${storeFilter}`;
  const listPage = useClientPagination(filteredEmployees, 10, filterKey);

  const hasActiveFilters =
    search.trim() !== "" ||
    statusFilter !== "all" ||
    loginFilter !== "all" ||
    deptFilter !== "all" ||
    desigFilter !== "all" ||
    storeFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setLoginFilter("all");
    setDeptFilter("all");
    setDesigFilter("all");
    setStoreFilter("all");
  };

  // Drawer Handlers
  const openCreateEmployee = () => {
    setEditingEmp(null);
    setForm(emptyForm());
    setPhotoFile(null);
    setPhotoPreview("");
    setOpenEmpDrawer(true);
  };

  const openEditEmployee = (e: MiniHrEmployee) => {
    setEditingEmp(e);
    setPhotoFile(null);
    setPhotoPreview("");
    setForm({
      employee_code: e.employee_code,
      first_name: e.first_name,
      last_name: e.last_name ?? "",
      mobile: e.mobile ?? "",
      email: e.email ?? "",
      joining_date: e.joining_date ?? "",
      department_id: e.department_id ?? "",
      designation_id: e.designation_id ?? "",
      primary_store_id: e.primary_store_id ?? "",
      employee_status: e.employee_status,
    });
    setOpenEmpDrawer(true);
  };

  const submitEmployeeForm = async () => {
    if (!form.employee_code.trim() || !form.first_name.trim()) return;

    const isUuid = (val?: string | null) =>
      val ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val) : false;

    let finalDeptId = form.department_id || null;
    let finalDesigId = form.designation_id || null;

    try {
      if (finalDeptId && !isUuid(finalDeptId)) {
        const cleanCode = `DEPT-${finalDeptId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`;
        const newDept = await createDeptMut.mutateAsync({
          department_code: cleanCode,
          department_name: finalDeptId,
        });
        finalDeptId = (newDept as any).id;
      }

      if (finalDesigId && !isUuid(finalDesigId)) {
        const cleanCode = `DESG-${finalDesigId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`;
        const newDesig = await createDesigMut.mutateAsync({
          designation_code: cleanCode,
          designation_name: finalDesigId,
        });
        finalDesigId = (newDesig as any).id;
      }
    } catch (err) {
      toast.error("Failed to automatically create department or designation");
      console.error(err);
      return;
    }

    try {
      if (editingEmp) {
        const updated = await patchMut.mutateAsync({
          id: editingEmp.id,
          body: {
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim() || null,
            mobile: form.mobile.trim() || null,
            email: form.email.trim() || null,
            joining_date: form.joining_date || null,
            department_id: finalDeptId,
            designation_id: finalDesigId,
            primary_store_id: form.primary_store_id || null,
            employee_status: form.employee_status,
          },
        });
        if (photoFile) {
          await uploadPhotoMut.mutateAsync({ employeeId: updated.id, file: photoFile });
        }
        toast.success("Employee updated successfully");
      } else {
        const created = await createMut.mutateAsync({
          employee_code: form.employee_code.trim(),
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim() || undefined,
          mobile: form.mobile.trim() || undefined,
          email: form.email.trim() || undefined,
          joining_date: form.joining_date || undefined,
          department_id: finalDeptId || undefined,
          designation_id: finalDesigId || undefined,
          primary_store_id: form.primary_store_id || undefined,
          employee_status: form.employee_status,
        });
        if (photoFile) {
          await uploadPhotoMut.mutateAsync({ employeeId: created.id, file: photoFile });
        }
        toast.success("Employee created successfully");
      }
      setOpenEmpDrawer(false);
      setPhotoFile(null);
      setPhotoPreview("");
    } catch (err) {
      toast.error(formatApiError(err as ApiError));
    }
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title="Employees" subtitle="Backend required" />
        <PageBody><EmptyState title="Backend required" description="Sign in with API enabled to manage employees." /></PageBody>
      </>
    );
  }

  const activeUserAccess = viewingEmp ? userAccessMap.get(viewingEmp.id) : null;

  return (
    <PermissionGate perm="hr.view" fallback={<PageBody><ErrorState title="Permission denied" description="Requires hr.view permission" /></PageBody>}>
      <PageHeader
        title="Employees"
        subtitle="Manage employee master data, multi-store access, and system login credentials"
        actions={
          <>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              {isFetching
                ? "Refreshing…"
                : dataUpdatedAt
                  ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString()}`
                  : ""}
            </span>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <PermissionGate perm="hr.employee_manage">
              <Button size="sm" className="gap-1.5" onClick={openCreateEmployee}>
                <Plus className="h-3.5 w-3.5" /> Add employee
              </Button>
            </PermissionGate>
          </>
        }
      />
      <PageBody>
        {/* Headcount at a glance — counts are over the whole directory, not the
            current filter, so they stay a stable reference point. */}
        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total employees" value={String(headcount.total)} icon={<Users className="h-4 w-4" />} />
          <StatCard label="Active" value={String(headcount.active)} icon={<UserCheck className="h-4 w-4" />} />
          <StatCard label="With system login" value={String(headcount.withLogin)} icon={<KeyRound className="h-4 w-4" />} />
          <StatCard label="No login" value={String(headcount.withoutLogin)} icon={<UserX className="h-4 w-4" />} />
        </div>

        {/* Multi-Filter Bar */}
        <div className="mb-4 rounded-xl border border-border/70 bg-card p-3 shadow-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search code or name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>

            {/* Status Filter */}
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 text-xs"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
              <option value="resigned">Resigned</option>
            </select>

            {/* Login Filter */}
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 text-xs"
              value={loginFilter}
              onChange={e => setLoginFilter(e.target.value)}
            >
              <option value="all">All Login Types</option>
              <option value="with_login">With Login Account</option>
              <option value="without_login">Without Login Account</option>
            </select>

            {/* Department Filter */}
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 text-xs"
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
            >
              <option value="all">All Departments</option>
              {(depts.data ?? []).map(d => (
                <option key={d.id} value={d.id}>{d.department_name}</option>
              ))}
            </select>

            {/* Designation Filter */}
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 text-xs"
              value={desigFilter}
              onChange={e => setDesigFilter(e.target.value)}
            >
              <option value="all">All Designations</option>
              {(desigs.data ?? []).map(d => (
                <option key={d.id} value={d.id}>{d.designation_name}</option>
              ))}
            </select>

            {/* Store Filter */}
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 text-xs"
              value={storeFilter}
              onChange={e => setStoreFilter(e.target.value)}
            >
              <option value="all">All Stores</option>
              {(stores.data ?? []).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            {/* Clear Filters Button */}
            {hasActiveFilters ? (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground">
                <FilterX className="h-3.5 w-3.5" /> Clear
              </Button>
            ) : null}
          </div>
        </div>

        {/* States */}
        {isLoading ? <LoadingState /> : null}
        {isError ? <ErrorState title="Failed to load" description="Could not load employee directory." onRetry={() => refetch()} /> : null}
        {!isLoading && filteredEmployees.length === 0 ? (
          <EmptyState
            title="No employees found"
            description={hasActiveFilters ? "Try clearing search filters." : "Create the first employee record for this store."}
          />
        ) : null}

        {/* Table View */}
        {filteredEmployees.length > 0 ? (
          <SectionCard title={`${filteredEmployees.length} Employee(s)`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50">
                  <tr className="border-b text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="py-2.5 pl-5 pr-3">Code</th>
                    <th className="py-2.5 pr-3">Employee Name</th>
                    <th className="py-2.5 pr-3">Department</th>
                    <th className="py-2.5 pr-3">Designation</th>
                    <th className="py-2.5 pr-3">Primary Store</th>
                    <th className="py-2.5 pr-3">Status</th>
                    <th className="py-2.5 pr-3">System Login</th>
                    <th className="py-2.5 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {listPage.pageItems.map(e => {
                    const deptName = e.department_id ? deptMap.get(e.department_id) || "—" : "—";
                    const desigName = e.designation_id ? desigMap.get(e.designation_id) || "—" : "—";
                    const storeName = e.primary_store_id ? storeMap.get(e.primary_store_id) || "—" : "—";

                    return (
                      <tr key={e.id} className="hover:bg-muted/40 transition-colors cursor-pointer" onClick={() => { setViewingEmp(e); setDetailTab("overview"); }}>
                        <td className="py-3 pl-5 pr-3 font-mono text-xs font-medium text-foreground">{e.employee_code}</td>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2.5">
                            <EmployeeAvatar employee={e} />
                            <div>
                              <div className="font-medium text-foreground">{e.full_name}</div>
                              {e.email ? <div className="text-xs text-muted-foreground">{e.email}</div> : null}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-xs text-muted-foreground">
                          <MetaCell icon={<Building2 className="h-3 w-3 text-muted-foreground/70" />} value={deptName} />
                        </td>
                        <td className="py-3 pr-3 text-xs text-muted-foreground">
                          <MetaCell icon={<Briefcase className="h-3 w-3 text-muted-foreground/70" />} value={desigName} />
                        </td>
                        <td className="py-3 pr-3 text-xs text-muted-foreground">
                          <MetaCell icon={<StoreIcon className="h-3 w-3 text-muted-foreground/70" />} value={storeName} />
                        </td>
                        <td className="py-3 pr-3"><StatusBadge status={e.employee_status} /></td>
                        <td className="py-3 pr-3">
                          {e.has_login ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              <KeyRound className="h-3 w-3" /> Active Login
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                              No Login
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-5 text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => {
                                setViewingEmp(e);
                                setDetailTab("overview");
                              }}>
                                <Eye className="h-4 w-4 mr-2 text-primary" /> View Profile & Activity
                              </DropdownMenuItem>

                              <PermissionGate perm="hr.employee_manage">
                                <DropdownMenuItem onClick={() => openEditEmployee(e)}>
                                  <Edit className="h-4 w-4 mr-2" /> Edit Master Profile
                                </DropdownMenuItem>
                              </PermissionGate>

                              <PermissionGate perm="hr.store_assignment_manage">
                                <DropdownMenuItem onClick={() => {
                                  setStoreEmp(e);
                                  setSelectedStoreId(e.primary_store_id || "");
                                  setIsPrimaryStore(false);
                                }}>
                                  <StoreIcon className="h-4 w-4 mr-2" /> Assign Store
                                </DropdownMenuItem>
                              </PermissionGate>

                              <DropdownMenuSeparator />

                              {!e.has_login ? (
                                <PermissionGate perm="hr.user_access_manage">
                                  <DropdownMenuItem onClick={() => {
                                    setLoginEmp(e);
                                    setUsername(e.email ? e.email.split("@")[0] : e.employee_code.toLowerCase());
                                    setPassword("");
                                    setRoleCode("Cashier");
                                  }}>
                                    <UserPlus className="h-4 w-4 mr-2 text-emerald-600" /> Create Login
                                  </DropdownMenuItem>
                                </PermissionGate>
                              ) : (
                                <>
                                  <PermissionGate perm="hr.password_reset">
                                    <DropdownMenuItem onClick={() => {
                                      setResetEmp(e);
                                      setResetPassword("");
                                    }}>
                                      <KeyRound className="h-4 w-4 mr-2" /> Reset Password
                                    </DropdownMenuItem>
                                  </PermissionGate>

                                  <PermissionGate perm="hr.user_access_manage">
                                    {e.employee_status === "active" ? (
                                      <DropdownMenuItem onClick={() => setSuspendEmpId(e.id)} className="text-destructive">
                                        <UserX className="h-4 w-4 mr-2" /> Suspend Access
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem onClick={() => setActivateEmpId(e.id)}>
                                        <UserCheck className="h-4 w-4 mr-2 text-emerald-600" /> Reactivate Access
                                      </DropdownMenuItem>
                                    )}
                                  </PermissionGate>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      {/* Profile & Activity Detail Drawer */}
      <EntityFormDrawer
        open={Boolean(viewingEmp)}
        onOpenChange={o => { if (!o) setViewingEmp(null); }}
        title={`Employee Profile — ${viewingEmp?.full_name ?? ""}`}
        onSubmit={async () => { setViewingEmp(null); }}
        isPending={false}
      >
        {viewingEmp ? (
          <div className="space-y-4">
            {/* Header Identity Card */}
            <div className="rounded-xl border border-border/70 bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="relative group flex-shrink-0">
                  {viewingEmp.photo_url && !drawerImgError ? (
                    <img
                      src={resolveMediaUrl(viewingEmp.photo_url)}
                      alt={viewingEmp.full_name}
                      onError={() => setDrawerImgError(true)}
                      className="h-14 w-14 rounded-full object-cover border border-border bg-muted shadow-sm"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 font-display text-lg font-bold text-primary border border-primary/10">
                      {viewingEmp.first_name[0]}{(viewingEmp.last_name || "")[0]}
                    </div>
                  )}
                  {/* Hover Overlay */}
                  <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-[9px] text-white font-medium rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity" title="Change photo">
                    {uploadPhotoMut.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    ) : (
                      <>
                        <Camera className="h-3.5 w-3.5 mb-0.5" />
                        <span>Change</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 5 * 1024 * 1024) {
                            toast.error("Image file size must be under 5MB");
                            return;
                          }
                          try {
                            const updated = await uploadPhotoMut.mutateAsync({ employeeId: viewingEmp.id, file });
                            setViewingEmp(updated);
                            setDrawerImgError(false);
                            toast.success("Photo uploaded successfully");
                          } catch (err) {
                            toast.error(formatApiError(err));
                          }
                        }
                      }}
                    />
                  </label>

                  {/* Camera Badge at bottom-right */}
                  <label className="absolute -bottom-1 -right-1 p-1 rounded-full bg-primary text-primary-foreground shadow border border-background cursor-pointer hover:bg-primary/90 transition-transform active:scale-95" title="Upload photo">
                    {uploadPhotoMut.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Camera className="h-3 w-3" />
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 5 * 1024 * 1024) {
                            toast.error("Image file size must be under 5MB");
                            return;
                          }
                          try {
                            const updated = await uploadPhotoMut.mutateAsync({ employeeId: viewingEmp.id, file });
                            setViewingEmp(updated);
                            setDrawerImgError(false);
                            toast.success("Photo uploaded successfully");
                          } catch (err) {
                            toast.error(formatApiError(err));
                          }
                        }
                      }}
                    />
                  </label>
                </div>
                <div>
                  <div className="font-display text-base font-semibold text-foreground flex items-center gap-2">
                    {viewingEmp.full_name}
                    <span className="font-mono text-xs text-muted-foreground font-normal">({viewingEmp.employee_code})</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5 items-center text-xs">
                    <StatusBadge status={viewingEmp.employee_status} />
                    {viewingEmp.department_id ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                        {deptMap.get(viewingEmp.department_id)}
                      </span>
                    ) : null}
                    {viewingEmp.designation_id ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                        {desigMap.get(viewingEmp.designation_id)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-border text-xs font-medium gap-2">
              <button
                type="button"
                onClick={() => setDetailTab("overview")}
                className={`pb-2 px-1 border-b-2 font-medium flex items-center gap-1 transition-colors ${
                  detailTab === "overview" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <User className="h-3.5 w-3.5" /> Overview
              </button>
              <button
                type="button"
                onClick={() => setDetailTab("access")}
                className={`pb-2 px-1 border-b-2 font-medium flex items-center gap-1 transition-colors ${
                  detailTab === "access" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" /> System Access
              </button>
              <button
                type="button"
                onClick={() => setDetailTab("stores")}
                className={`pb-2 px-1 border-b-2 font-medium flex items-center gap-1 transition-colors ${
                  detailTab === "stores" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <StoreIcon className="h-3.5 w-3.5" /> Stores
              </button>
              <button
                type="button"
                onClick={() => setDetailTab("activity")}
                className={`pb-2 px-1 border-b-2 font-medium flex items-center gap-1 transition-colors ${
                  detailTab === "activity" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Activity className="h-3.5 w-3.5" /> Activity Timeline
              </button>
            </div>

            {/* Tab 1: Overview */}
            {detailTab === "overview" ? (
              <div className="grid gap-3 text-xs">
                <div className="rounded-lg border border-border/50 bg-card p-3 space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> Mobile: <span className="font-medium text-foreground">{viewingEmp.mobile || "—"}</span></div>
                  <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" /> Email: <span className="font-medium text-foreground">{viewingEmp.email || "—"}</span></div>
                  <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-3.5 w-3.5" /> Joining Date: <span className="font-medium text-foreground">{viewingEmp.joining_date || "—"}</span></div>
                  <div className="flex items-center gap-2 text-muted-foreground"><StoreIcon className="h-3.5 w-3.5" /> Primary Store: <span className="font-medium text-foreground">{viewingEmp.primary_store_id ? storeMap.get(viewingEmp.primary_store_id) : "—"}</span></div>
                </div>
              </div>
            ) : null}

            {/* Tab 2: System Access */}
            {detailTab === "access" ? (
              <div className="space-y-3 text-xs">
                <div className="rounded-lg border border-border/50 bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Account Status:</span>
                    <StatusBadge status={activeUserAccess ? activeUserAccess.account_status : "no_login"} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Username:</span>
                    <span className="font-mono font-medium text-foreground">{activeUserAccess?.username || "No Username"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Assigned Role(s):</span>
                    <span className="font-medium text-foreground">{activeUserAccess?.roles.join(", ") || "None"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Last Login:</span>
                    <span className="font-medium text-foreground">
                      {activeUserAccess?.last_login_at ? new Date(activeUserAccess.last_login_at).toLocaleString() : "Never"}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Tab 3: Store Mappings */}
            {detailTab === "stores" ? (
              <div className="space-y-2 text-xs">
                {empStoresQuery.isLoading ? <LoadingState /> : null}
                {empStoresQuery.data && empStoresQuery.data.length > 0 ? (
                  empStoresQuery.data.map(asg => (
                    <div key={asg.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-card p-2.5">
                      <div className="flex items-center gap-2">
                        <StoreIcon className="h-4 w-4 text-primary" />
                        <div>
                          <div className="font-medium text-foreground">{storeMap.get(asg.store_id) || "Store"}</div>
                          <div className="text-[10px] text-muted-foreground uppercase">{asg.assignment_type} {asg.is_primary ? "(Primary)" : ""}</div>
                        </div>
                      </div>
                      <StatusBadge status={asg.is_active ? "active" : "inactive"} />
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground text-center py-4">No secondary store assignments mapped.</div>
                )}
              </div>
            ) : null}

            {/* Tab 4: Activity & Audit Timeline */}
            {detailTab === "activity" ? (
              <div className="space-y-2 text-xs">
                {empActivityQuery.isLoading ? <LoadingState /> : null}
                {empActivityQuery.data && empActivityQuery.data.length > 0 ? (
                  <div className="relative border-l border-border pl-4 space-y-3 ml-2">
                    {empActivityQuery.data.map(act => (
                      <div key={act.id} className="relative">
                        <div className="absolute -left-[21px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-primary">
                          <CheckCircle2 className="h-3 w-3" />
                        </div>
                        <div className="font-semibold text-foreground capitalize">
                          {act.action.replace(/\./g, " ").replace(/_/g, " ")}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {act.created_at ? new Date(act.created_at).toLocaleString() : "Unknown date"}
                        </div>
                        {act.detail ? (
                          <pre className="mt-1 rounded bg-muted/60 p-1.5 font-mono text-[10px] text-muted-foreground overflow-x-auto">
                            {JSON.stringify(act.detail)}
                          </pre>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted-foreground text-center py-4">No recorded audit log events yet.</div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </EntityFormDrawer>

      {/* Employee Master Create / Edit Drawer */}
      <EntityFormDrawer
        open={openEmpDrawer}
        onOpenChange={setOpenEmpDrawer}
        title={editingEmp ? `Edit Employee — ${editingEmp.employee_code}` : "Create New Employee"}
        onSubmit={submitEmployeeForm}
        isPending={createMut.isPending || patchMut.isPending}
      >
        <div className="grid gap-3">
          {/* Profile Photo Picker */}
          <div className="flex flex-col items-center gap-2 border-b border-border/40 pb-3">
            <Label className="self-start text-xs font-semibold text-muted-foreground uppercase">Profile Photo</Label>
            <div className="relative group">
              {photoPreview ? (
                <img src={photoPreview} alt="Preview" className="h-20 w-20 rounded-full object-cover border-2 border-border shadow-sm" />
              ) : editingEmp?.photo_url ? (
                <img src={resolveMediaUrl(editingEmp.photo_url)} alt="Profile" className="h-20 w-20 rounded-full object-cover border-2 border-border shadow-sm" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted border border-border text-muted-foreground font-medium text-xs">
                  No Photo
                </div>
              )}
              {/* Hover overlay */}
              <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-[10px] text-white font-medium rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                <Camera className="h-4 w-4 mb-0.5" />
                <span>{photoPreview || editingEmp?.photo_url ? "Change" : "Choose"}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 5 * 1024 * 1024) {
                        toast.error("Image file size must be under 5MB");
                        return;
                      }
                      setPhotoFile(file);
                      setPhotoPreview(URL.createObjectURL(file));
                    }
                  }}
                />
              </label>

              {/* Camera Badge button */}
              <label className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-primary text-primary-foreground shadow border border-background cursor-pointer hover:bg-primary/90 transition-transform active:scale-95" title="Choose photo">
                <Camera className="h-3.5 w-3.5" />
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 5 * 1024 * 1024) {
                        toast.error("Image file size must be under 5MB");
                        return;
                      }
                      setPhotoFile(file);
                      setPhotoPreview(URL.createObjectURL(file));
                    }
                  }}
                />
              </label>
            </div>

            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium border border-border rounded-md hover:bg-muted cursor-pointer transition-colors shadow-sm">
                <UploadCloud className="h-3.5 w-3.5" />
                <span>{photoPreview || editingEmp?.photo_url ? "Change Photo" : "Upload Photo"}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 5 * 1024 * 1024) {
                        toast.error("Image file size must be under 5MB");
                        return;
                      }
                      setPhotoFile(file);
                      setPhotoPreview(URL.createObjectURL(file));
                    }
                  }}
                />
              </label>

              {(photoPreview || editingEmp?.photo_url) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    setPhotoFile(null);
                    setPhotoPreview("");
                    // Clear database reference during editing if desired
                    if (editingEmp) {
                      editingEmp.photo_url = "";
                    }
                  }}
                >
                  Clear Photo
                </Button>
              )}
            </div>

            <div className="text-[10px] text-muted-foreground text-center">
              PNG, JPG, WEBP, GIF up to 5MB
            </div>
          </div>

          {!editingEmp ? (
            <div>
              <Label>Employee Code *</Label>
              <Input value={form.employee_code} onChange={e => setForm(f => ({ ...f, employee_code: e.target.value }))} placeholder="e.g. EMP001" />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>First Name *</Label>
              <Input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
            </div>
            <div>
              <Label>Last Name</Label>
              <Input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Mobile Number</Label>
            <Input value={form.mobile} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} placeholder="+1234567890" />
          </div>
          <div>
            <Label>Email Address</Label>
            <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="employee@pulse.pos" />
          </div>
          <div>
            <Label>Joining Date</Label>
            <Input type="date" value={form.joining_date} onChange={e => setForm(f => ({ ...f, joining_date: e.target.value }))} />
          </div>
          <SuggestionInput
            label="Department"
            value={form.department_id}
            onChange={val => setForm(f => ({ ...f, department_id: val }))}
            suggestions={(depts.data ?? []).map(d => ({ id: d.id, name: d.department_name }))}
          />
          <SuggestionInput
            label="Designation"
            value={form.designation_id}
            onChange={val => setForm(f => ({ ...f, designation_id: val }))}
            suggestions={(desigs.data ?? []).map(d => ({ id: d.id, name: d.designation_name }))}
          />
          <div>
            <Label>Primary Store</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={form.primary_store_id}
              onChange={e => setForm(f => ({ ...f, primary_store_id: e.target.value }))}
            >
              <option value="">— Select Primary Store —</option>
              {(stores.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <Label>Employee Status</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={form.employee_status}
              onChange={e => setForm(f => ({ ...f, employee_status: e.target.value }))}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
              <option value="resigned">Resigned</option>
            </select>
          </div>
        </div>
      </EntityFormDrawer>

      {/* Quick Action: Create User Login Drawer */}
      <EntityFormDrawer
        open={Boolean(loginEmp)}
        onOpenChange={o => { if (!o) setLoginEmp(null); }}
        title={`Create System Login — ${loginEmp?.full_name ?? ""}`}
        onSubmit={async () => {
          if (!loginEmp) return;
          try {
            await createUserMut.mutateAsync({
              employeeId: loginEmp.id,
              body: { username, temporary_password: password, role_code: roleCode, force_password_change: true },
            });
            toast.success(`Login created for ${loginEmp.full_name}`);
            setLoginEmp(null);
          } catch (err) {
            toast.error(formatApiError(err as ApiError));
          }
        }}
        isPending={createUserMut.isPending}
      >
        <div className="grid gap-3">
          <div>
            <Label>Username</Label>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. john.doe" autoComplete="off" />
          </div>
          <div>
            <Label>Temporary Password</Label>
            <div className="flex gap-2">
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  try {
                    const res = await genPwMut.mutateAsync();
                    setPassword(res.temporary_password);
                    toast.message("Generated password — copy now; it will not be shown again");
                  } catch (err) {
                    toast.error(formatApiError(err as ApiError));
                  }
                }}
              >
                Generate
              </Button>
            </div>
          </div>
          <div>
            <Label>Assigned Role</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={roleCode}
              onChange={e => setRoleCode(e.target.value)}
            >
              {["Cashier", "Store Manager", "Inventory User", "Auditor", "Admin"].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>
      </EntityFormDrawer>

      {/* Quick Action: Reset Password Drawer */}
      <EntityFormDrawer
        open={Boolean(resetEmp)}
        onOpenChange={o => { if (!o) setResetEmp(null); }}
        title={`Reset Password — ${resetEmp?.full_name ?? ""}`}
        onSubmit={async () => {
          if (!resetEmp) return;
          try {
            await resetPwMut.mutateAsync({
              employeeId: resetEmp.id,
              body: { temporary_password: resetPassword, force_password_change: true },
            });
            toast.success(`Password reset for ${resetEmp.full_name}`);
            setResetEmp(null);
          } catch (err) {
            toast.error(formatApiError(err as ApiError));
          }
        }}
        isPending={resetPwMut.isPending}
      >
        <div className="grid gap-3">
          <div>
            <Label>New Temporary Password</Label>
            <div className="flex gap-2">
              <Input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} />
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  try {
                    const res = await genPwMut.mutateAsync();
                    setResetPassword(res.temporary_password);
                  } catch (err) {
                    toast.error(formatApiError(err as ApiError));
                  }
                }}
              >
                Generate
              </Button>
            </div>
          </div>
        </div>
      </EntityFormDrawer>

      {/* Quick Action: Assign Store Drawer */}
      <EntityFormDrawer
        open={Boolean(storeEmp)}
        onOpenChange={o => { if (!o) setStoreEmp(null); }}
        title={`Assign Store — ${storeEmp?.full_name ?? ""}`}
        onSubmit={async () => {
          if (!storeEmp || !selectedStoreId) return;
          try {
            await assignStoreMut.mutateAsync({
              employeeId: storeEmp.id,
              body: { store_id: selectedStoreId, is_primary: isPrimaryStore, assignment_type: isPrimaryStore ? "primary" : "secondary" },
            });
            toast.success(`Store assigned to ${storeEmp.full_name}`);
            setStoreEmp(null);
          } catch (err) {
            toast.error(formatApiError(err as ApiError));
          }
        }}
        isPending={assignStoreMut.isPending}
      >
        <div className="grid gap-3">
          <div>
            <Label>Select Store</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={selectedStoreId}
              onChange={e => setSelectedStoreId(e.target.value)}
            >
              <option value="">— Select Store —</option>
              {(stores.data ?? []).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="is_primary_checkbox"
              checked={isPrimaryStore}
              onChange={e => setIsPrimaryStore(e.target.checked)}
              className="rounded border-input"
            />
            <Label htmlFor="is_primary_checkbox" className="text-xs font-normal cursor-pointer">
              Set as primary store for this employee
            </Label>
          </div>
        </div>
      </EntityFormDrawer>

      {/* Suspend Access Confirmation Dialog */}
      <ConfirmActionDialog
        open={Boolean(suspendEmpId)}
        onOpenChange={o => { if (!o) setSuspendEmpId(null); }}
        title="Suspend Access?"
        description="Employee status will become suspended and their system login disabled. Historical data remains intact."
        confirmLabel="Suspend Access"
        onConfirm={async () => {
          if (!suspendEmpId) return;
          try {
            await suspendMut.mutateAsync(suspendEmpId);
            toast.success("Access suspended");
            setSuspendEmpId(null);
          } catch (err) {
            toast.error(formatApiError(err as ApiError));
          }
        }}
      />

      {/* Reactivate Access Confirmation Dialog */}
      <ConfirmActionDialog
        open={Boolean(activateEmpId)}
        onOpenChange={o => { if (!o) setActivateEmpId(null); }}
        title="Reactivate Access?"
        description="Employee status will become active and their system login re-enabled."
        confirmLabel="Reactivate Access"
        onConfirm={async () => {
          if (!activateEmpId) return;
          try {
            await activateMut.mutateAsync(activateEmpId);
            toast.success("Access reactivated");
            setActivateEmpId(null);
          } catch (err) {
            toast.error(formatApiError(err as ApiError));
          }
        }}
      />
    </PermissionGate>
  );
}

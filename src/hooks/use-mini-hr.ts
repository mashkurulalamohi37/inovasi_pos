import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

export type MiniHrEmployee = {
  id: string;
  employee_code: string;
  first_name: string;
  last_name?: string | null;
  full_name: string;
  mobile?: string | null;
  email?: string | null;
  joining_date?: string | null;
  department_id?: string | null;
  designation_id?: string | null;
  department_name?: string | null;
  designation_name?: string | null;
  primary_store_id?: string | null;
  employee_status: string;
  user_account_id?: string | null;
  has_login: boolean;
  is_active: boolean;
  photo_url?: string | null;
};

export type MiniHrDepartment = {
  id: string;
  department_code: string;
  department_name: string;
  description?: string | null;
  is_active: boolean;
};

export type MiniHrDesignation = {
  id: string;
  designation_code: string;
  designation_name: string;
  description?: string | null;
  level?: number | null;
  is_active: boolean;
};

export type MiniHrDashboard = {
  total_employees: number;
  active_employees: number;
  inactive_employees: number;
  suspended_employees: number;
  employees_with_login: number;
  employees_without_login: number;
  total_departments: number;
  stores_with_employees: number;
};

export type MiniHrStoreAssignment = {
  id: string;
  store_id: string;
  assignment_type: string;
  is_primary: boolean;
  is_active: boolean;
};

export type MiniHrUserAccessRow = {
  employee_id: string;
  employee_code: string;
  full_name: string;
  username?: string | null;
  roles: string[];
  stores: MiniHrStoreAssignment[];
  employee_status: string;
  account_status: string;
  last_login_at?: string | null;
};

export function useMiniHrDashboard(enabled = true) {
  return useQuery({
    queryKey: queryKeys.miniHr.dashboard,
    queryFn: () => api.get<MiniHrDashboard>("/mini-hr/dashboard"),
    enabled,
  });
}

export function useMiniHrEmployees(params?: { q?: string; status?: string }, enabled = true) {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.status) qs.set("status", params.status);
  const query = qs.toString();
  return useQuery({
    queryKey: queryKeys.miniHr.employees(query || "all"),
    queryFn: () => api.get<MiniHrEmployee[]>(`/mini-hr/employees${query ? `?${query}` : ""}`),
    enabled,
  });
}

export function useMiniHrDepartments(enabled = true) {
  return useQuery({
    queryKey: queryKeys.miniHr.departments,
    queryFn: () => api.get<MiniHrDepartment[]>("/mini-hr/departments"),
    enabled,
  });
}

export function useMiniHrDesignations(enabled = true) {
  return useQuery({
    queryKey: queryKeys.miniHr.designations,
    queryFn: () => api.get<MiniHrDesignation[]>("/mini-hr/designations"),
    enabled,
  });
}

export function useMiniHrUserAccess(enabled = true) {
  return useQuery({
    queryKey: queryKeys.miniHr.userAccess,
    queryFn: () => api.get<MiniHrUserAccessRow[]>("/mini-hr/user-access"),
    enabled,
  });
}

export function useMiniHrMyProfile(enabled = true) {
  return useQuery({
    queryKey: queryKeys.miniHr.myProfile,
    queryFn: () => api.get<MiniHrEmployee & { stores: MiniHrStoreAssignment[] }>("/mini-hr/my-profile"),
    enabled,
    retry: false,
  });
}

export function useMiniHrEmployeeStores(employeeId?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.miniHr.stores(employeeId ?? ""),
    queryFn: () => api.get<MiniHrStoreAssignment[]>(`/mini-hr/employees/${employeeId}/stores`),
    enabled: Boolean(employeeId) && enabled,
  });
}

function invalidateHr(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["mini-hr"] });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<MiniHrEmployee>("/mini-hr/employees", body),
    onSuccess: () => invalidateHr(qc),
  });
}

export function usePatchEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<MiniHrEmployee>(`/mini-hr/employees/${id}`, body),
    onSuccess: () => invalidateHr(qc),
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/mini-hr/departments", body),
    onSuccess: () => invalidateHr(qc),
  });
}

export function usePatchDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/mini-hr/departments/${id}`, body),
    onSuccess: () => invalidateHr(qc),
  });
}

export function useCreateDesignation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/mini-hr/designations", body),
    onSuccess: () => invalidateHr(qc),
  });
}

export function usePatchDesignation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/mini-hr/designations/${id}`, body),
    onSuccess: () => invalidateHr(qc),
  });
}

export function useAssignEmployeeStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, body }: { employeeId: string; body: Record<string, unknown> }) =>
      api.post(`/mini-hr/employees/${employeeId}/stores`, body),
    onSuccess: () => invalidateHr(qc),
  });
}

export function useRemoveEmployeeStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, assignmentId }: { employeeId: string; assignmentId: string }) =>
      api.delete(`/mini-hr/employees/${employeeId}/stores/${assignmentId}`),
    onSuccess: () => invalidateHr(qc),
  });
}

export function useCreateEmployeeUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, body }: { employeeId: string; body: Record<string, unknown> }) =>
      api.post(`/mini-hr/employees/${employeeId}/create-user`, body),
    onSuccess: () => invalidateHr(qc),
  });
}

export function useResetEmployeePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, body }: { employeeId: string; body: Record<string, unknown> }) =>
      api.post(`/mini-hr/employees/${employeeId}/reset-password`, body),
    onSuccess: () => invalidateHr(qc),
  });
}

export function useAssignEmployeeRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, body }: { employeeId: string; body: Record<string, unknown> }) =>
      api.post(`/mini-hr/employees/${employeeId}/assign-role`, body),
    onSuccess: () => invalidateHr(qc),
  });
}

export function useSuspendEmployeeAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (employeeId: string) => api.post(`/mini-hr/employees/${employeeId}/suspend-access`),
    onSuccess: () => invalidateHr(qc),
  });
}

export function useActivateEmployeeAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (employeeId: string) => api.post(`/mini-hr/employees/${employeeId}/activate-access`),
    onSuccess: () => invalidateHr(qc),
  });
}

export function useGenerateTempPassword() {
  return useMutation({
    mutationFn: () => api.get<{ temporary_password: string }>("/mini-hr/generate-temp-password"),
  });
}

export type MiniHrEmployeeActivityItem = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  user_id?: string | null;
  detail?: Record<string, unknown> | null;
  created_at?: string | null;
};

export function useMiniHrEmployeeActivity(employeeId?: string, enabled = true) {
  return useQuery({
    queryKey: ["mini-hr", "activity", employeeId],
    queryFn: () => api.get<MiniHrEmployeeActivityItem[]>(`/mini-hr/employees/${employeeId}/activity`),
    enabled: Boolean(employeeId) && enabled,
  });
}

export type MiniHrAttendanceItem = {
  id: string;
  company_id: string;
  store_id: string;
  employee_id: string;
  date: string;
  clock_in: string;
  clock_out?: string | null;
  status: string;
  notes?: string | null;
  duration_minutes?: number | null;
  created_at?: string | null;
};

export function useMiniHrAttendance(params?: { date?: string; store_id?: string; employee_id?: string }, enabled = true) {
  const qs = new URLSearchParams();
  if (params?.date) qs.set("date", params.date);
  if (params?.store_id) qs.set("store_id", params.store_id);
  if (params?.employee_id) qs.set("employee_id", params.employee_id);
  const query = qs.toString();
  return useQuery({
    queryKey: ["mini-hr", "attendance", query || "all"],
    queryFn: () => api.get<MiniHrAttendanceItem[]>(`/mini-hr/attendance${query ? `?${query}` : ""}`),
    enabled,
  });
}

export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { employee_id: string; store_id?: string; notes?: string }) =>
      api.post<MiniHrAttendanceItem>("/mini-hr/attendance/clock-in", body),
    onSuccess: () => invalidateHr(qc),
  });
}

export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { attendance_id: string; notes?: string }) =>
      api.post<MiniHrAttendanceItem>("/mini-hr/attendance/clock-out", body),
    onSuccess: () => invalidateHr(qc),
  });
}

export function useCreateAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<MiniHrAttendanceItem>("/mini-hr/attendance", body),
    onSuccess: () => invalidateHr(qc),
  });
}

/**
 * Result of a bulk attendance action. Employees already in the target state come
 * back under `skipped` rather than failing, so re-submitting a roster is safe.
 */
export type BulkAttendanceResult = {
  clocked_in?: MiniHrAttendanceItem[];
  clocked_out?: MiniHrAttendanceItem[];
  marked_absent?: MiniHrAttendanceItem[];
  skipped: Array<{ employee_id?: string; attendance_id?: string; reason: string }>;
  failed: Array<{ employee_id?: string; attendance_id?: string; detail: string }>;
};

export function useBulkClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { employee_ids: string[]; store_id?: string; notes?: string }) =>
      api.post<BulkAttendanceResult>("/mini-hr/attendance/bulk-clock-in", body),
    // One batch, one invalidation — the whole point of the bulk endpoint.
    onSuccess: () => invalidateHr(qc),
  });
}

export function useBulkClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { attendance_ids: string[]; notes?: string }) =>
      api.post<BulkAttendanceResult>("/mini-hr/attendance/bulk-clock-out", body),
    onSuccess: () => invalidateHr(qc),
  });
}

/** Records a no-show — a dated row with a status but no clock times. */
export function useBulkMarkAbsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { employee_ids: string[]; date?: string; notes?: string }) =>
      api.post<BulkAttendanceResult>("/mini-hr/attendance/bulk-mark-absent", body),
    onSuccess: () => invalidateHr(qc),
  });
}

// ─────────────────────────  LEAVE MANAGEMENT  ─────────────────────────

export type MiniHrLeaveItem = {
  id: string;
  company_id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  store_id?: string | null;
  leave_type: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason?: string | null;
  status: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  created_by?: string | null;
  created_at?: string | null;
};

export type MiniHrLeaveSummary = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  approved_days: number;
  sick_days: number;
};

export type MiniHrLeaveResponse = {
  summary: MiniHrLeaveSummary;
  items: MiniHrLeaveItem[];
};

export function useMiniHrLeave(
  params?: { status?: string; employee_id?: string; leave_type?: string; from_date?: string; to_date?: string },
  enabled = true,
) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.employee_id) qs.set("employee_id", params.employee_id);
  if (params?.leave_type) qs.set("leave_type", params.leave_type);
  if (params?.from_date) qs.set("from_date", params.from_date);
  if (params?.to_date) qs.set("to_date", params.to_date);
  const query = qs.toString();
  return useQuery({
    queryKey: ["mini-hr", "leave", query || "all"],
    queryFn: () => api.get<MiniHrLeaveResponse>(`/mini-hr/leave${query ? `?${query}` : ""}`),
    enabled,
  });
}

export function useCreateLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      employee_id: string;
      leave_type: string;
      start_date: string;
      end_date: string;
      total_days?: number;
      store_id?: string;
      reason?: string;
    }) => api.post<MiniHrLeaveItem>("/mini-hr/leave", body),
    onSuccess: () => invalidateHr(qc),
  });
}

export function useApproveLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leave_id, review_notes }: { leave_id: string; review_notes?: string }) =>
      api.post<MiniHrLeaveItem>(`/mini-hr/leave/${leave_id}/approve`, { review_notes }),
    onSuccess: () => invalidateHr(qc),
  });
}

export function useRejectLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leave_id, review_notes }: { leave_id: string; review_notes?: string }) =>
      api.post<MiniHrLeaveItem>(`/mini-hr/leave/${leave_id}/reject`, { review_notes }),
    onSuccess: () => invalidateHr(qc),
  });
}

export function useCancelLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (leave_id: string) => api.post<MiniHrLeaveItem>(`/mini-hr/leave/${leave_id}/cancel`, {}),
    onSuccess: () => invalidateHr(qc),
  });
}


export type MiniHrPayrollSummaryItem = {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  department: string;
  designation: string;
  days_worked: number;
  hours_logged: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  payable_days: number;
};

export function useMiniHrPayrollSummary(params: { year: number; month: number; store_id?: string }, enabled = true) {
  const qs = new URLSearchParams();
  qs.set("year", String(params.year));
  qs.set("month", String(params.month));
  if (params.store_id) qs.set("store_id", params.store_id);
  const query = qs.toString();
  return useQuery({
    queryKey: ["mini-hr", "payroll-summary", query],
    queryFn: () => api.get<MiniHrPayrollSummaryItem[]>(`/mini-hr/payroll-summary?${query}`),
    enabled,
  });
}


export type MiniHrShiftRosterItem = {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  store_id: string | null;
  shift_date: string;
  shift_type: string;
  notes: string | null;
  created_at: string | null;
};

export function useMiniHrShiftRoster(params: { week_start: string; store_id?: string }, enabled = true) {
  const qs = new URLSearchParams();
  qs.set("week_start", params.week_start);
  if (params.store_id) qs.set("store_id", params.store_id);
  const query = qs.toString();
  return useQuery({
    queryKey: ["mini-hr", "shift-roster", query],
    queryFn: () => api.get<MiniHrShiftRosterItem[]>(`/mini-hr/shift-roster?${query}`),
    enabled,
  });
}

export function useUpsertShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      employee_id: string;
      shift_date: string;
      shift_type: string;
      store_id?: string;
      notes?: string;
    }) => api.post<MiniHrShiftRosterItem>("/mini-hr/shift-roster", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mini-hr", "shift-roster"] }),
  });
}

export function useDeleteShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roster_id: string) => api.delete<{ deleted: string }>(`/mini-hr/shift-roster/${roster_id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mini-hr", "shift-roster"] }),
  });
}

export function useUploadMiniHrPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, file }: { employeeId: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      const url = employeeId === "me" || employeeId === "self"
        ? "/mini-hr/my-profile/upload-photo"
        : `/mini-hr/employees/${employeeId}/upload-photo`;
      return apiFetch<MiniHrEmployee>(url, {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mini-hr"] });
    },
  });
}

export function useUploadMyProfilePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiFetch<MiniHrEmployee>("/mini-hr/my-profile/upload-photo", {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mini-hr"] });
    },
  });
}



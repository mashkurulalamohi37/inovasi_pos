import { api } from "./api";

export type DeviceRecord = {
  id: string;
  device_id: string;
  device_name: string;
  status: string;
};

export type ApprovalRecord = {
  id: string;
  title: string;
  status: string;
  request_type: string;
};

export type NotificationRecord = {
  id: string;
  title: string;
  is_read: boolean;
  event_type: string;
};

export type TenantRecord = {
  id: string;
  code: string;
  name: string;
  is_suspended: boolean;
  plan_code: string | null;
};

export async function registerDevice(deviceId: string, deviceName?: string): Promise<DeviceRecord> {
  return api.post<DeviceRecord>("/devices/register", {
    device_id: deviceId,
    device_name: deviceName ?? "POS Terminal",
  });
}

export async function listApprovals(status?: string): Promise<ApprovalRecord[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return api.get<ApprovalRecord[]>(`/approvals${q}`);
}

export async function approveRequest(requestId: string, comment?: string): Promise<ApprovalRecord> {
  return api.post<ApprovalRecord>(`/approvals/${requestId}/approve`, { comment });
}

export async function listNotifications(unreadOnly = false): Promise<NotificationRecord[]> {
  const q = unreadOnly ? "?unread_only=true" : "";
  return api.get<NotificationRecord[]>(`/notifications${q}`);
}

export async function markNotificationRead(notificationId: string): Promise<NotificationRecord> {
  return api.post<NotificationRecord>(`/notifications/${notificationId}/read`, {});
}

export async function listSuperAdminTenants(): Promise<TenantRecord[]> {
  return api.get<TenantRecord[]>("/super-admin/tenants");
}

export async function fetchSubscriptionUsage(): Promise<{
  plan_code: string | null;
  usage: Record<string, { current: number; limit: number }>;
  warnings: Array<{ metric: string; usage_pct: number; message: string }>;
}> {
  return api.get("/subscriptions/usage");
}

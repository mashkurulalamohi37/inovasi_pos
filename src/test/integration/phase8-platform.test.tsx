import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { login, logout } from "@/lib/auth";
import {
  approveRequest,
  listApprovals,
  listNotifications,
  listSuperAdminTenants,
  markNotificationRead,
  registerDevice,
} from "@/lib/phase8-api";

function NotificationBell({ unreadCount }: { unreadCount: number }) {
  return (
    <button type="button" aria-label="Notifications">
      Notifications
      {unreadCount > 0 ? <span data-testid="unread-badge">{unreadCount}</span> : null}
    </button>
  );
}

describe("phase 8 platform integration", () => {
  it("registers a device in pending state", async () => {
    await login("admin@pulse.pos", "admin123", "PULSE-DEMO");
    const device = await registerDevice("browser-pos-99", "Checkout Browser");
    expect(device.status).toBe("pending");
    expect(device.device_id).toBe("browser-pos-99");
    await logout();
  });

  it("lists pending approvals in inbox", async () => {
    await login("admin@pulse.pos", "admin123", "PULSE-DEMO");
    const pending = await listApprovals("pending");
    expect(pending.length).toBeGreaterThan(0);
    expect(pending[0].status).toBe("pending");
    await logout();
  });

  it("approves a pending request", async () => {
    await login("admin@pulse.pos", "admin123", "PULSE-DEMO");
    const approved = await approveRequest("apr-1", "Looks good");
    expect(approved.status).toBe("approved");
    await logout();
  });

  it("loads unread notifications for bell badge", async () => {
    await login("admin@pulse.pos", "admin123", "PULSE-DEMO");
    const unread = await listNotifications(true);
    expect(unread.every(n => !n.is_read)).toBe(true);
    render(<NotificationBell unreadCount={unread.length} />);
    expect(screen.getByTestId("unread-badge")).toHaveTextContent(String(unread.length));
    await logout();
  });

  it("marks notification as read", async () => {
    await login("admin@pulse.pos", "admin123", "PULSE-DEMO");
    const read = await markNotificationRead("ntf-1");
    expect(read.is_read).toBe(true);
    await logout();
  });

  it("loads super admin tenant list for platform admin", async () => {
    await login("super@pulse.pos", "super123", "PULSE-PLATFORM");
    const tenants = await listSuperAdminTenants();
    expect(tenants.some(t => t.code === "PULSE-DEMO")).toBe(true);
    expect(tenants.some(t => t.is_suspended)).toBe(true);
    await logout();
  });

  it("denies super admin tenants for normal admin", async () => {
    await login("admin@pulse.pos", "admin123", "PULSE-DEMO");
    await expect(listSuperAdminTenants()).rejects.toMatchObject({ status: 403 });
    await logout();
  });

  it("blocks login for suspended tenant", async () => {
    await expect(login("suspended@pulse.pos", "anypass", "PULSE-DEMO")).rejects.toMatchObject({
      status: 403,
      detail: "Tenant suspended",
    });
  });
});

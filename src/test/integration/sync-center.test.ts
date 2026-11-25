import { describe, expect, it } from "vitest";
import { computeSyncStatus, syncQueuedSales, type OfflineSalePayload } from "@/lib/offline-sync";
import type { QueuedSale } from "@/lib/app-store";
import { login, logout } from "@/lib/auth";
import { http, HttpResponse } from "msw";
import { API_BASE } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";

const sampleQueue: QueuedSale[] = [
  {
    id: "q-1",
    total: 650,
    tender: "cash",
    lines: [{ sku: "GRC-001", name: "Rice", qty: 1, price: 650 }],
    ts: Date.now(),
    status: "queued",
    industry: "grocery",
  },
  {
    id: "q-2",
    total: 185,
    tender: "cash",
    lines: [{ sku: "GRC-002", name: "Oil", qty: 1, price: 185 }],
    ts: Date.now(),
    status: "synced",
    industry: "grocery",
  },
];

describe("sync center queue", () => {
  it("computes offline status when queue has pending sales", () => {
    expect(computeSyncStatus(false, 2, false)).toBe("sync_pending");
    expect(computeSyncStatus(true, 0, false)).toBe("offline");
    expect(computeSyncStatus(false, 0, true)).toBe("sync_failed");
    expect(computeSyncStatus(false, 0, false)).toBe("online");
  });

  it("syncs queued sales via backend mock", async () => {
    await login("admin@pulse.pos", "admin123", "PULSE-DEMO");
    const result = await syncQueuedSales(sampleQueue, "grocery");
    expect(result.total).toBe(1);
    expect(result.synced).toBe(1);
    expect(result.conflicts).toBe(0);
    await logout();
  });

  it("marks conflicts when server returns 409", async () => {
    server.use(
      http.post(`${API_BASE}/sales`, () =>
        HttpResponse.json({ detail: "conflict" }, { status: 409 }),
      ),
    );
    await login("admin@pulse.pos", "admin123", "PULSE-DEMO");
    const result = await syncQueuedSales(sampleQueue, "grocery");
    expect(result.conflicts).toBe(1);
    expect(result.details[0]?.status).toBe("conflict");
    await logout();
  });

  it("builds offline payload with industry pack", async () => {
    const { queuedSaleToPayload } = await import("@/lib/offline-sync");
    const payload: OfflineSalePayload = queuedSaleToPayload(sampleQueue[0], "grocery");
    expect(payload.industry_pack).toBe("grocery");
    expect(payload.client_transaction_id).toBe("q-1");
    expect(payload.lines[0].sku).toBe("GRC-001");
  });
});

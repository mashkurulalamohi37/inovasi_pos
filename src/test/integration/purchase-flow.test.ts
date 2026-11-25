import { describe, expect, it } from "vitest";
import { api } from "@/lib/api";
import { login, logout } from "@/lib/auth";

describe("purchase flow integration", () => {
  it("creates a purchase order and receives goods", async () => {
    await login("admin@pulse.pos", "admin123", "PULSE-DEMO");

    const createBody = {
      supplier_id: "sup-1",
      lines: [
        {
          product_id: "prod-1",
          qty: 10,
          unit_cost: 600,
          line_total: 6000,
        },
      ],
    };

    const created = await api.post<{ id: string; status: string; po_number: string }>(
      "/purchases",
      createBody,
    );

    expect(created.id).toMatch(/^po-/);
    expect(created.status).toBe("draft");
    expect(created.po_number).toBeTruthy();

    const received = await api.post<{ id: string; status: string; receive: unknown }>(
      `/purchases/${created.id}/receive`,
      {
        lines: [{ purchase_line_id: "line-1", qty: 10, batch_no: "BATCH-001" }],
        remarks: "GRN received",
      },
    );

    expect(received.id).toBe(created.id);
    expect(received.status).toBe("received");
    expect(received.receive).toMatchObject({ remarks: "GRN received" });

    const list = await api.get<Array<{ id: string; status: string }>>("/purchases");
    expect(list.some(p => p.id === created.id && p.status === "received")).toBe(true);

    await logout();
  });
});

import { describe, expect, it } from "vitest";
import type { CartLine } from "@/lib/app-store";
import { buildSalePayload, postSale } from "@/lib/sales-api";
import { login, logout } from "@/lib/auth";

describe("sales API payload integration", () => {
  const cart: CartLine[] = [
    {
      sku: "GRC-001",
      name: "Basmati Rice 5kg",
      price: 650,
      qty: 1,
      extras: { productId: "prod-1" },
    },
  ];

  it("builds a payload matching backend sale schema", () => {
    const payload = buildSalePayload(cart, "grocery", "Cash", {
      clientId: "TX-integration-001",
      taxRate: 0.05,
      storeId: "store-1",
      counterId: "counter-1",
    });

    expect(payload).toMatchObject({
      client_transaction_id: "TX-integration-001",
      industry_pack: "grocery",
      tender: "cash",
      store_id: "store-1",
      counter_id: "counter-1",
      subtotal: 650,
      tax: 33,
      total: 683,
    });
    expect(payload.lines[0]).toMatchObject({
      sku: "GRC-001",
      product_id: "prod-1",
      unit_price: 650,
      qty: 1,
    });
  });

  it("posts sale to mocked backend and returns invoice", async () => {
    await login("admin@pulse.pos", "admin123", "PULSE-DEMO");

    const payload = buildSalePayload(cart, "grocery", "Cash", {
      clientId: "TX-integration-post",
      taxRate: 0.05,
    });

    const result = await postSale(payload);

    expect(result.invoice_number).toBe("INV-0001");
    expect(result.duplicate).toBe(false);
    expect(result.total).toBe(payload.total);

    await logout();
  });
});

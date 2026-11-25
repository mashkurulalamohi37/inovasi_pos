/**
 * The restaurant cart mirrors `order.lines`, so the qty stepper and remove button
 * must reach the backend. They used to call `app.updateQty` / `app.removeLine`,
 * which touch local state only — the edit looked applied, then the next refetch
 * silently reverted it and the kitchen and the bill never learned about it.
 *
 * These assert on the intercepted request, which is the shape of check that would
 * also have caught the `table_number` / `target_table_id` contract drift.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { beforeAll, describe, expect, it } from "vitest";
import {
  useUpdateRestaurantOrderLine,
  useVoidRestaurantOrderLine,
} from "@/hooks/use-industry-backoffice";
import { login } from "@/lib/auth";
import { API_BASE } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const ORDER_ID = "order-1";
const LINE_ID = "line-1";

beforeAll(async () => {
  await login("admin@pulse.pos", "admin123", "PULSE-DEMO");
});

describe("restaurant order line mutations", () => {
  it("PATCHes the line when the qty stepper changes a quantity", async () => {
    let captured: { url: string; body: unknown } | null = null;
    server.use(
      http.patch(
        `${API_BASE}/industry/restaurant/orders/:orderId/lines/:lineId`,
        async ({ request }) => {
          captured = { url: request.url, body: await request.json() };
          return HttpResponse.json({ id: ORDER_ID, lines: [] });
        },
      ),
    );

    const { result } = renderHook(() => useUpdateRestaurantOrderLine(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({ orderId: ORDER_ID, lineId: LINE_ID, body: { qty: 4 } });

    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.url).toContain(`/orders/${ORDER_ID}/lines/${LINE_ID}`);
    expect(captured!.body).toEqual({ qty: 4 });
  });

  it("sends the void reason the backend requires after a KOT", async () => {
    let captured: { url: string; body: Record<string, unknown> } | null = null;
    server.use(
      http.post(
        `${API_BASE}/industry/restaurant/orders/:orderId/lines/:lineId/void`,
        async ({ request }) => {
          captured = { url: request.url, body: (await request.json()) as Record<string, unknown> };
          return HttpResponse.json({ id: ORDER_ID, subtotal: 0, lines: [] });
        },
      ),
    );

    const { result } = renderHook(() => useVoidRestaurantOrderLine(), { wrapper: createWrapper() });
    await result.current.mutateAsync({
      orderId: ORDER_ID,
      lineId: LINE_ID,
      body: { qty: 1, reason: "Guest changed order" },
    });

    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.url).toContain(`/lines/${LINE_ID}/void`);
    expect(captured!.body.reason).toBe("Guest changed order");
    expect(captured!.body.qty).toBe(1);
  });

  it("surfaces the backend rejection instead of swallowing it", async () => {
    server.use(
      http.patch(`${API_BASE}/industry/restaurant/orders/:orderId/lines/:lineId`, () =>
        HttpResponse.json(
          { detail: "Cannot reduce below already-sent kitchen qty; void instead" },
          { status: 400 },
        ),
      ),
    );

    const { result } = renderHook(() => useUpdateRestaurantOrderLine(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({ orderId: ORDER_ID, lineId: LINE_ID, body: { qty: 1 } }),
    ).rejects.toBeDefined();
  });
});

import { http, HttpResponse } from "msw";

/** Must match vitest `VITE_API_URL` and app `resolveApiBase()` in tests. */
export const API_BASE = "http://localhost:9001/api/v1";

/** Host-agnostic path so absolute 9001 URLs and origin-relative `/api/v1` both match. */
const API = "*/api/v1";

const mockUser = {
  id: "user-1",
  email: "admin@pulse.pos",
  username: "admin",
  full_name: "Pulse Admin",
  company_id: "company-1",
  company_name: "Pulse Retail",
  store_id: "store-1",
  store_code: "DHK-01",
  store_name: "Dhaka Main",
  role_code: "Super Admin",
  role_id: "role-1",
  permissions: ["sales.create", "inventory.edit", "inventory.adjust", "reports.export", "config.packs"],
};

const mockProducts = [
  {
    id: "prod-1",
    sku: "GRC-001",
    barcode: "8801001",
    name: "Basmati Rice 5kg",
    industry_pack: "grocery",
    base_price: 650,
    wholesale_price: 620,
    is_active: true,
    meta: {},
  },
  {
    id: "prod-2",
    sku: "GRC-002",
    barcode: "8801002",
    name: "Sunflower Oil 1L",
    industry_pack: "grocery",
    base_price: 185,
    wholesale_price: null,
    is_active: true,
    meta: {},
  },
];

let purchaseSeq = 1;
const purchases = new Map<string, Record<string, unknown>>();

/** Reset mutable handler state between tests (resetHandlers alone does not). */
export function resetMswState() {
  purchaseSeq = 1;
  purchases.clear();
}

function paginated<T>(items: T[], page = 1, pageSize = 50) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    page,
    page_size: pageSize,
    pages,
  };
}

export const handlers = [
  http.post(`${API}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string; company_code?: string };
    if (body.email === "suspended@pulse.pos") {
      return HttpResponse.json({ detail: "Tenant suspended" }, { status: 403 });
    }
    if (body.email === "super@pulse.pos" && body.password === "super123") {
      return HttpResponse.json({
        access_token: "mock-super-token",
        refresh_token: "mock-super-refresh",
        token_type: "bearer",
      });
    }
    if (body.email === "admin@pulse.pos" && body.password === "admin123") {
      return HttpResponse.json({
        access_token: "mock-access-token",
        refresh_token: "mock-refresh-token",
        token_type: "bearer",
      });
    }
    return HttpResponse.json({ detail: "Invalid credentials" }, { status: 401 });
  }),

  http.get(`${API}/auth/me`, ({ request }) => {
    const auth = request.headers.get("Authorization");
    if (auth === "Bearer mock-super-token") {
      return HttpResponse.json({
        ...mockUser,
        email: "super@pulse.pos",
        full_name: "Platform Super Admin",
        role_code: "Super Admin",
        permissions: ["platform.admin"],
      });
    }
    if (!auth?.startsWith("Bearer mock-access-token")) {
      return HttpResponse.json({ detail: "Not authenticated" }, { status: 401 });
    }
    return HttpResponse.json(mockUser);
  }),

  http.post(`${API}/auth/refresh`, async ({ request }) => {
    const body = (await request.json()) as { refresh_token?: string };
    if (body.refresh_token === "mock-refresh-token") {
      return HttpResponse.json({
        access_token: "mock-access-token",
        refresh_token: "mock-refresh-token",
        token_type: "bearer",
      });
    }
    return HttpResponse.json({ detail: "Invalid refresh token" }, { status: 401 });
  }),

  http.post(`${API}/auth/logout`, () => HttpResponse.json({ ok: true })),

  http.get(`${API}/products`, ({ request }) => {
    const url = new URL(request.url);
    const industry = url.searchParams.get("industry_pack");
    const page = Number(url.searchParams.get("page") ?? "1");
    let items = mockProducts;
    if (industry) items = items.filter((p) => p.industry_pack === industry);
    return HttpResponse.json(paginated(items, page));
  }),

  http.post(`${API}/products`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        id: "prod-new",
        sku: body.sku,
        barcode: body.barcode ?? null,
        name: body.name,
        industry_pack: body.industry_pack,
        base_price: body.base_price,
        wholesale_price: body.wholesale_price ?? null,
        is_active: true,
        meta: body.meta ?? {},
      },
      { status: 201 },
    );
  }),

  http.get(`${API}/purchases`, () => {
    return HttpResponse.json(Array.from(purchases.values()));
  }),

  http.post(`${API}/purchases`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const id = `po-${purchaseSeq++}`;
    const po = {
      id,
      po_number: `PO-${String(purchaseSeq).padStart(4, "0")}`,
      status: "draft",
      supplier_id: body.supplier_id ?? null,
      lines: body.lines ?? [],
      total: 1000,
    };
    purchases.set(id, po);
    return HttpResponse.json(po, { status: 201 });
  }),

  http.post(`${API}/purchases/:purchaseId/receive`, async ({ params, request }) => {
    const purchaseId = params.purchaseId as string;
    const existing = purchases.get(purchaseId);
    if (!existing) {
      return HttpResponse.json({ detail: "Purchase not found" }, { status: 404 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const received = { ...existing, status: "received", receive: body };
    purchases.set(purchaseId, received);
    return HttpResponse.json(received);
  }),

  http.post(`${API}/sales`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      id: "sale-1",
      invoice_number: "INV-0001",
      duplicate: false,
      total: body.total ?? 0,
    });
  }),

  // Idempotent offline sync probe — 404 means "not yet synced"
  http.get(`${API}/sales/sync/:clientTxId`, () =>
    HttpResponse.json({ detail: "Not found" }, { status: 404 }),
  ),

  http.get(`${API}/inventory/stock`, () => {
    return HttpResponse.json([
      { product_id: "prod-1", sku: "GRC-001", name: "Basmati Rice 5kg", qty_on_hand: 42 },
      { product_id: "prod-2", sku: "GRC-002", name: "Sunflower Oil 1L", qty_on_hand: 18 },
    ]);
  }),

  http.post(`${API}/devices/register`, async ({ request }) => {
    const body = (await request.json()) as { device_id?: string; device_name?: string };
    return HttpResponse.json({
      id: "dev-1",
      device_id: body.device_id ?? "pos-1",
      device_name: body.device_name ?? "POS Terminal",
      status: "pending",
    });
  }),

  http.get(`${API}/devices`, () =>
    HttpResponse.json([
      { id: "dev-1", device_id: "pos-1", device_name: "Front Counter", status: "approved" },
    ]),
  ),

  http.get(`${API}/approvals`, ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const items = [
      { id: "apr-1", title: "Refund approval", status: "pending", request_type: "refund" },
      { id: "apr-2", title: "Price override", status: "approved", request_type: "price_override" },
    ];
    return HttpResponse.json(status ? items.filter((i) => i.status === status) : items);
  }),

  http.post(`${API}/approvals/:id/approve`, ({ params }) =>
    HttpResponse.json({
      id: params.id,
      title: "Refund approval",
      status: "approved",
      request_type: "refund",
    }),
  ),

  http.get(`${API}/notifications`, ({ request }) => {
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get("unread_only") === "true";
    const items = [
      { id: "ntf-1", title: "Approval needed: Refund", is_read: false, event_type: "approval_request" },
      { id: "ntf-2", title: "Sync completed", is_read: true, event_type: "sync" },
    ];
    return HttpResponse.json(unreadOnly ? items.filter((i) => !i.is_read) : items);
  }),

  http.post(`${API}/notifications/:id/read`, ({ params }) =>
    HttpResponse.json({
      id: params.id,
      title: "Approval needed: Refund",
      is_read: true,
      event_type: "approval_request",
    }),
  ),

  http.get(`${API}/super-admin/tenants`, ({ request }) => {
    const auth = request.headers.get("Authorization");
    if (auth !== "Bearer mock-super-token") {
      return HttpResponse.json({ detail: "Platform admin required" }, { status: 403 });
    }
    return HttpResponse.json([
      { id: "company-1", code: "PULSE-DEMO", name: "Pulse Retail", is_suspended: false, plan_code: "enterprise" },
      { id: "company-jw", code: "AURA-JEWELRY", name: "Aura Fine Jewelry & Gems", is_suspended: false, plan_code: "professional" },
      { id: "company-el", code: "VOLT-ELECTRONICS", name: "Volt Electronics & Gadgets", is_suspended: false, plan_code: "professional" },
      { id: "company-2", code: "PILOT-001", name: "Pilot Retail", is_suspended: true, plan_code: "starter" },
    ]);
  }),

  http.get(`${API}/subscriptions/usage`, () =>
    HttpResponse.json({
      plan_code: "starter",
      usage: {
        stores: { current: 1, limit: 1 },
        users: { current: 2, limit: 2 },
        industry_packs: { current: 1, limit: 1 },
      },
      warnings: [{ metric: "users", usage_pct: 100, message: "Limit reached" }],
    }),
  ),
];

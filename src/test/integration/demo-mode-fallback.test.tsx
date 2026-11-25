import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { usePosCatalog } from "@/hooks/use-pos-catalog";
import { api } from "@/lib/api";
import { login, logout } from "@/lib/auth";
import { AuthCtx, type AuthContextValue } from "@/lib/auth-provider";
import { disableDemoMode, enableDemoMode, isDemoMode, shouldUseBackend } from "@/lib/demo-mode";
import { API_BASE } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";

const mockAuthValue: AuthContextValue = {
  user: null,
  isDemo: false,
  loading: false,
  logout: async () => {},
  refreshUser: async () => {},
  adoptUser: () => {},
  switchStore: () => {},
  can: () => true,
  requestLogout: () => {},
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthCtx.Provider value={mockAuthValue}>{children}</AuthCtx.Provider>
    </QueryClientProvider>
  );
}

describe("demo mode fallback", () => {
  const demoItems = [
    { id: "demo-1", sku: "DEMO-1", name: "Demo Product", price: 99, stock: 50 },
  ];

  it("does not use backend when demo mode is enabled without auth", () => {
    disableDemoMode();
    enableDemoMode();

    expect(isDemoMode()).toBe(false);
    expect(shouldUseBackend()).toBe(false);
  });

  it("usePosCatalog returns demo items without calling backend", () => {
    enableDemoMode();

    const { result } = renderHook(() => usePosCatalog("grocery", demoItems), {
      wrapper: createWrapper(),
    });

    expect(result.current.items).toEqual(
      demoItems.map((item) => ({
        ...item,
        isMarkdownActive: false,
        markdownBadge: undefined,
        markdownDiscountPct: undefined,
        markdownRuleName: undefined,
        originalPrice: undefined,
      })),
    );
    expect(result.current.fromBackend).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("returns empty catalog when backend returns no products (no mock fallback)", async () => {
    await login("admin@pulse.pos", "admin123", "PULSE-DEMO");
    disableDemoMode();

    server.use(
      http.get(`${API_BASE}/products`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, page_size: 50, pages: 0 }),
      ),
      http.get(`${API_BASE}/inventory/stock`, () => HttpResponse.json([])),
    );

    const { result } = renderHook(() => usePosCatalog("grocery", demoItems), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.fromBackend).toBe(false);

    await logout();
  });

  it("uses backend catalog when authenticated and products exist", async () => {
    await login("admin@pulse.pos", "admin123", "PULSE-DEMO");
    disableDemoMode();

    const products = await api.get<{ items: Array<{ id: string; name: string }> }>("/products");
    expect(products.items.length).toBeGreaterThan(0);

    const { result } = renderHook(() => usePosCatalog("grocery", demoItems), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.fromBackend).toBe(true);
    });

    expect(result.current.items[0]?.name).toBe("Basmati Rice 5kg");
    expect(result.current.items).not.toEqual(demoItems);

    await logout();
  });
});

import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { login, logout, getStoredUser } from "@/lib/auth";
import { setTokens } from "@/lib/api";
import { API_BASE } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function TestLoginForm() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const user = await login("admin@pulse.pos", "admin123", "PULSE-DEMO", "DHK-01");
      setMessage(`Welcome, ${user.full_name}`);
    } catch (err: unknown) {
      const detail = (err as { detail?: string })?.detail ?? "Login failed";
      setMessage(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <button type="submit" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}

describe("login integration", () => {
  beforeEach(() => {
    setTokens(null, null);
  });

  it("logs in successfully and stores user session", async () => {
    const user = await login("admin@pulse.pos", "admin123", "PULSE-DEMO", "DHK-01");

    expect(user.email).toBe("admin@pulse.pos");
    expect(user.full_name).toBe("Pulse Admin");
    expect(localStorage.getItem("pulse.accessToken")).toBe("mock-access-token");
    expect(getStoredUser()?.role_code).toBe("Super Admin");

    await logout();
  });

  it("returns 401 for invalid credentials", async () => {
    await expect(login("admin@pulse.pos", "wrong-password", "PULSE-DEMO")).rejects.toMatchObject({
      status: 401,
    });
    expect(localStorage.getItem("pulse.accessToken")).toBeNull();
  });

  it("renders login form and shows welcome message on success", async () => {
    const user = userEvent.setup();
    render(<TestLoginForm />);

    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Welcome, Pulse Admin");
    });
  });

  it("renders login form and shows error on failure", async () => {
    setTokens(null, null);
    server.use(
      http.post(`${API_BASE}/auth/login`, () =>
        HttpResponse.json({ detail: "Invalid credentials" }, { status: 401 }),
      ),
    );

    const user = userEvent.setup();
    render(<TestLoginForm />);
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Invalid credentials");
    });
  });

  it("deduplicates concurrent refreshAccessToken calls into a single in-flight network request", async () => {
    let refreshCalls = 0;
    server.use(
      http.post(`${API_BASE}/auth/refresh`, async () => {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return HttpResponse.json({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          token_type: "bearer",
        });
      }),
    );

    setTokens("old-access-token", "old-refresh-token");

    const { refreshAccessToken, getAccessToken } = await import("@/lib/api");

    // Launch 4 concurrent refresh calls
    const [r1, r2, r3, r4] = await Promise.all([
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
    ]);

    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(r3).toBe(true);
    expect(r4).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(getAccessToken()).toBe("new-access-token");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  isAuthenticated: vi.fn(() => false),
}));

import { isAuthenticated } from "@/lib/auth";
import {
  disableDemoMode,
  enableDemoMode,
  isDemoMode,
  shouldUseBackend,
} from "@/lib/demo-mode";

describe("demo-mode", () => {
  beforeEach(() => {
    vi.mocked(isAuthenticated).mockReturnValue(false);
    disableDemoMode();
  });

  it("isDemoMode returns false when authenticated", () => {
    vi.mocked(isAuthenticated).mockReturnValue(true);
    enableDemoMode();
    expect(isDemoMode()).toBe(false);
  });

  it("isDemoMode stays false even when unauthenticated and demo flag is set — demo mode is permanently disabled", () => {
    enableDemoMode();
    expect(isDemoMode()).toBe(false);
  });

  it("isDemoMode returns false when unauthenticated and demo flag is unset", () => {
    expect(isDemoMode()).toBe(false);
  });

  it("shouldUseBackend returns true when authenticated", () => {
    vi.mocked(isAuthenticated).mockReturnValue(true);
    expect(shouldUseBackend()).toBe(true);

    // Demo flag is ignored while authenticated — isDemoMode() is always false then
    enableDemoMode();
    expect(shouldUseBackend()).toBe(true);
  });

  it("shouldUseBackend returns false when unauthenticated", () => {
    vi.mocked(isAuthenticated).mockReturnValue(false);
    expect(shouldUseBackend()).toBe(false);

    enableDemoMode();
    expect(shouldUseBackend()).toBe(false);
  });
});

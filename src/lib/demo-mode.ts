import { isAuthenticated } from "./auth";

/**
 * Demo mode is permanently disabled for production.
 * All callers of isDemoMode() will receive false, so every
 * route uses the real backend unconditionally.
 */
export function isDemoMode(): boolean {
  return false;
}

export function enableDemoMode(): void {
  // No-op: demo mode has been removed.
}

export function disableDemoMode(): void {
  // No-op: demo mode has been removed.
  // Also clear any stale flag that might exist in localStorage from an older build.
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    localStorage.removeItem("pulse.demoMode");
  }
}

export function shouldUseBackend(): boolean {
  return isAuthenticated();
}

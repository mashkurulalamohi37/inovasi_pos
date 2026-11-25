import { api, setTokens, loadStoredTokens, getAccessToken } from "./api";
import { disableDemoMode } from "./demo-mode";
import { clearAllStoredCompanyLogos } from "./company-branding";

export type AuthUser = {
  id: string;
  email: string;
  username: string;
  full_name: string;
  company_id: string;
  company_code?: string;
  company_name?: string;
  store_id: string | null;
  store_code?: string | null;
  store_name?: string | null;
  role_code: string;
  role_id: string;
  permissions: string[];
  is_platform_admin?: boolean;
  support_mode?: boolean;
  impersonation_id?: string | null;
};

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

const SUPPORT_STASH_KEY = "pulse.support.stash";

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export async function login(
  email: string,
  password: string,
  companyCode: string,
  storeCode?: string,
): Promise<AuthUser> {
  const tokens = await api.post<LoginResponse>("/auth/login", {
    email,
    password,
    company_code: companyCode.trim().toUpperCase(),
    store_code: storeCode,
  });
  setTokens(tokens.access_token, tokens.refresh_token);
  disableDemoMode();
  clearSupportStash();
  return getCurrentUser();
}

export async function logout(): Promise<void> {
  loadStoredTokens();
  const refresh = hasBrowserStorage() ? localStorage.getItem("pulse.refreshToken") : null;
  if (refresh) {
    try {
      await api.post("/auth/logout", { refresh_token: refresh });
    } catch {
      /* ignore */
    }
  }
  setTokens(null, null);
  clearSupportStash();
  if (hasBrowserStorage()) {
    localStorage.removeItem("pulse.user");
    clearAllStoredCompanyLogos();
  }
}

/** Stash the operator session, then switch into a tenant support token. */
export async function applySupportAccessToken(accessToken: string): Promise<AuthUser> {
  if (hasBrowserStorage()) {
    loadStoredTokens();
    localStorage.setItem(
      SUPPORT_STASH_KEY,
      JSON.stringify({
        accessToken: localStorage.getItem("pulse.accessToken"),
        refreshToken: localStorage.getItem("pulse.refreshToken"),
        user: localStorage.getItem("pulse.user"),
      }),
    );
  }
  setTokens(accessToken, null);
  disableDemoMode();
  return getCurrentUser();
}

/** End support mode and restore the previous operator session when stashed. */
export async function restoreOperatorSessionAfterSupport(): Promise<AuthUser | null> {
  if (!hasBrowserStorage()) return null;
  const raw = localStorage.getItem(SUPPORT_STASH_KEY);
  clearSupportStash();
  if (!raw) {
    setTokens(null, null);
    localStorage.removeItem("pulse.user");
    return null;
  }
  try {
    const stash = JSON.parse(raw) as {
      accessToken?: string | null;
      refreshToken?: string | null;
      user?: string | null;
    };
    setTokens(stash.accessToken ?? null, stash.refreshToken ?? null);
    if (stash.user) localStorage.setItem("pulse.user", stash.user);
    else localStorage.removeItem("pulse.user");
    if (!stash.accessToken) return null;
    return getCurrentUser();
  } catch {
    setTokens(null, null);
    localStorage.removeItem("pulse.user");
    return null;
  }
}

function clearSupportStash() {
  if (hasBrowserStorage()) localStorage.removeItem(SUPPORT_STASH_KEY);
}

export async function getCurrentUser(): Promise<AuthUser> {
  const user = await api.get<AuthUser>("/auth/me");
  if (hasBrowserStorage()) localStorage.setItem("pulse.user", JSON.stringify(user));
  return user;
}

export function getStoredUser(): AuthUser | null {
  if (!hasBrowserStorage()) return null;
  try {
    const raw = localStorage.getItem("pulse.user");
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  loadStoredTokens();
  if (hasBrowserStorage()) {
    return Boolean(localStorage.getItem("pulse.accessToken"));
  }
  return Boolean(getAccessToken());
}

export function userHasPermission(user: AuthUser | null, code: string): boolean {
  if (!user) return false;
  return user.permissions.includes(code);
}

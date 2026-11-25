import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getCurrentUser, getStoredUser, isAuthenticated, logout as authLogout, type AuthUser } from "./auth";
import {
  setUnauthorizedHandler,
  setForbiddenHandler,
  setTokens,
  formatApiError,
  refreshAccessToken,
  getAccessTokenExpiresAt,
  type ApiError,
} from "./api";
import { queryKeys } from "./queryKeys";
import { useApp } from "./app-store";
import { useApiFlags, useApiPacks, useApiDynamicFields, useApiMenuConfig } from "@/hooks/use-api-config";
import { shouldUseBackend, isDemoMode } from "./demo-mode";
import { backendHasPermission } from "./backend-permissions";
import { hasFullMenuAccess } from "./permissions";
import type { IndustryPackId } from "./industry-registry";
import { mergePackMenus } from "./industry-registry";
import type { Permission } from "./permissions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  isDemo: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Apply a just-logged-in user into React state (login page must call this). */
  adoptUser: (user: AuthUser) => void;
  switchStore: (storeId: string, storeCode?: string, storeName?: string) => void;
  can: (perm: Permission) => boolean;
  requestLogout: () => void;
};

export const AuthCtx = createContext<AuthContextValue | null>(null);

function clearSessionLocal() {
  setTokens(null, null);
  localStorage.removeItem("pulse.user");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Start null on both server and client so SSR HTML matches the first client paint.
  // localStorage is only read after mount (see hydrate effect below).
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: s => s.location.pathname });
  const onLoginPage = pathname === "/login";
  const qc = useQueryClient();
  const app = useApp();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSessionLocal();
      setUser(null);
      // Already on login — stale tokens after backend restart; don't block the form.
      if (window.location.pathname === "/login") {
        setSessionExpired(false);
        return;
      }
      setSessionExpired(true);
    });
    setForbiddenHandler((detail) => {
      toast.error("Permission required", { description: detail });
    });
  }, []);

  useEffect(() => {
    if (onLoginPage && sessionExpired) {
      clearSessionLocal();
      setUser(null);
      setSessionExpired(false);
    }
  }, [onLoginPage, sessionExpired]);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored) setUser(stored);

    if (!isAuthenticated()) {
      setLoading(false);
      return;
    }

    // If we already have a stored user, show the app immediately and
    // refresh the user profile silently in the background.
    if (stored) {
      setLoading(false);
      getCurrentUser()
        .then(u => {
          setUser(u);
          app.setRole(u.role_code as typeof app.role);
        })
        .catch((err: unknown) => {
          // ONLY clear session if backend returned 401 Unauthorized.
          // Network errors or server glitches must not log out an active cashier session!
          const status = (err as { status?: number })?.status;
          if (status === 401) {
            clearSessionLocal();
            setUser(null);
          }
        });
      return;
    }

    // No cached user — must wait for the network call before rendering.
    getCurrentUser()
      .then(u => {
        setUser(u);
        app.setRole(u.role_code as typeof app.role);
      })
      .catch((err: unknown) => {
        const status = (err as { status?: number })?.status;
        if (status === 401) {
          clearSessionLocal();
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Proactively refresh tokens before they expire so cashier/manager sessions never drop
  useEffect(() => {
    if (!user) return;

    const checkAndRefreshToken = async () => {
      if (!isAuthenticated()) return;
      const expiresAt = getAccessTokenExpiresAt();
      if (expiresAt) {
        const msUntilExpiry = expiresAt - Date.now();
        // If token expires within 10 minutes (or already expired), renew silently in background
        if (msUntilExpiry < 10 * 60 * 1000) {
          await refreshAccessToken();
        }
      }
    };

    // Periodically check every 2 minutes
    const interval = setInterval(checkAndRefreshToken, 2 * 60 * 1000);

    // Refresh immediately when returning to tab or unlocking device
    const onVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void checkAndRefreshToken();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityOrFocus);
    window.addEventListener("focus", onVisibilityOrFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      window.removeEventListener("focus", onVisibilityOrFocus);
    };
  }, [user]);

  const logout = async () => {
    await authLogout();
    setUser(null);
    qc.clear();
    navigate({ to: "/login" });
  };

  const refreshUser = async () => {
    if (!isAuthenticated()) return;
    const u = await getCurrentUser();
    setUser(u);
    app.setRole(u.role_code as typeof app.role);
  };

  const adoptUser = (u: AuthUser) => {
    setUser(u);
    setSessionExpired(false);
    setLoading(false);
    app.setRole(u.role_code as typeof app.role);
    const st = u.store_code || u.store_id;
    if (st) app.setStore(st);
  };

  const switchStore = useCallback((storeId: string, storeCode?: string, storeName?: string) => {
    const code = storeCode || storeId;
    app.setStore(code);
    setUser((prev) => {
      if (!prev) return prev;
      const updated: AuthUser = {
        ...prev,
        store_id: storeId,
        store_code: code,
        store_name: storeName || code,
      };
      if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
        localStorage.setItem("pulse.user", JSON.stringify(updated));
      }
      return updated;
    });
    qc.invalidateQueries();
    toast.success(`Switched active store: ${storeName || code}`);
  }, [app, qc]);

  const can = useCallback((perm: Permission) => {
    if (isDemoMode()) return app.can(perm);
    if (user && hasFullMenuAccess(user.role_code, user.is_platform_admin)) return true;
    if (user && (user.role_code === "Admin" || user.role_code === "Super Admin")) return true;
    if (user) return backendHasPermission(user.permissions, perm);
    return false;
  }, [user, app]);

  const requestLogout = () => setLogoutOpen(true);

  return (
    <AuthCtx.Provider value={{ user, loading, isDemo: isDemoMode(), logout, refreshUser, adoptUser, switchStore, can, requestLogout }}>
      <ApiHydrator />
      {children}
      <AlertDialog open={sessionExpired} onOpenChange={setSessionExpired}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Session expired</AlertDialogTitle>
            <AlertDialogDescription>Please sign in again to continue.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => {
              clearSessionLocal();
              setUser(null);
              setSessionExpired(false);
              navigate({ to: "/login" });
            }}>Sign in</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>You will need to sign in again to access the app.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setLogoutOpen(false); logout(); }}>Sign out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AuthCtx.Provider>
  );
}

function ApiHydrator() {
  const app = useApp();
  const on = shouldUseBackend();
  const { data: packs, isError: packsError, refetch: refetchPacks } = useApiPacks(on);
  const { data: flags, isError: flagsError, refetch: refetchFlags } = useApiFlags(on);
  const { data: dynamicFields } = useApiDynamicFields(on);
  const { data: menuConfig } = useApiMenuConfig(on);

  useEffect(() => {
    if (packsError || flagsError) {
      toast.error("Failed to load configuration", {
        description: "Retry or check backend connection.",
        action: { label: "Retry", onClick: () => { refetchPacks(); refetchFlags(); } },
      });
    }
  }, [packsError, flagsError, refetchPacks, refetchFlags]);

  // Always hydrate pack enablement from the database — Admin previously forced
  // allPacksEnabledConfigs() which made Industry Packs / POS Modes ignore DB state.
  useEffect(() => {
    if (!shouldUseBackend()) return;
    const next = { ...app.packConfigs };
    // Reset all packs to disabled by default in API mode, so only DB-enabled packs are active
    for (const key of Object.keys(next)) {
      const id = key as IndustryPackId;
      next[id] = {
        ...next[id],
        company: false,
        store: false,
        counter: false,
      };
    }
    if (packs?.length) {
      for (const p of packs) {
        const id = p.industry_code as IndustryPackId;
        if (!next[id]) continue;
        next[id] = {
          ...next[id],
          company: p.enabled_company,
          store: p.enabled_store,
          counter: p.enabled_counter,
          updatedAt: Date.now(),
          updatedBy: "API",
        };
      }
    }
    app.hydratePackConfigs(next);
  }, [packs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!flags?.length) return;
    const map: Record<string, boolean> = {};
    for (const f of flags) map[f.key] = f.enabled;
    app.hydrateFlags(map);
  }, [flags]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dynamicFields?.length) return;
    app.hydrateDynamicFields(dynamicFields.map(f => ({
      id: f.id,
      pack: f.pack_code as IndustryPackId,
      entity: f.entity,
      name: f.name,
      type: f.field_type as import("./industry-registry").FieldType,
      required: f.required,
      visibleInPos: f.visible_in_pos,
      visibleInProduct: f.visible_in_product,
      visibleInReceipt: f.visible_in_receipt,
      visibleInReport: f.visible_in_report,
      order: f.sort_order,
      enabled: f.enabled,
      allStores: f.all_stores,
      allCounters: f.all_counters,
      stores: f.store_codes,
      counters: f.counter_codes,
      options: f.options,
    })));
  }, [dynamicFields]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!menuConfig?.menus) return;
    app.hydratePackMenus(mergePackMenus(menuConfig.menus));
  }, [menuConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}

export function useBackendCan() {
  const { can, isDemo } = useAuth();
  return { can, isDemo };
}

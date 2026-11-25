import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppLayout } from "@/components/pulse/AppLayout";
import { useAuth } from "@/lib/auth-provider";
import { isAuthenticated, getStoredUser } from "@/lib/auth";
import { setTokens } from "@/lib/api";
import { hasSaasConsoleAccess } from "@/lib/permissions";

export const Route = createFileRoute("/super-admin")({
  beforeLoad: () => {
    // SSR has no localStorage, so this guard cannot run there — SuperAdminLayout
    // repeats the check after hydration. Both are required.
    if (typeof window === "undefined") return;
    if (!isAuthenticated()) throw redirect({ to: "/login" });
    const user = getStoredUser();
    if (!hasSaasConsoleAccess(user?.role_code, user?.is_platform_admin)) {
      throw redirect({ to: "/app/pos" });
    }
  },
  component: SuperAdminLayout,
});

function ConsoleLoading() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Checking access...</p>
      </div>
    </div>
  );
}

/**
 * Same shell as /app so SaaS pages keep the left Platform submenu.
 *
 * On a hard navigation the route is matched during SSR, where `beforeLoad`
 * returns early because there is no localStorage to read, and nothing re-ran
 * the check after hydration — so /super-admin/* rendered the whole console
 * shell and its navigation tree to anonymous visitors. This mirrors the
 * AppShell pattern in app.tsx: render nothing until platform access is
 * positively confirmed on the client.
 */
function SuperAdminLayout() {
  const { user, loading, refreshUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated()) {
      void navigate({ to: "/login" });
      return;
    }

    // Token present but AuthProvider not hydrated yet (e.g. straight after login).
    if (!user) {
      void refreshUser().catch(() => {
        setTokens(null, null);
        try {
          localStorage.removeItem("pulse.user");
        } catch {
          /* ignore */
        }
        void navigate({ to: "/login" });
      });
      return;
    }

    if (!hasSaasConsoleAccess(user.role_code, user.is_platform_admin)) {
      void navigate({ to: "/app/pos" });
    }
  }, [loading, user, navigate, refreshUser]);

  if (!user || !hasSaasConsoleAccess(user.role_code, user.is_platform_admin)) {
    return <ConsoleLoading />;
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

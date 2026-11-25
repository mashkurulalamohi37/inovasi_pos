import { createFileRoute, Outlet, useRouterState, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppLayout } from "@/components/pulse/AppLayout";
import { useApp } from "@/lib/app-store";
import { useAuth } from "@/lib/auth-provider";
import { isAuthenticated } from "@/lib/auth";
import { setTokens } from "@/lib/api";
import { isDemoMode } from "@/lib/demo-mode";
import { ROUTE_PERMISSIONS, routeAllowed } from "@/lib/permissions";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/app")({
  beforeLoad: () => {
    // SSR has no localStorage — do not treat that as logged-out (Phase 8B).
    if (typeof window === "undefined") return;
    if (!isAuthenticated() && !isDemoMode()) {
      throw redirect({ to: "/login" });
    }
  },
  component: AppShell,
});

function AppShell() {
  const { user, loading, isDemo, refreshUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (isDemo || user) return;

    // Token present but AuthProvider not hydrated yet (just after login).
    if (isAuthenticated()) {
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

    void navigate({ to: "/login" });
  }, [loading, user, isDemo, navigate, refreshUser]);

  if (loading && !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Restoring session...</p>
        </div>
      </div>
    );
  }

  return (
    <AppLayout>
      <Guard />
    </AppLayout>
  );
}

function Guard() {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const { role, roleOverrides } = useApp();
  const { user, isDemo, can: authCan } = useAuth();

  // Demo: local role matrix. Live: same route prefixes as ROUTE_PERMISSIONS,
  // evaluated via backend-mapped authCan (covers fashion + all verticals).
  const allowed = isDemo
    ? routeAllowed(role, pathname, roleOverrides)
    : (() => {
        const match = ROUTE_PERMISSIONS.find(
          r => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
        );
        if (!match || !user) return true;
        return authCan(match.perm);
      })();

  if (!allowed) {
    return (
      <div className="grid min-h-[calc(100vh-4rem)] place-items-center px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h1 className="font-display text-2xl font-semibold">Restricted area</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your current role <span className="font-semibold text-foreground">{role}</span> doesn't have access to this page. Switch role from the top bar or ask an Admin to grant permission.
          </p>
          <Button asChild className="mt-5"><Link to="/app/pos">Go to POS Lane</Link></Button>
        </div>
      </div>
    );
  }
  return <Outlet />;
}

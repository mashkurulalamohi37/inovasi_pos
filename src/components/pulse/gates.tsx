import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-provider";
import { useApp } from "@/lib/app-store";
import type { Permission } from "@/lib/permissions";

/**
 * PermissionGate — renders children only when the current user holds `perm`.
 * When denied it renders `fallback` (if provided) or nothing. Use this to gate
 * whole sections/actions by RBAC. For a button that must remain visible but
 * disabled with a reason, use DisabledReasonButton instead.
 *
 * While auth is still hydrating, render nothing (not the denied fallback) so a
 * brief /auth/me delay after login or API recovery does not flash "Permission denied".
 */
export function PermissionGate({
  perm,
  children,
  fallback = null,
}: {
  perm: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can, loading, user, isDemo } = useAuth();
  if (loading || (!isDemo && !user)) return null;
  return <>{can(perm) ? children : fallback}</>;
}

/**
 * FeatureFlagGate — renders children only when a feature flag is enabled for
 * the tenant. When disabled it renders `fallback` (if provided) or nothing.
 */
export function FeatureFlagGate({
  flag,
  children,
  fallback = null,
}: {
  flag: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { isFeatureEnabled } = useApp();
  return <>{isFeatureEnabled(flag) ? children : fallback}</>;
}

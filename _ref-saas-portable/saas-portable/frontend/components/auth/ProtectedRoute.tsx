import { Navigate, useLocation } from "react-router-dom";
import { useAuthContext } from "@/contexts/AuthContext";
import { AppRole } from "@/hooks/useAuth";
import { useMenuAccess } from "@/hooks/useMenuAccess";
import { isMenuGuardExempt } from "@/lib/menu-route-access";
import { MenuAccessDenied } from "@/components/auth/MenuAccessDenied";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: AppRole[];
  /** Override path used for menu guard (defaults to current location). */
  menuPath?: string;
}

export function ProtectedRoute({ children, requiredRoles, menuPath }: ProtectedRouteProps) {
  const { user, role, loading, hasRole, membershipStatus } = useAuthContext();
  const { canAccessPath, menuAccessUnrestricted } = useMenuAccess();
  const location = useLocation();
  const pathToCheck = menuPath ?? location.pathname;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (membershipStatus === "invited") {
    return <Navigate to="/membership-pending" replace />;
  }

  const useLegacyRoleGate = menuAccessUnrestricted;

  if (
    useLegacyRoleGate &&
    requiredRoles &&
    requiredRoles.length > 0 &&
    !hasRole(requiredRoles)
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-2">Access Denied</h1>
          <p className="text-muted-foreground">
            You don&apos;t have permission to access this page.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Required role: {requiredRoles.join(" or ")} | Your role: {role || "none"}
          </p>
        </div>
      </div>
    );
  }

  if (
    role !== "customer" &&
    !useLegacyRoleGate &&
    !isMenuGuardExempt(pathToCheck) &&
    !canAccessPath(pathToCheck)
  ) {
    return <MenuAccessDenied pathname={pathToCheck} />;
  }

  return <>{children}</>;
}

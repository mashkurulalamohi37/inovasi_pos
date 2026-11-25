import { Navigate, useLocation } from "react-router-dom";
import { useTenantContext } from "@/contexts/TenantContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { tenantHasRequestedPlan } from "@/lib/tenant-onboarding";
import { Loader2 } from "lucide-react";

const PENDING_ALLOWED_PREFIXES = [
  "/onboarding",
  "/pending-approval",
  "/membership-pending",
  "/customer-portal-pending",
  "/accounts/subscription",
  "/accounts/billing-history",
  "/accounts/invoices",
  "/accounts/pending-payments",
  "/accounts/platform-notifications",
  "/auth",
];

const MEMBERSHIP_PENDING_ALLOWED = ["/membership-pending", "/auth"];
const CUSTOMER_PORTAL_PENDING_ALLOWED = ["/customer-portal-pending", "/auth"];
const CUSTOMER_ALLOWED_PREFIXES = ["/customer/", "/customer-portal-pending", "/auth"];

const MOTHER_ACCOUNT_PATHS = [
  "/accounts/subscription",
  "/accounts/billing-history",
  "/accounts/invoices",
  "/accounts/pending-payments",
  "/accounts/platform-notifications",
];

interface GuardProps {
  children: React.ReactNode;
}

/** Staff self-signup awaiting organization owner approval. */
export function StaffMembershipGuard({ children }: GuardProps) {
  const { role, membershipStatus, organizationInToken, loading, isPlatformOperator } =
    useAuthContext();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isPharmacyStaff =
    role !== "customer" &&
    role !== "platform_admin" &&
    role !== null &&
    !isPlatformOperator;

  const needsPendingGate =
    isPharmacyStaff &&
    (membershipStatus === "invited" || !organizationInToken);

  if (needsPendingGate) {
    const path = location.pathname;
    const allowed = MEMBERSHIP_PENDING_ALLOWED.some((p) => path.startsWith(p));
    if (!allowed) {
      return <Navigate to="/membership-pending" replace state={{ from: location }} />;
    }
  }

  return <>{children}</>;
}

/** Customer portal sign-up awaiting pharmacy owner approval. */
export function CustomerPortalGuard({ children }: GuardProps) {
  const { role, customerPortalPending, loading } = useAuthContext();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const path = location.pathname;

  if (role === "customer" && customerPortalPending) {
    const allowed = CUSTOMER_PORTAL_PENDING_ALLOWED.some((p) => path.startsWith(p));
    if (!allowed) {
      return <Navigate to="/customer-portal-pending" replace state={{ from: location }} />;
    }
    return <>{children}</>;
  }

  if (role === "customer") {
    const allowed = CUSTOMER_ALLOWED_PREFIXES.some((p) => path.startsWith(p));
    if (!allowed) {
      return <Navigate to="/customer/notifications" replace state={{ from: location }} />;
    }
  }

  return <>{children}</>;
}

/** Blocks pharmacy modules until super-admin approves the organization. */
export function TenantApprovedGuard({ children }: GuardProps) {
  const { tenant, loading, isPendingApproval } = useTenantContext();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isPendingApproval && tenant) {
    const path = location.pathname;
    const allowed = PENDING_ALLOWED_PREFIXES.some((p) => path.startsWith(p));
    if (!allowed) {
      const target = tenantHasRequestedPlan(tenant)
        ? "/pending-approval"
        : "/onboarding/choose-plan";
      return <Navigate to={target} replace state={{ from: location }} />;
    }
    if (!tenantHasRequestedPlan(tenant) && !path.startsWith("/onboarding")) {
      return <Navigate to="/onboarding/choose-plan" replace state={{ from: location }} />;
    }
  }

  return <>{children}</>;
}

/** Subscription / billing pages — organization mother account (owner) only. */
export function MotherAccountGuard({ children }: GuardProps) {
  const { isMotherAccount, loading } = useTenantContext();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isMotherAccount && MOTHER_ACCOUNT_PATHS.some((p) => location.pathname.startsWith(p))) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 p-6 text-center">
        <h2 className="text-lg font-semibold text-destructive">Mother account only</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Subscription, billing, and invoices are managed by your organization&apos;s owner account
          only. Contact your workspace owner if you need access.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

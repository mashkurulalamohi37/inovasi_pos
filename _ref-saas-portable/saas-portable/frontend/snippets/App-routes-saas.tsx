/**
 * Paste into your App.tsx — imports + route definitions + guard wrapper.
 * Adjust role names and layout imports to match your app.
 */

// --- imports ---
import Auth from "./pages/Auth";
import OrganizationChoosePlanPage from "./pages/OrganizationChoosePlanPage";
import OrganizationPendingApproval from "./pages/OrganizationPendingApproval";
import MembershipPendingApproval from "./pages/MembershipPendingApproval";
import PlatformAdminConsole from "./pages/PlatformAdminConsole";
import { TenantProvider } from "@/contexts/TenantContext";
import {
  StaffMembershipGuard,
  CustomerPortalGuard,
  TenantApprovedGuard,
  MotherAccountGuard,
} from "@/components/auth/TenantAccessGuards";

// --- wrap protected tree (inside AuthProvider) ---
/*
<AuthProvider>
  <TenantProvider>
    <StaffMembershipGuard>
      <CustomerPortalGuard>
        <TenantApprovedGuard>
          <MotherAccountGuard>
            <Routes>...</Routes>
          </MotherAccountGuard>
        </TenantApprovedGuard>
      </CustomerPortalGuard>
    </StaffMembershipGuard>
  </TenantProvider>
</AuthProvider>
*/

// --- public auth routes ---
/*
<Route path="/auth" element={<Auth />} />
<Route path="/login" element={<Navigate to="/auth" replace />} />
<Route path="/membership-pending" element={<MembershipPendingApproval />} />
*/

// --- onboarding + approval (admin / owner) ---
/*
<Route
  path="/onboarding/choose-plan"
  element={
    <ProtectedRoute requiredRoles={["admin"]}>
      <OrganizationChoosePlanPage />
    </ProtectedRoute>
  }
/>
<Route
  path="/pending-approval"
  element={
    <ProtectedRoute requiredRoles={["admin"]}>
      <OrganizationPendingApproval />
    </ProtectedRoute>
  }
/>
*/

// --- platform operator console ---
/*
<Route
  path="/platform/admin"
  element={
    <ProtectedRoute requiredRoles={["platform_admin"]}>
      <Navigate to="/platform/admin/companies" replace />
    </ProtectedRoute>
  }
/>
<Route
  path="/platform/admin/:section"
  element={
    <ProtectedRoute requiredRoles={["platform_admin"]}>
      <PlatformAdminConsole />
    </ProtectedRoute>
  }
/>
*/

// PlatformAdminConsole sections: companies | users | packages | notifications

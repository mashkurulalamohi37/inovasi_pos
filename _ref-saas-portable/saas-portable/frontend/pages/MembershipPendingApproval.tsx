import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuthContext } from "@/contexts/AuthContext";
import { TenantBrandingHeader } from "@/components/auth/TenantBrandingHeader";
import { AuthFormNav } from "@/components/auth/AuthFormNav";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Building2 } from "lucide-react";
import { toast } from "sonner";

export default function MembershipPendingApproval() {
  const { user, membershipStatus, signOut, loading } = useAuthContext();

  useEffect(() => {
    if (!loading && membershipStatus === "active") {
      toast.success("Your account was approved! Loading menus…");
      window.location.assign("/");
    }
  }, [loading, membershipStatus]);

  const handleCheckStatus = async () => {
    const { data, error } = await apiClient.getCurrentUser();
    if (error) {
      toast.error(error.message || "Could not refresh status");
      return;
    }
    if (data?.membership_status === "active") {
      toast.success("Approved! Redirecting…");
      window.location.assign("/");
    } else {
      toast.message("Still waiting for your pharmacy owner to approve your access.");
    }
  };

  const goToAuth = async () => {
    await signOut();
    window.location.assign("/auth");
  };

  return (
    <div className="auth-slide-root min-h-screen">
      <div className="auth-slide-brand">
        <TenantBrandingHeader branding={null} />
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-md border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <AuthFormNav showSignOut={Boolean(user)} onSignOut={goToAuth} />
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-6 w-6 text-amber-600 animate-pulse" />
              Awaiting owner approval
            </CardTitle>
            <CardDescription>
              Your staff account was created. Your pharmacy owner must approve you and assign menu
              access (Cashier, Pharmacist, or Admin) before you can use POS, inventory, and other
              modules.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-4 w-4 shrink-0" />
              Ask your manager to open <strong className="text-foreground">User Management</strong>{" "}
              and approve your request under <strong className="text-foreground">Pending access</strong>.
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void handleCheckStatus()}>
                Check approval status
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/auth">Back to Sign In</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

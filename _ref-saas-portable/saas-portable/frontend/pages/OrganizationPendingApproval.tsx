import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { apiClient } from "@/lib/api-client";
import { useAuthContext } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Building2, LayoutDashboard } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export default function OrganizationPendingApproval() {
  const { user } = useAuthContext();
  const { data, refetch } = useQuery({
    queryKey: ["tenant-current"],
    queryFn: () => apiClient.getCurrentTenant(),
    refetchInterval: (q) => (q.state.data?.tenant?.status === "pending_approval" ? 15000 : false),
  });

  const tenant = data?.tenant;

  useEffect(() => {
    if (tenant?.status === "active") {
      toast.success("Your workspace is approved! Loading all menus…");
      window.location.assign("/");
    }
  }, [tenant?.status]);

  return (
    <MainLayout
      title="Awaiting approval"
      subtitle="Your pharmacy workspace is registered and pending platform review"
    >
      <Card className="max-w-xl mx-auto border-amber-500/30 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-6 w-6 text-amber-600 animate-pulse" />
            Pending approval
          </CardTitle>
          <CardDescription>
            <span className="font-medium text-foreground">{tenant?.name}</span> and your package
            request were submitted. A platform administrator will review and activate your account.
            After approval you can use POS, inventory, master data, and all modules.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="h-4 w-4" />
            Workspace code:{" "}
            <span className="font-mono font-medium text-foreground">
              {tenant?.company_code ?? "—"}
            </span>
          </div>
          <p>
            Plan selected: <strong className="text-foreground">{tenant?.plan_code ?? "—"}</strong>.
            You will receive full access once approved — then start entering your data from Master
            Data in the menu.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Check approval status
            </Button>
            {tenant?.status === "active" ? (
              <Button asChild>
                <Link to="/">
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  Open dashboard
                </Link>
              </Button>
            ) : null}
          </div>
          {user ? (
            <p className="text-xs text-muted-foreground">
              After approval, sign out and sign in again if menus do not appear immediately.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </MainLayout>
  );
}

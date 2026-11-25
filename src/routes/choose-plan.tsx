import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { isAuthenticated, getStoredUser } from "@/lib/auth";
import { PageHeader, PageBody } from "@/components/pulse/primitives";
import { SubscriptionPlanCards } from "@/components/subscription/SubscriptionPlanCards";
import { CompanyIdCopyField } from "@/components/auth/CompanyIdCopyField";
import { Button } from "@/components/ui/button";
import { useChangeSubscriptionPlan, usePublicSubscriptionPlans, useSubscriptionCurrent } from "@/hooks/use-api-config";
import { getStoredWorkspaceCode } from "@/lib/tenant-branding";
import { toast } from "sonner";

export const Route = createFileRoute("/choose-plan")({
  beforeLoad: () => {
    if (!isAuthenticated()) throw redirect({ to: "/login" });
  },
  component: ChoosePlanPage,
});

function ChoosePlanPage() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const companyCode = user?.company_code ?? getStoredWorkspaceCode();
  const { data: plans = [], isLoading } = usePublicSubscriptionPlans();
  const { data: current } = useSubscriptionCurrent(true);
  const changePlan = useChangeSubscriptionPlan();
  const [selected, setSelected] = useState<string | null>(current?.plan_code ?? "starter");

  const handleConfirm = () => {
    if (!selected) {
      toast.error("Select a package first");
      return;
    }
    changePlan.mutate(selected, {
      onSuccess: () => {
        toast.success("Subscription package activated");
        navigate({ to: "/app/pos" });
      },
    });
  };

  return (
    <div className="min-h-screen page-gradient">
      <PageHeader
        eyebrow="SaaS billing"
        title="Choose your package"
        subtitle="Select a plan for your workspace — upgrade anytime from Subscription settings."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/pos">Skip for now</Link>
          </Button>
        }
      />
      <PageBody className="mx-auto max-w-6xl space-y-6">
        {companyCode ? (
          <CompanyIdCopyField companyId={companyCode} hint="Use this Company ID when signing in on any device." />
        ) : null}

        <div>
          <h2 className="mb-1 text-lg font-semibold">Available packages</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Tap a package to select it, then confirm. Your workspace limits update immediately.
          </p>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <SubscriptionPlanCards plans={plans} mode="select" selectedPlanCode={selected} onSelectPlan={setSelected} currentPlanCode={current?.plan_code} />
          )}
        </div>

        <Button size="lg" disabled={!selected || changePlan.isPending} onClick={handleConfirm}>
          {changePlan.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Activating…
            </>
          ) : (
            "Confirm package selection"
          )}
        </Button>
      </PageBody>
    </div>
  );
}

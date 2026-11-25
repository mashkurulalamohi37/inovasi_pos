import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { apiClient } from "@/lib/api-client";
import { SubscriptionPlanCards } from "@/components/subscription/SubscriptionPlanCards";
import { CompanyIdCopyField } from "@/components/auth/CompanyIdCopyField";
import { useTenantContext } from "@/contexts/TenantContext";
import { tenantHasRequestedPlan } from "@/lib/tenant-onboarding";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function OrganizationChoosePlanPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenant, refreshTenant, isMotherAccount } = useTenantContext();
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ["public-subscription-plans"],
    queryFn: () => apiClient.getPublicSubscriptionPlans(),
  });

  const selectablePlans = plans.filter(
    (p) => p.is_active !== false && p.code.toLowerCase() !== "trial"
  );

  const requestPlan = useMutation({
    mutationFn: (planCode: string) => apiClient.requestTenantPlan(planCode),
    onSuccess: async () => {
      await refreshTenant();
      await queryClient.invalidateQueries({ queryKey: ["tenant-current"] });
      setReviewOpen(true);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not submit plan request");
    },
  });

  if (!isMotherAccount) {
    return (
      <MainLayout title="Choose a package" subtitle="Organization owner only">
        <p className="text-sm text-muted-foreground text-center py-12">
          Only the organization owner can select a subscription package. Contact your workspace
          owner.
        </p>
      </MainLayout>
    );
  }

  useEffect(() => {
    if (tenant && tenantHasRequestedPlan(tenant)) {
      navigate("/pending-approval", { replace: true });
    }
  }, [tenant, navigate]);

  const handleConfirm = () => {
    if (!selectedCode) {
      toast.error("Select a package first");
      return;
    }
    requestPlan.mutate(selectedCode);
  };

  return (
    <MainLayout
      title="Choose your package"
      subtitle="Select a plan for your pharmacy — a platform admin will review and activate your workspace"
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {tenant?.company_code ? (
          <CompanyIdCopyField
            companyId={tenant.company_code}
            hint="Save this Company ID — you will use it every time you sign in."
          />
        ) : null}

        <div>
          <h2 className="text-lg font-semibold mb-1">Available packages</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Tap a package to select it, then confirm. Payment and activation are handled after
            platform approval.
          </p>
          {plansLoading ? (
            <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          ) : (
            <SubscriptionPlanCards
              plans={selectablePlans}
              mode="select"
              selectedPlanCode={selectedCode}
              onSelectPlan={setSelectedCode}
            />
          )}
        </div>

        <Button
          size="lg"
          className="w-full sm:w-auto"
          disabled={!selectedCode || requestPlan.isPending}
          onClick={handleConfirm}
        >
          {requestPlan.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Submitting…
            </>
          ) : (
            "Confirm package selection"
          )}
        </Button>
      </div>

      <AlertDialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Request under review</AlertDialogTitle>
            <AlertDialogDescription>
              Your package selection has been sent to the platform administrator. You will get full
              access to POS, inventory, master data, and reports once your pharmacy is approved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setReviewOpen(false);
                navigate("/pending-approval", { replace: true });
              }}
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}

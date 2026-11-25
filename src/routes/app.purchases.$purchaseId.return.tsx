import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PurchaseReturnForm } from "@/features/purchases/PurchaseForms";
import { usePurchase } from "@/hooks/use-api-config";
import { shouldUseBackend } from "@/lib/demo-mode";
import { PageHeader, PageBody } from "@/components/pulse/primitives";
import { EmptyState, LoadingState, ErrorState } from "@/components/pulse/states";

export const Route = createFileRoute("/app/purchases/$purchaseId/return")({
  component: ReturnPurchasePage,
});

function ReturnPurchasePage() {
  const { purchaseId } = Route.useParams();
  const navigate = useNavigate();
  const useApi = shouldUseBackend();
  const { data: purchase, isLoading, isError, refetch } = usePurchase(useApi ? purchaseId : undefined);

  if (!useApi) {
    return (
      <>
        <PageHeader title="Return to supplier" />
        <PageBody><EmptyState title="Backend required" description="Connect to the live API to post returns." /></PageBody>
      </>
    );
  }
  if (isLoading) return <><PageHeader title="Return to supplier" /><PageBody><LoadingState rows={4} /></PageBody></>;
  if (isError || !purchase) {
    return (
      <>
        <PageHeader title="Return to supplier" />
        <PageBody><ErrorState title="Could not load purchase" onRetry={() => refetch()} /></PageBody>
      </>
    );
  }

  return (
    <PurchaseReturnForm
      layout="page"
      open
      purchase={purchase}
      onOpenChange={(open) => {
        if (!open) void navigate({ to: "/app/purchases" });
      }}
      onSuccess={() => {
        void navigate({ to: "/app/purchases" });
      }}
    />
  );
}

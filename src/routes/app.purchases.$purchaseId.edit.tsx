import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PurchaseOrderForm } from "@/features/purchases/PurchaseForms";
import { usePurchase } from "@/hooks/use-api-config";
import { shouldUseBackend } from "@/lib/demo-mode";
import { PageHeader, PageBody } from "@/components/pulse/primitives";
import { EmptyState, LoadingState, ErrorState } from "@/components/pulse/states";

export const Route = createFileRoute("/app/purchases/$purchaseId/edit")({
  component: EditPurchasePage,
});

function EditPurchasePage() {
  const { purchaseId } = Route.useParams();
  const navigate = useNavigate();
  const useApi = shouldUseBackend();
  const { data: purchase, isLoading, isError, refetch } = usePurchase(useApi ? purchaseId : undefined);

  if (!useApi) {
    return (
      <>
        <PageHeader title="Edit purchase order" />
        <PageBody><EmptyState title="Backend required" description="Connect to the live API to edit purchase orders." /></PageBody>
      </>
    );
  }
  if (isLoading) return <><PageHeader title="Edit purchase order" /><PageBody><LoadingState rows={4} /></PageBody></>;
  if (isError || !purchase) {
    return (
      <>
        <PageHeader title="Edit purchase order" />
        <PageBody><ErrorState title="Could not load purchase" onRetry={() => refetch()} /></PageBody>
      </>
    );
  }

  return (
    <PurchaseOrderForm
      layout="page"
      open
      purchase={purchase}
      onOpenChange={(open) => {
        if (!open) void navigate({ to: "/app/purchases/$purchaseId", params: { purchaseId } });
      }}
      onSuccess={() => {
        void navigate({ to: "/app/purchases/$purchaseId", params: { purchaseId } });
      }}
    />
  );
}

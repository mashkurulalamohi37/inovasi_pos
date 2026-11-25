import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GrnReceiveForm } from "@/features/purchases/PurchaseForms";
import { usePurchase } from "@/hooks/use-api-config";
import { shouldUseBackend } from "@/lib/demo-mode";
import { PageHeader, PageBody } from "@/components/pulse/primitives";
import { EmptyState, LoadingState, ErrorState } from "@/components/pulse/states";

export const Route = createFileRoute("/app/purchases/$purchaseId/receive")({
  component: ReceivePurchasePage,
});

function ReceivePurchasePage() {
  const { purchaseId } = Route.useParams();
  const navigate = useNavigate();
  const useApi = shouldUseBackend();
  const { data: purchase, isLoading, isError, refetch } = usePurchase(useApi ? purchaseId : undefined);

  if (!useApi) {
    return (
      <>
        <PageHeader title="Receive GRN" />
        <PageBody><EmptyState title="Backend required" description="Connect to the live API to receive goods." /></PageBody>
      </>
    );
  }
  if (isLoading) return <><PageHeader title="Receive GRN" /><PageBody><LoadingState rows={4} /></PageBody></>;
  if (isError || !purchase) {
    return (
      <>
        <PageHeader title="Receive GRN" />
        <PageBody><ErrorState title="Could not load purchase" onRetry={() => refetch()} /></PageBody>
      </>
    );
  }

  return (
    <GrnReceiveForm
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

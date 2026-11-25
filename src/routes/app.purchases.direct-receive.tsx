import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DirectPurchaseReceiveForm } from "@/features/purchases/PurchaseForms";
import { useAuth } from "@/lib/auth-provider";
import { shouldUseBackend } from "@/lib/demo-mode";
import { PageHeader, PageBody } from "@/components/pulse/primitives";
import { EmptyState } from "@/components/pulse/states";

export const Route = createFileRoute("/app/purchases/direct-receive")({
  component: DirectReceivePage,
});

function DirectReceivePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const useApi = shouldUseBackend();

  if (!useApi) {
    return (
      <>
        <PageHeader title="Direct purchase & receive" />
        <PageBody><EmptyState title="Backend required" description="Connect to the live API to post direct purchases." /></PageBody>
      </>
    );
  }

  return (
    <DirectPurchaseReceiveForm
      layout="page"
      open
      defaultStoreId={user?.store_id ?? undefined}
      onOpenChange={(open) => {
        if (!open) void navigate({ to: "/app/purchases" });
      }}
      onSuccess={(result) => {
        void navigate({
          to: "/app/purchases/$purchaseId",
          params: { purchaseId: result.purchase.id },
        });
      }}
    />
  );
}

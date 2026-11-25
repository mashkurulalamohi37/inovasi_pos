import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PurchaseOrderForm } from "@/features/purchases/PurchaseForms";
import { useAuth } from "@/lib/auth-provider";
import { shouldUseBackend } from "@/lib/demo-mode";
import { PageHeader, PageBody } from "@/components/pulse/primitives";
import { EmptyState } from "@/components/pulse/states";

export const Route = createFileRoute("/app/purchases/new")({
  component: NewPurchasePage,
});

function NewPurchasePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const useApi = shouldUseBackend();

  if (!useApi) {
    return (
      <>
        <PageHeader title="New purchase order" />
        <PageBody><EmptyState title="Backend required" description="Connect to the live API to create purchase orders." /></PageBody>
      </>
    );
  }

  return (
    <PurchaseOrderForm
      layout="page"
      open
      defaultStoreId={user?.store_id ?? undefined}
      onOpenChange={(open) => {
        if (!open) void navigate({ to: "/app/purchases" });
      }}
      onSuccess={() => {
        void navigate({ to: "/app/purchases" });
      }}
    />
  );
}

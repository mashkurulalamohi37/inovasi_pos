import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SupplierPaymentForm } from "@/features/purchases/PurchaseForms";
import { shouldUseBackend } from "@/lib/demo-mode";
import { PageHeader, PageBody } from "@/components/pulse/primitives";
import { EmptyState } from "@/components/pulse/states";

type PaymentSearch = { supplierId?: string };

export const Route = createFileRoute("/app/purchases/payments/new")({
  validateSearch: (search: Record<string, unknown>): PaymentSearch => ({
    supplierId: typeof search.supplierId === "string" ? search.supplierId : undefined,
  }),
  component: SupplierPaymentPage,
});

function SupplierPaymentPage() {
  const navigate = useNavigate();
  const { supplierId } = Route.useSearch();
  const useApi = shouldUseBackend();

  if (!useApi) {
    return (
      <>
        <PageHeader title="Supplier payment" />
        <PageBody><EmptyState title="Backend required" description="Connect to the live API to record payments." /></PageBody>
      </>
    );
  }

  return (
    <SupplierPaymentForm
      layout="page"
      open
      defaultSupplierId={supplierId}
      onOpenChange={(open) => {
        if (!open) void navigate({ to: "/app/purchases" });
      }}
      onSuccess={() => {
        void navigate({ to: "/app/purchases" });
      }}
    />
  );
}

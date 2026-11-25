import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PurchaseDetailDrawer } from "@/features/purchases/PurchaseDetailDrawer";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { useApprovePurchase, usePurchase } from "@/hooks/use-api-config";
import { shouldUseBackend } from "@/lib/demo-mode";
import { PageHeader, PageBody } from "@/components/pulse/primitives";
import { EmptyState } from "@/components/pulse/states";

export const Route = createFileRoute("/app/purchases/$purchaseId/")({
  component: PurchaseDetailPage,
});

function PurchaseDetailPage() {
  const { purchaseId } = Route.useParams();
  const navigate = useNavigate();
  const useApi = shouldUseBackend();
  const { data: purchase } = usePurchase(useApi ? purchaseId : undefined);
  const approvePurchase = useApprovePurchase();
  const [approveOpen, setApproveOpen] = useState(false);

  if (!useApi) {
    return (
      <>
        <PageHeader title="Purchase order" />
        <PageBody><EmptyState title="Backend required" description="Connect to the live API to view purchase orders." /></PageBody>
      </>
    );
  }

  return (
    <>
      <PurchaseDetailDrawer
        layout="page"
        purchaseId={purchaseId}
        onClose={() => void navigate({ to: "/app/purchases" })}
        onEdit={() => void navigate({ to: "/app/purchases/$purchaseId/edit", params: { purchaseId } })}
        onApprove={() => setApproveOpen(true)}
        onReceive={() => void navigate({ to: "/app/purchases/$purchaseId/receive", params: { purchaseId } })}
        onReturn={() => void navigate({ to: "/app/purchases/$purchaseId/return", params: { purchaseId } })}
        onInvoice={() => void navigate({ to: "/app/purchases/$purchaseId/invoice", params: { purchaseId } })}
        onPayment={() =>
          void navigate({
            to: "/app/purchases/payments/new",
            search: { supplierId: purchase?.supplier_id ?? undefined },
          })
        }
      />
      <ConfirmActionDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="Approve purchase order?"
        description="Approved POs can be received via GRN. This action is audited."
        confirmLabel="Approve"
        isPending={approvePurchase.isPending}
        onConfirm={async () => {
          await approvePurchase.mutateAsync(purchaseId);
          setApproveOpen(false);
        }}
      />
    </>
  );
}

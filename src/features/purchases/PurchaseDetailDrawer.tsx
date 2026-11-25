import { Link } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { AuditTrailPanel } from "@/components/pulse/AuditTrailPanel";
import { PermissionGate } from "@/components/pulse/gates";
import { PrintButton } from "@/components/pulse/ActionButtons";
import { printPurchaseOrder } from "@/features/purchases/purchase-print";
import { toast } from "sonner";
import { LoadingState, ErrorState } from "@/components/pulse/states";
import { fmtBDT } from "@/lib/pos-data";
import { usePurchase, useAuditLogs, useSupplierInvoices } from "@/hooks/use-api-config";
import {
  canApprovePurchase,
  canEditPurchase,
  canReceivePurchase,
  canReturnPurchase,
  displayPurchaseStatus,
  receivedLabel,
  totalQty,
} from "@/features/purchases/utils";
import type { PurchaseFormLayout } from "@/features/purchases/PurchaseFormShell";
import { ArrowLeft } from "lucide-react";

function PurchaseDetailBody({
  purchaseId,
  onEdit,
  onApprove,
  onReceive,
  onReturn,
  onInvoice,
  onPayment,
}: {
  purchaseId: string;
  onEdit: () => void;
  onApprove: () => void;
  onReceive: () => void;
  onReturn: () => void;
  onInvoice: () => void;
  onPayment: () => void;
}) {
  const { data: purchase, isLoading, isError, refetch } = usePurchase(purchaseId);
  const auditQuery = useAuditLogs({ entity_type: "purchase_invoice" });
  const invoicesQuery = useSupplierInvoices(purchaseId);

  const auditEntries = (auditQuery.data?.items ?? [])
    .filter((a) => a.entity_id === purchaseId)
    .map((a) => ({
      id: a.id,
      action: a.action,
      actor: a.user_id,
      at: a.created_at,
      detail: a.detail ? JSON.stringify(a.detail) : null,
    }));

  const relatedInvoices = invoicesQuery.data ?? [];
  const paid = relatedInvoices.reduce((s, i) => s + (i.paid_amount ?? 0), 0);
  const due = relatedInvoices.reduce((s, i) => s + (i.due_amount ?? 0), 0);

  if (isLoading) return <LoadingState rows={4} />;
  if (isError || !purchase) return <ErrorState title="Could not load purchase" onRetry={() => refetch()} />;

  return (
    <div className="space-y-5">
      <div className="space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Supplier</span><span>{purchase.supplier_name ?? "—"}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Status</span><StatusBadge status={displayPurchaseStatus(purchase.status)} /></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{purchase.purchase_date ? new Date(purchase.purchase_date).toLocaleDateString() : "—"}</span></div>
        {purchase.expected_date && (
          <div className="flex justify-between"><span className="text-muted-foreground">Expected delivery</span><span>{new Date(purchase.expected_date).toLocaleDateString()}</span></div>
        )}
        {purchase.reference_no && (
          <div className="flex justify-between"><span className="text-muted-foreground">Supplier ref</span><span>{purchase.reference_no}</span></div>
        )}
        <div className="flex justify-between"><span className="text-muted-foreground">Total qty</span><span>{totalQty(purchase)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Received</span><span>{receivedLabel(purchase)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Gross</span><span className="tabular-nums">{fmtBDT(purchase.subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">{fmtBDT(purchase.discount_amount)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="tabular-nums">{fmtBDT(purchase.tax_amount)}</span></div>
        <div className="flex justify-between font-semibold"><span>Net</span><span className="tabular-nums">{fmtBDT(purchase.total)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Invoice due</span><span className="tabular-nums">{fmtBDT(due)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="tabular-nums">{fmtBDT(paid)}</span></div>
        {purchase.supplier_id && (
          <Link to="/app/suppliers/$supplierId/ledger" params={{ supplierId: purchase.supplier_id }} className="text-xs text-primary underline">
            Open supplier ledger
          </Link>
        )}
      </div>

      <div className="rounded-md border border-border">
        <div className="border-b border-border bg-secondary/40 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">Lines</div>
        {purchase.lines.map((l) => (
          <div key={l.id} className="border-b border-border px-3 py-2 text-sm last:border-0">
            <div className="font-medium">{l.product_name ?? l.product_id}</div>
            <div className="text-xs text-muted-foreground">
              {l.sku}
              {(l.size || l.color) ? ` · ${[l.size, l.color].filter(Boolean).join(" / ")}` : ""}
              {l.variant_code ? ` · ${l.variant_code}` : ""}
            </div>
            <div className="mt-1 flex justify-between tabular-nums">
              <span>Qty {l.qty} · Rcvd {l.received_qty} · Bal {l.open_qty ?? l.qty - l.received_qty}</span>
              <span>{fmtBDT(l.line_total)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <PermissionGate perm="purchases.edit">
          {canEditPurchase(purchase.status) ? (
            <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button>
          ) : null}
        </PermissionGate>
        <PermissionGate perm="purchases.approve">
          {canApprovePurchase(purchase.status) ? (
            <Button size="sm" onClick={onApprove}>Approve</Button>
          ) : null}
        </PermissionGate>
        <PermissionGate perm="purchases.receive">
          {canReceivePurchase(purchase.status) ? (
            <Button size="sm" variant="outline" onClick={onReceive}>Receive (GRN)</Button>
          ) : null}
        </PermissionGate>
        <PermissionGate perm="purchases.edit">
          {canReturnPurchase(purchase) ? (
            <Button size="sm" variant="outline" onClick={onReturn}>Return to supplier</Button>
          ) : null}
        </PermissionGate>
        <PermissionGate perm="purchases.edit">
          {purchase.lines.some((l) => l.received_qty > 0) ? (
            <Button size="sm" variant="outline" onClick={onInvoice}>Supplier invoice</Button>
          ) : null}
        </PermissionGate>
        <PermissionGate perm="purchases.approve">
          <Button size="sm" variant="outline" onClick={onPayment}>Pay supplier</Button>
        </PermissionGate>
        <PrintButton
          onPrint={() => {
            if (!printPurchaseOrder(purchase)) {
              toast.error("Pop-up blocked. Allow pop-ups for this site to print.");
            }
          }}
        />
      </div>

      <AuditTrailPanel
        entries={auditEntries}
        isLoading={auditQuery.isLoading}
        error={auditQuery.isError ? "Failed to load audit trail" : null}
        onRetry={() => auditQuery.refetch()}
      />
    </div>
  );
}

export function PurchaseDetailDrawer({
  purchaseId,
  onClose,
  onEdit,
  onApprove,
  onReceive,
  onReturn,
  onInvoice,
  onPayment,
  layout = "drawer",
}: {
  purchaseId: string | null;
  onClose: () => void;
  onEdit: () => void;
  onApprove: () => void;
  onReceive: () => void;
  onReturn: () => void;
  onInvoice: () => void;
  onPayment: () => void;
  layout?: PurchaseFormLayout;
}) {
  const { data: purchase } = usePurchase(purchaseId ?? undefined);

  if (layout === "page") {
    if (!purchaseId) return null;
    return (
      <>
        <PageHeader
          title={purchase?.invoice_number ?? "Purchase order"}
          subtitle="PO detail, receiving status, invoices and audit trail"
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/purchases"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Purchases</Link>
            </Button>
          }
        />
        <PageBody>
          <SectionCard title="Purchase detail">
            <div className="p-4">
              <PurchaseDetailBody
                purchaseId={purchaseId}
                onEdit={onEdit}
                onApprove={onApprove}
                onReceive={onReceive}
                onReturn={onReturn}
                onInvoice={onInvoice}
                onPayment={onPayment}
              />
            </div>
          </SectionCard>
        </PageBody>
      </>
    );
  }

  return (
    <Sheet open={!!purchaseId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{purchase?.invoice_number ?? "Purchase order"}</SheetTitle>
        </SheetHeader>
        {purchaseId ? (
          <div className="mt-4">
            <PurchaseDetailBody
              purchaseId={purchaseId}
              onEdit={onEdit}
              onApprove={onApprove}
              onReceive={onReceive}
              onReturn={onReturn}
              onInvoice={onInvoice}
              onPayment={onPayment}
            />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

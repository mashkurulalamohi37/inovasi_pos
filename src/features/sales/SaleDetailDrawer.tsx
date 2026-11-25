import { Link } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/pulse/primitives";
import { AuditTrailPanel } from "@/components/pulse/AuditTrailPanel";
import { PermissionGate } from "@/components/pulse/gates";
import { DisabledReasonButton, PrintButton } from "@/components/pulse/ActionButtons";
import { LoadingState, ErrorState } from "@/components/pulse/states";
import { fmtBDT } from "@/lib/pos-data";
import { useSale, useAuditLogs, useReprintReceipt } from "@/hooks/use-api-config";
import {
  canReturnSale,
  canRefundSale,
  canCollectDue,
  normSaleStatus,
} from "@/features/sales/utils";

export function SaleDetailDrawer({
  saleId,
  onClose,
  onReturn,
  onRefund,
  onExchange,
  onCollectDue,
}: {
  saleId: string | null;
  onClose: () => void;
  onReturn: () => void;
  onRefund: () => void;
  onExchange: () => void;
  onCollectDue: () => void;
}) {
  const { data: sale, isLoading, isError, refetch } = useSale(saleId ?? undefined);
  const auditQuery = useAuditLogs({ entity_type: "sales_invoice" });
  const reprint = useReprintReceipt();

  const auditEntries = (auditQuery.data?.items ?? [])
    .filter((a) => a.entity_id === saleId)
    .map((a) => ({
      id: a.id,
      action: a.action,
      actor: a.user_id,
      at: a.created_at,
      detail: a.detail ? JSON.stringify(a.detail) : null,
    }));

  return (
    <Sheet open={!!saleId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{sale?.invoice_number ?? "Sale detail"}</SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <LoadingState rows={4} />
        ) : isError || !sale ? (
          <ErrorState title="Could not load sale" onRetry={() => refetch()} />
        ) : (
          <div className="mt-4 space-y-5">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span>{sale.customer_name ?? "Walk-in"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Store</span><span>{sale.store_name ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cashier</span><span>{sale.cashier_name ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><StatusBadge status={normSaleStatus(sale.status)} /></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Industry</span><span className="capitalize">{sale.industry_pack}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tender</span><span className="capitalize">{sale.tender}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">When</span><span>{sale.completed_at ? new Date(sale.completed_at).toLocaleString() : "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{fmtBDT(sale.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">{fmtBDT(sale.discount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="tabular-nums">{fmtBDT(sale.tax)}</span></div>
              <div className="flex justify-between font-semibold"><span>Total</span><span className="tabular-nums">{fmtBDT(sale.total)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="tabular-nums">{fmtBDT(sale.paid_amount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Due</span><span className="tabular-nums">{fmtBDT(sale.due_amount)}</span></div>
              {sale.customer_id && (
                <Link
                  to="/app/customers/$customerId/ledger"
                  params={{ customerId: sale.customer_id }}
                  className="text-xs text-primary underline"
                >
                  Open customer ledger
                </Link>
              )}
            </div>

            <div className="rounded-md border border-border">
              <div className="border-b border-border bg-secondary/40 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">Lines</div>
              {sale.lines.map((l) => (
                <div key={l.id} className="border-b border-border px-3 py-2 text-sm last:border-0">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-muted-foreground">{l.sku}</div>
                  <div className="mt-1 flex justify-between tabular-nums">
                    <span>Qty {l.qty} · Rtn {l.returned_qty} · Bal {l.returnable_qty}</span>
                    <span>{fmtBDT(l.line_total)}</span>
                  </div>
                </div>
              ))}
            </div>

            {sale.payments.length > 0 && (
              <div className="rounded-md border border-border">
                <div className="border-b border-border bg-secondary/40 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">Payments</div>
                {sale.payments.map((p) => (
                  <div key={p.id} className="flex justify-between border-b border-border px-3 py-2 text-sm last:border-0">
                    <span className="capitalize">{p.method} · {p.payment_type}</span>
                    <span className="tabular-nums">{fmtBDT(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <PermissionGate perm="pos.refund" fallback={<DisabledReasonButton label="Return" reason="You do not have permission to process returns." />}>
                {canReturnSale(sale) ? (
                  <Button size="sm" variant="outline" onClick={onReturn}>Return</Button>
                ) : null}
              </PermissionGate>
              <PermissionGate perm="pos.refund" fallback={<DisabledReasonButton label="Refund" reason="You do not have permission to issue refunds." />}>
                {canRefundSale(sale) ? (
                  <Button size="sm" variant="outline" onClick={onRefund}>Refund</Button>
                ) : null}
              </PermissionGate>
              <PermissionGate perm="pos.refund" fallback={<DisabledReasonButton label="Exchange" reason="You do not have permission to process exchanges." />}>
                {canReturnSale(sale) ? (
                  <Button size="sm" variant="outline" onClick={onExchange}>Exchange</Button>
                ) : null}
              </PermissionGate>
              <PermissionGate perm="customers.manage" fallback={<DisabledReasonButton label="Collect due" reason="You do not have permission to collect dues." />}>
                {canCollectDue(sale) ? (
                  <Button size="sm" onClick={onCollectDue}>Collect due</Button>
                ) : null}
              </PermissionGate>
              <PrintButton
                onPrint={() => reprint.mutate(sale.id)}
                isPrinting={reprint.isPending}
              />
            </div>

            <AuditTrailPanel
              entries={auditEntries}
              isLoading={auditQuery.isLoading}
              error={auditQuery.isError ? "Failed to load audit trail" : null}
              onRetry={() => auditQuery.refetch()}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

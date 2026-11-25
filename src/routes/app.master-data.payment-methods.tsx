import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { ListPagination } from "@/components/pulse/ListPagination";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useCreatePaymentMethod, usePaymentMethods, useUpdatePaymentMethod } from "@/hooks/use-api-config";

export const Route = createFileRoute("/app/master-data/payment-methods")({
  component: PaymentMethodsPage,
});

function PaymentMethodsPage() {
  const useApi = shouldUseBackend();
  const { data: apiMethods, isLoading, isError, refetch, isFetching } = usePaymentMethods();
  const updateMethod = useUpdatePaymentMethod();
  const createMethod = useCreatePaymentMethod();
  const [addOpen, setAddOpen] = useState(false);
  const [newMethod, setNewMethod] = useState({ code: "", name: "" });

  const rows = apiMethods ?? [];
  const listPage = useClientPagination(rows, 10);

  if (!useApi) {
    return (
      <>
        <PageHeader title="Payment methods" subtitle="Connect backend to manage tender methods." />
        <PageBody><EmptyState title="Backend required" description="Payment methods require API mode." /></PageBody>
      </>
    );
  }

  return (
    <PermissionGate
      perm="config.flags"
      fallback={
        <PageBody>
          <ErrorState title="Permission denied" description="Requires config.flags to manage payment methods." />
          <div className="mt-4"><DisabledReasonButton label="Manage payment methods" reason="Requires config.flags permission" /></div>
        </PageBody>
      }
    >
      <PageHeader
        title="Payment methods"
        subtitle="Master data — cash, card, mobile wallet and custom tenders used at POS"
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add method
            </Button>
          </>
        }
      />
      <PageBody>
        {isError && <ErrorState title="Failed to load payment methods" onRetry={() => refetch()} />}
        <SectionCard title="Configured methods">
          {isLoading ? (
            <LoadingState rows={5} />
          ) : rows.length === 0 ? (
            <EmptyState title="No payment methods" description="Add cash, card, mobile or a custom tender." />
          ) : (
            <>
              <div className="divide-y divide-border">
                {listPage.pageItems.map((m) => (
                  <div key={m.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{m.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{m.code}</div>
                    </div>
                    <Badge variant="outline" className={m.is_active ? "border-success/30 text-success" : ""}>
                      {m.is_active ? "Enabled" : "Disabled"}
                    </Badge>
                    <Switch
                      checked={m.is_active}
                      disabled={updateMethod.isPending || (["cash", "card", "mobile"].includes(m.code) && m.is_active)}
                      onCheckedChange={(v) => updateMethod.mutate({ id: m.id, body: { name: m.name, is_active: v } })}
                    />
                  </div>
                ))}
              </div>
              <ListPagination
                page={listPage.page}
                pageSize={listPage.pageSize}
                total={listPage.total}
                onPageChange={listPage.setPage}
              />
            </>
          )}
        </SectionCard>
      </PageBody>

      <EntityFormDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add payment method"
        onSubmit={async () => {
          await createMethod.mutateAsync({ code: newMethod.code.trim(), name: newMethod.name.trim() });
          setAddOpen(false);
          setNewMethod({ code: "", name: "" });
        }}
        isPending={createMethod.isPending}
        submitDisabled={!newMethod.code.trim() || !newMethod.name.trim()}
      >
        <div className="space-y-3">
          <div>
            <Label>Code</Label>
            <Input value={newMethod.code} onChange={(e) => setNewMethod((f) => ({ ...f, code: e.target.value }))} placeholder="bank_transfer" />
          </div>
          <div>
            <Label>Name</Label>
            <Input value={newMethod.name} onChange={(e) => setNewMethod((f) => ({ ...f, name: e.target.value }))} placeholder="Bank Transfer" />
          </div>
        </div>
      </EntityFormDrawer>
    </PermissionGate>
  );
}

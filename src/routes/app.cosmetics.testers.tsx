import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { PermissionGate } from "@/components/pulse/gates";
import { EmptyState, ErrorState, LoadingState } from "@/components/pulse/states";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useCosmeticsTesters, type CosmeticsTester } from "@/hooks/use-api-config";
import {
  useConvertCosmeticsTester,
  useSetCosmeticsTesterStatus,
} from "@/hooks/use-industry-backoffice";
import { toast } from "sonner";

export const Route = createFileRoute("/app/cosmetics/testers")({ component: CosmeticsTestersPage });

function CosmeticsTestersPage() {
  const useApi = shouldUseBackend();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<CosmeticsTester | null>(null);
  const [nextStatus, setNextStatus] = useState("retired");
  const [form, setForm] = useState({
    product_id: "",
    variant_id: "",
    batch_id: "",
    qty: "1",
    notes: "",
  });

  const testersQuery = useCosmeticsTesters({
    q: q || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const convertMut = useConvertCosmeticsTester();
  const statusMut = useSetCosmeticsTesterStatus();

  const rows = useMemo(() => (useApi ? testersQuery.data ?? [] : []), [useApi, testersQuery.data]);

  const handleConvert = async () => {
    if (!useApi) {
      toast.error("Backend mode required");
      return;
    }
    if (!form.product_id.trim()) {
      toast.error("Product ID required");
      return;
    }
    const qty = Number(form.qty);
    if (!qty || qty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    try {
      await convertMut.mutateAsync({
        product_id: form.product_id.trim(),
        variant_id: form.variant_id.trim() || undefined,
        batch_id: form.batch_id.trim() || undefined,
        qty,
        notes: form.notes.trim() || undefined,
      });
      toast.success("Converted to tester");
      setOpen(false);
      void testersQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Convert failed");
    }
  };

  const handleStatus = async () => {
    if (!statusTarget) return;
    try {
      await statusMut.mutateAsync({
        id: statusTarget.id,
        body: { status: nextStatus },
      });
      toast.success("Tester status updated");
      setStatusTarget(null);
      void testersQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Status update failed");
    }
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title="Testers" subtitle="Floor testers — not sellable stock" />
        <PageBody>
          <EmptyState
            title="Backend required"
            description="Tester conversion uses live cosmetics APIs. Enable backend mode to manage testers."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Testers"
        subtitle="Convert sellable units to floor testers. Tester qty is never sellable on POS."
        actions={
          <PermissionGate
            perm="cosmetics.manage"
            fallback={<DisabledReasonButton label="Convert to tester" reason="Requires cosmetics.manage" />}
          >
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setForm({ product_id: "", variant_id: "", batch_id: "", qty: "1", notes: "" });
                setOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Convert to tester
            </Button>
          </PermissionGate>
        }
      />
      <PageBody>
        <SectionCard
          title="Tester list"
          actions={
            <div className="flex gap-2">
              <Input
                className="h-8 w-48"
                placeholder="Search…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="retired">Retired</SelectItem>
                  <SelectItem value="depleted">Depleted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        >
          {testersQuery.isLoading ? (
            <LoadingState rows={3} />
          ) : testersQuery.isError ? (
            <ErrorState
              title="Failed to load testers"
              description={String(testersQuery.error)}
              onRetry={() => testersQuery.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No testers"
              description="Convert a sellable batch unit to create a floor tester."
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase">
                <tr>
                  <th className="px-5 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-left">Brand</th>
                  <th className="px-3 py-2 text-left">Shade</th>
                  <th className="px-3 py-2 text-left">Batch</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-2 font-medium">{r.product_name ?? r.sku ?? r.product_id}</td>
                    <td className="px-3 py-2 text-xs">{r.brand_name ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {[r.shade_code, r.shade_name].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.batch_no ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular">{r.qty}</td>
                    <td className="px-3 py-2"><StatusBadge status={String(r.status ?? "active")} /></td>
                    <td className="px-3 py-2 text-right">
                      <PermissionGate perm="cosmetics.manage">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setStatusTarget(r);
                            setNextStatus(r.status === "active" ? "retired" : "active");
                          }}
                        >
                          Set status
                        </Button>
                      </PermissionGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        <EntityFormDrawer
          open={open}
          onOpenChange={setOpen}
          title="Convert to tester"
          onSubmit={handleConvert}
          isPending={convertMut.isPending}
          submitDisabled={!form.product_id.trim() || !Number(form.qty)}
        >
          <div className="space-y-3">
            <div>
              <Label>Product ID</Label>
              <Input
                value={form.product_id}
                onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
              />
            </div>
            <div>
              <Label>Variant ID (optional)</Label>
              <Input
                value={form.variant_id}
                onChange={(e) => setForm((f) => ({ ...f, variant_id: e.target.value }))}
              />
            </div>
            <div>
              <Label>Batch ID (optional)</Label>
              <Input
                value={form.batch_id}
                onChange={(e) => setForm((f) => ({ ...f, batch_id: e.target.value }))}
              />
            </div>
            <div>
              <Label>Qty</Label>
              <Input
                type="number"
                min={1}
                value={form.qty}
                onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Converted units move out of sellable stock and will not appear as POS sellable qty.
            </p>
          </div>
        </EntityFormDrawer>
      </PageBody>

      <ConfirmActionDialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null);
        }}
        title="Update tester status"
        description="Retiring or depleting a tester does not return qty to sellable stock automatically."
        confirmLabel="Update status"
        onConfirm={handleStatus}
        isPending={statusMut.isPending}
      >
        <div className="mt-3 space-y-2">
          <Label>New status</Label>
          <Select value={nextStatus} onValueChange={setNextStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="retired">Retired</SelectItem>
              <SelectItem value="depleted">Depleted</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </ConfirmActionDialog>
    </>
  );
}

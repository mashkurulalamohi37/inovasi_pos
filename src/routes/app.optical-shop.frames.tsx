import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { opticalCatalog } from "@/lib/industry-mock";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useOpticalFrames, useApiProducts } from "@/hooks/use-api-config";
import { useUpsertOpticalFrame } from "@/hooks/use-industry-backoffice";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { fmtBDT } from "@/lib/pos-data";
import { toast } from "sonner";

export const Route = createFileRoute("/app/optical-shop/frames")({ component: Page });

function Page() {
  const useApi = shouldUseBackend();
  const [q, setQ] = useState("");
  const { data, isLoading, isError, refetch } = useOpticalFrames(q ? { q } : undefined);
  const products = useApiProducts({ industry: "optical-shop", status: "active" });
  const upsert = useUpsertOpticalFrame();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    product_id: "",
    frame_type: "optical",
    frame_shape: "",
    material: "",
    size_eye: "",
    size_bridge: "",
    temple_length: "",
    color: "",
    brand_name: "",
  });

  const demoRows = useMemo(
    () => opticalCatalog.filter(i => i.category === "Frame").map(i => ({
      id: i.sku,
      sku: i.sku,
      name: i.name,
      brand_name: i.brand,
      frame_shape: "—",
      material: "—",
      color: "—",
      size_eye: i.frameSize ?? "—",
      selling_price: i.price,
      stock_qty: 99,
      is_active: true,
    })),
    [],
  );

  const rows = useApi ? (data ?? []) : demoRows;

  const submit = async () => {
    if (!form.product_id) {
      toast.error("Select a product");
      return;
    }
    await upsert.mutateAsync(form);
    toast.success("Frame profile saved");
    setOpen(false);
  };

  return (
    <BackOfficePage
      title="Frame inventory"
      eyebrow="Optical"
      subtitle={`${rows.length} frames`}
      actions={
        useApi ? (
          <PermissionGate perm="optical-shop.manage">
            <Button size="sm" className="gap-1" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Link frame profile
            </Button>
          </PermissionGate>
        ) : (
          <DisabledReasonButton label="Link frame profile" reason="Connect backend to manage frame profiles" />
        )
      }
    >
      <SectionCard
        title="Frames"
        actions={
          useApi ? (
            <Input
              className="h-8 w-48"
              placeholder="Search SKU / brand / model"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          ) : null
        }
      >
        {useApi && isLoading ? (
          <LoadingState rows={4} label="Loading frames…" />
        ) : useApi && isError ? (
          <ErrorState title="Failed to load frames" onRetry={() => void refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No frames" description="Link optical products as frames to show stock and sizing." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left">SKU</th>
                  <th className="px-3 py-2.5 text-left">Name</th>
                  <th className="px-3 py-2.5 text-left">Brand</th>
                  <th className="px-3 py-2.5 text-left">Shape</th>
                  <th className="px-3 py-2.5 text-left">Size</th>
                  <th className="px-3 py-2.5 text-right">Price</th>
                  <th className="px-3 py-2.5 text-right">Stock</th>
                  <th className="px-5 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(r => (
                  <tr key={String(r.id)} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 font-mono text-xs">{String(r.sku)}</td>
                    <td className="px-3 py-3">{String(r.name)}</td>
                    <td className="px-3 py-3">{String(r.brand_name ?? "—")}</td>
                    <td className="px-3 py-3">{String(r.frame_shape ?? "—")}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {[(r as any).size_eye, (r as any).size_bridge, (r as any).temple_length].filter(Boolean).join("-") || "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular">{fmtBDT(Number(r.selling_price ?? 0))}</td>
                    <td className="px-3 py-3 text-right tabular">{Number(r.stock_qty ?? 0)}</td>
                    <td className="px-5 py-3 text-right">
                      <StatusBadge status={r.is_active === false ? "inactive" : "active"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <EntityFormDrawer
        open={open}
        onOpenChange={setOpen}
        title="Frame profile"
        description="Extends a Product with optical frame attributes. Stock stays on Product/StockBalance."
        onSubmit={() => void submit().catch(e => toast.error(String((e as Error)?.message ?? e)))}
        isPending={upsert.isPending}
      >
        <div className="grid gap-3">
          <div>
            <Label>Product</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={form.product_id}
              onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}
            >
              <option value="">Select product…</option>
              {(products.data?.items ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Type</Label>
              <Input value={form.frame_type} onChange={e => setForm(f => ({ ...f, frame_type: e.target.value }))} />
            </div>
            <div>
              <Label>Shape</Label>
              <Input value={form.frame_shape} onChange={e => setForm(f => ({ ...f, frame_shape: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Eye</Label>
              <Input value={form.size_eye} onChange={e => setForm(f => ({ ...f, size_eye: e.target.value }))} />
            </div>
            <div>
              <Label>Bridge</Label>
              <Input value={form.size_bridge} onChange={e => setForm(f => ({ ...f, size_bridge: e.target.value }))} />
            </div>
            <div>
              <Label>Temple</Label>
              <Input value={form.temple_length} onChange={e => setForm(f => ({ ...f, temple_length: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Material</Label>
              <Input value={form.material} onChange={e => setForm(f => ({ ...f, material: e.target.value }))} />
            </div>
            <div>
              <Label>Color</Label>
              <Input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Brand</Label>
            <Input value={form.brand_name} onChange={e => setForm(f => ({ ...f, brand_name: e.target.value }))} />
          </div>
        </div>
      </EntityFormDrawer>
    </BackOfficePage>
  );
}

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
import { useOpticalLenses, useApiProducts } from "@/hooks/use-api-config";
import { useUpsertOpticalLens } from "@/hooks/use-industry-backoffice";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { fmtBDT } from "@/lib/pos-data";
import { toast } from "sonner";

export const Route = createFileRoute("/app/optical-shop/lenses")({ component: Page });

function Page() {
  const useApi = shouldUseBackend();
  const [q, setQ] = useState("");
  const { data, isLoading, isError, refetch } = useOpticalLenses(q ? { q } : undefined);
  const products = useApiProducts({ industry: "optical-shop", status: "active" });
  const upsert = useUpsertOpticalLens();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    product_id: "",
    lens_type: "single_vision",
    refractive_index: "1.56",
    coating: "anti-reflective",
    supply_mode: "stocked",
    blue_cut: true,
    brand_name: "",
  });

  const demoRows = useMemo(
    () => opticalCatalog.filter(i => i.category === "Lens" || i.category === "Contact lens").map(i => ({
      id: i.sku,
      sku: i.sku,
      name: i.name,
      lens_type: i.category === "Contact lens" ? "contact" : "single_vision",
      refractive_index: "—",
      coating: i.coating ?? "—",
      supply_mode: "stocked",
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
    await upsert.mutateAsync({
      ...form,
      blue_cut: form.blue_cut,
      anti_reflective: form.coating.includes("anti") || form.coating.includes("AR"),
    });
    toast.success("Lens profile saved");
    setOpen(false);
  };

  return (
    <BackOfficePage
      title="Lens catalog"
      eyebrow="Optical"
      subtitle={`${rows.length} lenses`}
      actions={
        useApi ? (
          <PermissionGate perm="optical-shop.manage">
            <Button size="sm" className="gap-1" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Link lens profile
            </Button>
          </PermissionGate>
        ) : (
          <DisabledReasonButton label="Link lens profile" reason="Connect backend to manage lens profiles" />
        )
      }
    >
      <SectionCard
        title="Lenses"
        actions={
          useApi ? (
            <Input
              className="h-8 w-48"
              placeholder="Search type / coating"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          ) : null
        }
      >
        {useApi && isLoading ? (
          <LoadingState rows={4} label="Loading lenses…" />
        ) : useApi && isError ? (
          <ErrorState title="Failed to load lenses" onRetry={() => void refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No lenses" description="Link optical products as lenses with index and coating." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left">SKU</th>
                  <th className="px-3 py-2.5 text-left">Name</th>
                  <th className="px-3 py-2.5 text-left">Type</th>
                  <th className="px-3 py-2.5 text-left">Index</th>
                  <th className="px-3 py-2.5 text-left">Coating</th>
                  <th className="px-3 py-2.5 text-left">Supply</th>
                  <th className="px-3 py-2.5 text-right">Price</th>
                  <th className="px-5 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(r => (
                  <tr key={String(r.id)} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 font-mono text-xs">{String(r.sku)}</td>
                    <td className="px-3 py-3">{String(r.name)}</td>
                    <td className="px-3 py-3">{String(r.lens_type ?? "—")}</td>
                    <td className="px-3 py-3">{String(r.refractive_index ?? "—")}</td>
                    <td className="px-3 py-3">{String(r.coating ?? "—")}</td>
                    <td className="px-3 py-3 text-muted-foreground">{String(r.supply_mode ?? "stocked")}</td>
                    <td className="px-3 py-3 text-right tabular">{fmtBDT(Number(r.selling_price ?? 0))}</td>
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
        title="Lens profile"
        description="Extends a Product with lens type, index, coating, and supply mode."
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
              <Label>Lens type</Label>
              <Input value={form.lens_type} onChange={e => setForm(f => ({ ...f, lens_type: e.target.value }))} />
            </div>
            <div>
              <Label>Index</Label>
              <Input value={form.refractive_index} onChange={e => setForm(f => ({ ...f, refractive_index: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Coating</Label>
              <Input value={form.coating} onChange={e => setForm(f => ({ ...f, coating: e.target.value }))} />
            </div>
            <div>
              <Label>Supply mode</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={form.supply_mode}
                onChange={e => setForm(f => ({ ...f, supply_mode: e.target.value }))}
              >
                <option value="stocked">stocked</option>
                <option value="made_to_order">made_to_order</option>
                <option value="external_lab">external_lab</option>
                <option value="service_only">service_only</option>
              </select>
            </div>
          </div>
          <div>
            <Label>Brand</Label>
            <Input value={form.brand_name} onChange={e => setForm(f => ({ ...f, brand_name: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.blue_cut}
              onChange={e => setForm(f => ({ ...f, blue_cut: e.target.checked }))}
            />
            Blue-cut
          </label>
        </div>
      </EntityFormDrawer>
    </BackOfficePage>
  );
}

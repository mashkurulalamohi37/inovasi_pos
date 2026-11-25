import { useState, type Dispatch, type SetStateAction } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { LoadingState, EmptyState } from "@/components/pulse/states";
import { PermissionGate } from "@/components/pulse/gates";
import { Plus, Pencil, Printer, Sparkles } from "lucide-react";
import {
  useCreateProductBarcode,
  useCreateProductVariant,
  useProductBarcodes,
  useProductVariants,
  useUpdateProductBarcode,
  useUpdateProductVariant,
  useProduct,
  useApiStores,
  type ApiProductBarcode,
} from "@/hooks/use-api-config";
import { useAuth } from "@/lib/auth-provider";
import { BarcodeLabelPrintDialog } from "@/components/products/BarcodeLabelPrintDialog";

type VariantForm = {
  variant_code: string;
  size: string;
  color: string;
  style: string;
  model: string;
  barcode: string;
  is_active: boolean;
};

export function ProductBarcodePanel({ productId }: { productId: string }) {
  const { data, isLoading, refetch } = useProductBarcodes(productId);
  const { data: prodData } = useProduct(productId);
  const createMut = useCreateProductBarcode();
  const updateMut = useUpdateProductBarcode();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ barcode: "", is_primary: false });
  const [deactivateTarget, setDeactivateTarget] = useState<ApiProductBarcode | null>(null);
  const [printDialog, setPrintDialog] = useState(false);
  const [selectedBarcodeForPrint, setSelectedBarcodeForPrint] = useState<string>("");

  const { user } = useAuth();
  const storesQuery = useApiStores();
  const currentStoreName = user?.store_name || user?.company_name || storesQuery.data?.[0]?.name || user?.company_code || "Main Store";

  const rows = data ?? [];

  const productForPrint = {
    id: productId,
    name: prodData?.name || "Product",
    sku: prodData?.sku || "SKU",
    barcode: selectedBarcodeForPrint || prodData?.barcode || rows.find((r) => r.is_primary)?.barcode || (rows[0]?.barcode ?? null),
    retail_price: prodData?.base_price ?? prodData?.cost_price ?? 0,
    storeName: currentStoreName,
  };

  return (
    <PermissionGate perm="inventory.edit" fallback={<EmptyState title="Permission required" description="Requires inventory.edit to manage barcodes." />}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="font-semibold text-sm">Product barcodes</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1 border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => {
                setSelectedBarcodeForPrint(rows.find((r) => r.is_primary)?.barcode || (rows[0]?.barcode ?? ""));
                setPrintDialog(true);
              }}
            >
              <Printer className="h-3.5 w-3.5" /> Print Barcode Label
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => { setForm({ barcode: "", is_primary: false }); setAddOpen(true); }}>
              <Plus className="h-3.5 w-3.5" /> Add barcode
            </Button>
          </div>
        </div>
        {isLoading ? <LoadingState rows={2} /> : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center space-y-3">
            <EmptyState title="No barcodes assigned" description="This product currently has no scannable barcode." />
            <Button
              type="button"
              variant="default"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setSelectedBarcodeForPrint("");
                setPrintDialog(true);
              }}
            >
              <Sparkles className="h-4 w-4" /> Auto-Generate & Print Barcode
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase"><tr>
              <th className="px-2 py-1.5 text-left">Barcode</th><th className="px-2 py-1.5 text-left">Type</th>
              <th className="px-2 py-1.5 text-right">Primary</th><th className="px-2 py-1.5 text-right">Status</th><th className="px-2 py-1.5 text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((b) => (
                <tr key={b.id}>
                  <td className="px-2 py-2 font-mono text-xs font-semibold">{b.barcode}</td>
                  <td className="px-2 py-2 text-muted-foreground">{b.barcode_type}</td>
                  <td className="px-2 py-2 text-right">{b.is_primary ? "Yes" : "—"}</td>
                  <td className="px-2 py-2 text-right"><Badge variant="outline">{b.is_active ? "active" : "inactive"}</Badge></td>
                  <td className="px-2 py-2 text-right space-x-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => {
                        setSelectedBarcodeForPrint(b.barcode);
                        setPrintDialog(true);
                      }}
                    >
                      <Printer className="h-3 w-3" /> Print
                    </Button>
                    {!b.is_primary && b.is_active && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => updateMut.mutate({ productId, barcodeId: b.id, body: { is_primary: true } })}>
                        Set primary
                      </Button>
                    )}
                    {b.is_active && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setDeactivateTarget(b)}>Deactivate</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <BarcodeLabelPrintDialog
        open={printDialog}
        onOpenChange={setPrintDialog}
        product={productForPrint}
        onBarcodeAssigned={() => refetch()}
      />
      <EntityFormDrawer open={addOpen} onOpenChange={setAddOpen} title="Add barcode"
        onSubmit={async () => { await createMut.mutateAsync({ productId, body: form }); setAddOpen(false); }}
        isPending={createMut.isPending} submitDisabled={!form.barcode.trim()}>
        <div className="space-y-3">
          <div><Label>Barcode</Label><Input value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} /></div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="bc-primary" checked={form.is_primary} onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))} />
            <Label htmlFor="bc-primary">Set as primary barcode</Label>
          </div>
        </div>
      </EntityFormDrawer>
      <ConfirmActionDialog
        open={!!deactivateTarget}
        onOpenChange={(o) => !o && setDeactivateTarget(null)}
        title="Deactivate barcode"
        description={`Deactivate barcode ${deactivateTarget?.barcode}? It will no longer resolve at POS scan.`}
        confirmLabel="Deactivate"
        onConfirm={async () => {
          if (!deactivateTarget) return;
          await updateMut.mutateAsync({ productId, barcodeId: deactivateTarget.id, body: { is_active: false } });
          setDeactivateTarget(null);
        }}
        isPending={updateMut.isPending}
      />
    </PermissionGate>
  );
}

export function ProductVariantPanel({ productId }: { productId: string }) {
  const { data, isLoading, refetch } = useProductVariants(productId);
  const createMut = useCreateProductVariant();
  const updateMut = useUpdateProductVariant();
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VariantForm>({ variant_code: "", size: "", color: "", style: "", model: "", barcode: "", is_active: true });

  const rows = data ?? [];
  const openEdit = (v: (typeof rows)[0]) => {
    setEditingId(v.id);
    setForm({
      variant_code: v.variant_code, size: v.size ?? "", color: v.color ?? "",
      style: v.style ?? "", model: v.model ?? "", barcode: v.barcode ?? "", is_active: v.is_active,
    });
    setEditOpen(true);
  };

  return (
    <PermissionGate perm="inventory.edit" fallback={<EmptyState title="Permission required" description="Requires inventory.edit to manage variants." />}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Variants</Label>
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => {
            setEditingId(null);
            setForm({ variant_code: "", size: "", color: "", style: "", model: "", barcode: "", is_active: true });
            setAddOpen(true);
          }}>
            <Plus className="h-3.5 w-3.5" /> Add variant
          </Button>
        </div>
        {isLoading ? <LoadingState rows={2} /> : rows.length === 0 ? (
          <EmptyState title="No variants" description="Add size/color/style or industry-specific attributes." />
        ) : (
          <ul className="text-sm space-y-1">
            {rows.filter((v) => v.is_active).concat(rows.filter((v) => !v.is_active)).map((v) => (
              <li key={v.id} className="flex items-center justify-between rounded border px-2 py-1.5">
                <div>
                  <span className="font-medium">{v.variant_code}</span>
                  <span className="text-muted-foreground"> {[v.size, v.color, v.style].filter(Boolean).join(" / ")}</span>
                  {!v.is_active && <Badge variant="outline" className="ml-2 text-xs">inactive</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs font-mono">{v.barcode ?? "—"}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(v)}><Pencil className="h-3.5 w-3.5" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <EntityFormDrawer open={addOpen} onOpenChange={setAddOpen} title="Add variant"
        onSubmit={async () => {
          await createMut.mutateAsync({
            productId,
            body: {
              variant_code: form.variant_code, size: form.size || undefined, color: form.color || undefined,
              style: form.style || undefined, model: form.model || undefined, barcode: form.barcode || undefined,
            },
          });
          setAddOpen(false);
          refetch();
        }}
        isPending={createMut.isPending} submitDisabled={!form.variant_code.trim()}>
        <VariantFormFields form={form} setForm={setForm} showActive={false} />
      </EntityFormDrawer>
      <EntityFormDrawer open={editOpen} onOpenChange={setEditOpen} title="Edit variant"
        onSubmit={async () => {
          if (!editingId) return;
          await updateMut.mutateAsync({
            productId, variantId: editingId,
            body: {
              variant_code: form.variant_code, size: form.size || undefined, color: form.color || undefined,
              style: form.style || undefined, model: form.model || undefined, barcode: form.barcode || undefined,
              is_active: form.is_active,
            },
          });
          setEditOpen(false);
          refetch();
        }}
        isPending={updateMut.isPending} submitDisabled={!form.variant_code.trim()}>
        <VariantFormFields form={form} setForm={setForm} showActive />
      </EntityFormDrawer>
    </PermissionGate>
  );
}

function VariantFormFields({
  form, setForm, showActive,
}: {
  form: VariantForm;
  setForm: Dispatch<SetStateAction<VariantForm>>;
  showActive: boolean;
}) {
  return (
    <div className="space-y-3">
      <div><Label>Variant code</Label><Input value={form.variant_code} onChange={(e) => setForm((f) => ({ ...f, variant_code: e.target.value }))} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Size</Label><Input value={form.size} onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))} /></div>
        <div><Label>Color</Label><Input value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} /></div>
        <div><Label>Style</Label><Input value={form.style} onChange={(e) => setForm((f) => ({ ...f, style: e.target.value }))} /></div>
        <div><Label>Model</Label><Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} /></div>
      </div>
      <div><Label>Barcode</Label><Input value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} /></div>
      {showActive && (
        <div className="flex items-center gap-2">
          <input type="checkbox" id="var-active" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
          <Label htmlFor="var-active">Active</Label>
        </div>
      )}
    </div>
  );
}

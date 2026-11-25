import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { PermissionGate } from "@/components/pulse/gates";
import { EmptyState, LoadingState } from "@/components/pulse/states";
import { Grid3X3, Pencil, Plus, CheckSquare } from "lucide-react";
import { fashionStyles } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import { api } from "@/lib/api";
import { useFashionVariants } from "@/hooks/use-industry-data";
import {
  useApiProducts,
  useCreateProductVariant,
  useGenerateFashionVariantMatrix,
  useUpdateProductVariant,
} from "@/hooks/use-api-config";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";

export const Route = createFileRoute("/app/fashion/variants")({ component: Variants });

type VariantRow = {
  id: string;
  product_id: string;
  product_name: string;
  product_sku?: string;
  sku: string;
  variant_code?: string;
  size: string;
  color: string;
  style?: string | null;
  model?: string | null;
  barcode: string | null;
  stock: number;
  is_active?: boolean;
  source?: string;
  editable?: boolean;
};

type VariantForm = {
  product_id: string;
  variant_code: string;
  size: string;
  color: string;
  style: string;
  model: string;
  barcode: string;
  is_active: boolean;
};

type MatrixForm = {
  product_id: string;
  sizes: string;
  colors: string;
  fit: string;
  pattern: string;
  generate_barcodes: boolean;
  skip_existing: boolean;
};

const emptyForm = (): VariantForm => ({
  product_id: "",
  variant_code: "",
  size: "",
  color: "",
  style: "",
  model: "",
  barcode: "",
  is_active: true,
});

const emptyMatrix = (): MatrixForm => ({
  product_id: "",
  sizes: "S, M, L, XL",
  colors: "Blue, Black, White",
  fit: "",
  pattern: "",
  generate_barcodes: true,
  skip_existing: true,
});

function splitCsv(raw: string): string[] {
  return raw
    .split(/[,;/|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function Variants() {
  const useApi = shouldUseBackend();
  const qc = useQueryClient();
  const variantsQuery = useFashionVariants();
  const { data: productsPage } = useApiProducts({ industry: "fashion", page: 1 });
  const createMut = useCreateProductVariant();
  const updateMut = useUpdateProductVariant();
  const matrixMut = useGenerateFashionVariantMatrix();
  const [formOpen, setFormOpen] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [editRow, setEditRow] = useState<VariantRow | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<VariantRow | null>(null);
  const [form, setForm] = useState<VariantForm>(emptyForm());
  const [matrix, setMatrix] = useState<MatrixForm>(emptyMatrix());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [matrixErrors, setMatrixErrors] = useState<Record<string, string>>({});

  const demoRows: VariantRow[] = fashionStyles.flatMap((s) =>
    s.variants.map((v) => ({
      id: v.sku,
      product_id: s.styleCode,
      product_name: s.name,
      sku: v.barcode,
      size: v.size,
      color: v.color,
      barcode: v.barcode,
      stock: Object.values(v.stock).reduce((a, b) => a + b, 0),
      editable: true,
    })),
  );

  const apiRows: VariantRow[] = useMemo(
    () =>
      (variantsQuery.data ?? []).map((v) => ({
        id: v.id,
        product_id: v.product_id,
        product_name: v.product_name ?? v.product_id,
        product_sku: v.product_sku,
        sku: v.sku,
        variant_code: v.variant_code,
        size: v.size,
        color: v.color,
        style: v.style,
        model: v.model,
        barcode: v.barcode,
        stock: v.stock_qty,
        is_active: v.is_active,
        source: v.source,
        editable: v.editable ?? v.source !== "legacy",
      })),
    [variantsQuery.data],
  );

  const rows = useApi ? apiRows : demoRows;
  const products = productsPage?.items ?? [];

  const openCreate = () => {
    setEditRow(null);
    setForm(emptyForm());
    setErrors({});
    setFormOpen(true);
  };

  const openMatrix = () => {
    setMatrix(emptyMatrix());
    setMatrixErrors({});
    setMatrixOpen(true);
  };

  const openEdit = (row: VariantRow) => {
    if (!row.editable) return;
    setEditRow(row);
    setForm({
      product_id: row.product_id,
      variant_code: row.variant_code ?? row.sku,
      size: row.size,
      color: row.color,
      style: row.style ?? "",
      model: row.model ?? "",
      barcode: row.barcode ?? "",
      is_active: row.is_active ?? true,
    });
    setErrors({});
    setFormOpen(true);
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.product_id) next.product_id = "Select a product";
    if (!form.variant_code.trim()) next.variant_code = "Variant code is required";
    if (!form.size.trim()) next.size = "Size is required";
    if (!form.color.trim()) next.color = "Color is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const validateMatrix = () => {
    const next: Record<string, string> = {};
    if (!matrix.product_id) next.product_id = "Select a product";
    if (splitCsv(matrix.sizes).length === 0) next.sizes = "Enter at least one size";
    if (splitCsv(matrix.colors).length === 0) next.colors = "Enter at least one color";
    setMatrixErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const body = {
      variant_code: form.variant_code.trim(),
      size: form.size.trim(),
      color: form.color.trim(),
      style: form.style.trim() || undefined,
      model: form.model.trim() || undefined,
      barcode: form.barcode.trim() || undefined,
      is_active: form.is_active,
    };
    if (editRow) {
      await updateMut.mutateAsync({
        productId: editRow.product_id,
        variantId: editRow.id,
        body,
      });
    } else {
      await createMut.mutateAsync({ productId: form.product_id, body });
    }
    setFormOpen(false);
    variantsQuery.refetch();
  };

  const handleMatrixSubmit = async () => {
    if (!validateMatrix()) return;
    await matrixMut.mutateAsync({
      productId: matrix.product_id,
      body: {
        sizes: splitCsv(matrix.sizes),
        colors: splitCsv(matrix.colors),
        fit: matrix.fit.trim() || undefined,
        pattern: matrix.pattern.trim() || undefined,
        generate_barcodes: matrix.generate_barcodes,
        skip_existing: matrix.skip_existing,
      },
    });
    setMatrixOpen(false);
    variantsQuery.refetch();
  };

  const previewCount = splitCsv(matrix.sizes).length * splitCsv(matrix.colors).length;

  const editableRows = rows.filter((r) => r.editable);
  const allEditableSelected = editableRows.length > 0 && editableRows.every((r) => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    setSelectedIds(allEditableSelected ? new Set() : new Set(editableRows.map((r) => r.id)));
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkSetActive = async (isActive: boolean) => {
    const targets = rows.filter((r) => selectedIds.has(r.id));
    if (targets.length === 0) return;
    setBulkPending(true);
    let ok = 0;
    let failed = 0;
    for (const r of targets) {
      try {
        await api.patch(`/products/${r.product_id}/variants/${r.id}`, { is_active: isActive });
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    qc.invalidateQueries({ queryKey: queryKeys.industry.fashionVariants });
    setBulkPending(false);
    setSelectedIds(new Set());
    if (failed === 0) {
      toast.success(`${isActive ? "Activated" : "Deactivated"} ${ok} variant${ok === 1 ? "" : "s"}`);
    } else {
      toast.error(`${ok} succeeded, ${failed} failed`);
    }
  };

  return (
    <>
      <PageHeader
        title="Variant Matrix"
        subtitle="Size × color variants — generate a full matrix or add one at a time"
        actions={
          useApi ? (
            <PermissionGate perm="inventory.edit">
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={openMatrix}>
                  <Grid3X3 className="h-3.5 w-3.5" /> Generate matrix
                </Button>
                <Button size="sm" className="gap-1.5" onClick={openCreate}>
                  <Plus className="h-3.5 w-3.5" /> New variant
                </Button>
              </div>
            </PermissionGate>
          ) : null
        }
      />
      <PageBody>
        {useApi && selectedIds.size > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <CheckSquare className="h-4 w-4 text-primary" />
              <span className="font-medium">{selectedIds.size} selected</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={bulkPending} onClick={() => void bulkSetActive(true)}>
                Activate selected
              </Button>
              <Button size="sm" variant="outline" disabled={bulkPending} onClick={() => void bulkSetActive(false)}>
                Deactivate selected
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
            </div>
          </div>
        )}
        <SectionCard title="Variant stock">
          {useApi && variantsQuery.isLoading ? (
            <LoadingState rows={3} />
          ) : rows.length === 0 ? (
            <EmptyState title="No fashion variants" description="Generate a size×color matrix or create a single variant." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                <tr>
                  {useApi && (
                    <th className="w-10 px-5 py-2 text-left">
                      <input
                        type="checkbox"
                        aria-label="Select all editable variants"
                        checked={allEditableSelected}
                        onChange={toggleSelectAll}
                        disabled={editableRows.length === 0}
                      />
                    </th>
                  )}
                  <th className="px-5 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-left">SKU / Code</th>
                  <th className="px-3 py-2 text-left">Size</th>
                  <th className="px-3 py-2 text-left">Color</th>
                  <th className="px-3 py-2 text-left">Barcode</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-5 py-2 text-right">Stock</th>
                  {useApi && <th className="px-5 py-2 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id}>
                    {useApi && (
                      <td className="px-5 py-3">
                        {r.editable && (
                          <input
                            type="checkbox"
                            aria-label={`Select ${r.sku}`}
                            checked={selectedIds.has(r.id)}
                            onChange={() => toggleRow(r.id)}
                          />
                        )}
                      </td>
                    )}
                    <td className="px-5 py-3">
                      <div>{r.product_name}</div>
                      {r.product_sku && <div className="text-xs text-muted-foreground">{r.product_sku}</div>}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{r.sku}</td>
                    <td className="px-3 py-3">{r.size}</td>
                    <td className="px-3 py-3">{r.color}</td>
                    <td className="px-3 py-3 font-mono text-xs">{r.barcode ?? "—"}</td>
                    <td className="px-3 py-3">
                      {r.source === "legacy" ? (
                        <Badge variant="outline">legacy (read-only)</Badge>
                      ) : (
                        <Badge variant="outline">{r.is_active === false ? "inactive" : "active"}</Badge>
                      )}
                    </td>
                    <td className={`px-5 py-3 text-right tabular font-semibold ${r.stock === 0 ? "text-destructive" : r.stock < 3 ? "text-warning" : ""}`}>
                      {r.stock}
                    </td>
                    {useApi && (
                      <td className="px-5 py-3 text-right space-x-1">
                        {r.editable && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {r.is_active !== false && (
                              <Button variant="ghost" size="sm" onClick={() => setDeactivateTarget(r)}>
                                Deactivate
                              </Button>
                            )}
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </PageBody>

      <EntityFormDrawer
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editRow ? "Edit variant" : "New fashion variant"}
        onSubmit={handleSubmit}
        submitLabel={editRow ? "Save changes" : "Create variant"}
        isPending={createMut.isPending || updateMut.isPending}
        errorMessage={
          ((createMut.error ?? updateMut.error) as Error | null)?.message ?? null
        }
      >
        {!editRow && (
          <div>
            <Label>Product</Label>
            <Select value={form.product_id} onValueChange={(v) => setForm((f) => ({ ...f, product_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.product_id && <p className="text-xs text-destructive mt-1">{errors.product_id}</p>}
          </div>
        )}
        <div><Label>Variant code</Label><Input value={form.variant_code} onChange={(e) => setForm((f) => ({ ...f, variant_code: e.target.value }))} disabled={!!editRow} /></div>
        {errors.variant_code && <p className="text-xs text-destructive">{errors.variant_code}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Size</Label><Input value={form.size} onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))} /></div>
          <div><Label>Color</Label><Input value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} /></div>
        </div>
        {errors.size && <p className="text-xs text-destructive">{errors.size}</p>}
        {errors.color && <p className="text-xs text-destructive">{errors.color}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Style</Label><Input value={form.style} onChange={(e) => setForm((f) => ({ ...f, style: e.target.value }))} /></div>
          <div><Label>Model</Label><Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} /></div>
        </div>
        <div><Label>Barcode</Label><Input value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} className="font-mono" /></div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="fv-active" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
          <Label htmlFor="fv-active">Active</Label>
        </div>
      </EntityFormDrawer>

      <EntityFormDrawer
        open={matrixOpen}
        onOpenChange={setMatrixOpen}
        title="Generate size × color matrix"
        onSubmit={handleMatrixSubmit}
        submitLabel={previewCount > 0 ? `Generate ${previewCount} variants` : "Generate matrix"}
        isPending={matrixMut.isPending}
        errorMessage={matrixMut.error instanceof Error ? matrixMut.error.message : null}
      >
        <div>
          <Label>Product</Label>
          <Select value={matrix.product_id} onValueChange={(v) => setMatrix((m) => ({ ...m, product_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Select fashion product" /></SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {matrixErrors.product_id && <p className="text-xs text-destructive mt-1">{matrixErrors.product_id}</p>}
        </div>
        <div>
          <Label>Sizes (comma-separated)</Label>
          <Input
            value={matrix.sizes}
            onChange={(e) => setMatrix((m) => ({ ...m, sizes: e.target.value }))}
            placeholder="S, M, L, XL"
          />
          {matrixErrors.sizes && <p className="text-xs text-destructive mt-1">{matrixErrors.sizes}</p>}
        </div>
        <div>
          <Label>Colors (comma-separated)</Label>
          <Input
            value={matrix.colors}
            onChange={(e) => setMatrix((m) => ({ ...m, colors: e.target.value }))}
            placeholder="Blue, Black, White"
          />
          {matrixErrors.colors && <p className="text-xs text-destructive mt-1">{matrixErrors.colors}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Fit (optional)</Label>
            <Input value={matrix.fit} onChange={(e) => setMatrix((m) => ({ ...m, fit: e.target.value }))} placeholder="Regular" />
          </div>
          <div>
            <Label>Pattern (optional)</Label>
            <Input value={matrix.pattern} onChange={(e) => setMatrix((m) => ({ ...m, pattern: e.target.value }))} placeholder="Solid" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="mx-bc"
            checked={matrix.generate_barcodes}
            onChange={(e) => setMatrix((m) => ({ ...m, generate_barcodes: e.target.checked }))}
          />
          <Label htmlFor="mx-bc">Generate barcodes</Label>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="mx-skip"
            checked={matrix.skip_existing}
            onChange={(e) => setMatrix((m) => ({ ...m, skip_existing: e.target.checked }))}
          />
          <Label htmlFor="mx-skip">Skip existing size×color pairs</Label>
        </div>
        {previewCount > 0 && (
          <p className="text-xs text-muted-foreground">
            Will request {previewCount} combination{previewCount === 1 ? "" : "s"} (existing pairs skipped when enabled).
          </p>
        )}
      </EntityFormDrawer>

      <ConfirmActionDialog
        open={!!deactivateTarget}
        onOpenChange={(o) => !o && setDeactivateTarget(null)}
        title="Deactivate variant"
        description={`Deactivate ${deactivateTarget?.sku}? It cannot be sold at POS while inactive.`}
        confirmLabel="Deactivate"
        onConfirm={async () => {
          if (!deactivateTarget) return;
          await updateMut.mutateAsync({
            productId: deactivateTarget.product_id,
            variantId: deactivateTarget.id,
            body: { is_active: false },
          });
          setDeactivateTarget(null);
          variantsQuery.refetch();
        }}
      />
    </>
  );
}

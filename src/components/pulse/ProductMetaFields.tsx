import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Check, Pencil, Plus, SlidersHorizontal, Trash2, X } from "lucide-react";
import type { IndustryPackId } from "@/lib/industry-registry";
import { useApp } from "@/lib/app-store";
import { shouldUseBackend } from "@/lib/demo-mode";
import { getPackMasterAttributes, type PackMasterAttrDef } from "@/lib/pack-master-attributes";
import {
  getUnifiedProductFields,
  type UnifiedProductField,
} from "@/lib/product-field-utils";
import {
  usePackAttributes,
  useCreatePackAttribute,
  useUpdatePackAttribute,
  useDeletePackAttribute,
  type ApiPackAttribute,
} from "@/hooks/use-api-config";

type ProductMetaFormProps = {
  packId: IndustryPackId;
  meta: Record<string, string | number | boolean>;
  onChange: (meta: Record<string, string | number | boolean>) => void;
  mode?: "minimal" | "full";
};

function ManageAttributeOptionsModal({
  packId,
  masterDef,
  currentValue,
  onSelect,
}: {
  packId: IndustryPackId;
  masterDef: PackMasterAttrDef;
  currentValue: string;
  onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const attrsQuery = usePackAttributes(packId, masterDef.key, { includeInactive: false, enabled: open });
  const createMut = useCreatePackAttribute();
  const updateMut = useUpdatePackAttribute();
  const deleteMut = useDeletePackAttribute();

  const options = attrsQuery.data ?? [];

  const handleAdd = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    const code = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || `OPT-${Date.now().toString().slice(-4)}`;
    try {
      await createMut.mutateAsync({
        pack_code: packId,
        attr_type: masterDef.key,
        code,
        name: trimmed,
        is_active: true,
      });
      setNewName("");
      onSelect(trimmed);
      void attrsQuery.refetch();
    } catch {
      /* handled by mutation error */
    }
  };

  const startEdit = (opt: ApiPackAttribute) => {
    setEditingId(opt.id);
    setEditName(opt.name);
  };

  const handleSaveEdit = async (opt: ApiPackAttribute) => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    try {
      await updateMut.mutateAsync({
        id: opt.id,
        body: { name: trimmed },
      });
      if (currentValue === opt.name) {
        onSelect(trimmed);
      }
      setEditingId(null);
      void attrsQuery.refetch();
    } catch {
      /* handled */
    }
  };

  const handleDelete = async (opt: ApiPackAttribute) => {
    try {
      await deleteMut.mutateAsync(opt.id);
      if (currentValue === opt.name) {
        onSelect("");
      }
      void attrsQuery.refetch();
    } catch {
      /* handled */
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-5 px-1 text-[10px] font-medium text-primary hover:text-primary/80 gap-0.5"
        >
          <SlidersHorizontal className="h-2.5 w-2.5" />
          <span>Manage</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Manage {masterDef.label} Options
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Add custom options, edit existing names, or delete options for this pack.
          </p>
        </DialogHeader>

        <form onSubmit={handleAdd} className="flex items-center gap-2 pt-2 pb-1">
          <Input
            placeholder={`Add new ${masterDef.label.toLowerCase()}...`}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="h-8 text-xs flex-1"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!newName.trim() || createMut.isPending}
            className="h-8 gap-1 px-3 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </form>

        <div className="max-h-60 overflow-y-auto divide-y divide-border/60 rounded-md border border-border/80 bg-muted/20 my-2">
          {attrsQuery.isLoading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Loading options...</div>
          ) : options.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">No custom options yet. Add your first above.</div>
          ) : (
            options.map(opt => (
              <div key={opt.id} className="flex items-center justify-between px-3 py-2 text-xs">
                {editingId === opt.id ? (
                  <div className="flex items-center gap-1.5 flex-1 mr-2">
                    <Input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="h-7 text-xs flex-1"
                      autoFocus
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-emerald-600 hover:bg-emerald-50"
                      onClick={() => handleSaveEdit(opt)}
                      disabled={updateMut.isPending}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:bg-muted"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className={`font-medium ${currentValue === opt.name ? "text-primary font-semibold" : "text-foreground"}`}>
                      {opt.name}
                      {currentValue === opt.name && (
                        <span className="ml-1.5 text-[10px] text-primary/70 font-normal">(selected)</span>
                      )}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => startEdit(opt)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(opt)}
                        disabled={deleteMut.isPending}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  packId,
  masterDef,
  useApi,
}: {
  field: UnifiedProductField;
  value: string | number | boolean;
  onChange: (v: string | number | boolean) => void;
  packId?: IndustryPackId;
  masterDef?: PackMasterAttrDef;
  useApi?: boolean;
}) {
  if (field.type === "checkbox") {
    return (
      <div className="flex items-center gap-2 pt-6">
        <Checkbox checked={Boolean(value)} onCheckedChange={v => onChange(Boolean(v))} id={field.key} />
        <Label htmlFor={field.key} className="font-normal">{field.label}</Label>
      </div>
    );
  }
  if (field.type === "select") {
    const options = field.options ?? [];
    return (
      <div>
        <div className="flex items-center justify-between pb-1">
          <Label>{field.label}{field.required && " *"}</Label>
          {useApi && masterDef && packId && (
            <ManageAttributeOptionsModal
              packId={packId}
              masterDef={masterDef}
              currentValue={String(value ?? "")}
              onSelect={v => onChange(v)}
            />
          )}
        </div>
        <Select value={String(value ?? "")} onValueChange={v => onChange(v)}>
          <SelectTrigger><SelectValue placeholder={options.length ? "Select…" : "Add values in Master data"} /></SelectTrigger>
          <SelectContent>
            {options.map(o => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  return (
    <div>
      <Label>
        {field.label}{field.required && " *"}
        {field.source === "admin" && <span className="ml-1 text-[10px] font-normal text-muted-foreground">(admin)</span>}
      </Label>
      <Input
        type={field.type === "number" || field.type === "currency" || field.type === "weight" ? "number" : field.type === "date" ? "date" : "text"}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={e => onChange(
          field.type === "number" || field.type === "currency" || field.type === "weight"
            ? Number(e.target.value) || 0
            : e.target.value,
        )}
      />
    </div>
  );
}

function optionsForField(
  fieldKey: string,
  attrsByType: Record<string, ApiPackAttribute[]>,
  meta: Record<string, string | number | boolean>,
  packId: IndustryPackId,
  fallback: string[] | undefined,
): string[] {
  const defs = getPackMasterAttributes(packId);
  const def = defs.find(d => (d.productFieldKey ?? d.key) === fieldKey) ?? defs.find(d => d.key === fieldKey);
  if (!def) return fallback ?? [];

  let rows = attrsByType[def.key] ?? [];
  if (def.parentAttrType && def.parentProductField) {
    const parentName = String(meta[def.parentProductField] ?? "");
    const parent = (attrsByType[def.parentAttrType] ?? []).find(p => p.name === parentName);
    if (parent) {
      rows = rows.filter(r => r.parent_id === parent.id);
    } else if (parentName) {
      rows = [];
    }
  }
  const names = Array.from(new Set(rows.filter(r => r.is_active !== false).map(r => r.name)));
  return names.length > 0 ? names : Array.from(new Set(fallback ?? []));
}

/** Pack-specific product fields: admin dynamic columns + registry defaults + pack master data. */
export function ProductMetaFields({ packId, meta, onChange, mode = "full" }: ProductMetaFormProps) {
  const app = useApp();
  const useApi = shouldUseBackend();
  const attrsQuery = usePackAttributes(packId, undefined, { enabled: useApi });
  const attrsByType = useMemo(() => {
    const map: Record<string, ApiPackAttribute[]> = {};
    for (const row of attrsQuery.data ?? []) {
      (map[row.attr_type] ??= []).push(row);
    }
    return map;
  }, [attrsQuery.data]);

  const masterAttrMap = useMemo(() => {
    const map = new Map<string, PackMasterAttrDef>();
    for (const d of getPackMasterAttributes(packId)) {
      map.set(d.productFieldKey ?? d.key, d);
      map.set(d.key, d);
    }
    return map;
  }, [packId]);

  const baseFields = getUnifiedProductFields(packId, app.dynamicFields, { store: app.store, counter: app.counter }, mode);

  const fields = useMemo(() => {
    const masterKeys = new Set(
      getPackMasterAttributes(packId).map(d => d.productFieldKey ?? d.key),
    );
    const list = baseFields.map((field) => {
      if (!masterKeys.has(field.key)) return field;
      const options = optionsForField(field.key, attrsByType, meta, packId, field.options);
      return {
        ...field,
        type: "select" as const,
        options,
      };
    });
    // When live backend Master Data (Category, Brand, Unit) is active, exclude redundant metadata inputs
    if (useApi) {
      return list.filter(f => f.key !== "brand" && f.key !== "category" && f.key !== "unit");
    }
    return list;
  }, [baseFields, attrsByType, meta, packId, useApi]);

  if (fields.length === 0) return null;

  const adminCount = fields.filter(f => f.source === "admin").length;

  const handleChange = (key: string, v: string | number | boolean) => {
    const next = { ...meta, [key]: v };
    // Clear dependent subcategory when category changes
    if (key === "category") {
      const subs = optionsForField("subcategory", attrsByType, next, packId, []);
      if (meta.subcategory && !subs.includes(String(meta.subcategory))) {
        next.subcategory = "";
      }
    }
    onChange(next);
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm space-y-3.5">
      <div className="flex items-center justify-between border-b border-border/40 pb-2">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
            {packId.replace(/-/g, " ")} Specifications &amp; Attributes
          </span>
          <p className="text-[11px] text-muted-foreground mt-0.5">Industry pack attributes and variant specifications</p>
        </div>
        {adminCount > 0 && <span className="text-[10px] text-muted-foreground/80 bg-secondary px-2 py-0.5 rounded">{adminCount} custom</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map(field => (
          <FieldInput
            key={field.key}
            field={field}
            value={meta[field.key] ?? (field.type === "checkbox" ? false : field.type === "number" || field.type === "currency" || field.type === "weight" ? 0 : "")}
            onChange={v => handleChange(field.key, v)}
            packId={packId}
            masterDef={masterAttrMap.get(field.key)}
            useApi={useApi}
          />
        ))}
      </div>
    </div>
  );
}

export function resetMetaForPack(packId: IndustryPackId, store: string, counter: string, dynamicFields: ReturnType<typeof useApp>["dynamicFields"]) {
  return getUnifiedProductFields(packId, dynamicFields, { store, counter }, "full").reduce(
    (acc, f) => {
      acc[f.key] = f.type === "checkbox" ? false : f.type === "number" || f.type === "currency" || f.type === "weight" ? 0 : "";
      return acc;
    },
    {} as Record<string, string | number | boolean>,
  );
}

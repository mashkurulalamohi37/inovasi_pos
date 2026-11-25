import { useEffect, useMemo, useState } from "react";
import { Layers, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtBDT } from "@/lib/pos-data";
import type { ComboComponentDraft, ComboRow, ComboFormValues, ComboItemRole } from "./types";

const ROLES: ComboItemRole[] = ["main", "side", "drink", "addon"];

const EMPTY: ComboFormValues = { name: "", combo_price: 0, items: [] };

/**
 * Build and edit combo meals.
 *
 * A combo needs at least two components; the backend rejects fewer, duplicates,
 * and inactive products, so the same rules are enforced here to keep the round
 * trip from being the first place staff learn they made a mistake.
 */
export function ManageCombosDialog({
  open,
  onOpenChange,
  combos,
  menu,
  onSave,
  onDelete,
  isSaving = false,
  isDeleting = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  combos: ComboRow[];
  menu: Array<{ id: string; name: string; price: number }>;
  /** `editingId` is null when creating. */
  onSave: (values: ComboFormValues, editingId: string | null) => void | Promise<void>;
  onDelete: (combo: ComboRow) => void;
  isSaving?: boolean;
  isDeleting?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ComboFormValues>(EMPTY);
  const [picker, setPicker] = useState("");

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setForm(EMPTY);
      setPicker("");
    }
  }, [open]);

  const componentsTotal = useMemo(
    () =>
      form.items.reduce((sum, item) => {
        const product = menu.find(m => m.id === item.product_id);
        return sum + (product?.price ?? 0);
      }, 0),
    [form.items, menu],
  );
  const savings = componentsTotal - Number(form.combo_price || 0);

  const startEdit = (combo: ComboRow) => {
    setEditingId(combo.id);
    setForm({
      name: combo.name,
      combo_price: combo.combo_price,
      items: combo.items.map(i => ({ product_id: i.product_id, item_role: i.item_role })),
    });
  };

  const addComponent = (productId: string) => {
    if (!productId) return;
    if (form.items.some(i => i.product_id === productId)) {
      toast.error("That dish is already in this combo");
      return;
    }
    setForm(f => ({
      ...f,
      // First component defaults to the main dish; later ones are usually sides.
      items: [...f.items, { product_id: productId, item_role: f.items.length === 0 ? "main" : "side" }],
    }));
    setPicker("");
  };

  const setRole = (productId: string, role: ComboItemRole) =>
    setForm(f => ({
      ...f,
      items: f.items.map(i => (i.product_id === productId ? { ...i, item_role: role } : i)),
    }));

  const removeComponent = (productId: string) =>
    setForm(f => ({ ...f, items: f.items.filter(i => i.product_id !== productId) }));

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Give the combo a name");
      return;
    }
    if (Number(form.combo_price) <= 0) {
      toast.error("Combo price must be more than 0");
      return;
    }
    if (form.items.length < 2) {
      toast.error("A combo needs at least 2 dishes");
      return;
    }
    await onSave({ ...form, name: form.name.trim(), combo_price: Number(form.combo_price) }, editingId);
    setEditingId(null);
    setForm(EMPTY);
  };

  const nameOf = (productId: string) =>
    menu.find(m => m.id === productId)?.name ?? "(unavailable dish)";
  const priceOf = (productId: string) => menu.find(m => m.id === productId)?.price ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4" /> Combo meals
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-2">
          {/* ---- existing combos ---- */}
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">
              Current combos ({combos.length})
            </Label>
            {combos.length === 0 && (
              <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                No combos yet. Build one on the right — pick a main, a side and a drink,
                then set one price for the bundle.
              </p>
            )}
            <div className="space-y-2">
              {combos.map(combo => (
                <div
                  key={combo.id}
                  className={`rounded-md border p-2.5 text-sm ${
                    editingId === combo.id ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{combo.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {combo.items.length} items · {fmtBDT(combo.combo_price)}
                        {combo.savings > 0 && (
                          <span className="ml-1 text-emerald-600">
                            saves {fmtBDT(combo.savings)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        aria-label={`Edit ${combo.name}`}
                        onClick={() => startEdit(combo)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        aria-label={`Delete ${combo.name}`}
                        disabled={isDeleting}
                        onClick={() => onDelete(combo)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {combo.items.map(i => (
                      <Badge key={i.product_id} variant="secondary" className="text-[10px]">
                        {i.item_role}: {i.product_name}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ---- builder ---- */}
          <div className="space-y-3">
            <Label className="text-xs uppercase text-muted-foreground">
              {editingId ? "Edit combo" : "New combo"}
            </Label>

            <div className="space-y-1.5">
              <Label htmlFor="combo-name">Name</Label>
              <Input
                id="combo-name"
                value={form.name}
                placeholder="e.g. Lunch Combo"
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="combo-price">Combo price (BDT)</Label>
              <Input
                id="combo-price"
                type="number"
                min={1}
                step="1"
                value={form.combo_price || ""}
                onChange={e => setForm(f => ({ ...f, combo_price: Math.round(Number(e.target.value)) }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="combo-add">Add a dish</Label>
              <select
                id="combo-add"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={picker}
                onChange={e => addComponent(e.target.value)}
              >
                <option value="">Choose a dish…</option>
                {menu
                  .filter(m => !form.items.some(i => i.product_id === m.id))
                  .map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {fmtBDT(m.price)}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1.5">
              {form.items.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                  At least 2 dishes
                </p>
              ) : (
                form.items.map(item => (
                  <div
                    key={item.product_id}
                    className="flex items-center gap-2 rounded-md border p-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{nameOf(item.product_id)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {fmtBDT(priceOf(item.product_id))}
                      </div>
                    </div>
                    <select
                      aria-label={`Role for ${nameOf(item.product_id)}`}
                      className="h-8 rounded-md border bg-background px-1.5 text-xs"
                      value={item.item_role}
                      onChange={e => setRole(item.product_id, e.target.value as ComboItemRole)}
                    >
                      {ROLES.map(r => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      aria-label={`Remove ${nameOf(item.product_id)}`}
                      onClick={() => removeComponent(item.product_id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            {form.items.length > 0 && (
              <div className="rounded-md bg-muted/50 p-2 text-xs">
                <div className="flex justify-between">
                  <span>Dishes separately</span>
                  <span className="tabular-nums">{fmtBDT(componentsTotal)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Combo price</span>
                  <span className="tabular-nums">{fmtBDT(Number(form.combo_price) || 0)}</span>
                </div>
                <div
                  className={`flex justify-between ${
                    savings >= 0 ? "text-emerald-600" : "text-destructive"
                  }`}
                >
                  <span>{savings >= 0 ? "Guest saves" : "Costs the guest more"}</span>
                  <span className="tabular-nums">{fmtBDT(Math.abs(savings))}</span>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button type="button" className="flex-1" onClick={() => void submit()} disabled={isSaving}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                {editingId ? "Save changes" : "Create combo"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setForm(EMPTY);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type { ComboComponentDraft };

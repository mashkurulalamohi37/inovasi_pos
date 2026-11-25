import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TableFormValues, TableRow } from "./types";

const MIN_CAPACITY = 1;
const MAX_CAPACITY = 50;

const EMPTY: TableFormValues = {
  table_no: "",
  table_name: "",
  capacity: 4,
  floor_or_zone: "Main Floor",
};

/**
 * Add, edit and delete dining tables.
 *
 * Owns its own form state so the POS container does not carry five more `useState`
 * calls for a modal it only opens.
 */
export function ManageTablesDialog({
  open,
  onOpenChange,
  tables,
  onSave,
  onDelete,
  isSaving = false,
  isDeleting = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tables: TableRow[];
  /** `editingId` is null when creating. */
  onSave: (values: TableFormValues, editingId: string | null) => void | Promise<void>;
  onDelete: (table: TableRow) => void;
  isSaving?: boolean;
  isDeleting?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TableFormValues>(EMPTY);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setForm(EMPTY);
    }
  }, [open]);

  const startEdit = (t: TableRow) => {
    setEditingId(t.id);
    // `t.id` is a UUID — showing it in the Table Code field made the disabled
    // input read "3f7a9c2e-…" instead of "T-06".
    setForm({
      table_no: t.table_no,
      table_name: t.table_name,
      capacity: t.capacity || 4,
      floor_or_zone: t.zone || "Main Floor",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.table_no.trim()) {
      toast.error("Table code is required (e.g. T-06)");
      return;
    }
    // The min/max attributes on a number input are advisory — a typed value of
    // -5 submits happily and was being stored verbatim.
    if (
      !Number.isFinite(form.capacity) ||
      form.capacity < MIN_CAPACITY ||
      form.capacity > MAX_CAPACITY
    ) {
      toast.error(`Seats must be a whole number between ${MIN_CAPACITY} and ${MAX_CAPACITY}`);
      return;
    }
    await onSave(
      {
        table_no: form.table_no.trim(),
        table_name: form.table_name.trim() || form.table_no.trim(),
        capacity: form.capacity,
        floor_or_zone: form.floor_or_zone.trim() || "Main Floor",
      },
      editingId,
    );
    cancelEdit();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 text-primary" /> Manage dining tables &amp; seating
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3 border-b border-border py-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-foreground">
              {editingId
                ? `Edit table ${form.table_name || form.table_no}`
                : "Add new dining table"}
            </div>
            {editingId && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-[11px]"
                onClick={cancelEdit}
              >
                Cancel edit
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Table code *</Label>
              <Input
                placeholder="e.g. T-06, VIP-02"
                disabled={!!editingId}
                value={form.table_no}
                onChange={(e) => setForm((f) => ({ ...f, table_no: e.target.value }))}
                className="mt-1 h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-[11px]">Display name</Label>
              <Input
                placeholder="e.g. Table 6, VIP Room 2"
                value={form.table_name}
                onChange={(e) => setForm((f) => ({ ...f, table_name: e.target.value }))}
                className="mt-1 h-8 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Seats</Label>
              <Input
                type="number"
                min={MIN_CAPACITY}
                max={MAX_CAPACITY}
                value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))}
                className="mt-1 h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-[11px]">Zone / area</Label>
              <Input
                placeholder="e.g. Main Floor, VIP, Rooftop"
                value={form.floor_or_zone}
                onChange={(e) => setForm((f) => ({ ...f, floor_or_zone: e.target.value }))}
                className="mt-1 h-8 text-xs"
              />
            </div>
          </div>

          <Button
            type="submit"
            size="sm"
            disabled={isSaving}
            className="mt-2 h-8 w-full gap-1 text-xs font-bold"
          >
            {editingId ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {editingId ? "Update table" : "Add table"}
          </Button>
        </form>

        <div className="max-h-52 space-y-1.5 overflow-y-auto py-1">
          <div className="text-xs font-bold text-muted-foreground">
            Current tables ({tables.length})
          </div>
          {tables.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No tables yet. Add the first one above.
            </p>
          ) : (
            <div className="space-y-1">
              {tables.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-center gap-2">
                    <UtensilsCrossed className="h-3.5 w-3.5 text-primary" />
                    <span className="font-bold">{t.label}</span>
                    <Badge variant="outline" className="px-1 py-0 text-[11px]">
                      {t.capacity || 4} seats
                    </Badge>
                    {t.zone && (
                      <span className="text-[11px] text-muted-foreground">({t.zone})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge
                      variant={t.status === "occupied" ? "destructive" : "secondary"}
                      className="text-[11px] capitalize"
                    >
                      {t.status}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      title="Edit table name and seats"
                      onClick={() => startEdit(t)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
                      title={
                        t.status === "occupied"
                          ? "Close the order before deleting this table"
                          : "Delete table"
                      }
                      disabled={t.status === "occupied" || isDeleting}
                      onClick={() => onDelete(t)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

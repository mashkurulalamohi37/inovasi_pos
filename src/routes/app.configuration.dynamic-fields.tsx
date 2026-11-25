import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { ArrowDown, ArrowUp, Plus, GripVertical } from "lucide-react";
import { useApp } from "@/lib/app-store";
import { INDUSTRY_PACKS, type FieldType, type IndustryPackId, type DynamicFieldDef } from "@/lib/industry-registry";
import { stores } from "@/lib/pos-data";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useCreateDynamicField, useReorderDynamicFields } from "@/hooks/use-api-config";

export const Route = createFileRoute("/app/configuration/dynamic-fields")({ component: Fields });

function Fields() {
  const app = useApp();
  const useApi = shouldUseBackend();
  const createField = useCreateDynamicField();
  const reorderFields = useReorderDynamicFields();
  const [previewPack, setPreviewPack] = useState<IndustryPackId>("fashion");
  const [dragId, setDragId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const grouped = useMemo(() => {
    const sorted = [...app.dynamicFields].sort((a, b) => a.order - b.order);
    const map = new Map<IndustryPackId, DynamicFieldDef[]>();
    INDUSTRY_PACKS.forEach(p => map.set(p.id, []));
    sorted.forEach(f => map.get(f.pack)?.push(f));
    return map;
  }, [app.dynamicFields]);

  const preview = app.getVisibleFields({ pack: previewPack, store: app.store, counter: app.counter, surface: "product" });

  const persistOrder = (orderedIds: string[]) => {
    app.setDynamicFieldOrder(orderedIds);
    if (useApi) {
      reorderFields.mutate(orderedIds);
    }
  };

  const handleDrop = (targetId: string, pack: IndustryPackId) => {
    if (!dragId || dragId === targetId) return;
    const packFields = grouped.get(pack) ?? [];
    const ids = packFields.map(f => f.id);
    const fromIdx = ids.indexOf(dragId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, dragId);
    persistOrder([...app.dynamicFields.filter(f => f.pack !== pack).sort((a, b) => a.order - b.order).map(f => f.id), ...ids]);
    setDragId(null);
    toast.success("Field order updated");
  };

  const handleAdd = async (f: Omit<DynamicFieldDef, "id" | "order">) => {
    if (useApi) {
      await createField.mutateAsync({
        pack_code: f.pack,
        entity: f.entity.toLowerCase(),
        name: f.name,
        field_type: f.type,
        required: f.required,
        visible_in_pos: f.visibleInPos,
        visible_in_product: f.visibleInProduct,
        visible_in_receipt: f.visibleInReceipt,
        visible_in_report: f.visibleInReport,
        enabled: f.enabled !== false,
        all_stores: f.allStores !== false,
        all_counters: f.allCounters !== false,
        store_codes: f.stores ?? [],
        counter_codes: f.counters ?? [],
        options: f.options ?? [],
      });
      setSheetOpen(false);
      return;
    }
    app.addDynamicField(f);
    toast.success("Field added");
    setSheetOpen(false);
  };

  return (
    <>
      <PageHeader
        title="Dynamic Field Builder"
        subtitle={useApi
          ? "Fields are saved to the database · drag to reorder · assign pack, store, counter."
          : "Drag to reorder · assign pack, store, counter · preview updates live (local demo)."}
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => setSheetOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add field
          </Button>
        }
      />
      <EntityFormDrawer
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="New dynamic field"
        onSubmit={() => {}}
        footer={<span className="hidden" />}
      >
        <FieldForm onSave={handleAdd} saving={createField.isPending} />
      </EntityFormDrawer>
      <PageBody className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {INDUSTRY_PACKS.filter(p => app.isPackEnabled(p.id)).map(pack => {
            const fields = grouped.get(pack.id) ?? [];
            if (fields.length === 0) return null;
            return (
              <SectionCard key={pack.id} title={`${pack.shortName} pack`} description={`${fields.length} field(s) · drag handle to reorder`}>
                <div className="divide-y divide-border">
                  {fields.map(d => (
                    <div
                      key={d.id}
                      draggable
                      onDragStart={() => setDragId(d.id)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => handleDrop(d.id, pack.id)}
                      className={cn("flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/30", dragId === d.id && "bg-primary/5")}
                    >
                      <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{d.name}{d.required && " *"}</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge variant="outline" className="text-[9px]">{d.type}</Badge>
                          <Badge variant="outline" className="text-[9px]">{d.entity}</Badge>
                          {d.allStores === false && <Badge variant="secondary" className="text-[9px]">Store scoped</Badge>}
                          {d.allCounters === false && <Badge variant="secondary" className="text-[9px]">Counter scoped</Badge>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {d.visibleInPos && <Badge className="text-[9px]">POS</Badge>}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                          app.reorderDynamicField(d.id, "up");
                          if (useApi) {
                            const next = [...app.dynamicFields].sort((a, b) => a.order - b.order);
                            const idx = next.findIndex(x => x.id === d.id);
                            if (idx > 0) {
                              const swap = next[idx - 1];
                              next[idx - 1] = next[idx];
                              next[idx] = swap;
                              reorderFields.mutate(next.map(x => x.id));
                            }
                          }
                        }}><ArrowUp className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                          app.reorderDynamicField(d.id, "down");
                          if (useApi) {
                            const next = [...app.dynamicFields].sort((a, b) => a.order - b.order);
                            const idx = next.findIndex(x => x.id === d.id);
                            if (idx >= 0 && idx < next.length - 1) {
                              const swap = next[idx + 1];
                              next[idx + 1] = next[idx];
                              next[idx] = swap;
                              reorderFields.mutate(next.map(x => x.id));
                            }
                          }
                        }}><ArrowDown className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            );
          })}
        </div>

        <SectionCard title="Live preview" description={`Store ${app.store} · Counter ${app.counter}`}>
          <div className="space-y-3 p-5">
            <Select value={previewPack} onValueChange={v => setPreviewPack(v as IndustryPackId)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{INDUSTRY_PACKS.map(p => <SelectItem key={p.id} value={p.id}>{p.shortName}</SelectItem>)}</SelectContent>
            </Select>
            {preview.length === 0 && <p className="text-sm text-muted-foreground">No visible fields for this pack/scope.</p>}
            {preview.map(f => (
              <div key={f.id}>
                <Label>{f.name}{f.required && " *"}</Label>
                <Input placeholder={f.type} disabled className="mt-1 bg-background" />
              </div>
            ))}
          </div>
        </SectionCard>
      </PageBody>
    </>
  );
}

function FieldForm({ onSave, saving }: { onSave: (f: Omit<DynamicFieldDef, "id" | "order">) => void | Promise<void>; saving?: boolean }) {
  const [pack, setPack] = useState<IndustryPackId>("fashion");
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [entity, setEntity] = useState("Product");
  const [required, setRequired] = useState(false);
  const [visibleInPos, setVisibleInPos] = useState(true);
  const [visibleInProduct, setVisibleInProduct] = useState(true);
  const [visibleInReceipt, setVisibleInReceipt] = useState(false);
  const [visibleInReport, setVisibleInReport] = useState(false);
  const [allStores, setAllStores] = useState(true);
  const [allCounters, setAllCounters] = useState(true);
  const [storeCode, setStoreCode] = useState("DHK-01");
  const [counterCode, setCounterCode] = useState("CTR-01");

  return (
    <div className="space-y-3 py-4">
      <div><Label>Industry pack</Label>
        <Select value={pack} onValueChange={v => setPack(v as IndustryPackId)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{INDUSTRY_PACKS.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Field name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
      <div><Label>Entity</Label><Input value={entity} onChange={e => setEntity(e.target.value)} /></div>
      <div><Label>Type</Label>
        <Select value={type} onValueChange={v => setType(v as FieldType)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(["text", "number", "date", "dropdown", "checkbox", "file", "barcode", "currency", "weight"] as FieldType[]).map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center gap-2 text-sm"><Switch checked={required} onCheckedChange={setRequired} /> Required</label>
      <label className="flex items-center gap-2 text-sm"><Switch checked={visibleInPos} onCheckedChange={setVisibleInPos} /> Visible in POS</label>
      <label className="flex items-center gap-2 text-sm"><Switch checked={visibleInProduct} onCheckedChange={setVisibleInProduct} /> Product master</label>
      <label className="flex items-center gap-2 text-sm"><Switch checked={visibleInReceipt} onCheckedChange={setVisibleInReceipt} /> Receipt</label>
      <label className="flex items-center gap-2 text-sm"><Switch checked={visibleInReport} onCheckedChange={setVisibleInReport} /> Reports</label>
      <div className="rounded-lg border border-border p-3 space-y-2">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Scope</div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={allStores} onCheckedChange={setAllStores} /> All stores</label>
        {!allStores && (
          <Select value={storeCode} onValueChange={setStoreCode}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{stores.map(s => <SelectItem key={s.code} value={s.code}>{s.code}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <label className="flex items-center gap-2 text-sm"><Switch checked={allCounters} onCheckedChange={setAllCounters} /> All counters</label>
        {!allCounters && <Input value={counterCode} onChange={e => setCounterCode(e.target.value)} placeholder="Counter ID e.g. CTR-01" />}
      </div>
      <div className="pt-2">
        <Button type="button" onClick={() => void onSave({
          pack, name, type, entity, required, visibleInPos, visibleInProduct, visibleInReceipt, visibleInReport,
          enabled: true, allStores, allCounters,
          stores: allStores ? [] : [storeCode],
          counters: allCounters ? [] : [counterCode],
        })} disabled={!name.trim() || saving}>{saving ? "Saving…" : "Save field"}</Button>
      </div>
    </div>
  );
}

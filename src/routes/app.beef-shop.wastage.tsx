import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { beefCatalog, butchers, cutTypes } from "@/lib/industry-mock";
import { loadWastage } from "@/lib/beef-analytics";
import type { BeefWastageRecord } from "@/lib/pulse-storage";
import { readStorage, writeStorage, STORAGE_KEYS, downloadCsv } from "@/lib/pulse-storage";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useIndustryWastage } from "@/hooks/use-api-config";
import { useBeefBatches, useBeefButchers } from "@/hooks/use-industry-data";
import { useCreateBeefWastage } from "@/hooks/use-industry-backoffice";

export const Route = createFileRoute("/app/beef-shop/wastage")({ component: Page });

const WASTAGE_TYPES = ["trim", "spoilage", "processing_loss", "customer_return", "other"];

function Page() {
  const useApi = shouldUseBackend();
  const wastageQuery = useIndustryWastage();
  const createWastage = useCreateBeefWastage();

  const [localRecords, setLocalRecords] = useState<BeefWastageRecord[]>(() => {
    const stored = readStorage<BeefWastageRecord[]>(STORAGE_KEYS.beefWastage, []);
    return stored.length ? stored : loadWastage().filter(w => !w.id.startsWith("w"));
  });

  const apiRecords = (wastageQuery.data ?? []).map(r => ({
    id: String(r.id),
    date: r.recorded_at ? new Date(String(r.recorded_at)).toLocaleString() : "—",
    type: String(r.wastage_type ?? "—"),
    kg: Number(r.wastage_kg ?? 0),
    reason: String(r.reason ?? ""),
    responsible: String(r.responsible_person ?? "—"),
  }));

  const records = useApi ? apiRecords : localRecords.map(r => ({
    id: r.id,
    date: new Date(r.ts).toLocaleString(),
    type: r.wastageType,
    kg: r.kg,
    reason: r.reason,
    responsible: r.responsible,
  }));

  const totalKg = records.reduce((s, r) => s + r.kg, 0);

  const exportCsv = () => {
    downloadCsv("beef-wastage.csv",
      ["ID", "Type", "Kg", "Reason", "Responsible", "Date"],
      records.map(r => [r.id, r.type, r.kg, r.reason, r.responsible, r.date]),
    );
    toast.success("Wastage CSV exported");
  };

  const saveLocal = (entry: BeefWastageRecord) => {
    const next = [entry, ...localRecords];
    writeStorage(STORAGE_KEYS.beefWastage, next.filter(r => r.id.startsWith("WST-")));
    setLocalRecords(next);
    toast.success("Wastage recorded");
  };

  return (
    <BackOfficePage
      title="Wastage Log"
      subtitle={useApi ? "Trim, spoilage and write-offs · live from backend" : "Trim, spoilage and write-offs · demo localStorage"}
      eyebrow="Beef Shop"
      stats={[{ label: "Total wastage", value: `${totalKg.toFixed(1)} kg` }, { label: "Entries", value: String(records.length) }]}
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}><Download className="h-3.5 w-3.5" /> Export CSV</Button>
          <WastageForm
            useApi={useApi}
            onSaveLocal={saveLocal}
            onSaveApi={body => createWastage.mutate(body, { onSuccess: () => { wastageQuery.refetch(); toast.success("Wastage recorded"); } })}
            loading={createWastage.isPending}
          />
        </>
      }
    >
      <SectionCard title="Wastage records">
        {useApi && wastageQuery.isLoading ? (
          <div className="space-y-2 p-5"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No wastage records yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-right">Kg</th>
                <th className="px-5 py-2 text-left">Reason</th>
                <th className="px-5 py-2 text-left">Responsible</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 text-muted-foreground">{r.date}</td>
                  <td className="px-3 py-3">{r.type}</td>
                  <td className="px-3 py-3 text-right tabular font-semibold">{r.kg.toFixed(2)}</td>
                  <td className="px-5 py-3">{r.reason}</td>
                  <td className="px-5 py-3">{r.responsible}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </BackOfficePage>
  );
}

function WastageForm({
  useApi,
  onSaveLocal,
  onSaveApi,
  loading,
}: {
  useApi: boolean;
  onSaveLocal: (r: BeefWastageRecord) => void;
  onSaveApi: (body: Record<string, unknown>) => void;
  loading?: boolean;
}) {
  const batchesQuery = useBeefBatches();
  const butchersQuery = useBeefButchers();
  const batches = useApi ? (batchesQuery.data ?? []) : beefCatalog.map(b => ({ id: b.batchNo, batch_code: b.batchNo }));
  const butcherNames = useApi ? (butchersQuery.data ?? []).map(b => b.name) : butchers;

  const [batchId, setBatchId] = useState("");
  const [cutType, setCutType] = useState(cutTypes[0]);
  const [wastageType, setWastageType] = useState(WASTAGE_TYPES[0]);
  const [kg, setKg] = useState("0.5");
  const [reason, setReason] = useState("");
  const [responsible, setResponsible] = useState(butcherNames[0] ?? "");
  const [open, setOpen] = useState(false);

  const submit = () => {
    if (useApi) {
      onSaveApi({
        batch_id: batchId || batches[0]?.id,
        cut_type: cutType,
        wastage_type: wastageType,
        wastage_kg: Number(kg) || 0,
        reason: reason || wastageType,
        responsible_person: responsible,
      });
    } else {
      const b = beefCatalog[0];
      onSaveLocal({
        id: `WST-${Date.now().toString().slice(-6)}`,
        product: b.name,
        batch: b.batchNo,
        cutType,
        wastageType,
        kg: Number(kg) || 0,
        reason: reason || wastageType,
        responsible,
        ts: Date.now(),
      });
    }
    setOpen(false);
  };

  return (
    <>
      <Button size="sm" className="gap-1.5" disabled={loading} onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Add wastage
      </Button>
      <EntityFormDrawer
        open={open}
        onOpenChange={setOpen}
        title="Record wastage"
        onSubmit={submit}
        submitLabel="Save wastage"
        isPending={loading}
      >
        <div className="space-y-3">
          {useApi && (
            <div><Label>Batch</Label>
              <Select value={batchId || batches[0]?.id} onValueChange={setBatchId}>
                <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
                <SelectContent>{batches.map(b => <SelectItem key={b.id ?? b.batch_code} value={String(b.id ?? b.batch_code)}>{b.batch_code ?? b.id}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div><Label>Cut type</Label>
            <Select value={cutType} onValueChange={setCutType}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{cutTypes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label>Wastage type</Label>
            <Select value={wastageType} onValueChange={setWastageType}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{WASTAGE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label>Wastage (kg)</Label><Input type="number" step="0.01" value={kg} onChange={e => setKg(e.target.value)} /></div>
          <div><Label>Reason</Label><Input value={reason} onChange={e => setReason(e.target.value)} /></div>
          <div><Label>Responsible person</Label>
            <Select value={responsible} onValueChange={setResponsible}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{butcherNames.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select>
          </div>
        </div>
      </EntityFormDrawer>
    </>
  );
}

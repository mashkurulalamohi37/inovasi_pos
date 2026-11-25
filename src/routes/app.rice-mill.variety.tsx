import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { ProductionIncompleteBanner } from "@/components/pulse/ProductionIncompleteBanner";
import { SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { Plus, RefreshCw, Wheat } from "lucide-react";
import { useRiceVarietyStock } from "@/hooks/use-industry-data";
import { useUpsertRiceVarietyStock } from "@/hooks/use-industry-backoffice";
import { riceVarietyStockDemo } from "@/lib/industry-mock";
import { isDemoMode } from "@/lib/demo-mode";
import { fmtBDT } from "@/lib/pos-data";
import { toast } from "sonner";

export const Route = createFileRoute("/app/rice-mill/variety")({
  component: Page,
});

function Page() {
  const useApi = !isDemoMode();
  const query = useRiceVarietyStock();
  const upsertMut = useUpsertRiceVarietyStock();
  const [demoRows, setDemoRows] = useState(riceVarietyStockDemo);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editRow, setEditRow] = useState<typeof demoRows[0] | null>(null);
  const [form, setForm] = useState({ variety: "Miniket", grade: "Standard", rate_per_kg: 0, qty_kg: 0, bag_count: 0, reorder_kg: 200 });

  const rows = useMemo(() => (useApi ? (query.data ?? []) : demoRows), [useApi, query.data, demoRows]);
  const lowCount = rows.filter(r => r.low_stock).length;

  const openEdit = (row: typeof demoRows[0]) => {
    if (useApi) {
      toast.error("Rice mill variety remains backlog debt — edits are unavailable");
      return;
    }
    setEditRow(row);
    setForm({
      variety: row.variety,
      grade: row.grade,
      rate_per_kg: row.rate_per_kg,
      qty_kg: row.qty_kg,
      bag_count: row.bag_count,
      reorder_kg: row.reorder_kg,
    });
    setSheetOpen(true);
  };

  const openNew = () => {
    if (useApi) {
      toast.error("Rice mill variety remains backlog debt — create is unavailable");
      return;
    }
    setEditRow(null);
    setForm({ variety: "Miniket", grade: "Standard", rate_per_kg: 72, qty_kg: 0, bag_count: 0, reorder_kg: 200 });
    setSheetOpen(true);
  };

  const saveStock = async () => {
    if (useApi) {
      toast.error("Rice mill variety remains backlog debt — save is unavailable");
      return;
    }
    if (editRow) {
      setDemoRows(prev => prev.map(r => r.id === editRow.id ? {
        ...r, ...form, low_stock: form.qty_kg <= form.reorder_kg,
      } : r));
    } else {
      setDemoRows(prev => [...prev, {
        id: `rv-${Date.now()}`,
        ...form,
        low_stock: form.qty_kg <= form.reorder_kg,
      }]);
    }
    setEditRow(null);
    setSheetOpen(false);
    toast.success("Variety stock updated");
  };

  return (
    <BackOfficePage
      title="Rice & Atta Variety Stock"
      eyebrow="Rice Mill"
      subtitle="Miniket, Nazirshail, atta — kg on hand, bag count, reorder alerts"
      stats={[
        { label: "Varieties tracked", value: String(rows.length) },
        { label: "Low stock alerts", value: String(lowCount) },
      ]}
      actions={
        <>
          {useApi && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          )}
          <Button variant="outline" size="sm" asChild><Link to="/app/pos/rice-mill">Open POS</Link></Button>
          <Button size="sm" className="gap-1.5" onClick={openNew}>
            <Plus className="h-3.5 w-3.5" /> Add variety
          </Button>
        </>
      }
    >
      <EntityFormDrawer
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editRow ? "Update stock" : "New variety"}
        onSubmit={saveStock}
        isPending={upsertMut.isPending}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Variety</Label><Input value={form.variety} onChange={e => setForm(f => ({ ...f, variety: e.target.value }))} /></div>
            <div><Label>Grade</Label><Input value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Rate/kg</Label><Input type="number" value={form.rate_per_kg} onChange={e => setForm(f => ({ ...f, rate_per_kg: Number(e.target.value) }))} /></div>
            <div><Label>Qty (kg)</Label><Input type="number" value={form.qty_kg} onChange={e => setForm(f => ({ ...f, qty_kg: Number(e.target.value) }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Bag count</Label><Input type="number" value={form.bag_count} onChange={e => setForm(f => ({ ...f, bag_count: Number(e.target.value) }))} /></div>
            <div><Label>Reorder at (kg)</Label><Input type="number" value={form.reorder_kg} onChange={e => setForm(f => ({ ...f, reorder_kg: Number(e.target.value) }))} /></div>
          </div>
        </div>
      </EntityFormDrawer>
      <ProductionIncompleteBanner
        moduleName="Rice mill variety"
        reason="Variety stock updates are toast-oriented and lack hardened inventory posting."
      />
      <SectionCard title="Mill stock by variety">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-2.5 text-left">Variety</th>
              <th className="px-3 py-2.5 text-left">Grade</th>
              <th className="px-3 py-2.5 text-right">Rate/kg</th>
              <th className="px-3 py-2.5 text-right">Qty (kg)</th>
              <th className="px-3 py-2.5 text-right">Bags</th>
              <th className="px-3 py-2.5 text-right">Reorder</th>
              <th className="px-5 py-2.5 text-right">Status</th>
              <th className="px-5 py-2.5 text-right">Edit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-secondary/30">
                <td className="px-5 py-3 font-medium"><Wheat className="mr-1 inline h-3.5 w-3.5 text-amber-600" />{r.variety}</td>
                <td className="px-3 py-3">{r.grade}</td>
                <td className="px-3 py-3 text-right tabular">{fmtBDT(r.rate_per_kg)}</td>
                <td className="px-3 py-3 text-right tabular">{r.qty_kg.toLocaleString()}</td>
                <td className="px-3 py-3 text-right tabular">{r.bag_count}</td>
                <td className="px-3 py-3 text-right tabular text-muted-foreground">{r.reorder_kg} kg</td>
                <td className="px-5 py-3 text-right">
                  {r.low_stock ? <Badge variant="destructive">Low</Badge> : <StatusBadge status="active" />}
                </td>
                <td className="px-5 py-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r as typeof demoRows[0])}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </BackOfficePage>
  );
}

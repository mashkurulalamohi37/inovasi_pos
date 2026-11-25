import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { ProductionIncompleteBanner } from "@/components/pulse/ProductionIncompleteBanner";
import { SectionCard, StatCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";
import { beefCatalog, butchers, cutTypes } from "@/lib/industry-mock";
import { beefDashboardStats, loadWastage } from "@/lib/beef-analytics";
import { shouldUseBackend } from "@/lib/demo-mode";
import { fmtBDT } from "@/lib/pos-data";
import { downloadCsv } from "@/lib/pulse-storage";

export const Route = createFileRoute("/app/beef-shop/reports")({ component: Page });

function Page() {
  const { transactions } = useApp();
  const wastage = loadWastage();
  const stats = useMemo(() => beefDashboardStats(transactions, wastage), [transactions, wastage]);
  const backend = shouldUseBackend();

  const exportReport = (name: string, headers: string[], rows: (string | number)[][]) => {
    if (backend) {
      toast.error("Beef reports remain backlog debt — server export is unavailable");
      return;
    }
    downloadCsv(`beef-${name}.csv`, headers, rows);
    toast.success(`${name} report exported`);
  };

  return (
    <BackOfficePage
      title="Meat Reports"
      subtitle="Daily sales, butcher-wise, cut-wise, batch stock, wastage, cold storage"
      eyebrow="Beef Shop"
      actions={<Button variant="outline" size="sm" className="gap-1.5" disabled={backend} onClick={() => exportReport("summary", ["Metric", "Value"], [["Today kg", stats.todayKg], ["Today value", stats.todayValue], ["Wastage kg", stats.todayWastage]])}><Download className="h-3.5 w-3.5" /> Export all</Button>}
    >
      <ProductionIncompleteBanner
        moduleName="Beef reports"
        reason="Client-side export and analytics are demo-oriented."
      />
      <Tabs defaultValue="daily">
        <TabsList className="mb-4">
          <TabsTrigger value="daily">Daily meat sales</TabsTrigger>
          <TabsTrigger value="butcher">Butcher-wise</TabsTrigger>
          <TabsTrigger value="cut">Cut-wise</TabsTrigger>
          <TabsTrigger value="batch">Batch stock</TabsTrigger>
          <TabsTrigger value="wastage">Wastage</TabsTrigger>
          <TabsTrigger value="cold">Cold storage</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          <div className="grid gap-4 sm:grid-cols-3 mb-4">
            <StatCard label="Sales kg" value={`${stats.todayKg.toFixed(1)} kg`} />
            <StatCard label="Sales value" value={fmtBDT(stats.todayValue || 84200)} />
            <StatCard label="Transactions" value={String(stats.beefTx.length)} />
          </div>
          <SectionCard title="Daily meat sales" actions={
            <Button size="sm" variant="outline" onClick={() => exportReport("daily-sales", ["Invoice", "Product", "Kg", "Value"], stats.beefTx.map(t => [t.id, t.product, t.kg, t.value]))}>Export CSV</Button>
          }>
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase"><tr><th className="px-5 py-2 text-left">Invoice</th><th className="px-3 py-2 text-left">Product</th><th className="px-3 py-2 text-right">Kg</th><th className="px-5 py-2 text-right">Value</th></tr></thead>
              <tbody className="divide-y divide-border">
                {stats.beefTx.slice(0, 10).map(t => (
                  <tr key={t.id}><td className="px-5 py-3 font-mono text-xs">{t.id}</td><td className="px-3 py-3">{t.product}</td><td className="px-3 py-3 text-right">{t.kg.toFixed(2)}</td><td className="px-5 py-3 text-right font-semibold">{fmtBDT(t.value)}</td></tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </TabsContent>

        <TabsContent value="butcher">
          <SectionCard title="Butcher-wise sales" actions={
            <Button size="sm" variant="outline" onClick={() => exportReport("butcher", ["Butcher", "Sales"], Object.entries(stats.butcherSales).map(([b, v]) => [b, v]))}>Export CSV</Button>
          }>
            <div className="divide-y divide-border p-4">
              {butchers.map(b => (
                <div key={b} className="flex justify-between py-3 text-sm">
                  <span>{b}</span><span className="font-semibold tabular">{fmtBDT(stats.butcherSales[b] ?? Math.round(15000 + Math.random() * 20000))}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="cut">
          <SectionCard title="Cut-wise sales" actions={
            <Button size="sm" variant="outline" onClick={() => exportReport("cut", ["Cut type", "Units"], cutTypes.map(c => [c, stats.beefTx.filter(t => t.cutType === c).length]))}>Export CSV</Button>
          }>
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {cutTypes.map(c => (
                <div key={c} className="rounded-lg border border-border p-3 text-sm">
                  <div className="font-medium">{c}</div>
                  <div className="text-muted-foreground">{stats.beefTx.filter(t => t.cutType === c).length} sales</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="batch">
          <SectionCard title="Batch-wise stock" actions={
            <Button size="sm" variant="outline" onClick={() => exportReport("batch", ["Batch", "Item", "Storage", "Expiry"], beefCatalog.map(b => [b.batchNo, b.name, b.storage, b.expiryDate]))}>Export CSV</Button>
          }>
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase"><tr><th className="px-5 py-2 text-left">Batch</th><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-left">Storage</th><th className="px-5 py-2 text-left">Expiry</th></tr></thead>
              <tbody className="divide-y divide-border">
                {beefCatalog.map(b => (
                  <tr key={b.batchNo}><td className="px-5 py-3 font-mono text-xs">{b.batchNo}</td><td className="px-3 py-3">{b.name}</td><td className="px-3 py-3">{b.storage}</td><td className="px-5 py-3">{b.expiryDate}</td></tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </TabsContent>

        <TabsContent value="wastage">
          <SectionCard title="Wastage report" actions={
            <Button size="sm" variant="outline" onClick={() => exportReport("wastage", ["ID", "Product", "Kg", "Type", "Responsible"], wastage.map(w => [w.id, w.product, w.kg, w.wastageType, w.responsible]))}>Export CSV</Button>
          }>
            <div className="p-4 text-sm text-muted-foreground">Total wastage: {wastage.reduce((s, w) => s + w.kg, 0).toFixed(2)} kg across {wastage.length} entries</div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="cold">
          <SectionCard title="Cold storage report" actions={
            <Button size="sm" variant="outline" onClick={() => exportReport("cold", ["Storage", "Batch", "Item"], beefCatalog.map(b => [b.storage, b.batchNo, b.name]))}>Export CSV</Button>
          }>
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {Array.from(new Set(beefCatalog.map(b => b.storage))).map(s => (
                <div key={s} className="rounded-lg border border-border p-4">
                  <div className="font-semibold">{s}</div>
                  <div className="text-sm text-muted-foreground">{beefCatalog.filter(b => b.storage === s).length} batches</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </BackOfficePage>
  );
}

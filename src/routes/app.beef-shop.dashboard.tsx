import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { ProductionIncompleteBanner } from "@/components/pulse/ProductionIncompleteBanner";
import { SectionCard, StatCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";
import { beefCatalog, butchers, cutTypes } from "@/lib/industry-mock";
import { beefDashboardStats, loadWastage } from "@/lib/beef-analytics";
import { shouldUseBackend } from "@/lib/demo-mode";
import { fmtBDT } from "@/lib/pos-data";
import { downloadCsv } from "@/lib/pulse-storage";

export const Route = createFileRoute("/app/beef-shop/dashboard")({ component: Page });

function Page() {
  const { transactions } = useApp();
  const wastage = loadWastage();
  const stats = useMemo(() => beefDashboardStats(transactions, wastage), [transactions, wastage]);
  const backend = shouldUseBackend();

  const [meatType, setMeatType] = useState("All");
  const [cut, setCut] = useState("All");
  const [butcher, setButcher] = useState("All");
  const [batch, setBatch] = useState("All");
  const [dateQ, setDateQ] = useState("");

  const filtered = stats.beefTx.filter(t => {
    if (meatType !== "All" && t.category !== meatType) return false;
    if (cut !== "All" && t.cutType !== cut) return false;
    if (butcher !== "All" && t.butcher !== butcher) return false;
    if (batch !== "All" && t.batch !== batch) return false;
    if (dateQ && !new Date(t.ts).toISOString().slice(0, 10).includes(dateQ)) return false;
    return true;
  });

  const exportCsv = () => {
    if (backend) {
      toast.error("Beef dashboard remains backlog debt — server export is unavailable");
      return;
    }
    downloadCsv("beef-dashboard.csv",
      ["Invoice", "Date", "Product", "Category", "Cut", "Butcher", "Batch", "Kg", "Value"],
      filtered.map(t => [t.id, new Date(t.ts).toLocaleString(), t.product, t.category, t.cutType, t.butcher, t.batch, t.kg.toFixed(2), t.value]),
    );
    toast.success("Dashboard CSV exported");
  };

  const categories = ["All", ...Array.from(new Set(beefCatalog.map(b => b.category)))];

  return (
    <BackOfficePage
      title="Beef Shop Dashboard"
      subtitle="Daily meat sales, wastage, cold storage, butcher performance"
      eyebrow="Beef Shop"
      actions={<Button variant="outline" size="sm" className="gap-1.5" disabled={backend} onClick={exportCsv}><Download className="h-3.5 w-3.5" /> Export CSV</Button>}
    >
      <ProductionIncompleteBanner
        moduleName="Beef dashboard"
        reason="Dashboard CSV export is client-side only."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today sales (kg)" value={`${stats.todayKg.toFixed(1)} kg`} />
        <StatCard label="Today sales value" value={fmtBDT(stats.todayValue || 84200)} />
        <StatCard label="Wastage today" value={`${stats.todayWastage.toFixed(1)} kg`} />
        <StatCard label="Top cut type" value={stats.topCut} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Butcher-wise sales">
          <div className="divide-y divide-border p-4">
            {Object.entries(stats.butcherSales).map(([b, v]) => (
              <div key={b} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium">{b}</span>
                <span className="tabular font-semibold">{fmtBDT(v)}</span>
              </div>
            ))}
            {Object.keys(stats.butcherSales).length === 0 && (
              <p className="py-4 text-sm text-muted-foreground">Complete beef POS sales to populate butcher stats.</p>
            )}
          </div>
        </SectionCard>
        <SectionCard title="Cold storage & near expiry">
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm">Cold storage stock</span>
              <Badge>{stats.coldStock} kg est.</Badge>
            </div>
            {stats.nearExpiry.map(b => (
              <div key={b.batchNo} className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
                <span>{b.name}</span>
                <Badge variant="outline" className="text-warning">Exp {b.expiryDate}</Badge>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Recent beef transactions">
        <div className="flex flex-wrap gap-2 border-b border-border p-4">
          <Input type="date" value={dateQ} onChange={e => setDateQ(e.target.value)} className="h-9 w-[140px]" />
          <Select value={meatType} onValueChange={setMeatType}><SelectTrigger className="h-9 w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
          <Select value={cut} onValueChange={setCut}><SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="Cut" /></SelectTrigger>
            <SelectContent><SelectItem value="All">All cuts</SelectItem>{cutTypes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
          <Select value={butcher} onValueChange={setButcher}><SelectTrigger className="h-9 w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="All">All butchers</SelectItem>{butchers.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select>
          <Select value={batch} onValueChange={setBatch}><SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="All">All batches</SelectItem>{beefCatalog.map(b => <SelectItem key={b.batchNo} value={b.batchNo}>{b.batchNo}</SelectItem>)}</SelectContent></Select>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-2 text-left">Invoice</th>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-left">Cut</th>
              <th className="px-3 py-2 text-left">Butcher</th>
              <th className="px-3 py-2 text-right">Kg</th>
              <th className="px-5 py-2 text-right">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">No transactions match filters · sell via Beef Shop POS</td></tr>
            ) : filtered.slice(0, 20).map(t => (
              <tr key={t.id} className="hover:bg-secondary/30">
                <td className="px-5 py-3 font-mono text-xs">{t.id}</td>
                <td className="px-3 py-3">{t.product}</td>
                <td className="px-3 py-3">{t.cutType}</td>
                <td className="px-3 py-3">{t.butcher}</td>
                <td className="px-3 py-3 text-right tabular">{t.kg.toFixed(2)}</td>
                <td className="px-5 py-3 text-right tabular font-semibold">{fmtBDT(t.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </BackOfficePage>
  );
}

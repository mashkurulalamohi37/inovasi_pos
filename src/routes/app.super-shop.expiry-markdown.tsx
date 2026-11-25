import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { PermissionGate } from "@/components/pulse/gates";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock, Percent, ShieldAlert, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { fmtBDT } from "@/lib/pos-data";

export const Route = createFileRoute("/app/super-shop/expiry-markdown")({
  component: SuperShopExpiryMarkdownPage,
});

type MarkdownRule = {
  id: string;
  name: string;
  department: string;
  discountPct: number;
  triggerTime?: string;
  daysToExpiry?: number;
  isActive: boolean;
};

const INITIAL_RULES: MarkdownRule[] = [
  {
    id: "mr-1",
    name: "Evening Fresh Produce & Meat Clearance",
    department: "Fresh, Meat & Fish",
    discountPct: 50,
    triggerTime: "20:00 - 23:00",
    isActive: true,
  },
  {
    id: "mr-2",
    name: "Near-Expiry Bakery Items",
    department: "Grocery & FMCG",
    discountPct: 30,
    triggerTime: "19:00 - 22:00",
    isActive: true,
  },
  {
    id: "mr-3",
    name: "Pharmacy Batch Near-Expiry Alert",
    department: "Pharmacy & Health",
    discountPct: 20,
    daysToExpiry: 30,
    isActive: true,
  },
];

type PerishableWatchItem = {
  id: string;
  name: string;
  department: string;
  batchNo: string;
  expiryDate: string;
  daysRemaining: number;
  stock: number;
  status: "critical" | "warning" | "fresh";
};

const PERISHABLE_ITEMS: PerishableWatchItem[] = [
  {
    id: "p1",
    name: "Fresh Broiler Chicken · Whole",
    department: "Fresh, Meat & Fish",
    batchNo: "CS-2026-0928",
    expiryDate: "2026-09-29",
    daysRemaining: 1,
    stock: 24,
    status: "critical",
  },
  {
    id: "p2",
    name: "Fresh Beef · Sirloin Cut",
    department: "Fresh, Meat & Fish",
    batchNo: "CS-2026-0927",
    expiryDate: "2026-09-30",
    daysRemaining: 2,
    stock: 18,
    status: "warning",
  },
  {
    id: "p3",
    name: "Moxacil 500mg Capsule",
    department: "Pharmacy & Health",
    batchNo: "BT-2026-04C",
    expiryDate: "2026-10-15",
    daysRemaining: 17,
    stock: 45,
    status: "warning",
  },
];

function SuperShopExpiryMarkdownPage() {
  const [rules, setRules] = useState<MarkdownRule[]>(INITIAL_RULES);
  const [items, setItems] = useState<PerishableWatchItem[]>(PERISHABLE_ITEMS);

  const toggleRule = (id: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r))
    );
    toast.info("Markdown rule status updated");
  };

  const handleQuarantine = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success("Batch quarantined and removed from active sales");
  };

  return (
    <PermissionGate perm="super-shop.manage">
      <PageHeader
        title="Fresh Clearance & Expiry Markdown Policies"
        subtitle="Automate evening clearance discounts on perishables and monitor cross-department expiry risk"
      />

      <PageBody>
        {/* Markdown Rules Section */}
        <SectionCard className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" /> Active Automated Markdown Schedules
              </h3>
              <p className="text-xs text-muted-foreground">
                Time-based clearance policies applied dynamically to checkout prices during specified hours.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {rules.map((r) => (
              <div
                key={r.id}
                className="p-3 rounded-xl border border-border/70 bg-card space-y-2 flex flex-col justify-between text-xs"
              >
                <div>
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-semibold text-sm">{r.name}</span>
                    <Badge variant={r.isActive ? "default" : "secondary"}>
                      {r.discountPct}% OFF
                    </Badge>
                  </div>
                  <span className="text-[11px] text-muted-foreground block mt-1">{r.department}</span>
                  {r.triggerTime && (
                    <span className="text-amber-600 dark:text-amber-400 font-mono font-medium block mt-1">
                      Active: {r.triggerTime}
                    </span>
                  )}
                </div>

                <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                  <span className="text-muted-foreground">Status: {r.isActive ? "Active" : "Disabled"}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => toggleRule(r.id)}
                  >
                    {r.isActive ? "Disable" : "Enable"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Perishables Watchboard */}
        <SectionCard>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-base flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" /> Cross-Department Perishable Watchboard
              </h3>
              <p className="text-xs text-muted-foreground">
                Batches requiring clearance pricing, markdown promotion, or supervisor quarantine.
              </p>
            </div>
            <Badge variant="destructive">{items.length} Batches Flagged</Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border bg-secondary/20 text-muted-foreground font-semibold">
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3">Department</th>
                  <th className="py-2.5 px-3">Batch Number</th>
                  <th className="py-2.5 px-3">Expiry Date</th>
                  <th className="py-2.5 px-3">Days Left</th>
                  <th className="py-2.5 px-3">Stock</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {items.map((i) => (
                  <tr key={i.id} className="hover:bg-secondary/10">
                    <td className="py-2.5 px-3 font-semibold">{i.name}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{i.department}</td>
                    <td className="py-2.5 px-3 font-mono">{i.batchNo}</td>
                    <td className="py-2.5 px-3 font-mono">{i.expiryDate}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded font-mono font-bold ${
                          i.daysRemaining <= 2
                            ? "bg-destructive/10 text-destructive"
                            : "bg-amber-500/10 text-amber-600"
                        }`}
                      >
                        {i.daysRemaining} Days
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold">{i.stock} units</td>
                    <td className="py-2.5 px-3 text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => handleQuarantine(i.id)}
                      >
                        Quarantine Batch
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </PageBody>
    </PermissionGate>
  );
}

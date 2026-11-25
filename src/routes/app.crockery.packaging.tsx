import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { Gift, Plus, PackageCheck, Sparkles, Download, Heart } from "lucide-react";
import { toast } from "sonner";
import { fmtBDT } from "@/lib/pos-data";
import { readStorage, writeStorage, downloadCsv } from "@/lib/pulse-storage";
import { useAuth } from "@/lib/auth-provider";

export const Route = createFileRoute("/app/crockery/packaging")({ component: Page });

export interface GiftPackagingOrder {
  id: string;
  invoiceNo: string;
  recipientName: string;
  packageType: "bubble" | "luxury" | "crate";
  greetingNote: string;
  fee: number;
  packedBy: string;
  orderedAt: string;
  status: "packed" | "pending" | "dispatched";
}

const DEFAULT_PACKAGING_ORDERS: GiftPackagingOrder[] = [];

const PACKAGING_TIERS = [
  {
    id: "bubble",
    name: "Shockproof Bubble Wrap & Outer Box",
    price: 60,
    description: "Multi-layer bubble wrap, corner edge protectors, and corrugated outer box for fragile glass/dinnerware courier transport.",
    badge: "Courier Standard",
  },
  {
    id: "luxury",
    name: "Luxury Gift Wrap with Satin Ribbon & Greeting Card",
    price: 150,
    description: "Embossed matte gift wrapping paper, double-faced satin ribbon bow, and printed personalized greeting slip.",
    badge: "Wedding & Festive",
  },
  {
    id: "crate",
    name: "Reinforced Wooden Transit Crate",
    price: 350,
    description: "Custom heavy-duty wooden frame with foam shock absorption for bulk 52-pc sets or long-distance truck cargo.",
    badge: "Heavy Transit",
  },
];

function Page() {
  const [orders, setOrders] = useState<GiftPackagingOrder[]>(() => {
    const raw = readStorage<GiftPackagingOrder[]>("pulse_crockery_packaging_orders", DEFAULT_PACKAGING_ORDERS);
    // Purge legacy demo entries
    const clean = raw.filter(
      (o) => !o.id.startsWith("PKG-2026-00") && !o.packedBy?.includes("Aura")
    );
    if (clean.length !== raw.length) {
      writeStorage("pulse_crockery_packaging_orders", clean);
    }
    return clean;
  });

  const totalFeeCollected = orders.reduce((s, o) => s + o.fee, 0);

  const exportCsv = () => {
    downloadCsv(
      "gift-packaging-orders.csv",
      ["ID", "Invoice", "Recipient", "Packaging Type", "Greeting Note", "Fee", "Status", "Date"],
      orders.map((o) => [
        o.id,
        o.invoiceNo,
        o.recipientName,
        o.packageType,
        o.greetingNote,
        String(o.fee),
        o.status,
        o.orderedAt,
      ])
    );
    toast.success("Packaging orders CSV exported");
  };

  const handleCreateOrder = (entry: Omit<GiftPackagingOrder, "id" | "orderedAt" | "status">) => {
    const newOrder: GiftPackagingOrder = {
      ...entry,
      id: `PKG-2026-${String(orders.length + 1).padStart(3, "0")}`,
      orderedAt: new Date().toISOString().replace("T", " ").slice(0, 16),
      status: "packed",
    };
    const updated = [newOrder, ...orders];
    setOrders(updated);
    writeStorage("pulse_crockery_packaging_orders", updated);
    toast.success(`Packaging order logged for ${entry.recipientName}`);
  };

  return (
    <BackOfficePage
      title="Gift & Packaging Services"
      subtitle="Configure luxury gift wrapping, bubble cushioning, and custom wooden transit crates for dinner sets"
      eyebrow="Crockery & Kitchenware"
      stats={[
        { label: "Packaging Orders", value: `${orders.length} Handled` },
        { label: "Packaging Revenue", value: fmtBDT(totalFeeCollected) },
        { label: "Packaging Tiers", value: "3 Options" },
      ]}
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <CreatePackagingModal onSave={handleCreateOrder} />
        </>
      }
    >
      <div className="space-y-6">
        <SectionCard
          title="Available Packaging Tiers & Service Rates"
          description="Standard packaging options available to cashiers at checkout"
        >
          <div className="grid gap-4 sm:grid-cols-3 p-4 pt-0">
            {PACKAGING_TIERS.map((tier) => (
              <div
                key={tier.id}
                className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between hover:border-primary/40 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                      {tier.badge}
                    </Badge>
                    <span className="font-mono font-bold text-foreground text-sm">{fmtBDT(tier.price)}</span>
                  </div>
                  <h3 className="font-bold text-sm text-foreground mb-1">{tier.name}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{tier.description}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Recent Gift Wrapping & Protective Packaging Orders"
          description="Customer orders processed with customized packaging and greeting notes"
        >
          {orders.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <Gift className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <div className="font-semibold text-foreground text-base">No Packaging Orders Yet</div>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Customer gift wraps, transit wooden crates, and bubble packaging orders will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-5 py-2.5 text-left">Order & Invoice</th>
                  <th className="px-3 py-2.5 text-left">Packaging Type</th>
                  <th className="px-3 py-2.5 text-left">Recipient & Custom Greeting Slip</th>
                  <th className="px-3 py-2.5 text-right">Fee</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                  <th className="px-5 py-2.5 text-left">Packed By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-mono text-xs font-semibold text-foreground">{ord.id}</div>
                      <div className="text-[11px] text-muted-foreground">{ord.invoiceNo} · {ord.orderedAt}</div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Gift className="h-3 w-3 text-amber-600" />
                        {ord.packageType === "luxury"
                          ? "Luxury Gift Wrap"
                          : ord.packageType === "crate"
                          ? "Wooden Crate"
                          : "Bubble Wrap"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 max-w-xs">
                      <div className="font-semibold text-foreground">{ord.recipientName}</div>
                      {ord.greetingNote && (
                        <div className="text-xs text-muted-foreground italic mt-0.5 line-clamp-2">
                          "{ord.greetingNote}"
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-foreground">
                      {fmtBDT(ord.fee)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Badge className={
                        ord.status === "dispatched"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : ord.status === "packed"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      }>
                        {ord.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {ord.packedBy}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
      </div>
    </BackOfficePage>
  );
}

function CreatePackagingModal({
  onSave,
}: {
  onSave: (entry: Omit<GiftPackagingOrder, "id" | "orderedAt" | "status">) => void;
}) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [packageType, setPackageType] = useState<"bubble" | "luxury" | "crate">("luxury");
  const [greetingNote, setGreetingNote] = useState("");

  const fee = packageType === "luxury" ? 150 : packageType === "crate" ? 350 : 60;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientName) {
      toast.error("Please provide recipient details");
      return;
    }
    const operatorName = auth.user?.full_name || auth.user?.email || "Store Staff";
    onSave({
      invoiceNo: invoiceNo.trim() || `INV-${Date.now().toString().slice(-6)}`,
      recipientName,
      packageType,
      greetingNote,
      fee,
      packedBy: operatorName,
    });
    setOpen(false);
    setInvoiceNo("");
    setRecipientName("");
    setGreetingNote("");
  };

  return (
    <>
      <Button size="sm" className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Log Packaging Order
      </Button>

      <EntityFormDrawer
        open={open}
        onOpenChange={setOpen}
        title="Log Gift / Protective Packaging Service"
        description="Record packaging requirements, recipient names, and printed greeting notes for an order."
      >
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Invoice Number</Label>
            <Input
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              className="text-xs font-mono"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Packaging Type</Label>
            <select
              value={packageType}
              onChange={(e) => setPackageType(e.target.value as any)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs font-medium"
            >
              <option value="bubble">Shockproof Bubble Wrap (+৳60)</option>
              <option value="luxury">Luxury Gift Wrap with Satin Ribbon (+৳150)</option>
              <option value="crate">Reinforced Wooden Transit Crate (+৳350)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Recipient / Occasion Name</Label>
            <Input
              placeholder="e.g. Asif & Maya (Wedding Reception)"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              className="text-xs"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Greeting Note / Card Message</Label>
            <textarea
              placeholder="e.g. Wishing you warm blessings and joy in your new journey!"
              value={greetingNote}
              onChange={(e) => setGreetingNote(e.target.value)}
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-xs"
            />
          </div>

          <div className="rounded-lg border border-border p-3 flex justify-between items-center bg-muted/30 text-xs">
            <span className="text-muted-foreground">Service Fee:</span>
            <span className="font-mono font-bold text-foreground text-sm">{fmtBDT(fee)}</span>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5">
              <Gift className="h-3.5 w-3.5" /> Save Packaging Order
            </Button>
          </div>
        </form>
      </EntityFormDrawer>
    </>
  );
}

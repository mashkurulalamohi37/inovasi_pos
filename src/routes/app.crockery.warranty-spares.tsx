import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { ShieldCheck, Plus, Wrench, Download, Zap, Flame, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { fmtBDT } from "@/lib/pos-data";
import { readStorage, writeStorage, downloadCsv } from "@/lib/pulse-storage";

export const Route = createFileRoute("/app/crockery/warranty-spares")({ component: Page });

export interface CookwareWarrantyRecord {
  id: string;
  invoiceNo: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  brand: string;
  capacity: string;
  warrantyYears: number;
  purchaseDate: string;
  expiryDate: string;
  status: "active" | "expired" | "claimed";
}

export interface SparesMapping {
  id: string;
  cookerModel: string;
  brand: string;
  gasketSku: string;
  gasketName: string;
  valveSku: string;
  valveName: string;
  whistleSku: string;
  whistleName: string;
}

const DEFAULT_WARRANTIES: CookwareWarrantyRecord[] = [];

const DEFAULT_SPARES_MAPPINGS: SparesMapping[] = [
  {
    id: "MAP-01",
    cookerModel: "Kiam Classic & Deluxe Pressure Cookers (3L - 6.5L)",
    brand: "Kiam",
    gasketSku: "CRK-SP-01",
    gasketName: "Kiam Food-Grade Silicone Gasket (5.5L)",
    valveSku: "CRK-SP-02",
    valveName: "Universal Metallic Safety Valve",
    whistleSku: "CRK-SP-03",
    whistleName: "Heavy Weight Pressure Whistle",
  },
  {
    id: "MAP-02",
    cookerModel: "Hawkins Contura & Classic (3L / 5L)",
    brand: "Hawkins",
    gasketSku: "CRK-SP-04",
    gasketName: "Hawkins Genuine Rubber Gasket (3L/5L)",
    valveSku: "CRK-SP-05",
    valveName: "Hawkins Safety Valve Fusible Plug",
    whistleSku: "CRK-SP-06",
    whistleName: "Hawkins Vent Weight Assembly",
  },
  {
    id: "MAP-03",
    cookerModel: "Prestige Deluxe Alpha Induction",
    brand: "Prestige",
    gasketSku: "CRK-SP-07",
    gasketName: "Prestige Alpha Silicone Gasket Ring",
    valveSku: "CRK-SP-08",
    valveName: "Prestige Metallic Safety Plug",
    whistleSku: "CRK-SP-09",
    whistleName: "Prestige Whistle Weight Regulator",
  },
];

function Page() {
  const [warranties, setWarranties] = useState<CookwareWarrantyRecord[]>(() => {
    const raw = readStorage<CookwareWarrantyRecord[]>("pulse_crockery_warranties", DEFAULT_WARRANTIES);
    // Purge legacy demo entries
    const clean = raw.filter(
      (w) =>
        !w.id.startsWith("WAR-CK-00") &&
        w.customerName !== "Rahim Uddin" &&
        w.customerName !== "Sharmin Sultana" &&
        w.customerName !== "Tanvir Hasan"
    );
    if (clean.length !== raw.length) {
      writeStorage("pulse_crockery_warranties", clean);
    }
    return clean;
  });

  const [activeTab, setActiveTab] = useState<"warranties" | "spares">("warranties");

  const exportCsv = () => {
    downloadCsv(
      "cookware-warranties.csv",
      ["ID", "Invoice", "Customer", "Phone", "Product", "Brand", "Warranty (Yrs)", "Purchase Date", "Expiry Date", "Status"],
      warranties.map((w) => [
        w.id,
        w.invoiceNo,
        w.customerName,
        w.customerPhone,
        w.productName,
        w.brand,
        String(w.warrantyYears),
        w.purchaseDate,
        w.expiryDate,
        w.status,
      ])
    );
    toast.success("Warranties CSV exported");
  };

  const handleRegister = (entry: Omit<CookwareWarrantyRecord, "id" | "expiryDate" | "status">) => {
    const pDate = new Date(entry.purchaseDate);
    const expDate = new Date(pDate);
    expDate.setFullYear(pDate.getFullYear() + entry.warrantyYears);

    const newWarranty: CookwareWarrantyRecord = {
      ...entry,
      id: `WAR-CK-${String(warranties.length + 1).padStart(3, "0")}`,
      expiryDate: expDate.toISOString().slice(0, 10),
      status: "active",
    };
    const updated = [newWarranty, ...warranties];
    setWarranties(updated);
    writeStorage("pulse_crockery_warranties", updated);
    toast.success(`Warranty registered for ${entry.customerName}`);
  };

  return (
    <BackOfficePage
      title="Cookware Warranties & Spares"
      subtitle="Pressure cooker warranty cards, service registry, and spare part compatibility management"
      eyebrow="Crockery & Kitchenware"
      stats={[
        { label: "Active Warranties", value: `${warranties.filter((w) => w.status === "active").length} Covered` },
        { label: "Mapped Cooker Models", value: `${DEFAULT_SPARES_MAPPINGS.length} Brands` },
        { label: "Spare Part SKUs", value: "9 Types" },
      ]}
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <RegisterWarrantyModal onRegister={handleRegister} />
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex gap-2 border-b border-border pb-3">
          <Button
            variant={activeTab === "warranties" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("warranties")}
            className="gap-1.5 text-xs"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Registered Customer Warranties
          </Button>
          <Button
            variant={activeTab === "spares" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("spares")}
            className="gap-1.5 text-xs"
          >
            <Wrench className="h-3.5 w-3.5" /> Spare Parts Compatibility Engine
          </Button>
        </div>

        {activeTab === "warranties" ? (
          <SectionCard
            title="Active Cookware Warranty Registry"
            description="Verified customer warranty terms and receipt verification"
          >
            {warranties.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                <div className="font-semibold text-foreground text-base">No Cookware Warranties Registered</div>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Protect customer purchases for pressure cookers and pans. Click "+ Register Warranty" to register a warranty certificate.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-5 py-2.5 text-left">Warranty ID & Invoice</th>
                    <th className="px-3 py-2.5 text-left">Customer</th>
                    <th className="px-3 py-2.5 text-left">Cookware Item & Brand</th>
                    <th className="px-3 py-2.5 text-center">Warranty Period</th>
                    <th className="px-3 py-2.5 text-left">Valid Through</th>
                    <th className="px-5 py-2.5 text-right">Coverage Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {warranties.map((w) => (
                    <tr key={w.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="font-mono text-xs font-semibold text-foreground">{w.id}</div>
                        <div className="text-[11px] text-muted-foreground">{w.invoiceNo}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-foreground">{w.customerName}</div>
                        <div className="text-[11px] font-mono text-muted-foreground">{w.customerPhone}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-foreground">{w.productName}</div>
                        <div className="text-[11px] text-muted-foreground">{w.brand} · {w.capacity}</div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Badge variant="outline" className="font-mono text-xs bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          {w.warrantyYears} Years
                        </Badge>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-foreground">
                        {w.expiryDate}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 gap-1 text-xs">
                          <CheckCircle2 className="h-3 w-3" />
                          Active Protection
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
        ) : (
          <SectionCard
            title="Cookware Spare Parts Compatibility Engine"
            description="Automatic matching rules for gaskets, safety valves, and whistles when cashiers scan pressure cookers"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-5 py-2.5 text-left">Brand & Cooker Series</th>
                    <th className="px-3 py-2.5 text-left">Matching Gasket Ring</th>
                    <th className="px-3 py-2.5 text-left">Matching Safety Valve</th>
                    <th className="px-5 py-2.5 text-left">Pressure Whistle Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {DEFAULT_SPARES_MAPPINGS.map((map) => (
                    <tr key={map.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-foreground">{map.brand}</div>
                        <div className="text-xs text-muted-foreground">{map.cookerModel}</div>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="text-xs font-semibold text-foreground">{map.gasketName}</div>
                        <div className="text-[11px] font-mono text-amber-600">{map.gasketSku} · ৳180</div>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="text-xs font-semibold text-foreground">{map.valveName}</div>
                        <div className="text-[11px] font-mono text-amber-600">{map.valveSku} · ৳120</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="text-xs font-semibold text-foreground">{map.whistleName}</div>
                        <div className="text-[11px] font-mono text-amber-600">{map.whistleSku} · ৳150</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}
      </div>
    </BackOfficePage>
  );
}

function RegisterWarrantyModal({
  onRegister,
}: {
  onRegister: (entry: Omit<CookwareWarrantyRecord, "id" | "expiryDate" | "status">) => void;
}) {
  const [open, setOpen] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [productName, setProductName] = useState("");
  const [brand, setBrand] = useState("");
  const [warrantyYears, setWarrantyYears] = useState("5");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerPhone || !productName) {
      toast.error("Please provide all warranty details");
      return;
    }
    onRegister({
      invoiceNo: invoiceNo.trim() || `INV-${Date.now().toString().slice(-6)}`,
      customerName,
      customerPhone,
      productName,
      brand: brand || "Cookware",
      capacity: "Standard",
      warrantyYears: parseInt(warrantyYears) || 5,
      purchaseDate: new Date().toISOString().slice(0, 10),
    });
    setOpen(false);
    setInvoiceNo("");
    setCustomerName("");
    setCustomerPhone("");
    setProductName("");
    setBrand("");
  };

  return (
    <>
      <Button size="sm" className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Register Warranty
      </Button>

      <EntityFormDrawer
        open={open}
        onOpenChange={setOpen}
        title="Register Customer Cookware Warranty"
        description="Issue a new digital warranty certificate for pressure cookers or non-stick cookware."
      >
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
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
              <Label className="text-xs">Warranty Duration (Years)</Label>
              <select
                value={warrantyYears}
                onChange={(e) => setWarrantyYears(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs font-bold"
              >
                <option value="2">2 Years Warranty</option>
                <option value="3">3 Years Warranty</option>
                <option value="5">5 Years Warranty</option>
                <option value="10">10 Years Warranty</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Customer Full Name</Label>
            <Input
              placeholder="e.g. Mahin Ahmed"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="text-xs"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Customer Mobile Phone</Label>
            <Input
              placeholder="e.g. +880 1711-234567"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="text-xs font-mono"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Cookware Item</Label>
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="text-xs"
              required
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Save Warranty Certificate
            </Button>
          </div>
        </form>
      </EntityFormDrawer>
    </>
  );
}

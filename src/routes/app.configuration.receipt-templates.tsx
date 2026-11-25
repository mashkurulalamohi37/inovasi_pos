import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Printer, Download, Upload, RotateCcw, Languages } from "lucide-react";
import { useApp, type Language } from "@/lib/app-store";
import { ThermalReceipt, buildReceiptPdf, tryPrint, type ReceiptData } from "@/lib/receipt";
import { INDUSTRY_PACKS, type IndustryPackId } from "@/lib/industry-registry";
import { shouldUseBackend } from "@/lib/demo-mode";
import {
  useReceiptTemplates, useCreateReceiptTemplate, useUpdateReceiptTemplate,
  useDeleteReceiptTemplate, useSetDefaultReceiptTemplate, type ApiReceiptTemplate,
} from "@/hooks/use-api-config";
import { useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/configuration/receipt-templates")({ component: Receipts });

const INDUSTRY_SAMPLES: Partial<Record<IndustryPackId, ReceiptData>> = {
  "beef-shop": {
    id: "INV-BEEF-PREVIEW", ts: Date.now(), tender: "Cash", total: 2142, subtotal: 2040, tax: 102,
    lines: [{
      sku: "BF-001", name: "Premium Beef · Sirloin", price: 850, qty: 2.4, industry: "beef-shop",
      extras: { netWeight: 2.4, ratePerKg: 850, cutType: "Steak", butcher: "Karim", batch: "CS-2026-0612", amount: 2040 },
    }],
    note: "Weight · cut · batch on receipt",
  },
  fashion: {
    id: "INV-FASH-PREVIEW", ts: Date.now(), tender: "Card", total: 1450, subtotal: 1380, tax: 70,
    lines: [{
      sku: "TS-RED-M", name: "Cotton tee · Red · M", price: 690, qty: 1, industry: "fashion",
      extras: { size: "M", color: "Red", style: "TS-001", barcode: "8802001001" },
    }, {
      sku: "JN-BLU-32", name: "Slim jean · Indigo · 32", price: 690, qty: 1, industry: "fashion",
      extras: { size: "32", color: "Indigo", style: "JN-001", barcode: "8802001002" },
    }],
    note: "Exchange within 14 days with tag intact",
  },
  pharmacy: {
    id: "INV-RX-PREVIEW", ts: Date.now(), tender: "Cash", total: 420, subtotal: 420, tax: 0,
    lines: [{
      sku: "RX-001", name: "Napa 500mg", price: 420, qty: 1, industry: "pharmacy",
      extras: { batch: "B2026-04", expiry: "2027-03-15", generic: "Paracetamol", manufacturer: "Square", dosageForm: "Tablet" },
    }],
    note: "Batch & expiry on receipt",
  },
  grocery: {
    id: "INV-GR-PREVIEW", ts: Date.now(), tender: "Mobile", total: 380, subtotal: 362, tax: 18,
    lines: [{
      sku: "GR-001", name: "Fresh Milk 1L", price: 90, qty: 2, industry: "grocery",
      extras: { mrp: 95, shelf: "A-12", offer: "Buy 2 Save ৳10" },
    }],
  },
  restaurant: {
    id: "INV-RST-PREVIEW", ts: Date.now(), tender: "Cash", total: 880, subtotal: 800, tax: 80,
    lines: [{
      sku: "RST-001", name: "Beef Kacchi Biryani", price: 450, qty: 1, industry: "restaurant",
      extras: { table: "T-02", waiter: "Rahim", orderType: "Dine-in", kot: "KOT-1042" },
    }],
    note: "Table T-02 · Waiter Rahim",
  },
  jewelry: {
    id: "INV-JWL-PREVIEW", ts: Date.now(), tender: "Card", total: 125000, subtotal: 119048, tax: 5952,
    lines: [{
      sku: "JW-001", name: "Gold Chain 22K", price: 125000, qty: 1, industry: "jewelry",
      extras: { metal: "Gold", karat: 22, netWeight: 12.5, makingCharge: 15000, certificate: "GIA-8821", amount: 125000 },
    }],
  },
  electronics: {
    id: "INV-EL-PREVIEW", ts: Date.now(), tender: "Card", total: 45990, subtotal: 43800, tax: 2190,
    lines: [{
      sku: "EL-001", name: "Samsung Galaxy A55", price: 45990, qty: 1, industry: "electronics",
      extras: { serial: "SN-A55-8821", warrantyMonths: 12, brand: "Samsung", model: "A55" },
    }],
  },
  "optical-shop": {
    id: "INV-OP-PREVIEW", ts: Date.now(), tender: "Cash", total: 4050, subtotal: 4050, tax: 0,
    lines: [{
      sku: "OP-003", name: "Single Vision Lens · CR-39", price: 850, qty: 1, industry: "optical-shop",
      extras: { lens_power: "-2.00 SPH", coating: "Anti-glare", brand: "Essilor" },
    }, {
      sku: "OP-001", name: "Metal Full-Rim Frame", price: 1200, qty: 1, industry: "optical-shop",
      extras: { frame_size: "54-18-140", brand: "VisionStyle" },
    }],
    note: "Prescription on receipt",
  },
  "surgical-shop": {
    id: "INV-SG-PREVIEW", ts: Date.now(), tender: "Cash", total: 815, subtotal: 815, tax: 0,
    lines: [{
      sku: "SG-001", name: "Surgical Gloves · M", price: 280, qty: 2, industry: "surgical-shop",
      extras: { batch_no: "SG-2026-0412", expiry_date: "2027-04-01", sterile: true, surgical_grade: "ISO" },
    }, {
      sku: "SG-004", name: "IV Cannula · 22G", price: 35, qty: 5, industry: "surgical-shop",
      extras: { batch_no: "IV-2026-0518", expiry_date: "2027-05-20", sterile: true },
    }],
    note: "Batch & expiry on sterile items",
  },
  crockery: {
    id: "INV-CRK-PREVIEW", ts: Date.now(), tender: "Card", total: 4350, subtotal: 4143, tax: 207,
    lines: [{
      sku: "CRK-001", name: "Milano 32-Pc Royal Opal Dinner Set", price: 4200, qty: 1, industry: "crockery",
      extras: { material: "Opal Glass", pieces: 32, heatCompatibility: "Microwave Safe" },
    }, {
      sku: "CRK-SP-01", name: "Silicone Gasket 5.5L Cooker", price: 150, qty: 1, industry: "crockery",
      extras: { material: "Food-grade Silicone", fit: "Kiam / Prestige 5.5L" },
    }],
    note: "Inspect fragile goods at counter · 7-day exchange for boxed sets",
  },
};

function Receipts() {
  const app = useApp();
  const b = app.receiptBrand;
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewPack, setPreviewPack] = useState<IndustryPackId>("fashion");
  const sampleData = INDUSTRY_SAMPLES[previewPack] ?? INDUSTRY_SAMPLES["fashion"]!;
  const useApi = shouldUseBackend();
  const { data: cloudTemplates, refetch: refetchTemplates } = useReceiptTemplates();
  const createTemplate = useCreateReceiptTemplate();
  const updateTemplate = useUpdateReceiptTemplate();
  const deleteTemplate = useDeleteReceiptTemplate();
  const setDefaultTemplate = useSetDefaultReceiptTemplate();
  const [editingId, setEditingId] = useState<string | null>(null);

  const saveToBackend = () => {
    const payload = {
      pack_code: previewPack,
      name: `${previewPack} template`,
      brand_name: b.brandName,
      tagline: b.tagline ?? undefined,
      address_lines: b.addressLines.join("\n"),
      footer_notes: b.footerNotes,
      paper_width_mm: b.paperWidthMm,
      is_default: false,
    };
    if (editingId) {
      updateTemplate.mutate({ id: editingId, body: payload }, { onSuccess: () => refetchTemplates() });
    } else {
      createTemplate.mutate(payload, { onSuccess: () => refetchTemplates() });
    }
  };

  const loadFromTemplate = (t: ApiReceiptTemplate) => {
    setEditingId(t.id);
    app.setReceiptBrand({
      brandName: t.brand_name,
      tagline: t.tagline ?? "",
      addressLines: t.address_lines ? t.address_lines.split("\n") : [],
      footerNotes: t.footer_notes ?? "",
      paperWidthMm: (t.paper_width_mm === 58 ? 58 : 80) as 58 | 80,
    });
    if (t.pack_code && INDUSTRY_PACKS.some(p => p.id === t.pack_code)) {
      setPreviewPack(t.pack_code as IndustryPackId);
    }
    toast.info(`Loaded template: ${t.name}`);
  };

  const onLogo = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 250_000) { toast.error("Logo too large", { description: "Keep under 250 KB for receipts." }); return; }
    const reader = new FileReader();
    reader.onload = () => { app.setReceiptBrand({ logoDataUrl: String(reader.result), showLogo: true }); toast.success("Logo updated"); };
    reader.readAsDataURL(file);
  };

  const onTestPrint = () => {
    const ok = tryPrint(b, "pulse-template-preview", "Test receipt");
    if (!ok) toast.error("Print blocked", { description: "Allow pop-ups or use PDF." });
    else toast.success("Test print sent");
  };
  const onDownloadPdf = () => {
    const doc = buildReceiptPdf(b, { ...sampleData, ts: Date.now() });
    doc.save("pulse-receipt-sample.pdf");
    toast.success("Sample PDF downloaded");
  };

  return (
    <>
      <PageHeader title="Receipt Templates" subtitle="Brand your printed receipts and PDFs · logo, address, footer, bilingual text."
        actions={
          <div className="flex items-center gap-2">
            {useApi && (
              <Button variant="outline" size="sm" onClick={saveToBackend} disabled={createTemplate.isPending || updateTemplate.isPending}>
                {editingId ? "Update cloud template" : "Save to cloud"}
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { app.resetReceiptBrand(); setEditingId(null); toast.info("Defaults restored"); }}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onDownloadPdf}>
              <Download className="h-3.5 w-3.5" /> Sample PDF
            </Button>
            <Button size="sm" className="gap-1.5" onClick={onTestPrint}>
              <Printer className="h-3.5 w-3.5" /> Test print
            </Button>
          </div>
        }
      />
      <PageBody>
        {useApi && (cloudTemplates ?? []).length > 0 && (
          <SectionCard title="Cloud templates" description="Saved receipt templates on the backend." className="mb-4">
            <div className="divide-y divide-border">
              {(cloudTemplates ?? []).map(t => (
                <div key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-[160px]">
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">{t.pack_code ?? "global"} · {t.paper_width_mm}mm</div>
                  </div>
                  {t.is_default && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                  <Button variant="ghost" size="sm" onClick={() => loadFromTemplate(t)}>Load</Button>
                  {!t.is_default && (
                    <Button variant="ghost" size="sm" onClick={() => setDefaultTemplate.mutate(t.id)}>Set default</Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteTemplate.mutate(t.id, { onSuccess: () => { if (editingId === t.id) setEditingId(null); } })}>
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          </SectionCard>
        )}
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <SectionCard title="Brand & content" actions={
            <Badge variant="outline" className="gap-1"><Languages className="h-3 w-3" /> {b.language === "both" ? "Bilingual" : b.language.toUpperCase()}</Badge>
          }>
            <div className="space-y-5 p-5">
              {/* Logo + paper */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Logo</Label>
                  <div className="flex items-center gap-3">
                    <div className="grid h-16 w-16 place-items-center rounded-md border border-border bg-secondary">
                      {b.logoDataUrl ? <img src={b.logoDataUrl} alt="logo" className="max-h-14 max-w-14 object-contain" /> : <span className="text-[10px] text-muted-foreground">no logo</span>}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={e => onLogo(e.target.files?.[0])} />
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()}><Upload className="h-3.5 w-3.5" /> Upload</Button>
                      {b.logoDataUrl && <Button size="sm" variant="ghost" onClick={() => app.setReceiptBrand({ logoDataUrl: undefined })}>Remove</Button>}
                      <label className="mt-1 flex items-center gap-2 text-xs"><Switch checked={b.showLogo} onCheckedChange={(v) => app.setReceiptBrand({ showLogo: v })} /> Show on receipts</label>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Paper width</Label>
                  <Tabs value={String(b.paperWidthMm)} onValueChange={(v) => app.setReceiptBrand({ paperWidthMm: Number(v) as 58 | 80 })}>
                    <TabsList>
                      <TabsTrigger value="58">58 mm</TabsTrigger>
                      <TabsTrigger value="80">80 mm</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Label className="pt-2">Language</Label>
                  <Tabs value={b.language} onValueChange={(v) => app.setReceiptBrand({ language: v as Language })}>
                    <TabsList>
                      <TabsTrigger value="en">English</TabsTrigger>
                      <TabsTrigger value="bn">বাংলা</TabsTrigger>
                      <TabsTrigger value="both">Bilingual</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>

              <Tabs defaultValue="en">
                <TabsList>
                  <TabsTrigger value="en">English content</TabsTrigger>
                  <TabsTrigger value="bn">বাংলা content</TabsTrigger>
                  <TabsTrigger value="meta">Store details</TabsTrigger>
                </TabsList>
                <TabsContent value="en" className="space-y-3 pt-4">
                  <div><Label>Brand name</Label><Input value={b.brandName} onChange={e => app.setReceiptBrand({ brandName: e.target.value })} /></div>
                  <div><Label>Tagline</Label><Input value={b.tagline ?? ""} onChange={e => app.setReceiptBrand({ tagline: e.target.value })} /></div>
                  <div><Label>Address (one line per row)</Label>
                    <Textarea rows={3} value={b.addressLines.join("\n")} onChange={e => app.setReceiptBrand({ addressLines: e.target.value.split("\n") })} />
                  </div>
                  <div><Label>Footer notes</Label>
                    <Textarea rows={2} value={b.footerNotes} onChange={e => app.setReceiptBrand({ footerNotes: e.target.value })} />
                  </div>
                </TabsContent>
                <TabsContent value="bn" className="space-y-3 pt-4">
                  <div><Label>Brand name (বাংলা)</Label><Input value={b.brandNameBn ?? ""} onChange={e => app.setReceiptBrand({ brandNameBn: e.target.value })} /></div>
                  <div><Label>Tagline (বাংলা)</Label><Input value={b.taglineBn ?? ""} onChange={e => app.setReceiptBrand({ taglineBn: e.target.value })} /></div>
                  <div><Label>Address (বাংলা)</Label>
                    <Textarea rows={3} value={(b.addressLinesBn ?? []).join("\n")} onChange={e => app.setReceiptBrand({ addressLinesBn: e.target.value.split("\n") })} />
                  </div>
                  <div><Label>Footer notes (বাংলা)</Label>
                    <Textarea rows={2} value={b.footerNotesBn ?? ""} onChange={e => app.setReceiptBrand({ footerNotesBn: e.target.value })} />
                  </div>
                </TabsContent>
                <TabsContent value="meta" className="space-y-3 pt-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><Label>VAT / BIN</Label><Input value={b.vatBin ?? ""} onChange={e => app.setReceiptBrand({ vatBin: e.target.value })} /></div>
                    <div><Label>Phone</Label><Input value={b.phone ?? ""} onChange={e => app.setReceiptBrand({ phone: e.target.value })} /></div>
                    <div><Label>Website</Label><Input value={b.website ?? ""} onChange={e => app.setReceiptBrand({ website: e.target.value })} /></div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </SectionCard>

          <SectionCard title="Industry receipt preview" description="Each pack renders industry-specific line details on the thermal receipt.">
            <div className="flex flex-wrap gap-1 border-b border-border p-4">
              {INDUSTRY_PACKS.filter(p => app.isPackEnabled(p.id)).map(p => (
                <Button key={p.id} size="sm" variant={previewPack === p.id ? "default" : "outline"} onClick={() => setPreviewPack(p.id)}>
                  {p.shortName}
                </Button>
              ))}
            </div>
            <div className="flex justify-center p-5">
              <ThermalReceipt brand={b} data={sampleData} idAttr="pulse-template-preview" />
            </div>
          </SectionCard>
        </div>
      </PageBody>
    </>
  );
}
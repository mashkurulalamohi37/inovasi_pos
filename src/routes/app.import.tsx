import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Users, Building2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { shouldUseBackend } from "@/lib/demo-mode";
import { api } from "@/lib/api";
import { useApiCustomers, useApiSuppliers } from "@/hooks/use-api-config";

export const Route = createFileRoute("/app/import")({ component: ImportPage });

const MODULES = [
  { key: "products", label: "Products", sample: "docs/samples/products.csv", path: "/import/products" },
  { key: "opening_stock", label: "Opening stock", sample: "docs/samples/opening_stock.csv", path: "/import/opening-stock" },
  { key: "suppliers", label: "Supplier list", sample: "docs/samples/suppliers.csv", path: "/import/suppliers" },
  { key: "customers", label: "Customer list", sample: "docs/samples/customers.csv", path: "/import/customers" },
] as const;

const SAMPLE_ROWS: Record<string, Record<string, string>[]> = {
  products: [{ sku: "SAMPLE-001", name: "Sample product" }],
  opening_stock: [
    { sku: "GROC-001", store_code: "DHK-01", qty: "10", unit_cost: "500" },
    { sku: "FASH-001", variant_sku: "FASH-001-M-BLU", store_code: "DHK-01", qty: "5", unit_cost: "900" },
  ],
  suppliers: [{ code: "SUP-001", name: "Fresh Farms Ltd", contact_phone: "01700000001" }],
  customers: [{ code: "CUST-001", name: "Walk-in Customer", phone: "", email: "" }],
};

function ImportPage() {
  const live = shouldUseBackend();
  const customersQuery = useApiCustomers(undefined, live);
  const suppliersQuery = useApiSuppliers(live);

  const customerRows = useMemo(() => {
    const apiData = customersQuery.data ?? [];
    return apiData.map(c => ({ code: c.code, name: c.name, phone: c.phone ?? "—", email: c.email ?? "—" }));
  }, [customersQuery.data]);

  const supplierRows = useMemo(() => {
    const apiData = suppliersQuery.data ?? [];
    return apiData.map(s => ({ code: s.code, name: s.name, phone: s.phone ?? "—", contact: "—" }));
  }, [suppliersQuery.data]);

  const handleDryRun = async (module: (typeof MODULES)[number]) => {
    if (!live) {
      toast.info("Sign in with backend for import API");
      return;
    }
    try {
      const sample = SAMPLE_ROWS[module.key] ?? [{ name: "Sample row" }];
      const res = await api.post<{ message: string; rows_received: number }>(module.path, {
        rows: sample.map(data => ({ data })),
        dry_run: true,
      });
      toast.success(res.message ?? `Dry run: ${res.rows_received} row(s) validated`);
    } catch {
      toast.error(`Import API failed for ${module.label}`);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Data"
        title="Data import"
        subtitle="Import master data from CSV — preview lists below or open full customer & supplier registers"
        actions={<Badge variant="outline">CSV pilot</Badge>}
      />
      <PageBody className="space-y-4">
        <SectionCard title="Available import modules">
          <div className="grid gap-3 p-4 md:grid-cols-2">
            {MODULES.map(m => (
              <div key={m.key} className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-2 font-medium">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  {m.label}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Sample: {m.sample}</p>
                <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => handleDryRun(m)}>
                  <Upload className="h-3.5 w-3.5" /> Validate import
                </Button>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard
            title="Supplier list"
            description={`${supplierRows.length} suppliers in register`}
            actions={
              <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
                <Link to="/app/suppliers">Open suppliers <ArrowRight className="h-3 w-3" /></Link>
              </Button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5 text-left font-medium">Code</th>
                    <th className="px-3 py-2.5 text-left font-medium">Name</th>
                    <th className="px-3 py-2.5 text-left font-medium">Contact</th>
                    <th className="px-5 py-2.5 text-left font-medium">Phone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {supplierRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                        No suppliers registered. Import them above or create them in Master Data.
                      </td>
                    </tr>
                  ) : (
                    supplierRows.map(s => (
                      <tr key={s.code} className="hover:bg-secondary/30">
                        <td className="px-5 py-3 font-mono text-xs">{s.code}</td>
                        <td className="px-3 py-3 font-medium">{s.name}</td>
                        <td className="px-3 py-3 text-muted-foreground">{s.contact}</td>
                        <td className="px-5 py-3 text-muted-foreground">{s.phone}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard
            title="Customer list"
            description={`${customerRows.length} customers in register`}
            actions={
              <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
                <Link to="/app/customers">Open customers <ArrowRight className="h-3 w-3" /></Link>
              </Button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5 text-left font-medium">Code</th>
                    <th className="px-3 py-2.5 text-left font-medium">Name</th>
                    <th className="px-3 py-2.5 text-left font-medium">Phone</th>
                    <th className="px-5 py-2.5 text-left font-medium">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {customerRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                        No customers registered. Import them above or create them in Master Data.
                      </td>
                    </tr>
                  ) : (
                    customerRows.map(c => (
                      <tr key={c.code} className="hover:bg-secondary/30">
                        <td className="px-5 py-3 font-mono text-xs">{c.code}</td>
                        <td className="px-3 py-3 font-medium">{c.name}</td>
                        <td className="px-3 py-3 text-muted-foreground">{c.phone}</td>
                        <td className="px-5 py-3 text-muted-foreground">{c.email}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Quick links">
          <div className="flex flex-wrap gap-3 p-4">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/app/suppliers"><Building2 className="h-3.5 w-3.5" /> Manage suppliers</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/app/customers"><Users className="h-3.5 w-3.5" /> Manage customers</Link>
            </Button>
          </div>
        </SectionCard>
      </PageBody>
    </>
  );
}

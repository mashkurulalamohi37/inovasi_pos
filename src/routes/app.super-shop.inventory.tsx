import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { PageHeader, PageBody, SectionCard, StatCard } from "@/components/pulse/primitives";
import { PermissionGate } from "@/components/pulse/gates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Boxes, Layers, Search, AlertTriangle, ArrowUpDown, Download } from "lucide-react";
import { toast } from "sonner";
import { superShopCatalog, getSuperShopDepartments } from "@/lib/super-shop-data";
import { fmtBDT } from "@/lib/pos-data";

export const Route = createFileRoute("/app/super-shop/inventory")({
  component: SuperShopInventoryPage,
});

function SuperShopInventoryPage() {
  const departments = useMemo(getSuperShopDepartments, []);
  const [selectedDept, setSelectedDept] = useState("ALL");
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    return superShopCatalog.filter((item) => {
      const matchDept = selectedDept === "ALL" || item.departmentCode === selectedDept;
      const matchQuery =
        !search ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.sku.toLowerCase().includes(search.toLowerCase());
      return matchDept && matchQuery;
    });
  }, [selectedDept, search]);

  // Department valuation statistics
  const stats = useMemo(() => {
    let totalItems = 0;
    let totalStock = 0;
    let totalRetailValue = 0;
    let lowStockCount = 0;

    for (const item of filteredItems) {
      totalItems += 1;
      totalStock += item.stock;
      totalRetailValue += item.stock * item.price;
      if (item.stock < 25) lowStockCount += 1;
    }

    return { totalItems, totalStock, totalRetailValue, lowStockCount };
  }, [filteredItems]);

  return (
    <PermissionGate perm="super-shop.manage">
      <PageHeader
        title="Super Shop Departmental Inventory"
        subtitle="Department-wise stock levels, asset valuation, and low-stock replenishment reorders"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.success("Stock valuation report downloaded")}
            className="gap-1.5 text-xs"
          >
            <Download className="h-3.5 w-3.5" /> Export Valuation
          </Button>
        }
      />

      <PageBody>
        {/* KPI Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Total Products"
            value={stats.totalItems.toString()}
            icon={Boxes}
          />
          <StatCard
            label="Total Physical Units"
            value={stats.totalStock.toLocaleString()}
            icon={Layers}
          />
          <StatCard
            label="Estimated Retail Value"
            value={fmtBDT(stats.totalRetailValue)}
            icon={ArrowUpDown}
          />
          <StatCard
            label="Low Stock Alerts"
            value={stats.lowStockCount.toString()}
            icon={AlertTriangle}
          />
        </div>

        {/* Department Filters & Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto">
            <Button
              variant={selectedDept === "ALL" ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs rounded-full shrink-0"
              onClick={() => setSelectedDept("ALL")}
            >
              All Departments
            </Button>
            {departments.map((d) => (
              <Button
                key={d.id}
                variant={selectedDept === d.code ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs rounded-full shrink-0"
                style={
                  selectedDept === d.code
                    ? { backgroundColor: d.color, borderColor: d.color, color: "#fff" }
                    : {}
                }
                onClick={() => setSelectedDept(d.code)}
              >
                {d.name}
              </Button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product or SKU..."
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        {/* Stock Table */}
        <SectionCard>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border bg-secondary/20 text-muted-foreground font-semibold">
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3">Department</th>
                  <th className="py-2.5 px-3">Unit Price</th>
                  <th className="py-2.5 px-3">Stock Units</th>
                  <th className="py-2.5 px-3">Valuation</th>
                  <th className="py-2.5 px-3">Attributes & Tracking</th>
                  <th className="py-2.5 px-3">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredItems.map((item) => {
                  const dept = departments.find((d) => d.code === item.departmentCode);
                  const valuation = item.stock * item.price;
                  const isLow = item.stock < 25;

                  return (
                    <tr key={item.sku} className="hover:bg-secondary/10">
                      <td className="py-2.5 px-3 font-mono font-bold text-primary">{item.sku}</td>
                      <td className="py-2.5 px-3 font-semibold">{item.name}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
                          style={{ backgroundColor: dept?.color || "#64748b" }}
                        >
                          {dept?.name || item.departmentCode}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium">{fmtBDT(item.price)}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`font-mono font-bold ${
                            isLow ? "text-amber-600 dark:text-amber-400" : ""
                          }`}
                        >
                          {item.stock} units
                        </span>
                        {isLow && (
                          <span className="block text-[10px] text-amber-600 font-semibold uppercase">
                            Reorder
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-semibold">{fmtBDT(valuation)}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {item.isWeighable && (
                            <Badge variant="outline" className="text-[10px]">
                              Scale (PLU {item.pluCode})
                            </Badge>
                          )}
                          {item.batchNo && (
                            <Badge variant="outline" className="text-[10px]">
                              Batch {item.batchNo}
                            </Badge>
                          )}
                          {item.variants && (
                            <Badge variant="outline" className="text-[10px]">
                              {item.variants.length} Variants
                            </Badge>
                          )}
                          {item.serialRequired && (
                            <Badge variant="outline" className="text-[10px]">
                              Serial Req.
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">{item.shelfLocation || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </PageBody>
    </PermissionGate>
  );
}

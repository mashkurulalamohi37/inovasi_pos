import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Printer, Tag, QrCode, Search, Sparkles } from "lucide-react";
import { useJewelryProfiles } from "@/hooks/use-industry-data";
import { gramsToBhori } from "@/lib/jewelry-units";
import { fmtBDT } from "@/lib/pos-data";

export const Route = createFileRoute("/app/jewelry/tags")({ component: TagsPage });

function TagsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [karatFilter, setKaratFilter] = useState("all");

  const { data: profiles = [], isLoading } = useJewelryProfiles({
    karat: karatFilter === "all" ? undefined : karatFilter,
    q: searchTerm || undefined,
  });

  const handlePrintTag = (item: any) => {
    window.print();
  };

  return (
    <BackOfficePage
      title="Jewelry Barcode & Tag Labels"
      subtitle="Generate and print thermal barcode jewelry tags with Gross/Net weights, Bhori breakdown, Karat hallmark, and Making charge."
      actions={
        <Button onClick={() => window.print()} className="gap-2 bg-slate-800 hover:bg-slate-900 text-white shadow">
          <Printer className="h-4 w-4" /> Batch Print Selected Tags
        </Button>
      }
    >
      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm mb-6 print:hidden">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by tag no, SKU, product..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          {["all", "24K", "22K", "21K", "18K"].map((k) => (
            <Button
              key={k}
              variant={karatFilter === k ? "default" : "outline"}
              size="sm"
              onClick={() => setKaratFilter(k)}
              className="text-xs"
            >
              {k}
            </Button>
          ))}
        </div>
      </div>

      {/* Tag Preview Cards */}
      {isLoading ? (
        <div className="text-center py-16 text-slate-400">Loading jewelry product tags...</div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-8">
          <Tag className="h-12 w-12 text-amber-500 mx-auto mb-3 opacity-60" />
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">No Tagged Jewelry Products</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-4">
            Add jewelry profile products or complete factory work orders to generate barcode tags.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 print:grid-cols-2 print:gap-2">
          {profiles.map((p: any) => {
            const grossGrams = Number(p.gross_weight ?? 0);
            const netGrams = Number(p.net_metal_weight ?? grossGrams);
            const bhoriConv = gramsToBhori(grossGrams);

            return (
              <div
                key={p.id}
                className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm hover:border-amber-400 transition-colors flex flex-col justify-between print:border-black print:shadow-none"
              >
                <div>
                  {/* Tag Header */}
                  <div className="flex items-center justify-between border-b border-dashed border-slate-200 dark:border-slate-800 pb-2 mb-2">
                    <span className="font-mono text-xs font-black text-slate-900 dark:text-white tracking-wide">
                      {p.tag_no || p.sku || `JWL-${p.id.slice(0, 6).toUpperCase()}`}
                    </span>
                    <Badge variant="outline" className="font-bold text-[10px] bg-amber-50 text-amber-800 border-amber-300">
                      {p.karat || "22K"} ({p.metal_type || "Gold"})
                    </Badge>
                  </div>

                  {/* Product Title */}
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-1">
                    {p.product_name || p.name || "Gold Ornament"}
                  </h4>

                  {/* Weights Specifications */}
                  <div className="mt-2 text-[11px] space-y-1 bg-slate-50 dark:bg-slate-950/40 p-2 rounded">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Gross Wt:</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {grossGrams.toFixed(3)}g ({bhoriConv.displayEn})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Net Metal:</span>
                      <span className="font-mono font-bold text-amber-700 dark:text-amber-400">
                        {netGrams.toFixed(3)}g
                      </span>
                    </div>
                    {Number(p.stone_weight || 0) > 0 && (
                      <div className="flex justify-between text-slate-500">
                        <span>Stone Wt:</span>
                        <span>{Number(p.stone_weight).toFixed(3)}g</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-800">
                      <span className="text-slate-500">Making:</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {fmtBDT(p.making_charge ?? 0)} / {p.making_charge_type === "fixed" ? "pc" : "g"}
                      </span>
                    </div>
                  </div>

                  {/* Hallmarking / Certificate Note */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2">
                    <span>Hallmark: {p.hallmark_center || "Govt Approved"}</span>
                    {p.huid_code && <span className="font-mono">HUID: {p.huid_code}</span>}
                  </div>
                </div>

                {/* Print Button / Simulated Barcode */}
                <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-1 font-mono text-[9px] text-slate-400">
                    <QrCode className="h-3.5 w-3.5 text-slate-700 dark:text-slate-300" />
                    <span>SCAN AT POS</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px] text-slate-600 hover:text-slate-900 print:hidden"
                    onClick={() => handlePrintTag(p)}
                  >
                    <Printer className="h-3 w-3 mr-1" /> Print
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </BackOfficePage>
  );
}

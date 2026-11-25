import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/pulse/states";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useMobileDevices } from "@/hooks/use-api-config";
import { fmtBDT } from "@/lib/pos-data";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";

export const Route = createFileRoute("/app/mobile-shop/stock")({ component: MobileStockPage });

function MobileStockPage() {
  const useApi = shouldUseBackend();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [brand, setBrand] = useState("");
  const [condition, setCondition] = useState<string>("all");

  const query = useMobileDevices({
    q: q || undefined,
    status: status === "all" ? undefined : status,
    brand: brand.trim() || undefined,
    condition: condition === "all" ? undefined : condition,
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);

  if (!useApi) {
    return (
      <>
        <PageHeader title="Phone stock" subtitle="Connect backend mode to manage live mobile device stock." />
        <PageBody>
          <EmptyState title="Backend required" description="Mobile device stock is not available in demo mode." />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Phone stock"
        subtitle="Live handset inventory — IMEI-1 / IMEI-2, condition, and lifecycle status."
      />
      <PageBody>
        <div className="mb-4 flex flex-wrap gap-2">
          <Input
            placeholder="Search IMEI, serial, brand, model…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <Input
            placeholder="Brand filter"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="max-w-[140px]"
          />
          {(["all", "available", "sold", "returned", "trade_in_received", "rma", "blocked"] as const).map((s) => (
            <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
              {s}
            </Button>
          ))}
          {(["all", "new", "like_new", "good", "fair", "poor", "damaged"] as const).map((c) => (
            <Button key={c} size="sm" variant={condition === c ? "default" : "outline"} onClick={() => setCondition(c)}>
              {c}
            </Button>
          ))}
          <Link to="/app/mobile-shop/trade-ins" className="self-center ml-2 text-sm text-primary underline-offset-2 hover:underline">
            Trade-ins
          </Link>
          <Link to="/app/electronics/warranty" className="self-center text-sm text-primary underline-offset-2 hover:underline">
            Warranties
          </Link>
        </div>
        <SectionCard>
          {query.isLoading ? (
            <LoadingState rows={4} />
          ) : query.isError ? (
            <ErrorState title="Failed to load device stock" description="Check API connectivity and mobile.view permission." />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No mobile devices"
              description="Receive serialized handsets via purchase GRN with IMEI capture, or accept a trade-in."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5 text-left">Product</th>
                    <th className="px-3 py-2.5 text-left">Brand / Model</th>
                    <th className="px-3 py-2.5 text-left">Variant</th>
                    <th className="px-3 py-2.5 text-left">IMEI-1</th>
                    <th className="px-3 py-2.5 text-left">IMEI-2</th>
                    <th className="px-3 py-2.5 text-left">Condition</th>
                    <th className="px-3 py-2.5 text-left">Status</th>
                    <th className="px-3 py-2.5 text-right">Price</th>
                    <th className="px-5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={String(r.id)} className="hover:bg-secondary/30">
                      <td className="px-5 py-3">
                        <div className="font-medium">{String(r.product_name ?? "—")}</div>
                        <div className="font-mono text-xs text-muted-foreground">{String(r.sku ?? "")}</div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {String(r.brand ?? "—")}
                        <div className="text-muted-foreground">{String(r.model_name ?? "")}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {[r.ram, r.storage, r.color].filter(Boolean).map(String).join(" · ") || "—"}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{String(r.imei_1 ?? "—")}</td>
                      <td className="px-3 py-3 font-mono text-xs">{String(r.imei_2 ?? "—")}</td>
                      <td className="px-3 py-3 text-xs">{String(r.condition ?? "—")}</td>
                      <td className="px-3 py-3">
                        <StatusBadge status={String(r.status) === "available" ? "active" : "completed"} />
                        <span className="ml-1 text-xs text-muted-foreground">{String(r.status)}</span>
                      </td>
                      <td className="px-3 py-3 text-right text-xs">
                        {typeof r.selling_price === "number" ? fmtBDT(r.selling_price) : "—"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Link
                            to="/app/products"
                            className="text-xs text-primary underline-offset-2 hover:underline"
                          >
                            Product
                          </Link>
                          {r.warranty_id ? (
                            <Link
                              to="/app/electronics/warranty"
                              className="text-xs text-primary underline-offset-2 hover:underline"
                            >
                              Warranty
                            </Link>
                          ) : (
                            <DisabledReasonButton label="Warranty" reason="No warranty linked yet — created on sale when warranty months > 0" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}

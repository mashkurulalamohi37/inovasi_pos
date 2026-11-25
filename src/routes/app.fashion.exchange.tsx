import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { PermissionGate } from "@/components/pulse/gates";
import { EmptyState, LoadingState } from "@/components/pulse/states";
import { ArrowRight, Plus, RefreshCw, Repeat } from "lucide-react";
import { exchanges as demoExchanges } from "@/lib/mock-extra";
import { shouldUseBackend } from "@/lib/demo-mode";
import { fmtBDT } from "@/lib/pos-data";
import {
  useSales,
  useSale,
  useSalesExchange,
  useSalesExchanges,
  useApiProducts,
  type ApiSale,
} from "@/hooks/use-api-config";
import { useFashionVariants } from "@/hooks/use-industry-data";
import { toast } from "sonner";
import { printReturnExchangeSlip } from "@/lib/receipt";
import { returnableQty, validateReturnQty } from "@/features/sales/utils";

export const Route = createFileRoute("/app/fashion/exchange")({ component: Exchange });

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive mt-1">{message}</p>;
}

function Exchange() {
  const useApi = shouldUseBackend();
  const exchangesQuery = useSalesExchanges("fashion");
  const salesQuery = useSales({ industry_pack: "fashion", limit: 50 });
  const variantsQuery = useFashionVariants();
  const exchangeMut = useSalesExchange();
  const [formOpen, setFormOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [invoiceQ, setInvoiceQ] = useState("");
  const [selectedSaleId, setSelectedSaleId] = useState("");
  const [reason, setReason] = useState("");
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [newVariantId, setNewVariantId] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const saleDetail = useSale(selectedSaleId || undefined);
  const sale: ApiSale | undefined = saleDetail.data;
  const { data: productsPage } = useApiProducts({ industry: "fashion" });

  const rows = useMemo(() => {
    if (!useApi) {
      return demoExchanges.map((x) => ({
        id: x.id,
        exchange_no: x.ref,
        invoice_number: x.original,
        reason: x.reason,
        from_label: x.from,
        to_label: x.to,
        status: x.status,
      }));
    }
    return (exchangesQuery.data ?? []).map((x) => ({
      id: x.id,
      exchange_no: x.exchange_no,
      invoice_number: x.invoice_number ?? "—",
      reason: x.reason ?? "—",
      from_label: "Returned item",
      to_label: x.new_lines.map((l) => `${l.name} ×${l.qty}`).join(", ") || "—",
      status: x.status,
      price_difference: x.price_difference,
    }));
  }, [useApi, exchangesQuery.data]);

  const fashionSales = useMemo(() => {
    const all = salesQuery.data ?? [];
    if (!invoiceQ.trim()) return all;
    const q = invoiceQ.toLowerCase();
    return all.filter((s) => s.invoice_number.toLowerCase().includes(q));
  }, [salesQuery.data, invoiceQ]);

  const returnedProductId = useMemo(() => {
    if (!sale) return "";
    const withQty = sale.lines.find((l) => Number(qtys[l.id] ?? 0) > 0);
    return withQty?.product_id ?? sale.lines[0]?.product_id ?? "";
  }, [sale, qtys]);

  const replacementVariants = useMemo(() => {
    const variants = variantsQuery.data ?? [];
    return variants.filter((v) => {
      if (v.is_active === false || v.source === "legacy") return false;
      return true;
    });
  }, [variantsQuery.data]);

  useEffect(() => {
    if (!formOpen || !sale) return;
    const init: Record<string, string> = {};
    sale.lines.forEach((l) => {
      const bal = returnableQty(l);
      if (bal > 0) init[l.id] = "1";
    });
    setQtys(init);
    setReason("");
    setNewVariantId("");
    setNewQty("1");
    setErrors({});
  }, [formOpen, sale]);

  const validateForm = () => {
    if (!sale) {
      setErrors({ form: "Select an invoice" });
      return false;
    }
    const next: Record<string, string> = {};
    const return_lines = sale.lines
      .map((l) => {
        const bal = returnableQty(l);
        const qty = Number(qtys[l.id] ?? 0);
        if (qty <= 0) return null;
        const err = validateReturnQty(qty, bal);
        if (err) next[l.id] = err;
        return { invoice_line_id: l.id, qty };
      })
      .filter(Boolean) as Array<{ invoice_line_id: string; qty: number }>;
    if (return_lines.length === 0) next.form = "Select at least one line to return";
    if (!newVariantId) {
      next.variant = "Select replacement variant";
    } else {
      const variant = replacementVariants.find((v) => v.id === newVariantId);
      const reqQty = Number(newQty);
      if (variant && variant.stock_qty < reqQty) {
        next.variant = `Insufficient stock: only ${variant.stock_qty} available`;
      }
    }
    const nq = Number(newQty);
    if (!Number.isFinite(nq) || nq <= 0) next.newQty = "Replacement qty must be greater than zero";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submitExchange = async () => {
    if (!sale || !validateForm()) return;
    const return_lines = sale.lines
      .map((l) => {
        const qty = Number(qtys[l.id] ?? 0);
        if (qty <= 0) return null;
        const meta = (l.meta ?? {}) as Record<string, unknown>;
        return {
          invoice_line_id: l.id,
          qty,
          meta: meta.variant_id ? { variant_id: meta.variant_id } : undefined,
        };
      })
      .filter(Boolean) as Array<{ invoice_line_id: string; qty: number; meta?: { variant_id: string } }>;
    const variant = replacementVariants.find((v) => v.id === newVariantId);
    const product = productsPage?.items.find((p) => p.id === variant?.product_id);
    const returnTotal = return_lines.reduce((sum, rl) => {
      const line = sale.lines.find((l) => l.id === rl.invoice_line_id);
      return sum + (line ? line.unit_price * rl.qty : 0);
    }, 0);
    const newTotal = (product?.base_price ?? 0) * Number(newQty);
    const price_difference = Math.round((newTotal - returnTotal) * 100) / 100;
    await exchangeMut.mutateAsync({
      invoiceId: sale.id,
      body: {
        reason: reason.trim() || "Customer Exchange",
        return_lines,
        new_lines: [{
          product_id: variant?.product_id,
          sku: variant?.sku ?? product?.sku,
          name: product?.name,
          qty: Number(newQty),
          unit_price: product?.base_price ?? 0,
          variant_id: variant?.id,
        }],
        price_difference,
      },
    });
    toast.success("Exchange posted successfully");
    const replacementName = product ? `${product.name} (${variant?.size ?? ""} ${variant?.color ?? ""})` : (variant?.sku ?? "Replacement Item");
    printReturnExchangeSlip({
      type: "exchange",
      invoiceNumber: sale.invoice_number,
      customerName: sale.customer_name || undefined,
      reason: reason.trim() || undefined,
      itemsReturned: return_lines.map((rl) => {
        const line = sale.lines.find((l) => l.id === rl.invoice_line_id);
        return { name: line?.name ?? "Returned Item", qty: rl.qty, unitPrice: line?.unit_price ?? 0 };
      }),
      itemsReplacement: [{ name: replacementName, qty: Number(newQty), unitPrice: product?.base_price ?? 0 }],
      netAmount: price_difference,
    });
    setConfirmOpen(false);
    setFormOpen(false);
    exchangesQuery.refetch();
  };

  return (
    <BackOfficePage
      title="Exchange & Returns"
      subtitle="Size swaps, color preference, defects — wired to sales exchange API"
      actions={
        <>
          {useApi && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exchangesQuery.refetch()} disabled={exchangesQuery.isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${exchangesQuery.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          )}
          <PermissionGate perm="pos.refund">
            <Button size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}>
              <Repeat className="h-3.5 w-3.5" /> New exchange
            </Button>
          </PermissionGate>
        </>
      }
    >
      <SectionCard>
        {useApi && exchangesQuery.isLoading ? (
          <LoadingState rows={3} />
        ) : rows.length === 0 ? (
          <EmptyState title="No exchanges yet" description="Process a size or color exchange from a completed fashion sale." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 text-left">Ref</th>
                <th className="px-3 py-2.5 text-left">Original Invoice</th>
                <th className="px-3 py-2.5 text-left">Reason</th>
                <th className="px-3 py-2.5 text-left">From</th>
                <th className="px-3 py-2.5 text-left">To</th>
                <th className="px-5 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((x) => (
                <tr key={x.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs">{x.exchange_no}</td>
                  <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{x.invoice_number}</td>
                  <td className="px-3 py-3">{x.reason}</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1 text-xs">{x.from_label} <ArrowRight className="h-3 w-3 text-muted-foreground" /></span>
                  </td>
                  <td className="px-3 py-3 text-xs">{x.to_label}</td>
                  <td className="px-5 py-3 text-right"><StatusBadge status={x.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <EntityFormDrawer
        open={formOpen}
        onOpenChange={setFormOpen}
        title="New fashion exchange"
        onSubmit={() => {
          if (validateForm()) setConfirmOpen(true);
        }}
        submitLabel="Review exchange"
        isPending={exchangeMut.isPending}
        errorMessage={exchangeMut.error instanceof Error ? exchangeMut.error.message : null}
        className="sm:max-w-lg"
      >
        <FieldError message={errors.form} />
        <div>
          <Label>Find invoice</Label>
          <Input placeholder="Invoice number…" value={invoiceQ} onChange={(e) => setInvoiceQ(e.target.value)} />
        </div>
        <div>
          <Label>Original sale</Label>
          <Select value={selectedSaleId} onValueChange={setSelectedSaleId}>
            <SelectTrigger><SelectValue placeholder="Select invoice" /></SelectTrigger>
            <SelectContent>
              {fashionSales.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.invoice_number} — {fmtBDT(s.total)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {saleDetail.isLoading && selectedSaleId && <LoadingState rows={1} />}
        {sale && (
          <>
            <div>
              <Label>Reason (Optional)</Label>
              <Input placeholder="e.g. Size mismatch (Optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="text-xs font-medium uppercase text-muted-foreground">Return lines</div>
            {sale.lines.map((l) => {
              const bal = Math.max(1, returnableQty(l) || l.qty || 1);
              return (
                <div key={l.id} className="rounded-md border border-border p-3">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-muted-foreground">Returnable {bal}</div>
                  <Input type="number" min={0} max={bal} value={qtys[l.id] ?? "1"} onChange={(e) => setQtys((p) => ({ ...p, [l.id]: e.target.value }))} />
                  <FieldError message={errors[l.id]} />
                </div>
              );
            })}
            <div className="text-xs font-medium uppercase text-muted-foreground">
              Replacement (same product · different size/color)
            </div>
            <Select value={newVariantId} onValueChange={setNewVariantId}>
              <SelectTrigger><SelectValue placeholder="Select size × color" /></SelectTrigger>
              <SelectContent>
                {replacementVariants.map((v) => (
                  <SelectItem key={v.id} value={v.id} disabled={v.stock_qty <= 0}>
                    {v.size} · {v.color} ({v.sku}) — {v.stock_qty > 0 ? `${v.stock_qty} in stock` : "Out of stock"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {replacementVariants.length === 0 && (
              <p className="text-xs text-muted-foreground">No other size/color variants for this product.</p>
            )}
            <FieldError message={errors.variant} />
            <div>
              <Label>Replacement qty</Label>
              <Input type="number" min={1} value={newQty} onChange={(e) => setNewQty(e.target.value)} />
              <FieldError message={errors.newQty} />
            </div>
          </>
        )}
      </EntityFormDrawer>

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Post exchange?"
        description="Stock will be adjusted through the inventory service. Price difference is calculated from line totals."
        confirmLabel="Process exchange"
        onConfirm={submitExchange}
        isPending={exchangeMut.isPending}
      />
    </BackOfficePage>
  );
}

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Repeat2, Search, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/pulse/primitives";
import { ErrorState, LoadingState } from "@/components/pulse/states";
import { SalesExchangeForm, SalesReturnForm } from "@/features/sales/SalesForms";
import { useAuth } from "@/lib/auth-provider";
import { useSales, type ApiSale } from "@/hooks/use-api-config";
import { fmtBDT, fmtDateTime } from "@/lib/pos-data";

import { useApp } from "@/lib/app-store";
import { salesInvoices } from "@/lib/mock-extra";
import { shouldUseBackend } from "@/lib/demo-mode";

type Mode = "return" | "exchange";

/**
 * Return / Exchange from the POS lane.
 *
 * Lives in PosShell so every industry gets it — previously Exchange was a
 * fashion-only header link (removed in 57baa50) and Return was reachable only
 * from the back-office /app/sales screen, which is the wrong place for a
 * cashier standing at the till with a customer in front of them.
 *
 * The forms themselves are the same ones /app/sales uses (SalesReturnForm /
 * SalesExchangeForm) so the validation, permission and approval behaviour stays
 * identical in both places — this component only adds the "find the invoice"
 * step that the back-office screen already had via its sales table.
 */
export function PosReturnExchange({ industry }: { industry?: string }) {
  const { can, user } = useAuth();
  const app = useApp();
  const useApi = shouldUseBackend();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("return");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<ApiSale | null>(null);

  // Scope completed sales to the logged-in user's active store
  const { data, isLoading, isError, refetch } = useSales({
    status: "completed",
    store_id: user?.store_id || undefined,
    limit: 50,
  });

  const demoSales = useMemo<ApiSale[]>(() => {
    const localTx = (app.transactions ?? []).map((t) => ({
      id: t.id,
      invoice_number: t.id,
      customer_name: "Walk-in Customer",
      total: t.total,
      subtotal: t.total,
      tax: 0,
      discount: 0,
      paid_amount: t.total,
      due_amount: 0,
      tender: t.tender,
      status: "completed",
      industry_pack: t.industry || industry || "universal",
      created_at: new Date(t.ts).toISOString(),
      completed_at: new Date(t.ts).toISOString(),
      lines: [
        {
          id: `${t.id}-l1`,
          product_id: "demo-prod-1",
          name: `${t.industry ? String(t.industry).toUpperCase() : "POS"} Item`,
          qty: t.lines || 1,
          unit_price: Math.round(t.total / (t.lines || 1)),
          subtotal: t.total,
          returned_qty: 0,
          returnable_qty: t.lines || 1,
        },
      ],
    })) as unknown as ApiSale[];

    const mockSales = salesInvoices
      .filter((s) => s.status !== "refunded")
      .map((s) => ({
        id: s.id,
        invoice_number: s.invoice,
        customer_name: "Walk-in Customer",
        cashier_name: s.cashier,
        total: s.total,
        subtotal: s.total,
        tax: 0,
        discount: 0,
        paid_amount: s.status === "due" ? 0 : s.total,
        due_amount: s.status === "due" ? s.total : 0,
        tender: s.tender,
        status: "completed",
        industry_pack: industry || "fashion",
        created_at: s.ts,
        completed_at: s.ts,
        lines: [
          {
            id: `${s.id}-l1`,
            product_id: "demo-prod-1",
            name: "Purchased Merchandise",
            qty: 1,
            unit_price: s.total,
            subtotal: s.total,
            returned_qty: 0,
            returnable_qty: 1,
          },
        ],
      })) as unknown as ApiSale[];

    return [...localTx, ...mockSales];
  }, [app.transactions, industry]);

  const sales = useMemo(() => {
    const rawRows = (useApi && data && data.length > 0) ? data : (data ?? demoSales);
    // When inside a specific industry lane (e.g. Fashion POS), filter sales by industry
    const rows = (industry && industry !== "universal")
      ? rawRows.filter((s) => !s.industry_pack || s.industry_pack === industry)
      : rawRows;
    const needle = q.trim().toLowerCase();
    if (!needle) return rows.slice(0, 25);
    return rows
      .filter((s) => {
        const hay = [s.invoice_number, s.customer_name, s.tender, String(s.total)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      })
      .slice(0, 25);
  }, [useApi, data, demoSales, q, industry]);

  // The frontend "pos.refund" permission already maps to the backend codes
  // ["pos.return", "pos.refund"] (see lib/backend-permissions.ts), which is
  // exactly what the return / refund / void / exchange endpoints require.
  if (!can("pos.refund")) return null;

  const start = (next: Mode) => {
    setMode(next);
    setSelected(null);
    setQ("");
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setSelected(null);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1 text-xs"
        onClick={() => start("return")}
      >
        <Undo2 className="h-3 w-3" /> Return
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1 text-xs"
        onClick={() => start("exchange")}
      >
        <Repeat2 className="h-3 w-3" /> Exchange
      </Button>

      <Dialog open={open && !selected} onOpenChange={(v) => !v && close()}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-2xl border-border/60 shadow-2xl">
          {/* Glassmorphic header */}
          <div className="bg-secondary/40 pl-6 pr-14 pt-5 pb-4 border-b border-border/50 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 pr-2">
                <DialogTitle className="text-lg font-bold text-foreground truncate">
                  {mode === "return" ? "Process Customer Return" : "Process Item Exchange"}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5 truncate">
                  Select a completed sale invoice to {mode === "return" ? "issue a refund or credit voucher" : "exchange items"}.
                </DialogDescription>
              </div>

              <Badge variant="outline" className="px-3 py-1 text-xs font-bold uppercase tracking-wider bg-background shadow-2xs text-primary border-primary/30 shrink-0">
                {mode === "return" ? "↩️ Return Mode" : "🔄 Exchange Mode"}
              </Badge>
            </div>

            {/* Instant Search Bar */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search invoice #, customer name, phone or total…"
                className="h-10 pl-9 rounded-xl border-border/60 bg-background/90 text-sm shadow-inner"
                aria-label="Search invoices"
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="p-5 max-h-[48vh] overflow-y-auto space-y-2">
            {isLoading ? (
              <LoadingState label="Loading recent completed sales…" rows={4} />
            ) : isError ? (
              <ErrorState
                title="Could not load sales"
                onRetry={() => void refetch()}
              />
            ) : sales.length === 0 ? (
              <EmptyState
                title={q ? "No matching invoice" : "No completed sales found"}
                description={
                  q
                    ? "Check the invoice number, or clear the search to browse recent sales."
                    : "Completed sales will appear here for 1-click return or exchange."
                }
              />
            ) : (
              <div className="space-y-2">
                {sales.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelected(s)}
                    className="flex w-full items-center justify-between gap-4 rounded-xl border border-border/60 p-3.5 text-left transition-all cursor-pointer hover:border-primary/50 hover:bg-secondary/40 hover:shadow-md bg-background/50"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-foreground">{s.invoice_number}</span>
                        <Badge variant="outline" className="text-[10px] uppercase font-semibold bg-secondary/50">
                          {s.tender || "Cash"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{s.customer_name || "Walk-in Customer"}</span>
                        <span>·</span>
                        <span>{fmtDateTime(s.completed_at || s.created_at)}</span>
                        <span>·</span>
                        <span>{s.lines?.length ?? 0} line item(s)</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-sm font-bold font-mono text-foreground">{fmtBDT(s.total)}</div>
                        <div className="text-[10px] text-success font-medium uppercase tracking-wider">Completed</div>
                      </div>
                      <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                        →
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-secondary/20 px-5 py-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
            <span>Need advanced sales audit or historical register?</span>
            <Link to="/app/sales" className="text-primary font-medium hover:underline">
              Open Sales History →
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      {selected && mode === "return" && (
        <SalesReturnForm open onOpenChange={(v) => !v && close()} sale={selected} />
      )}
      {selected && mode === "exchange" && (
        <SalesExchangeForm open onOpenChange={(v) => !v && close()} sale={selected} />
      )}
    </>
  );
}

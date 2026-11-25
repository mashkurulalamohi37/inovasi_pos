import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Truck, Plus, FileCheck, Receipt, RefreshCw, CreditCard, PackagePlus,
  Search, Filter, Clock, PackageCheck, Wallet, X,
  MoreHorizontal, Eye, Pencil, Undo2, Printer,
} from "lucide-react";
import { PageHeader, PageBody, SectionCard, StatusBadge, StatCard } from "@/components/pulse/primitives";
import { ListPagination } from "@/components/pulse/ListPagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PermissionGate } from "@/components/pulse/gates";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { fmtBDT } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import { dateInputRangeForApi, daysAgoInputDate, todayInputDate } from "@/lib/dates";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { cn } from "@/lib/utils";
import {
  usePurchases,
  useApprovePurchase,
  usePurchaseReceives,
  useSupplierInvoices,
  useApiSuppliers,
  useApiStores,
  type ApiPurchase,
} from "@/hooks/use-api-config";
import {
  canApprovePurchase,
  canEditPurchase,
  canInvoicePurchase,
  canReceivePurchase,
  canReturnPurchase,
  displayPurchaseStatus,
  normPurchaseStatus,
  receivedLabel,
  totalQty,
} from "@/features/purchases/utils";
import { printPurchaseOrder } from "@/features/purchases/purchase-print";
import { toast } from "sonner";

export const Route = createFileRoute("/app/purchases/")({ component: Purchases });

type WorkflowFilter = "all" | "pending" | "receive" | "open";

function nextAction(p: ApiPurchase): { label: string; to?: string; approve?: boolean } | null {
  if (canApprovePurchase(p.status)) return { label: "Approve", approve: true };
  if (canReceivePurchase(p.status)) {
    return { label: "Receive", to: "/app/purchases/$purchaseId/receive" };
  }
  if (canInvoicePurchase(p)) {
    return { label: "Invoice", to: "/app/purchases/$purchaseId/invoice" };
  }
  return null;
}

function Purchases() {
  const useApi = shouldUseBackend();
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState<WorkflowFilter>("all");
  const [statusFilter, setStatusFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [fromDate, setFromDate] = useState(() => daysAgoInputDate(30));
  const [toDate, setToDate] = useState(todayInputDate);
  const [poSearch, setPoSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const apiDateRange = useMemo(() => dateInputRangeForApi(fromDate, toDate), [fromDate, toDate]);

  const filters = useMemo(() => ({
    status: statusFilter || undefined,
    supplier_id: supplierFilter || undefined,
    store_id: storeFilter || undefined,
    ...apiDateRange,
  }), [statusFilter, supplierFilter, storeFilter, apiDateRange]);

  const { data, isLoading, isError, refetch, isFetching } = usePurchases(useApi ? filters : undefined);
  const receivesQuery = usePurchaseReceives();
  const supplierInvoicesQuery = useSupplierInvoices();
  const { data: suppliers } = useApiSuppliers(useApi);
  const { data: stores } = useApiStores();
  const approvePurchase = useApprovePurchase();
  const [approveTarget, setApproveTarget] = useState<ApiPurchase | null>(null);

  const allRows = data ?? [];

  const pendingApproval = allRows.filter((p) => canApprovePurchase(p.status));
  const pendingGrn = allRows.filter((p) => canReceivePurchase(p.status));
  const openRows = allRows.filter((p) =>
    ["draft", "pending", "approved", "partial", "partially-received"].includes(normPurchaseStatus(p.status)),
  );
  const payable = (supplierInvoicesQuery.data ?? []).reduce((s, inv) => s + (inv.due_amount ?? 0), 0);
  const listedSpend = allRows.reduce((s, p) => s + p.total, 0);

  const rows = useMemo(() => {
    const q = poSearch.trim().toLowerCase();
    return allRows.filter((p) => {
      if (workflow === "pending" && !canApprovePurchase(p.status)) return false;
      if (workflow === "receive" && !canReceivePurchase(p.status)) return false;
      if (workflow === "open" && !["draft", "pending", "approved", "partial", "partially-received"].includes(normPurchaseStatus(p.status))) {
        return false;
      }
      if (!q) return true;
      return (
        p.invoice_number.toLowerCase().includes(q)
        || (p.supplier_name ?? "").toLowerCase().includes(q)
        || (p.reference_no ?? "").toLowerCase().includes(q)
      );
    });
  }, [allRows, poSearch, workflow]);

  const filterKey = `${workflow}|${statusFilter}|${supplierFilter}|${storeFilter}|${fromDate}|${toDate}|${poSearch}`;
  const poPage = useClientPagination(rows, 10, filterKey);
  const grnRows = receivesQuery.data ?? [];
  const grnPage = useClientPagination(grnRows, 10, String(grnRows.length));
  const invoiceRows = supplierInvoicesQuery.data ?? [];
  const invoicePage = useClientPagination(invoiceRows, 10, String(invoiceRows.length));

  const hasExtraFilters = Boolean(statusFilter || supplierFilter || storeFilter || poSearch);
  const clearFilters = () => {
    setWorkflow("all");
    setStatusFilter("");
    setSupplierFilter("");
    setStoreFilter("");
    setPoSearch("");
    setFromDate(daysAgoInputDate(30));
    setToDate(todayInputDate());
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title="Purchases" subtitle="Connect to backend to manage purchase orders." />
        <PageBody>
          <EmptyState
            title="Backend required"
            description="Purchase orders, GRN, supplier invoices and payments require the live API. Enable backend mode and sign in."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Purchases"
        subtitle="Create → Pending approval → Approve → Receive → Invoice → Pay"
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} /> Refresh
            </Button>
            <PermissionGate perm="purchases.approve" fallback={<DisabledReasonButton label="Pay supplier" reason="You do not have permission to record supplier payments." />}>
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link to="/app/purchases/payments/new"><CreditCard className="h-3.5 w-3.5" /> Pay supplier</Link>
              </Button>
            </PermissionGate>
            <PermissionGate
              perm="purchases.receive"
              fallback={<DisabledReasonButton label="Direct purchase" reason="Requires purchase create, approve, and receive permissions." />}
            >
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link to="/app/purchases/direct-receive"><PackagePlus className="h-3.5 w-3.5" /> Direct receive</Link>
              </Button>
            </PermissionGate>
            <PermissionGate perm="purchases.edit" fallback={<DisabledReasonButton label="New PO" reason="You do not have permission to create purchase orders." />}>
              <Button size="sm" className="gap-1.5" asChild>
                <Link to="/app/purchases/new"><Plus className="h-3.5 w-3.5" /> New PO</Link>
              </Button>
            </PermissionGate>
          </>
        }
      />

      <PageBody className="space-y-5">
        {isError && (
          <ErrorState title="Failed to load purchases" onRetry={() => refetch()} />
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <button type="button" className="text-left" onClick={() => setWorkflow("open")}>
            <StatCard
              label="Open POs"
              value={String(openRows.length)}
              icon={<Truck className="h-4 w-4" />}
              className={cn(workflow === "open" && "ring-2 ring-primary/40")}
            />
          </button>
          <button type="button" className="text-left" onClick={() => setWorkflow("pending")}>
            <StatCard
              label="Pending approval"
              value={String(pendingApproval.length)}
              icon={<Clock className="h-4 w-4" />}
              className={cn(workflow === "pending" && "ring-2 ring-primary/40")}
            />
          </button>
          <button type="button" className="text-left" onClick={() => setWorkflow("receive")}>
            <StatCard
              label="Ready to receive"
              value={String(pendingGrn.length)}
              icon={<PackageCheck className="h-4 w-4" />}
              className={cn(workflow === "receive" && "ring-2 ring-primary/40")}
            />
          </button>
          <StatCard label="Supplier payable" value={fmtBDT(payable)} icon={<Wallet className="h-4 w-4" />} />
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="h-9 pl-9 text-sm"
                placeholder="Search PO #, supplier, or reference…"
                value={poSearch}
                onChange={(e) => setPoSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([
                { id: "all", label: "All" },
                { id: "pending", label: `Pending (${pendingApproval.length})` },
                { id: "receive", label: `Receive (${pendingGrn.length})` },
                { id: "open", label: "Open" },
              ] as const).map((chip) => (
                <Button
                  key={chip.id}
                  type="button"
                  size="sm"
                  variant={workflow === chip.id ? "default" : "outline"}
                  className="h-9"
                  onClick={() => setWorkflow(chip.id)}
                >
                  {chip.label}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <Filter className="h-3.5 w-3.5" />
              Filters
            </Button>
            {(hasExtraFilters || workflow !== "all") && (
              <Button type="button" variant="ghost" size="sm" className="h-9 gap-1" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
            <Badge variant="secondary" className="h-8 gap-1.5 px-3 font-normal">
              <FileCheck className="h-3.5 w-3.5" />
              {rows.length} shown · {fmtBDT(listedSpend)} listed
            </Badge>
          </div>

          {filtersOpen && (
            <div className="grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <Label className="text-xs">Status</Label>
                <select
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setWorkflow("all");
                  }}
                >
                  <option value="">All statuses</option>
                  <option value="DRAFT">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="PARTIALLY_RECEIVED">Partially received</option>
                  <option value="RECEIVED">Received</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Supplier</Label>
                <select
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                >
                  <option value="">All suppliers</option>
                  {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Store</Label>
                <select
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={storeFilter}
                  onChange={(e) => setStoreFilter(e.target.value)}
                >
                  <option value="">All stores</option>
                  {(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">From</Label>
                <Input type="date" className="mt-1 h-9" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" className="mt-1 h-9" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <Tabs defaultValue="pos" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pos">Purchase orders</TabsTrigger>
            <TabsTrigger value="grn">GRN receipts</TabsTrigger>
            <TabsTrigger value="invoices">Supplier invoices</TabsTrigger>
          </TabsList>

          <TabsContent value="pos">
            <SectionCard
              title={
                workflow === "pending"
                  ? "Pending approval"
                  : workflow === "receive"
                    ? "Ready to receive"
                    : workflow === "open"
                      ? "Open purchase orders"
                      : "Purchase orders"
              }
              description={
                workflow === "pending"
                  ? "New POs wait here until someone approves them."
                  : "Approve drafts, receive goods, then invoice and pay."
              }
            >
              {isLoading ? (
                <LoadingState rows={5} />
              ) : rows.length === 0 ? (
                <EmptyState
                  title={allRows.length === 0 ? "No purchase orders yet" : "No matching POs"}
                  description={
                    allRows.length === 0
                      ? "Create a PO — it shows up here as Pending until approved."
                      : "Try Pending, clear filters, or widen the date range."
                  }
                  action={
                    allRows.length === 0 ? (
                      <PermissionGate perm="purchases.edit">
                        <Button size="sm" asChild>
                          <Link to="/app/purchases/new"><Plus className="mr-1.5 h-3.5 w-3.5" /> New PO</Link>
                        </Button>
                      </PermissionGate>
                    ) : (
                      <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>
                    )
                  }
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-sm">
                      <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2.5 text-left">PO</th>
                          <th className="px-3 py-2.5 text-left">Supplier</th>
                          <th className="px-3 py-2.5 text-left">Date</th>
                          <th className="px-3 py-2.5 text-right">Qty</th>
                          <th className="px-3 py-2.5 text-right">Net</th>
                          <th className="px-3 py-2.5 text-left">Received</th>
                          <th className="px-3 py-2.5 text-left">Status</th>
                          <th className="px-4 py-2.5 text-right">Next step</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {poPage.pageItems.map((p) => {
                          const action = nextAction(p);
                          return (
                            <tr
                              key={p.id}
                              className="cursor-pointer hover:bg-secondary/30"
                              onClick={() =>
                                void navigate({
                                  to: "/app/purchases/$purchaseId",
                                  params: { purchaseId: p.id },
                                })
                              }
                            >
                              <td className="px-4 py-3">
                                <Link
                                  to="/app/purchases/$purchaseId"
                                  params={{ purchaseId: p.id }}
                                  className="font-mono text-xs font-semibold text-primary hover:underline"
                                >
                                  {p.invoice_number}
                                </Link>
                                {p.reference_no ? (
                                  <div className="mt-0.5 text-[11px] text-muted-foreground">Ref {p.reference_no}</div>
                                ) : null}
                              </td>
                              <td className="px-3 py-3">
                                <div className="font-medium">{p.supplier_name ?? "—"}</div>
                              </td>
                              <td className="px-3 py-3 text-muted-foreground">
                                {p.purchase_date ? new Date(p.purchase_date).toLocaleDateString() : "—"}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums">{totalQty(p)}</td>
                              <td className="px-3 py-3 text-right tabular-nums font-medium">{fmtBDT(p.total)}</td>
                              <td className="px-3 py-3 text-muted-foreground">{receivedLabel(p)}</td>
                              <td className="px-3 py-3">
                                <StatusBadge status={displayPurchaseStatus(p.status)} />
                              </td>
                              {/* Two fixed slots so every row lines up: the one
                                  "next step" action, then an overflow menu.
                                  Stops propagation so these never trigger the
                                  row's click-to-view. */}
                              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1.5">
                                  <div className="w-[88px] shrink-0">
                                    {action?.approve ? (
                                      <PermissionGate perm="purchases.approve">
                                        <Button size="sm" className="w-full" onClick={() => setApproveTarget(p)}>
                                          Approve
                                        </Button>
                                      </PermissionGate>
                                    ) : action?.to ? (
                                      <PermissionGate
                                        perm={action.label === "Receive" ? "purchases.receive" : "purchases.edit"}
                                      >
                                        <Button size="sm" variant="secondary" className="w-full" asChild>
                                          <Link to={action.to} params={{ purchaseId: p.id }}>{action.label}</Link>
                                        </Button>
                                      </PermissionGate>
                                    ) : (
                                      <span className="block text-center text-xs text-muted-foreground">—</span>
                                    )}
                                  </div>

                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 shrink-0 p-0"
                                        aria-label={`Actions for ${p.invoice_number}`}
                                      >
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48">
                                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                      <DropdownMenuItem asChild>
                                        <Link to="/app/purchases/$purchaseId" params={{ purchaseId: p.id }}>
                                          <Eye className="mr-2 h-4 w-4 text-primary" /> View details
                                        </Link>
                                      </DropdownMenuItem>
                                      <PermissionGate perm="purchases.edit">
                                        {canEditPurchase(p.status) && (
                                          <DropdownMenuItem asChild>
                                            <Link to="/app/purchases/$purchaseId/edit" params={{ purchaseId: p.id }}>
                                              <Pencil className="mr-2 h-4 w-4" /> Edit
                                            </Link>
                                          </DropdownMenuItem>
                                        )}
                                      </PermissionGate>
                                      <PermissionGate perm="purchases.edit">
                                        {canReturnPurchase(p) && (
                                          <DropdownMenuItem asChild>
                                            <Link to="/app/purchases/$purchaseId/return" params={{ purchaseId: p.id }}>
                                              <Undo2 className="mr-2 h-4 w-4" /> Return to supplier
                                            </Link>
                                          </DropdownMenuItem>
                                        )}
                                      </PermissionGate>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => {
                                          if (!printPurchaseOrder(p)) {
                                            toast.error(
                                              "Pop-up blocked. Allow pop-ups for this site to print.",
                                            );
                                          }
                                        }}
                                      >
                                        <Printer className="mr-2 h-4 w-4" /> Print
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <ListPagination page={poPage.page} pageSize={poPage.pageSize} total={poPage.total} onPageChange={poPage.setPage} />
                </>
              )}
            </SectionCard>
          </TabsContent>

          <TabsContent value="grn">
            <SectionCard title="Goods received (GRN)">
              {receivesQuery.isLoading ? <LoadingState rows={3} /> : grnRows.length === 0 ? (
                <EmptyState title="No GRN records" description="Receive an approved PO or use Direct receive." />
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-5 py-2.5 text-left">GRN #</th>
                        <th className="px-3 py-2.5 text-left">PO #</th>
                        <th className="px-3 py-2.5 text-left">Received</th>
                        <th className="px-5 py-2.5 text-right">Lines</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {grnPage.pageItems.map((g) => (
                        <tr key={g.id} className="hover:bg-secondary/30">
                          <td className="px-5 py-3 font-mono text-xs">{g.receive_no}</td>
                          <td className="px-3 py-3">
                            <Link to="/app/purchases/$purchaseId" params={{ purchaseId: g.purchase_id }} className="font-mono text-xs text-primary hover:underline">
                              {g.purchase_no}
                            </Link>
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">{g.received_at ? new Date(g.received_at).toLocaleString() : "—"}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{g.lines.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ListPagination page={grnPage.page} pageSize={grnPage.pageSize} total={grnPage.total} onPageChange={grnPage.setPage} />
                </>
              )}
            </SectionCard>
          </TabsContent>

          <TabsContent value="invoices">
            <SectionCard title="Supplier invoices">
              {supplierInvoicesQuery.isLoading ? <LoadingState rows={3} /> : invoiceRows.length === 0 ? (
                <EmptyState title="No supplier invoices" description="Record an invoice from a received PO." />
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-5 py-2.5 text-left">Invoice #</th>
                        <th className="px-3 py-2.5 text-right">Total</th>
                        <th className="px-3 py-2.5 text-right">Due</th>
                        <th className="px-5 py-2.5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {invoicePage.pageItems.map((inv) => (
                        <tr key={inv.id} className="hover:bg-secondary/30">
                          <td className="px-5 py-3 font-mono text-xs">{inv.invoice_no}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{fmtBDT(inv.total)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{fmtBDT(inv.due_amount)}</td>
                          <td className="px-5 py-3 text-right"><StatusBadge status={inv.status.toLowerCase()} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ListPagination page={invoicePage.page} pageSize={invoicePage.pageSize} total={invoicePage.total} onPageChange={invoicePage.setPage} />
                </>
              )}
            </SectionCard>
          </TabsContent>
        </Tabs>
      </PageBody>

      <ConfirmActionDialog
        open={!!approveTarget}
        onOpenChange={(open) => !open && setApproveTarget(null)}
        title={`Approve ${approveTarget?.invoice_number}?`}
        description="Status becomes Approved. You can then Receive (GRN) from this list."
        confirmLabel="Approve"
        isPending={approvePurchase.isPending}
        onConfirm={async () => {
          if (!approveTarget) return;
          await approvePurchase.mutateAsync(approveTarget.id);
          setApproveTarget(null);
          void refetch();
        }}
      />
    </>
  );
}

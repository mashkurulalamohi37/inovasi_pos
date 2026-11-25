import { Fragment, useMemo, useState, useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Check, ChevronsUpDown, CalendarDays, Activity, Boxes, ShoppingCart, Truck, TrendingUp,
  AlertTriangle, BarChart3, PieChart, LineChart, Users, Wallet, CreditCard, Lock,
  ClipboardList, ScrollText, Percent, FileSpreadsheet, Package, ChevronLeft, RefreshCw, Printer,
} from "lucide-react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { ExportButton, PrintButton, DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, ErrorState } from "@/components/pulse/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { fmtBDT } from "@/lib/pos-data";
import { useAuth } from "@/lib/auth-provider";
import {
  useApiCustomers,
  useApiProducts,
  useApiStores,
  useApiSuppliers,
  useCategories,
  useCompanyProfile,
  useExportReport,
  useReportData,
  useReportsCatalog,
  type ApiReportCatalogItem,
  type ReportDateParams,
} from "@/hooks/use-api-config";
import { todayDateRange, todayInputDate, daysAgoInputDate } from "@/lib/dates";
import { exportRowsToExcel, exportRowsToPdf } from "@/lib/report-export";
import { escapeHtml, openPrintDocument } from "@/lib/print-document";
import { resolveCompanyLogo } from "@/lib/company-branding";
import { ReportCompanyHeader } from "@/components/pulse/ReportCompanyHeader";
import { toast } from "sonner";

const MONEY_KEYS = new Set([
  "opening_value", "closing_value", "gross_amount", "discount", "vat_tax", "net_amount",
  "paid_amount", "due_amount", "return_amount", "refund_amount", "total_cost", "movement_value",
  "balance_value", "amount", "debit", "credit", "gross_sales", "net_sales", "collection", "due_sales",
]);

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function sumRows(rows: Record<string, unknown>[], keys: string[]): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const key of keys) {
    sums[key] = rows.reduce((acc, r) => {
      const v = r[key];
      return acc + (typeof v === "number" ? v : 0);
    }, 0);
  }
  return sums;
}

function formatCell(key: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number" && MONEY_KEYS.has(key)) return fmtBDT(value);
  if (typeof value === "number") return String(value);
  return String(value);
}

function defaultDateRange(): { from: string; to: string } {
  return todayDateRange();
}

const REPORT_ICONS: Record<string, typeof Boxes> = {
  "stock-balance": Boxes,
  "stock-ledger": ScrollText,
  "low-stock": AlertTriangle,
  "sales-summary": ShoppingCart,
  "sales-by-industry": ShoppingCart,
  "sales-register": ShoppingCart,
  "sales-return": ShoppingCart,
  "daily-sales-summary": ShoppingCart,
  "purchase-summary": Truck,
  "purchase-register": Truck,
  "purchase-return": Truck,
  "grn-report": Truck,
  "payment-collection": CreditCard,
  "payment-collection-detail": CreditCard,
  "cashier-report": Lock,
  "margin-report": Percent,
  "item-ledger": ClipboardList,
  "supplier-ledger": Users,
  "customer-ledger": Users,
  "dashboard-kpi": BarChart3,
  "grocery-wholesale-retail": PieChart,
  "fashion-campaigns": TrendingUp,
  "fashion-size-color-sales": TrendingUp,
  "fashion-variant-sell-through": LineChart,
  "fashion-variant-stock": Boxes,
  "beef-wastage": AlertTriangle,
  "electronics-rma": Wallet,
  "inventory-report": Boxes,
  "profit-loss-report": BarChart3,
  "category-analysis": PieChart,
  "trend-analysis": LineChart,
  "daily-item-sales": ShoppingCart,
  "daily-item-purchase": Truck,
  "due-customer-report": Users,
  "expense-report": Wallet,
  "daily-account-closing": Lock,
  "product-details-report": Package,
};

function reportIcon(reportCode: string): typeof Boxes {
  return REPORT_ICONS[reportCode] ?? FileSpreadsheet;
}

type ReportRunnerProps = {
  reportCode: string;
  initialSearch?: {
    from_date?: string;
    to_date?: string;
    product_id?: string;
    store_id?: string;
    customer_id?: string;
    supplier_id?: string;
  };
};

export function ReportRunner({ reportCode, initialSearch }: ReportRunnerProps) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const catalogQuery = useReportsCatalog();
  const storesQuery = useApiStores();
  const suppliersQuery = useApiSuppliers();
  const customersQuery = useApiCustomers();
  const categoriesQuery = useCategories();
  const productsQuery = useApiProducts({ status: "active" });
  const { data: companyProfile } = useCompanyProfile();
  const exportMut = useExportReport();
  const normalizedCode = useMemo(() => {
    try {
      return decodeURIComponent(reportCode).trim().toLowerCase().replace(/[\s_]+/g, "-");
    } catch {
      return reportCode.trim().toLowerCase().replace(/[\s_]+/g, "-");
    }
  }, [reportCode]);
  const def: ApiReportCatalogItem | undefined = catalogQuery.data?.find((r) => r.key === reportCode || r.key === normalizedCode);
  const needsDates = def?.filters?.some((f) => f === "date_from" || f === "date_to") ?? true;
  const initial = defaultDateRange();

  const [fromDate, setFromDate] = useState(initial.from);
  const [toDate, setToDate] = useState(initial.to);
  const [storeId, setStoreId] = useState("");
  const [productId, setProductId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [refNo, setRefNo] = useState("");
  const [transactionType, setTransactionType] = useState("");

  const buildParams = (overrideFrom?: string, overrideTo?: string): ReportDateParams => {
    const fromVal = overrideFrom !== undefined ? overrideFrom : fromDate;
    const toVal = overrideTo !== undefined ? overrideTo : toDate;
    
    let fromIso: string | undefined;
    let toIso: string | undefined;
    
    if (fromVal) {
      const dFrom = new Date(`${fromVal}T00:00:00`);
      fromIso = !isNaN(dFrom.getTime()) ? dFrom.toISOString() : undefined;
    }
    if (toVal) {
      const dTo = new Date(`${toVal}T23:59:59.999`);
      toIso = !isNaN(dTo.getTime()) ? dTo.toISOString() : undefined;
    }

    return {
      ...(fromIso ? { from_date: fromIso } : {}),
      ...(toIso ? { to_date: toIso } : {}),
      ...(storeId ? { store_id: storeId } : {}),
      ...(productId ? { product_id: productId } : {}),
      ...(categoryId ? { category_id: categoryId } : {}),
      ...(subcategoryId ? { subcategory_id: subcategoryId } : {}),
      ...(supplierId ? { supplier_id: supplierId } : {}),
      ...(customerId ? { customer_id: customerId } : {}),
      ...(search ? { search } : {}),
      ...(refNo ? { ref_no: refNo } : {}),
      ...(transactionType ? { transaction_type: transactionType } : {}),
      limit: 500,
    };
  };

  const [applied, setApplied] = useState<ReportDateParams | null>(() => {
    const d = defaultDateRange();
    const dFrom = new Date(`${d.from}T00:00:00`);
    const dTo = new Date(`${d.to}T23:59:59.999`);
    return {
      from_date: !isNaN(dFrom.getTime()) ? dFrom.toISOString() : undefined,
      to_date: !isNaN(dTo.getTime()) ? dTo.toISOString() : undefined,
      limit: 500,
    };
  });

  const applyDatePreset = (preset: "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth") => {
    let from = todayInputDate();
    let to = todayInputDate();
    if (preset === "yesterday") {
      from = daysAgoInputDate(1);
      to = daysAgoInputDate(1);
    } else if (preset === "last7") {
      from = daysAgoInputDate(6);
      to = todayInputDate();
    } else if (preset === "thisMonth") {
      const now = new Date();
      from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      to = todayInputDate();
    } else if (preset === "lastMonth") {
      const now = new Date();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      from = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}-01`;
      to = `${lastDayPrevMonth.getFullYear()}-${String(lastDayPrevMonth.getMonth() + 1).padStart(2, "0")}-${String(lastDayPrevMonth.getDate()).padStart(2, "0")}`;
    }
    setFromDate(from);
    setToDate(to);
    const nextParams = buildParams(from, to);
    setApplied(nextParams);
  };

  useEffect(() => {
    if (!initialSearch) return;
    const hasDrill = Boolean(
      initialSearch.from_date || initialSearch.to_date ||
      initialSearch.product_id || initialSearch.store_id ||
      initialSearch.customer_id || initialSearch.supplier_id,
    );
    if (!hasDrill) return;
    const from = initialSearch.from_date?.slice(0, 10) ?? fromDate;
    const to = initialSearch.to_date?.slice(0, 10) ?? toDate;
    setFromDate(from);
    setToDate(to);
    if (initialSearch.store_id) setStoreId(initialSearch.store_id);
    if (initialSearch.product_id) setProductId(initialSearch.product_id);
    if (initialSearch.customer_id) setCustomerId(initialSearch.customer_id);
    if (initialSearch.supplier_id) setSupplierId(initialSearch.supplier_id);
    setApplied(buildParams(from, to));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSearch]);

  const ReportIcon = reportIcon(normalizedCode);
  const perm = def?.permission ?? "reports.view";
  const allowed = can(perm as Parameters<typeof can>[0]);
  const requiredFilters = def?.required_filters ?? [];
  const missingRequired = requiredFilters.filter((f) => {
    if (f === "store_id") return !storeId;
    return false;
  });

  useEffect(() => {
    if (!def) return;
    if (requiredFilters.includes("store_id") && !storeId) setApplied(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def]);

  const dataQuery = useReportData(normalizedCode, applied ?? undefined, allowed && applied !== null);
  const rows = dataQuery.data?.rows ?? [];
  const curatedColumns = def?.columns;
  const columns = useMemo(() => {
    if (curatedColumns?.length) return curatedColumns.map((c) => c.key);
    return rows[0] ? Object.keys(rows[0]).filter((k) => !k.endsWith("_id")) : [];
  }, [rows, curatedColumns]);
  const columnLabel = (key: string) => curatedColumns?.find((c) => c.key === key)?.label ?? humanizeKey(key);

  const totalKeys = def?.totals;
  const totalsRow = useMemo(() => {
    if (!totalKeys?.length || !rows.length) return null;
    return sumRows(rows, totalKeys);
  }, [rows, totalKeys]);

  const groupByKey = def?.group_by;
  const groupedRows = useMemo(() => {
    if (!groupByKey || !rows.length) return null;
    const map = new Map<string, Record<string, unknown>[]>();
    for (const r of rows) {
      const g = String(r[groupByKey] ?? "Unspecified");
      const list = map.get(g) ?? [];
      list.push(r);
      map.set(g, list);
    }
    return Array.from(map.entries()).map(([group, groupRows]) => ({
      group,
      rows: groupRows,
      subtotal: totalKeys?.length ? sumRows(groupRows, totalKeys) : null,
    }));
  }, [rows, groupByKey, totalKeys]);

  const topCategories = (categoriesQuery.data ?? []).filter((c) => !c.parent_id);
  const subcategoryOptions = (categoriesQuery.data ?? []).filter(
    (c) => c.parent_id && (!categoryId || c.parent_id === categoryId),
  );
  const selectedProduct = (productsQuery.data?.items ?? []).find((p) => p.id === productId);

  const handleShow = async () => {
    if (missingRequired.length) return;
    const nextParams = buildParams();
    setApplied(nextParams);
    await dataQuery.refetch();
    toast.success("Report updated");
  };

  const handleRefresh = async () => {
    if (!applied) {
      handleShow();
      return;
    }
    const res = await dataQuery.refetch();
    if (res.isSuccess) {
      toast.success("Report data refreshed");
    }
  };

  const handleReset = () => {
    const d = defaultDateRange();
    setFromDate(d.from); setToDate(d.to); setStoreId(""); setProductId("");
    setCategoryId(""); setSubcategoryId(""); setSupplierId(""); setCustomerId("");
    setSearch(""); setRefNo(""); setTransactionType("");
    const dFrom = new Date(`${d.from}T00:00:00`);
    const dTo = new Date(`${d.to}T23:59:59.999`);
    setApplied({
      from_date: !isNaN(dFrom.getTime()) ? dFrom.toISOString() : undefined,
      to_date: !isNaN(dTo.getTime()) ? dTo.toISOString() : undefined,
      limit: 500,
    });
    toast.info("Filters reset to default");
  };
  const handleExportCsv = () => { if (!applied) return; exportMut.mutate({ reportKey: normalizedCode, params: applied }); };
  const exportBaseName = def?.name ?? reportCode;
  const periodString = needsDates ? `${fromDate || "—"} to ${toDate || "—"}` : undefined;

  const handleExportExcel = () =>
    exportRowsToExcel(
      rows,
      exportBaseName,
      columns.map((c) => ({ key: c, label: columnLabel(c) })),
      totalsRow,
      {
        name: companyProfile?.name || companyProfile?.legal_name,
        legal_name: companyProfile?.legal_name,
        address: companyProfile?.address,
        phone: companyProfile?.phone,
        email: companyProfile?.email,
        tax_id: companyProfile?.tax_id,
      },
      exportBaseName,
      periodString,
    );

  const handleExportPdf = () => {
    const logo = resolveCompanyLogo(companyProfile ?? undefined);
    return exportRowsToPdf(
      rows,
      exportBaseName,
      {
        title: exportBaseName,
        subtitle: def?.description,
        period: periodString,
        companyInfo: {
          name: companyProfile?.name || companyProfile?.legal_name,
          legal_name: companyProfile?.legal_name,
          address: companyProfile?.address,
          phone: companyProfile?.phone,
          email: companyProfile?.email,
          tax_id: companyProfile?.tax_id,
          logo_url: logo,
        },
      },
      columns.map((c) => ({ key: c, label: columnLabel(c) })),
      totalsRow,
    );
  };

  const excelReason = !applied ? "Generate first" : undefined;
  const pdfReason = !applied ? "Generate first" : undefined;

  const printMeta = (): Array<{ label: string; value: string }> => {
    const meta: Array<{ label: string; value: string }> = [];
    if (needsDates) meta.push({ label: "Period", value: `${fromDate || "—"} to ${toDate || "—"}` });
    const named = (list: Array<{ id: string; name: string }> | undefined, id: string) =>
      id ? list?.find((x) => x.id === id)?.name : undefined;
    const store = named(storesQuery.data, storeId);
    if (store) meta.push({ label: "Store", value: store });
    if (selectedProduct) {
      meta.push({ label: "Item", value: `${selectedProduct.sku} · ${selectedProduct.name}` });
    }
    const supplier = named(suppliersQuery.data, supplierId);
    if (supplier) meta.push({ label: "Supplier", value: supplier });
    const customer = named(customersQuery.data, customerId);
    if (customer) meta.push({ label: "Customer", value: customer });
    if (search) meta.push({ label: "Search", value: search });
    if (refNo) meta.push({ label: "Document no.", value: refNo });
    if (transactionType) meta.push({ label: "Transaction type", value: transactionType });
    meta.push({ label: "Rows", value: String(dataQuery.data?.row_count ?? rows.length) });
    meta.push({ label: "Generated", value: new Date().toLocaleString() });
    return meta;
  };

  const buildPrintTableHtml = (): string => {
    const numeric = new Set(columns.filter((col) => rows.some((r) => typeof r[col] === "number")));
    const cls = (col: string) => (numeric.has(col) ? ' class="num"' : "");
    const hasSl = Boolean(curatedColumns?.length);
    const span = columns.length + (hasSl ? 1 : 0);

    const head =
      `<thead><tr>${hasSl ? '<th class="num" style="width:40px;">SL</th>' : ""}` +
      columns.map((c) => `<th${cls(c)}>${escapeHtml(columnLabel(c))}</th>`).join("") +
      `</tr></thead>`;

    const dataRow = (row: Record<string, unknown>, sl: number) =>
      `<tr>${hasSl ? `<td class="num">${sl}</td>` : ""}` +
      columns.map((c) => `<td${cls(c)}>${escapeHtml(formatCell(c, row[c]))}</td>`).join("") +
      `</tr>`;

    let bodyHtml = "";
    if (groupedRows) {
      let globalSl = 1;
      for (const g of groupedRows) {
        bodyHtml += `<tr class="group-row"><td colspan="${span}">${escapeHtml(humanizeKey(groupByKey!))}: ${escapeHtml(g.group)}</td></tr>`;
        for (const r of g.rows) {
          bodyHtml += dataRow(r, globalSl++);
        }
        if (g.subtotal) {
          bodyHtml +=
            `<tr class="total-row">${hasSl ? '<td class="num">—</td>' : ""}` +
            columns
              .map((c) => {
                const val = g.subtotal![c];
                return val !== undefined
                  ? `<td${cls(c)}>${escapeHtml(formatCell(c, val))}</td>`
                  : `<td${cls(c)}>—</td>`;
              })
              .join("") +
            `</tr>`;
        }
      }
    } else if (rows.length > 0) {
      bodyHtml = rows.map((r, idx) => dataRow(r, idx + 1)).join("");
    } else {
      bodyHtml = `<tr><td colspan="${span}" style="text-align:center;padding:16px;color:#666;">No data available for the selected criteria.</td></tr>`;
    }

    const tfoot = totalsRow
      ? `<tfoot><tr class="total-row">${hasSl ? '<td class="num">TOTAL</td>' : ""}` +
        columns
          .map((c) => {
            const val = totalsRow[c];
            return val !== undefined
              ? `<td${cls(c)}>${escapeHtml(formatCell(c, val))}</td>`
              : `<td${cls(c)}>—</td>`;
          })
          .join("") +
        `</tr></tfoot>`
      : "";

    return `${head}<tbody>${bodyHtml}</tbody>${tfoot}`;
  };

  const handlePrint = () => {
    const logo = resolveCompanyLogo(companyProfile ?? undefined);
    openPrintDocument({
      companyInfo: {
        name: companyProfile?.name || companyProfile?.legal_name,
        legal_name: companyProfile?.legal_name,
        address: companyProfile?.address,
        phone: companyProfile?.phone,
        email: companyProfile?.email,
        tax_id: companyProfile?.tax_id,
        logo_url: logo,
      },
      title: def?.name ?? reportCode,
      subtitle: def?.description,
      meta: printMeta(),
      bodyHtml: `<table>${buildPrintTableHtml()}</table>`,
    });
  };

  const handleRowClick = (row: Record<string, unknown>) => {
    if (reportCode === "stock-balance" && row.product_id) {
      void navigate({ to: "/app/reports/$reportCode", params: { reportCode: "item-ledger" },
        search: { product_id: String(row.product_id), store_id: row.store_id ? String(row.store_id) : undefined, from_date: applied?.from_date, to_date: applied?.to_date } });
      return;
    }
    if (reportCode === "daily-sales-summary" && row.date) {
      void navigate({ to: "/app/reports/$reportCode", params: { reportCode: "sales-register" },
        search: { from_date: `${row.date}T00:00:00.000Z`, to_date: `${row.date}T23:59:59.000Z` } });
      return;
    }
    if ((reportCode === "sales-register" || reportCode === "sales-return") && row.invoice_id) { void navigate({ to: "/app/sales" }); return; }
    if ((reportCode === "purchase-register" || reportCode === "grn-report") && row.purchase_id) { void navigate({ to: "/app/purchases" }); }
  };

  if (catalogQuery.isLoading) return <LoadingState label="Loading report definition…" />;
  if (!def) return <ErrorState title="Report not found" description={`No catalog entry for "${reportCode}".`} onRetry={() => catalogQuery.refetch()} />;

  return (
    <PermissionGate perm="reports.view" fallback={<PageBody><ErrorState title="Permission denied" description="Requires reports.view permission" /></PageBody>}>
      <PageHeader
        eyebrow="Reports"
        title={def?.name ?? humanizeKey(reportCode)}
        subtitle={def?.description}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/reports">
              <ChevronLeft className="h-4 w-4 mr-1" /> Catalog
            </Link>
          </Button>
        }
      />

      <PageBody>
        {/* ── Compact Filter Bar Card ────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card p-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
                <ReportIcon className="h-4 w-4" />
              </div>
              <div>
                <span className="text-xs font-semibold text-foreground">{def?.name ?? reportCode}</span>
                <span className="ml-2 text-[11px] text-muted-foreground hidden sm:inline">— {def?.description}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {needsDates && (
                <div className="flex items-center gap-1 bg-secondary/60 p-0.5 rounded-lg border border-border/40">
                  <button
                    type="button"
                    onClick={() => applyDatePreset("today")}
                    className="px-2 py-0.5 text-[10px] font-semibold rounded hover:bg-card hover:text-foreground text-muted-foreground transition-all cursor-pointer"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDatePreset("yesterday")}
                    className="px-2 py-0.5 text-[10px] font-semibold rounded hover:bg-card hover:text-foreground text-muted-foreground transition-all cursor-pointer"
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDatePreset("last7")}
                    className="px-2 py-0.5 text-[10px] font-semibold rounded hover:bg-card hover:text-foreground text-muted-foreground transition-all cursor-pointer"
                  >
                    Last 7D
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDatePreset("thisMonth")}
                    className="px-2 py-0.5 text-[10px] font-semibold rounded hover:bg-card hover:text-foreground text-muted-foreground transition-all cursor-pointer"
                  >
                    This Month
                  </button>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>Filters</span>
              </div>
            </div>
          </div>

          <div className="mt-3">
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              {def.filters?.includes("store_id") && (
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                    Store / Outlet {requiredFilters.includes("store_id") && <span className="text-destructive">*</span>}
                  </Label>
                  <Select value={storeId} onValueChange={setStoreId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select outlet" /></SelectTrigger>
                    <SelectContent>
                      {(storesQuery.data ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {needsDates && (
                <>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">From date</Label>
                    <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">To date</Label>
                    <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 text-xs" />
                  </div>
                </>
              )}
              {def.filters?.includes("category_id") && (
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Category</Label>
                  <Select value={categoryId || "__all"} onValueChange={(v) => { setCategoryId(v === "__all" ? "" : v); setSubcategoryId(""); }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All categories" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">All categories</SelectItem>
                      {topCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {def.filters?.includes("subcategory_id") && (
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Subcategory</Label>
                  <Select value={subcategoryId || "__all"} onValueChange={(v) => setSubcategoryId(v === "__all" ? "" : v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All subcategories" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">All subcategories</SelectItem>
                      {subcategoryOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {def.filters?.includes("product_id") && (
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Item</Label>
                  <Popover open={itemPickerOpen} onOpenChange={setItemPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="h-8 w-full justify-between text-xs font-normal">
                        <span className="truncate">{selectedProduct ? `${selectedProduct.sku} · ${selectedProduct.name}` : "All items"}</span>
                        <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command>
                        <CommandInput placeholder="Search SKU or name…" />
                        <CommandList>
                          <CommandEmpty>No item found</CommandEmpty>
                          <CommandGroup>
                            <CommandItem value="__all" onSelect={() => { setProductId(""); setItemPickerOpen(false); }}>
                              <Check className={cn("mr-2 h-4 w-4", !productId ? "opacity-100" : "opacity-0")} /> All items
                            </CommandItem>
                            {(productsQuery.data?.items ?? []).map((p) => (
                              <CommandItem key={p.id} value={`${p.sku} ${p.name}`} onSelect={() => { setProductId(p.id); setItemPickerOpen(false); }}>
                                <Check className={cn("mr-2 h-4 w-4", productId === p.id ? "opacity-100" : "opacity-0")} />
                                {p.sku} · {p.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              {def.filters?.includes("supplier_id") && (
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Supplier</Label>
                  <Select value={supplierId || "__all"} onValueChange={(v) => setSupplierId(v === "__all" ? "" : v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All suppliers" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">All</SelectItem>
                      {(suppliersQuery.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {def.filters?.includes("customer_id") && (
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Customer</Label>
                  <Select value={customerId || "__all"} onValueChange={(v) => setCustomerId(v === "__all" ? "" : v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All customers" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">All</SelectItem>
                      {(customersQuery.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {def.filters?.includes("search") && (
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Search / barcode</Label>
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="SKU, name, barcode" className="h-8 text-xs" />
                </div>
              )}
              {def.filters?.includes("ref_no") && (
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Document no.</Label>
                  <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="Invoice / PO / GRN" className="h-8 text-xs" />
                </div>
              )}
              {def.filters?.includes("transaction_type") && (
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Transaction type</Label>
                  <Input value={transactionType} onChange={(e) => setTransactionType(e.target.value)} placeholder="e.g. sale" className="h-8 text-xs" />
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2 pt-2 border-t border-border/50 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" className="h-8 gap-1.5 px-3" onClick={handleShow} disabled={missingRequired.length > 0 || dataQuery.isFetching}>
                  <Activity className={`h-3.5 w-3.5 ${dataQuery.isFetching ? "animate-spin" : ""}`} /> Generate Report
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 px-2.5 text-xs"
                  onClick={handleRefresh}
                  disabled={dataQuery.isFetching}
                  title="Refresh report data"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${dataQuery.isFetching ? "animate-spin" : ""}`} />
                  <span>Refresh</span>
                </Button>
                <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={handleReset} title="Reset all filters">
                  Reset
                </Button>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <ExportButton label="CSV" onExport={handleExportCsv} isExporting={exportMut.isPending} disabledReason={!applied ? "Generate first" : undefined} />
                <ExportButton label="Excel" onExport={handleExportExcel} disabledReason={excelReason} />
                <ExportButton label="PDF" onExport={handleExportPdf} disabledReason={pdfReason} />
                <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs" onClick={handlePrint} disabled={!applied}>
                  <Printer className="h-3.5 w-3.5" /> Print
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Results table ─────────────────────────────────────────────── */}
        <SectionCard>
          {/* Company Letterhead Banner */}
          <ReportCompanyHeader
            company={companyProfile}
            reportTitle={def?.name ?? humanizeKey(reportCode)}
            reportSubtitle={def?.description}
            period={periodString}
            storeName={(storesQuery.data ?? []).find((s) => s.id === storeId)?.name}
            className="border-0 shadow-none p-0 mb-4 bg-transparent"
          />

          {dataQuery.isLoading ? (
            <LoadingState />
          ) : dataQuery.isError ? (
            <ErrorState
              title="Failed to load report"
              description="Check permissions, plan limits, or try a different date range."
              onRetry={() => dataQuery.refetch()}
            />
          ) : rows.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              No data available for the selected criteria.
            </div>
          ) : (
            <div className="overflow-x-auto" id="report-print-area">
              <table className="w-full text-xs">
                <thead className="bg-secondary/60 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    {curatedColumns?.length && <th className="w-10 px-3 py-2 text-left font-medium">SL</th>}
                    {columns.map((col) => (
                      <th key={col} className="px-3 py-2 text-left font-medium">{columnLabel(col)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {groupedRows ? (
                    groupedRows.map((group) => (
                      <Fragment key={group.group}>
                        <tr className="bg-muted/40">
                          <td
                            colSpan={columns.length + (curatedColumns?.length ? 1 : 0)}
                            className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                          >
                            {group.group}
                          </td>
                        </tr>
                        {group.rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-secondary/30 cursor-pointer transition-colors" onClick={() => handleRowClick(row)}>
                            {curatedColumns?.length && <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{idx + 1}</td>}
                            {columns.map((col) => (
                              <td key={col} className="px-3 py-1.5 tabular-nums max-w-[260px] truncate" title={String(row[col] ?? "")}>
                                {formatCell(col, row[col])}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {group.subtotal && (
                          <tr className="bg-secondary/30 font-semibold">
                            {curatedColumns?.length && <td className="px-3 py-1.5" />}
                            {columns.map((col, idx) => {
                              if (col in group.subtotal!) return <td key={col} className="px-3 py-1.5 tabular-nums max-w-[260px] truncate">{formatCell(col, group.subtotal![col])}</td>;
                              if (idx === 0) return <td key={col} className="px-3 py-1.5 text-[10px] uppercase text-muted-foreground">Subtotal</td>;
                              return <td key={col} className="px-3 py-1.5" />;
                            })}
                          </tr>
                        )}
                      </Fragment>
                    ))
                  ) : (
                    rows.map((row, i) => (
                      <tr key={i} className="hover:bg-secondary/30 cursor-pointer transition-colors" onClick={() => handleRowClick(row)}>
                        {curatedColumns?.length && <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{i + 1}</td>}
                        {columns.map((col) => (
                          <td key={col} className="px-3 py-1.5 tabular-nums max-w-[260px] truncate" title={String(row[col] ?? "")}>
                            {formatCell(col, row[col])}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
                {totalsRow && (
                  <tfoot>
                    <tr className="border-t-2 border-border bg-secondary/50 font-bold text-foreground">
                      {curatedColumns?.length && <td className="px-3 py-2">—</td>}
                      {columns.map((col, idx) => {
                        if (col in totalsRow) return <td key={col} className="px-3 py-2 tabular-nums max-w-[260px] truncate">{formatCell(col, totalsRow[col])}</td>;
                        if (idx === 0) return <td key={col} className="px-3 py-2 text-[10px] uppercase tracking-wide">Grand Total</td>;
                        return <td key={col} className="px-3 py-2" />;
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </SectionCard>
      </PageBody>
    </PermissionGate>
  );
}

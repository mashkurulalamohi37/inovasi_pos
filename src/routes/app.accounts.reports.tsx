import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, RefreshCw, CheckCircle, AlertTriangle, Printer, Download } from "lucide-react";
import {
  useTrialBalance,
  useProfitLoss,
  useBalanceSheet,
  useCompanyProfile,
  type ApiTrialBalance,
  type ApiProfitLoss,
  type ApiBalanceSheet,
  type ApiCompanyProfile,
} from "@/hooks/use-api-config";
import { LoadingState, ErrorState } from "@/components/pulse/states";
import { fmtBDT } from "@/lib/pos-data";
import { todayDateRange } from "@/lib/dates";
import { toCsv } from "@/lib/csv";
import { saveTextFile } from "@/lib/download";
import { openPrintDocument, escapeHtml } from "@/lib/print-document";
import { resolveCompanyLogo } from "@/lib/company-branding";
import { ReportCompanyHeader } from "@/components/pulse/ReportCompanyHeader";
import { toast } from "sonner";

function downloadCsv(filename: string, csv: string) {
  saveTextFile(csv, filename);
}

function printTrialBalance(data: ApiTrialBalance | undefined, company?: ApiCompanyProfile | null) {
  if (!data) return;
  const rows = data.rows
    .map(
      (r) => `<tr>
        <td><b>${escapeHtml(r.code)}</b></td>
        <td>${escapeHtml(r.name)}</td>
        <td style="text-transform:capitalize;">${escapeHtml(r.account_type)}</td>
        <td class="num">${r.debit > 0 ? fmtBDT(r.debit) : "—"}</td>
        <td class="num">${r.credit > 0 ? fmtBDT(r.credit) : "—"}</td>
      </tr>`,
    )
    .join("");

  const bodyHtml = `<table>
    <thead>
      <tr>
        <th style="width:15%;">Code</th>
        <th style="width:40%;">Account Name</th>
        <th style="width:15%;">Type</th>
        <th class="num" style="width:15%;">Debit</th>
        <th class="num" style="width:15%;">Credit</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr class="total">
        <td colspan="3"><b>Total</b></td>
        <td class="num"><b>${fmtBDT(data.total_debit)}</b></td>
        <td class="num"><b>${fmtBDT(data.total_credit)}</b></td>
      </tr>
    </tfoot>
  </table>`;

  const logo = resolveCompanyLogo(company ?? undefined);
  const ok = openPrintDocument({
    companyInfo: {
      name: company?.name || company?.legal_name,
      legal_name: company?.legal_name,
      address: company?.address,
      phone: company?.phone,
      email: company?.email,
      tax_id: company?.tax_id,
      logo_url: logo,
    },
    title: "Trial Balance Sheet",
    subtitle: "Standard trial balance ledger summary",
    orientation: "portrait",
    meta: [
      { label: "As of", value: data.as_of ? new Date(data.as_of).toLocaleDateString() : "Latest" },
      { label: "Printed", value: new Date().toLocaleString() },
    ],
    bodyHtml,
  });

  if (!ok) {
    toast.error("Pop-up blocked. Allow pop-ups to print this report.");
  }
}

function exportTrialBalanceCsv(data: ApiTrialBalance | undefined) {
  if (!data || data.rows.length === 0) {
    toast.error("No trial balance data to export");
    return;
  }
  const header = ["Code", "Account Name", "Account Type", "Debit", "Credit"];
  const rows = data.rows.map((r) => ({
    Code: r.code, "Account Name": r.name, "Account Type": r.account_type,
    Debit: r.debit, Credit: r.credit,
  }));
  downloadCsv(`trial-balance-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(header, rows));
}

function printProfitAndLoss(data: ApiProfitLoss | undefined, company?: ApiCompanyProfile | null) {
  if (!data) return;
  const section = (
    title: string,
    rows: { code: string; name: string; amount: number }[],
    totalLabel: string,
    total: number,
  ) => `
    <h2 style="font-size:13px;margin:14px 0 6px;border-bottom:1px solid #cbd5e1;padding-bottom:3px;color:#0f172a;">${escapeHtml(title)}</h2>
    <table>
      <thead>
        <tr>
          <th style="width:75%;">Account</th>
          <th class="num" style="width:25%;">Amount (BDT)</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) =>
              `<tr><td>[${escapeHtml(r.code)}] ${escapeHtml(r.name)}</td><td class="num">${fmtBDT(r.amount)}</td></tr>`,
          )
          .join("")}
        <tr class="total" style="font-weight:bold;background:#f1f5f9;"><td>${escapeHtml(totalLabel)}</td><td class="num">${fmtBDT(total)}</td></tr>
      </tbody>
    </table>`;

  const bodyHtml =
    section("1. Operating Revenue", data.revenue, "Total Revenue", data.total_revenue) +
    section("2. Cost of Goods Sold", data.cogs, "Total COGS", data.total_cogs) +
    `<div style="display:flex;justify-content:space-between;font-weight:700;font-size:13px;padding:8px 10px;background:#e2e8f0;margin:10px 0;border-radius:4px;"><span>Gross Profit</span><span>${fmtBDT(data.gross_profit)}</span></div>` +
    section("3. Operating Expenses", data.operating_expenses, "Total Operating Expenses", data.total_operating_expenses) +
    `<div style="display:flex;justify-content:space-between;font-weight:700;font-size:13px;padding:8px 10px;background:#059669;color:#ffffff;margin:10px 0;border-radius:4px;"><span>Net Profit</span><span>${fmtBDT(data.net_profit)}</span></div>`;

  const logo = resolveCompanyLogo(company ?? undefined);
  const ok = openPrintDocument({
    companyInfo: {
      name: company?.name || company?.legal_name,
      legal_name: company?.legal_name,
      address: company?.address,
      phone: company?.phone,
      email: company?.email,
      tax_id: company?.tax_id,
      logo_url: logo,
    },
    title: "Profit & Loss Statement",
    subtitle: "Income statement & net revenue overview",
    orientation: "portrait",
    meta: [
      { label: "From", value: new Date(data.from).toLocaleDateString() },
      { label: "To", value: new Date(data.to).toLocaleDateString() },
      { label: "Printed", value: new Date().toLocaleString() },
    ],
    bodyHtml,
  });

  if (!ok) {
    toast.error("Pop-up blocked. Allow pop-ups to print this report.");
  }
}

function exportProfitAndLossCsv(data: ApiProfitLoss | undefined) {
  if (!data) {
    toast.error("No P&L data to export");
    return;
  }
  const header = ["Section", "Code", "Account Name", "Amount"];
  const rows = [
    ...data.revenue.map((r) => ({ Section: "Revenue", Code: r.code, "Account Name": r.name, Amount: r.amount })),
    { Section: "Revenue", Code: "", "Account Name": "Total Revenue", Amount: data.total_revenue },
    ...data.cogs.map((r) => ({ Section: "COGS", Code: r.code, "Account Name": r.name, Amount: r.amount })),
    { Section: "COGS", Code: "", "Account Name": "Total COGS", Amount: data.total_cogs },
    { Section: "Summary", Code: "", "Account Name": "Gross Profit", Amount: data.gross_profit },
    ...data.operating_expenses.map((r) => ({ Section: "Operating Expenses", Code: r.code, "Account Name": r.name, Amount: r.amount })),
    { Section: "Operating Expenses", Code: "", "Account Name": "Total Operating Expenses", Amount: data.total_operating_expenses },
    { Section: "Summary", Code: "", "Account Name": "Net Profit", Amount: data.net_profit },
  ];
  downloadCsv(`profit-loss-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(header, rows));
}

function printBalanceSheet(data: ApiBalanceSheet | undefined, company?: ApiCompanyProfile | null) {
  if (!data) return;
  const section = (
    title: string,
    rows: { code: string | null; name: string; amount: number }[],
    totalLabel: string,
    total: number,
  ) => `
    <h2 style="font-size:13px;margin:14px 0 6px;border-bottom:1px solid #cbd5e1;padding-bottom:3px;color:#0f172a;">${escapeHtml(title)}</h2>
    <table>
      <thead>
        <tr>
          <th style="width:75%;">Account</th>
          <th class="num" style="width:25%;">Amount (BDT)</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) =>
              `<tr><td>${r.code ? `[${escapeHtml(r.code)}] ` : ""}${escapeHtml(r.name)}</td><td class="num">${fmtBDT(r.amount)}</td></tr>`,
          )
          .join("")}
        <tr class="total" style="font-weight:bold;background:#f1f5f9;"><td>${escapeHtml(totalLabel)}</td><td class="num">${fmtBDT(total)}</td></tr>
      </tbody>
    </table>`;

  const bodyHtml =
    section("Assets", data.assets, "Total Assets", data.total_assets) +
    section("Liabilities", data.liabilities, "Total Liabilities", data.total_liabilities) +
    section("Equity", data.equity, "Total Equity", data.total_equity) +
    `<div style="display:flex;justify-content:space-between;font-weight:700;font-size:13px;padding:8px 10px;background:#e2e8f0;margin:10px 0;border-radius:4px;"><span>Total Liabilities &amp; Equity</span><span>${fmtBDT(data.total_liabilities + data.total_equity)}</span></div>`;

  const logo = resolveCompanyLogo(company ?? undefined);
  const ok = openPrintDocument({
    companyInfo: {
      name: company?.name || company?.legal_name,
      legal_name: company?.legal_name,
      address: company?.address,
      phone: company?.phone,
      email: company?.email,
      tax_id: company?.tax_id,
      logo_url: logo,
    },
    title: "Balance Sheet",
    subtitle: "Financial position overview (Assets, Liabilities & Equity)",
    orientation: "portrait",
    meta: [
      { label: "As of", value: new Date(data.as_of).toLocaleDateString() },
      { label: "Printed", value: new Date().toLocaleString() },
    ],
    bodyHtml,
  });

  if (!ok) {
    toast.error("Pop-up blocked. Allow pop-ups to print this report.");
  }
}

function exportBalanceSheetCsv(data: ApiBalanceSheet | undefined) {
  if (!data) {
    toast.error("No balance sheet data to export");
    return;
  }
  const header = ["Section", "Code", "Account Name", "Amount"];
  const rows = [
    ...data.assets.map((r) => ({ Section: "Assets", Code: r.code ?? "", "Account Name": r.name, Amount: r.amount })),
    { Section: "Assets", Code: "", "Account Name": "Total Assets", Amount: data.total_assets },
    ...data.liabilities.map((r) => ({ Section: "Liabilities", Code: r.code ?? "", "Account Name": r.name, Amount: r.amount })),
    { Section: "Liabilities", Code: "", "Account Name": "Total Liabilities", Amount: data.total_liabilities },
    ...data.equity.map((r) => ({ Section: "Equity", Code: r.code ?? "", "Account Name": r.name, Amount: r.amount })),
    { Section: "Equity", Code: "", "Account Name": "Total Equity", Amount: data.total_equity },
  ];
  downloadCsv(`balance-sheet-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(header, rows));
}

export const Route = createFileRoute("/app/accounts/reports")({
  component: FinancialStatementsPage,
});

function FinancialStatementsPage() {
  const initialDates = todayDateRange();
  const { data: companyProfile } = useCompanyProfile();

  // Filters State - Direct binding
  const [asOfDateTB, setAsOfDateTB] = useState(initialDates.to);
  const [dateFromPL, setDateFromPL] = useState(initialDates.from);
  const [dateToPL, setDateToPL] = useState(initialDates.to);
  const [asOfDateBS, setAsOfDateBS] = useState(initialDates.to);

  // Queries (updates automatically on date change)
  const tbQuery = useTrialBalance(asOfDateTB ? new Date(asOfDateTB).toISOString() : undefined);
  const plQuery = useProfitLoss(
    new Date(dateFromPL).toISOString(),
    new Date(`${dateToPL}T23:59:59`).toISOString(),
  );
  const bsQuery = useBalanceSheet(asOfDateBS ? new Date(asOfDateBS).toISOString() : undefined);

  const refetchAll = () => {
    tbQuery.refetch();
    plQuery.refetch();
    bsQuery.refetch();
  };

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Financial Statements"
        subtitle="Review standard accounting output reports: Trial Balance, Profit and Loss (Income Statement), and Balance Sheet"
        actions={
          <Button variant="outline" size="sm" onClick={refetchAll}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        }
      />

      <PageBody>
        <Tabs defaultValue="tb" className="w-full">
          <TabsList className="bg-secondary mb-4 flex flex-wrap h-auto p-1 gap-1">
            <TabsTrigger value="tb">Trial Balance</TabsTrigger>
            <TabsTrigger value="pl">Profit &amp; Loss</TabsTrigger>
            <TabsTrigger value="bs">Balance Sheet</TabsTrigger>
          </TabsList>

          {/* Trial Balance Tab */}
          <TabsContent value="tb" className="space-y-4">
            <div className="flex flex-wrap gap-2.5 items-end bg-secondary/30 p-3 rounded-lg border">
              <div className="w-[180px]">
                <Label className="text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> As of Date</Label>
                <Input type="date" className="h-8 text-xs mt-1" value={asOfDateTB} onChange={(e) => setAsOfDateTB(e.target.value)} />
              </div>
              <div className="flex gap-1.5 ml-auto">
                <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => printTrialBalance(tbQuery.data, companyProfile)} disabled={!tbQuery.data}>
                  <Printer className="h-3.5 w-3.5" /> Print
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => exportTrialBalanceCsv(tbQuery.data)} disabled={!tbQuery.data}>
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </Button>
              </div>
            </div>

            {tbQuery.isLoading ? (
              <LoadingState rows={6} />
            ) : tbQuery.isError ? (
              <ErrorState onRetry={() => tbQuery.refetch()} />
            ) : (
              <div className="space-y-4">
                <ReportCompanyHeader
                  company={companyProfile}
                  reportTitle="Trial Balance Sheet"
                  reportSubtitle="Standard trial balance ledger summary"
                  period={asOfDateTB ? `As of ${new Date(asOfDateTB).toLocaleDateString()}` : "Latest"}
                />

                <div className="flex items-center gap-2.5 p-3 rounded-lg border bg-card">
                  {tbQuery.data?.balanced ? (
                    <div className="flex gap-2 items-center text-success text-sm font-semibold">
                      <CheckCircle className="h-4 w-4" />
                      <span>The trial balance is fully balanced. Total debits equal total credits.</span>
                    </div>
                  ) : (
                    <div className="flex gap-2 items-center text-destructive text-sm font-semibold">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Warning: Trial balance is out of balance. Check manual ledger postings.</span>
                    </div>
                  )}
                </div>

                <SectionCard title="Trial Balance Sheet">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-5 py-3 text-left">Code</th>
                          <th className="px-5 py-3 text-left">Account Name</th>
                          <th className="px-5 py-3 text-left">Account Type</th>
                          <th className="px-5 py-3 text-right w-[150px]">Debit</th>
                          <th className="px-5 py-3 text-right w-[150px]">Credit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border font-mono">
                        {(tbQuery.data?.rows ?? []).map((row) => (
                          <tr key={row.account_id} className="hover:bg-muted/20">
                            <td className="px-5 py-3 font-semibold font-mono">{row.code}</td>
                            <td className="px-5 py-3 font-sans text-foreground text-left">{row.name}</td>
                            <td className="px-5 py-3 font-sans text-muted-foreground text-left capitalize">{row.account_type}</td>
                            <td className="px-5 py-3 text-right text-success">
                              {row.debit > 0 ? fmtBDT(row.debit) : "—"}
                            </td>
                            <td className="px-5 py-3 text-right text-destructive">
                              {row.credit > 0 ? fmtBDT(row.credit) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-secondary/40 font-semibold border-t font-mono">
                        <tr>
                          <td colSpan={3} className="px-5 py-3 text-right font-sans">Total Balanced Amounts:</td>
                          <td className="px-5 py-3 text-right text-primary">{fmtBDT(tbQuery.data?.total_debit ?? 0)}</td>
                          <td className="px-5 py-3 text-right text-primary">{fmtBDT(tbQuery.data?.total_credit ?? 0)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </SectionCard>
              </div>
            )}
          </TabsContent>

          {/* Profit & Loss Tab */}
          <TabsContent value="pl" className="space-y-4">
            <div className="flex flex-wrap gap-2.5 items-end bg-secondary/30 p-3 rounded-lg border">
              <div className="w-[155px]">
                <Label className="text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> Date From</Label>
                <Input type="date" className="h-8 text-xs mt-1" value={dateFromPL} onChange={(e) => setDateFromPL(e.target.value)} />
              </div>
              <div className="w-[155px]">
                <Label className="text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> Date To</Label>
                <Input type="date" className="h-8 text-xs mt-1" value={dateToPL} onChange={(e) => setDateToPL(e.target.value)} />
              </div>
              <div className="flex gap-1.5 ml-auto">
                <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => printProfitAndLoss(plQuery.data, companyProfile)} disabled={!plQuery.data}>
                  <Printer className="h-3.5 w-3.5" /> Print
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => exportProfitAndLossCsv(plQuery.data)} disabled={!plQuery.data}>
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </Button>
              </div>
            </div>

            {plQuery.isLoading ? (
              <LoadingState rows={8} />
            ) : plQuery.isError ? (
              <ErrorState onRetry={() => plQuery.refetch()} />
            ) : (
              <div className="space-y-4">
                <ReportCompanyHeader
                  company={companyProfile}
                  reportTitle="Profit & Loss Statement"
                  reportSubtitle="Income statement & net revenue overview"
                  period={`From ${new Date(dateFromPL).toLocaleDateString()} to ${new Date(dateToPL).toLocaleDateString()}`}
                />

                <SectionCard
                  title="Profit & Loss Breakdown"
                  description={`From ${new Date(dateFromPL).toLocaleDateString()} to ${new Date(dateToPL).toLocaleDateString()}`}
                >
                <div className="p-5 space-y-6 text-sm">
                  {/* Revenue section */}
                  <div>
                    <h3 className="font-semibold text-base border-b pb-1 text-primary">1. Operating Revenue</h3>
                    <ul className="mt-2 space-y-1 pl-4 divide-y divide-border">
                      {(plQuery.data?.revenue ?? []).map((r) => (
                        <li key={r.account_id} className="flex justify-between py-1.5">
                          <span className="text-muted-foreground">[{r.code}] {r.name}</span>
                          <span className="font-mono">{fmtBDT(r.amount)}</span>
                        </li>
                      ))}
                      <li className="flex justify-between font-bold py-2 border-t text-foreground">
                        <span>Total Revenue</span>
                        <span className="font-mono">{fmtBDT(plQuery.data?.total_revenue ?? 0)}</span>
                      </li>
                    </ul>
                  </div>

                  {/* COGS section */}
                  <div>
                    <h3 className="font-semibold text-base border-b pb-1 text-primary">2. Cost of Goods Sold (COGS)</h3>
                    <ul className="mt-2 space-y-1 pl-4 divide-y divide-border">
                      {(plQuery.data?.cogs ?? []).map((r) => (
                        <li key={r.account_id} className="flex justify-between py-1.5">
                          <span className="text-muted-foreground">[{r.code}] {r.name}</span>
                          <span className="font-mono">{fmtBDT(r.amount)}</span>
                        </li>
                      ))}
                      <li className="flex justify-between font-bold py-2 border-t text-foreground">
                        <span>Total Cost of Goods Sold</span>
                        <span className="font-mono text-destructive">{fmtBDT(plQuery.data?.total_cogs ?? 0)}</span>
                      </li>
                    </ul>
                  </div>

                  {/* Gross Profit KPI */}
                  <div className="flex justify-between items-center bg-secondary/40 p-3 rounded-lg border text-base font-bold">
                    <span>Gross Profit (Revenue - COGS)</span>
                    <span className="font-mono text-primary">{fmtBDT(plQuery.data?.gross_profit ?? 0)}</span>
                  </div>

                  {/* Expenses section */}
                  <div>
                    <h3 className="font-semibold text-base border-b pb-1 text-primary">3. Operating Expenses</h3>
                    <ul className="mt-2 space-y-1 pl-4 divide-y divide-border">
                      {(plQuery.data?.operating_expenses ?? []).map((r) => (
                        <li key={r.account_id} className="flex justify-between py-1.5">
                          <span className="text-muted-foreground">[{r.code}] {r.name}</span>
                          <span className="font-mono">{fmtBDT(r.amount)}</span>
                        </li>
                      ))}
                      <li className="flex justify-between font-bold py-2 border-t text-foreground">
                        <span>Total Operating Expenses</span>
                        <span className="font-mono text-destructive">{fmtBDT(plQuery.data?.total_operating_expenses ?? 0)}</span>
                      </li>
                    </ul>
                  </div>

                  {/* Net Profit KPI */}
                  <div className="flex justify-between items-center bg-primary/10 p-4 rounded-lg border border-primary/20 text-lg font-bold">
                    <span>Net Profit (Gross Profit - Expenses)</span>
                    <span className={`font-mono ${(plQuery.data?.net_profit ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
                      {fmtBDT(plQuery.data?.net_profit ?? 0)}
                    </span>
                  </div>
                </div>
              </SectionCard>
              </div>
            )}
          </TabsContent>

          {/* Balance Sheet Tab */}
          <TabsContent value="bs" className="space-y-4">
            <div className="flex flex-wrap gap-2.5 items-end bg-secondary/30 p-3 rounded-lg border">
              <div className="w-[180px]">
                <Label className="text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> As of Date</Label>
                <Input type="date" className="h-8 text-xs mt-1" value={asOfDateBS} onChange={(e) => setAsOfDateBS(e.target.value)} />
              </div>
              <div className="flex gap-1.5 ml-auto">
                <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => printBalanceSheet(bsQuery.data, companyProfile)} disabled={!bsQuery.data}>
                  <Printer className="h-3.5 w-3.5" /> Print
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => exportBalanceSheetCsv(bsQuery.data)} disabled={!bsQuery.data}>
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </Button>
              </div>
            </div>

            {bsQuery.isLoading ? (
              <LoadingState rows={8} />
            ) : bsQuery.isError ? (
              <ErrorState onRetry={() => bsQuery.refetch()} />
            ) : (
              <div className="space-y-4">
                <ReportCompanyHeader
                  company={companyProfile}
                  reportTitle="Balance Sheet"
                  reportSubtitle="Financial position overview (Assets, Liabilities & Equity)"
                  period={asOfDateBS ? `As of ${new Date(asOfDateBS).toLocaleDateString()}` : "Latest"}
                />
                <div className="flex items-center gap-2.5 p-3 rounded-lg border bg-card">
                  {bsQuery.data?.balanced ? (
                    <div className="flex gap-2 items-center text-success text-sm font-semibold">
                      <CheckCircle className="h-4 w-4" />
                      <span>Accounting equation balances perfectly (Assets = Liabilities + Equity).</span>
                    </div>
                  ) : (
                    <div className="flex gap-2 items-center text-destructive text-sm font-semibold">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Warning: Accounting equation does not balance. Total Assets do not match Liabilities + Equity.</span>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Left Column: Assets */}
                  <SectionCard title="Assets">
                    <div className="p-4 space-y-4 text-sm">
                      <ul className="space-y-1.5 divide-y divide-border">
                        {(bsQuery.data?.assets ?? []).map((r, idx) => (
                          <li key={(r.account_id ?? "earning") + "-" + idx} className="flex justify-between py-1.5">
                            <span className="text-muted-foreground">{r.code ? `[${r.code}] ` : ""}{r.name}</span>
                            <span className="font-mono">{fmtBDT(r.amount)}</span>
                          </li>
                        ))}
                        <li className="flex justify-between font-bold py-2 border-t text-foreground">
                          <span>Total Assets</span>
                          <span className="font-mono text-primary">{fmtBDT(bsQuery.data?.total_assets ?? 0)}</span>
                        </li>
                      </ul>
                    </div>
                  </SectionCard>

                  {/* Right Column: Liabilities & Equity */}
                  <div className="space-y-4">
                    <SectionCard title="Liabilities">
                      <div className="p-4 space-y-4 text-sm">
                        <ul className="space-y-1.5 divide-y divide-border">
                          {(bsQuery.data?.liabilities ?? []).map((r, idx) => (
                            <li key={(r.account_id ?? "liab") + "-" + idx} className="flex justify-between py-1.5">
                              <span className="text-muted-foreground">{r.code ? `[${r.code}] ` : ""}{r.name}</span>
                              <span className="font-mono">{fmtBDT(r.amount)}</span>
                            </li>
                          ))}
                          <li className="flex justify-between font-bold py-2 border-t text-foreground">
                            <span>Total Liabilities</span>
                            <span className="font-mono text-primary">{fmtBDT(bsQuery.data?.total_liabilities ?? 0)}</span>
                          </li>
                        </ul>
                      </div>
                    </SectionCard>

                    <SectionCard title="Equity">
                      <div className="p-4 space-y-4 text-sm">
                        <ul className="space-y-1.5 divide-y divide-border">
                          {(bsQuery.data?.equity ?? []).map((r, idx) => (
                            <li key={(r.account_id ?? "eq") + "-" + idx} className="flex justify-between py-1.5">
                              <span className="text-muted-foreground">{r.code ? `[${r.code}] ` : ""}{r.name}</span>
                              <span className="font-mono">{fmtBDT(r.amount)}</span>
                            </li>
                          ))}
                          <li className="flex justify-between font-bold py-2 border-t text-foreground">
                            <span>Total Equity</span>
                            <span className="font-mono text-primary">{fmtBDT(bsQuery.data?.total_equity ?? 0)}</span>
                          </li>
                        </ul>
                      </div>
                    </SectionCard>

                    <Card className="p-4 border-2 border-primary/20 bg-primary/5 flex justify-between items-center text-sm font-bold">
                      <span>Total Liabilities & Equity</span>
                      <span className="font-mono text-primary">
                        {fmtBDT((bsQuery.data?.total_liabilities ?? 0) + (bsQuery.data?.total_equity ?? 0))}
                      </span>
                    </Card>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, AlertCircle, Download } from "lucide-react";
import { useAuditLogs } from "@/hooks/use-api-config";

import { demoAuditLogs } from "@/lib/mock-extra";
import { shouldUseBackend } from "@/lib/demo-mode";
import { resolveLiveRows } from "@/lib/live-data";

import { toast } from "sonner";

export const Route = createFileRoute("/app/audit-logs")({ component: AuditLogsPage });

const ACTIONS = ["login", "logout", "product_create", "price_change", "sale_complete", "pack_update", "flag_update", "report_export", "beef_wastage", "rma_create"];

function exportToCsv(rows: Array<{ id: string; created_at?: string; action?: string; entity_type?: string; entity_id?: string | number; detail?: unknown }>) {
  const headers = ["Time", "Action", "Entity Type", "Entity ID", "Details"];
  const csvRows = rows.map(log => [
    log.created_at ? new Date(log.created_at).toLocaleString() : "",
    log.action ?? "",
    log.entity_type ?? "",
    log.entity_id ? String(log.entity_id) : "",
    log.detail ? JSON.stringify(log.detail).replace(/"/g, '""') : "",
  ].map(v => `"${v}"`).join(","));

  const csv = "\uFEFF" + [headers.join(","), ...csvRows].join("\n");
  const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;

  // Use data URI to ensure the filename is preserved reliably across browsers
  const dataUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  const a = document.createElement("a");
  a.setAttribute("href", dataUri);
  a.setAttribute("download", filename);
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 100);
}

function AuditLogsPage() {
  const useApi = shouldUseBackend();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<string>("all");

  const query = useAuditLogs({ page, action: action === "all" ? undefined : action });

  const apiItems = query.data?.items ?? [];
  const demoFiltered = demoAuditLogs.filter(log => action === "all" || log.action === action);
  const { rows: items } = resolveLiveRows<any>(useApi, apiItems, query.isLoading, demoFiltered);

  const handleExport = () => {
    if (items.length === 0) {
      toast.error("No audit log entries to export");
      return;
    }
    try {
      exportToCsv(items as any);
      toast.success(`Exported ${items.length} audit log entries to CSV`);
    } catch {
      toast.error("Export failed — please try again");
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Security"
        title="Audit Logs"
        subtitle="Tenant-scoped activity trail"
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport} disabled={query.isLoading}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        }
      />
      <PageBody>
        {query.isError && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> Failed to load audit logs
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => query.refetch()}>Retry</Button>
          </div>
        )}
        <SectionCard>
          <div className="flex flex-wrap gap-3 border-b border-border px-5 py-3">
            <Select value={action} onValueChange={v => { setAction(v); setPage(1); }}>
              <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="Action" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={() => query.refetch()}>
              <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
          {query.isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading audit logs…</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No audit entries found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase">
                  <tr>
                    <th className="px-5 py-2 text-left">Time</th>
                    <th className="px-3 py-2 text-left">Action</th>
                    <th className="px-3 py-2 text-left">Entity</th>
                    <th className="px-5 py-2 text-left">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map(log => (
                    <tr key={log.id}>
                      <td className="px-5 py-3 text-xs text-muted-foreground">{log.created_at ? new Date(log.created_at).toLocaleString() : "—"}</td>
                      <td className="px-3 py-3"><Badge variant="outline">{log.action}</Badge></td>
                      <td className="px-3 py-3 text-xs">{log.entity_type}{log.entity_id ? ` · ${String(log.entity_id).slice(0, 12)}` : ""}</td>
                      <td className="px-5 py-3 text-xs font-mono text-muted-foreground max-w-md truncate">{log.detail ? JSON.stringify(log.detail) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {query.data && query.data.pages > 1 && apiItems.length > 0 && (
            <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
              <span className="text-muted-foreground">Page {query.data.page} of {query.data.pages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= query.data.pages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}

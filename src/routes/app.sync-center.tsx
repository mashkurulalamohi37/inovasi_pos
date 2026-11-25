import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader, PageBody, SectionCard, StatCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/lib/app-store";
import { getOfflineQueue, syncOfflineQueue } from "@/lib/offline-store";
import { computeSyncStatus } from "@/lib/offline-sync";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import type { QueuedSale } from "@/lib/app-store";

export const Route = createFileRoute("/app/sync-center")({ component: SyncCenterPage });

function SyncCenterPage() {
  const app = useApp();
  const [idbQueue, setIdbQueue] = useState<QueuedSale[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    getOfflineQueue().then(setIdbQueue);
  }, [app.queuedSales]);

  const pending = app.queuedSales.filter(q => q.status === "queued" || q.status === "conflict");
  const status = computeSyncStatus(app.offline, pending.length, false);

  const handleSync = async () => {
    if (app.offline) {
      toast.error("Go online before syncing");
      return;
    }
    setSyncing(true);
    try {
      const appResult = await app.syncQueue();
      const storeResult = await syncOfflineQueue(app.posMode);
      setIdbQueue(storeResult.updatedQueue);
      if (appResult.total === 0 && storeResult.total === 0) toast("Nothing to sync");
      else toast.success(`Synced ${appResult.synced + storeResult.synced} sale(s)`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Sync Center"
        subtitle="Offline queue and sync status."
        actions={
          <Button size="sm" className="gap-1.5" onClick={handleSync} disabled={syncing || app.offline}>
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> Sync now
          </Button>
        }
      />
      <PageBody className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Connection" value={app.offline ? "Offline" : "Online"} icon={app.offline ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />} />
          <StatCard label="App queue" value={String(pending.length)} hint="localStorage queue" />
          <StatCard label="IDB queue" value={String(idbQueue.filter(q => q.status !== "synced").length)} hint="IndexedDB backup" />
        </div>
        <SectionCard title="Sync status">
          <div className="flex items-center gap-3 p-5">
            <Badge variant="outline" className="capitalize">{status.replace(/_/g, " ")}</Badge>
            <span className="text-sm text-muted-foreground">Resolve conflicts before clearing the queue.</span>
          </div>
        </SectionCard>
        <SectionCard title="Queued sales">
          {pending.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No pending offline sales.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase">
                <tr>
                  <th className="px-5 py-2 text-left">ID</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-left">Tender</th>
                  <th className="px-5 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pending.map(q => (
                  <tr key={q.id}>
                    <td className="px-5 py-3 font-mono text-xs">{q.id}</td>
                    <td className="px-3 py-3 text-right tabular">{q.total}</td>
                    <td className="px-3 py-3">{q.tender}</td>
                    <td className="px-5 py-3">
                      <Badge variant="outline">{q.status}</Badge>
                      {q.conflictReason && <span className="ml-2 text-xs text-destructive">{q.conflictReason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}

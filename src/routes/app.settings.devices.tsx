import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { useDevices, useApproveDevice, useBlockDevice } from "@/hooks/use-api-config";
import { isDemoMode } from "@/lib/demo-mode";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/app/settings/devices")({ component: DevicesPage });

const DEMO_DEVICES = [
  { id: "d1", device_id: "browser-demo-1", device_name: "POS · DHK-01", store_id: null, counter_id: null, device_type: "browser", status: "approved", last_seen_at: new Date().toISOString() },
  { id: "d2", device_id: "browser-demo-2", device_name: "Back office", store_id: null, counter_id: null, device_type: "browser", status: "pending", last_seen_at: null },
];

function DevicesPage() {
  const demo = isDemoMode();
  const query = useDevices(!demo);
  const approve = useApproveDevice();
  const block = useBlockDevice();
  const rows = demo ? DEMO_DEVICES : (query.data ?? []);

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Devices"
        subtitle="Registered POS terminals and browsers."
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => query.refetch()}>
            <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />
      <PageBody>
        <SectionCard>
          {query.isLoading && !demo ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading devices…</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase">
                <tr>
                  <th className="px-5 py-2 text-left">Device</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Last seen</th>
                  <th className="px-5 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(d => (
                  <tr key={d.id}>
                    <td className="px-5 py-3">
                      <div className="font-medium">{d.device_name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{d.device_id}</div>
                    </td>
                    <td className="px-3 py-3">{d.device_type}</td>
                    <td className="px-3 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-5 py-3 text-right gap-2">
                      {!demo && d.status !== "approved" && (
                        <Button size="sm" variant="outline" className="mr-2" onClick={() => approve.mutate(d.id)}>Approve</Button>
                      )}
                      {!demo && d.status !== "blocked" && (
                        <Button size="sm" variant="outline" onClick={() => block.mutate(d.id)}>Block</Button>
                      )}
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

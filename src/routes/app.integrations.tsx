import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateConnector,
  useDeleteConnector,
  useIntegrationConnectors,
  useIntegrationInbox,
  useIntegrationOutbox,
  useIntegrationRegistry,
  useProcessIntegrationInbox,
  useProcessIntegrationOutbox,
} from "@/hooks/use-api-config";
import { useApp } from "@/lib/app-store";
import { requirePermission } from "@/lib/permission-ui";
import { shouldUseBackend } from "@/lib/demo-mode";
import { Plug, Send, Inbox, Trash2, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/app/integrations")({ component: IntegrationsPage });

function IntegrationsPage() {
  const app = useApp();
  const useApi = shouldUseBackend();
  const canManage = app.can("config.integrations");
  const registry = useIntegrationRegistry(useApi && canManage);
  const connectors = useIntegrationConnectors(useApi && canManage);
  const outbox = useIntegrationOutbox(useApi && canManage);
  const inbox = useIntegrationInbox(useApi && canManage);
  const createConnector = useCreateConnector();
  const deleteConnector = useDeleteConnector();
  const processOutbox = useProcessIntegrationOutbox();
  const processInbox = useProcessIntegrationInbox();

  const [name, setName] = useState("Sale webhook");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");

  const webhookDef = registry.data?.find(r => r.code === "webhook");

  const handleCreate = () => {
    if (!requirePermission(canManage)) return;
    if (!url.trim()) return;
    createConnector.mutate({
      connector_code: "webhook",
      name: name.trim() || "Outbound webhook",
      config: {
        url: url.trim(),
        secret: secret.trim() || undefined,
        events: webhookDef?.events ?? ["sale.completed"],
      },
    });
    setUrl("");
    setSecret("");
  };

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Integrations"
        subtitle="Connect outbound webhooks and manage the integration inbox/outbox queue."
        actions={
          useApi && canManage ? (
            <div className="flex gap-2">
              <Button variant="outline" className="gap-1.5" onClick={() => processOutbox.mutate()} disabled={processOutbox.isPending}>
                <Send className="h-4 w-4" /> Process outbox
              </Button>
              <Button variant="outline" className="gap-1.5" onClick={() => processInbox.mutate()} disabled={processInbox.isPending}>
                <Inbox className="h-4 w-4" /> Process inbox
              </Button>
            </div>
          ) : null
        }
      />
      <PageBody className="space-y-6">
        {!useApi && (
          <SectionCard title="Demo mode" description="Connect to the backend to manage live integrations.">
            <p className="px-5 py-4 text-sm text-muted-foreground">Sign in with a live tenant to configure webhooks.</p>
          </SectionCard>
        )}

        {useApi && !canManage && (
          <SectionCard title="Access denied">
            <p className="px-5 py-4 text-sm text-muted-foreground">You need the integrations permission to manage connectors.</p>
          </SectionCard>
        )}

        {useApi && canManage && (
          <>
            <SectionCard title="Connector catalog" description="Available integration types for your plan.">
              {registry.isLoading ? (
                <div className="space-y-2 p-5"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
              ) : (
                <div className="divide-y divide-border">
                  {(registry.data ?? []).map(item => (
                    <div key={item.code} className="flex items-start gap-3 px-5 py-4">
                      <Plug className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{item.name}</span>
                          <Badge variant="outline" className="font-mono text-[10px]">{item.code}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{item.auth_type}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                        {item.events.length > 0 && (
                          <p className="mt-1 text-[11px] text-muted-foreground">Events: {item.events.join(", ")}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Add webhook connector" description="POST sale.completed and other events to your endpoint.">
              <div className="grid gap-4 p-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wh-name">Name</Label>
                  <Input id="wh-name" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="wh-url">Webhook URL</Label>
                  <Input id="wh-url" placeholder="https://example.com/hooks/pulse" value={url} onChange={e => setUrl(e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="wh-secret">Signing secret (optional)</Label>
                  <Input id="wh-secret" type="password" value={secret} onChange={e => setSecret(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <Button onClick={handleCreate} disabled={createConnector.isPending || !url.trim()}>Create connector</Button>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Active connectors" description="Configured endpoints for this tenant.">
              {connectors.isLoading ? (
                <div className="p-5"><Skeleton className="h-16 w-full" /></div>
              ) : (connectors.data ?? []).length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted-foreground">No connectors yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {(connectors.data ?? []).map(c => (
                    <div key={c.id} className="flex items-center gap-3 px-5 py-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{c.name}</span>
                          <Badge variant="outline">{c.connector_code}</Badge>
                          <Badge variant={c.status === "active" ? "default" : "destructive"}>{c.status}</Badge>
                        </div>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{String(c.config.url ?? "")}</p>
                        {c.last_error && <p className="mt-1 text-xs text-destructive">{c.last_error}</p>}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteConnector.mutate(c.id)}
                        disabled={deleteConnector.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <div className="grid gap-6 lg:grid-cols-2">
              <SectionCard title="Outbox" description="Events waiting to be delivered.">
                <div className="flex items-center justify-between border-b border-border px-5 py-2">
                  <span className="text-xs text-muted-foreground">{(outbox.data ?? []).length} events</span>
                  <Button variant="ghost" size="sm" className="gap-1" onClick={() => outbox.refetch()}>
                    <RefreshCw className="h-3 w-3" /> Refresh
                  </Button>
                </div>
                <div className="max-h-64 divide-y divide-border overflow-y-auto">
                  {(outbox.data ?? []).slice(0, 20).map(row => (
                    <div key={row.id} className="px-5 py-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono">{row.event_type}</span>
                        <Badge variant={row.status === "sent" ? "default" : row.status === "failed" ? "destructive" : "secondary"}>
                          {row.status}
                        </Badge>
                      </div>
                      {row.last_error && <p className="mt-1 text-destructive">{row.last_error}</p>}
                    </div>
                  ))}
                  {(outbox.data ?? []).length === 0 && (
                    <p className="px-5 py-4 text-sm text-muted-foreground">Outbox is empty.</p>
                  )}
                </div>
              </SectionCard>

              <SectionCard title="Inbox" description="Inbound events received from external systems.">
                <div className="flex items-center justify-between border-b border-border px-5 py-2">
                  <span className="text-xs text-muted-foreground">{(inbox.data ?? []).length} events</span>
                  <Button variant="ghost" size="sm" className="gap-1" onClick={() => inbox.refetch()}>
                    <RefreshCw className="h-3 w-3" /> Refresh
                  </Button>
                </div>
                <div className="max-h-64 divide-y divide-border overflow-y-auto">
                  {(inbox.data ?? []).slice(0, 20).map(row => (
                    <div key={row.id} className="px-5 py-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono">{row.event_type}</span>
                        <Badge variant={row.status === "processed" ? "default" : row.status === "failed" ? "destructive" : "secondary"}>
                          {row.status}
                        </Badge>
                      </div>
                      {row.source && <p className="mt-1 text-muted-foreground">via {row.source}</p>}
                    </div>
                  ))}
                  {(inbox.data ?? []).length === 0 && (
                    <p className="px-5 py-4 text-sm text-muted-foreground">Inbox is empty.</p>
                  )}
                </div>
              </SectionCard>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}

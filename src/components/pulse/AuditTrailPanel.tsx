import { History } from "lucide-react";
import { SectionCard } from "@/components/pulse/primitives";
import { LoadingState, ErrorState } from "@/components/pulse/states";

export type AuditTrailEntry = {
  id: string;
  action: string;
  actor?: string | null;
  at?: string | null;
  detail?: string | null;
};

/**
 * AuditTrailPanel — standard history/audit timeline for business documents
 * (purchase orders, invoices, returns, payments). Renders real audit rows with
 * loading/error/empty states. Data comes from the backend audit log; this
 * component never fabricates history.
 */
export function AuditTrailPanel({
  entries,
  isLoading = false,
  error,
  onRetry,
  title = "Audit trail",
  emptyLabel = "No history recorded yet",
}: {
  entries: AuditTrailEntry[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  title?: string;
  emptyLabel?: string;
}) {
  return (
    <SectionCard title={title}>
      {isLoading ? (
        <LoadingState rows={3} />
      ) : error ? (
        <div className="p-4">
          <ErrorState title="Could not load history" description={error} onRetry={onRetry} />
        </div>
      ) : entries.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">{emptyLabel}</div>
      ) : (
        <ol className="divide-y divide-border">
          {entries.map((e) => (
            <li key={e.id} className="flex gap-3 px-5 py-3">
              <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <History className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium capitalize">{e.action.replace(/[_.]/g, " ")}</span>
                  {e.at && (
                    <span className="text-xs text-muted-foreground">{new Date(e.at).toLocaleString()}</span>
                  )}
                </div>
                {(e.actor || e.detail) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {e.actor && <span className="font-medium text-foreground/70">{e.actor}</span>}
                    {e.actor && e.detail && " · "}
                    {e.detail}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

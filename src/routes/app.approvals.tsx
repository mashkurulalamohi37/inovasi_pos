import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useApprovals,
  useApproveRequest,
  useRejectRequest,
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/hooks/use-api-config";
import { isDemoMode } from "@/lib/demo-mode";
import { AlertTriangle, Bell, CheckCircle2, ShieldAlert, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/approvals")({ component: ApprovalsPage });

const DEMO_APPROVALS = [
  { id: "a1", request_type: "discount", entity_type: "sale", entity_id: "INV-001", status: "pending", title: "Manager discount 25%", requested_by: "user-1", resolved_at: null, comment: null, created_at: new Date().toISOString() },
  { id: "a2", request_type: "return", entity_type: "sale", entity_id: "INV-042", status: "approved", title: "Electronics RMA", requested_by: "user-2", resolved_at: new Date().toISOString(), comment: "Approved", created_at: new Date().toISOString() },
];

function ApprovalsPage() {
  const demo = isDemoMode();
  const [activeTab, setActiveTab] = useState<"notifications" | "approvals">("notifications");
  const [status, setStatus] = useState<string>("all");
  const [notifFilter, setNotifFilter] = useState<"all" | "unread">("all");

  const approvalsQuery = useApprovals(status === "all" ? undefined : status, !demo);
  const approve = useApproveRequest();
  const reject = useRejectRequest();

  const notifsQuery = useNotifications(notifFilter === "unread", !demo);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const approvals = demo
    ? DEMO_APPROVALS.filter(a => status === "all" || a.status === status)
    : (approvalsQuery.data ?? []).filter(a => status === "all" || a.status === status);

  const notifications = notifsQuery.data ?? [];
  const unreadNotifCount = notifications.filter(n => !n.is_read).length;

  return (
    <>
      <PageHeader
        eyebrow="Operations & System"
        title="Notifications & Approvals"
        subtitle="Manage subscription alerts, store notifications, and pending manager requests."
      />
      <PageBody>
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 mb-4 border-b border-border pb-2">
          <Button
            variant={activeTab === "notifications" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("notifications")}
            className="gap-2 cursor-pointer"
          >
            <Bell className="h-4 w-4" />
            <span>System Notifications</span>
            {unreadNotifCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] h-5 px-1.5 font-bold">
                {unreadNotifCount}
              </Badge>
            )}
          </Button>

          <Button
            variant={activeTab === "approvals" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("approvals")}
            className="gap-2 cursor-pointer"
          >
            <ShieldAlert className="h-4 w-4" />
            <span>Manager Approvals</span>
            {approvals.filter(a => a.status === "pending").length > 0 && (
              <Badge variant="destructive" className="ml-1 text-[10px] h-5 px-1.5 font-bold">
                {approvals.filter(a => a.status === "pending").length}
              </Badge>
            )}
          </Button>
        </div>

        {activeTab === "notifications" ? (
          <SectionCard>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 bg-muted/20">
              <div className="flex items-center gap-2">
                <Select value={notifFilter} onValueChange={(v: "all" | "unread") => setNotifFilter(v)}>
                  <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All notifications</SelectItem>
                    <SelectItem value="unread">Unread only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {unreadNotifCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="cursor-pointer"
                >
                  Mark all as read
                </Button>
              )}
            </div>

            {notifsQuery.isLoading && !demo ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading notifications…</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No notifications found.</div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((n) => {
                  const isSub = n.event_type.startsWith("subscription");
                  const isExpired = n.event_type === "subscription_expired" || n.event_type === "subscription_suspended";
                  const isExpiring = n.event_type === "subscription_expiring";

                  return (
                    <div
                      key={n.id}
                      className={cn(
                        "p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors",
                        !n.is_read && (isExpired ? "bg-red-50/60 dark:bg-red-950/20" : isExpiring ? "bg-amber-50/60 dark:bg-amber-950/20" : "bg-primary/5"),
                      )}
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="mt-1 shrink-0">
                          {isExpired ? (
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                          ) : isExpiring ? (
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                          ) : isSub ? (
                            <Sparkles className="h-5 w-5 text-emerald-500" />
                          ) : (
                            <Bell className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h4 className={cn("text-sm font-semibold", !n.is_read ? "text-foreground" : "text-muted-foreground")}>
                              {n.title}
                            </h4>
                            {!n.is_read && (
                              <Badge variant="default" className="text-[9px] h-4 px-1">New</Badge>
                            )}
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 opacity-70">
                              {n.event_type}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {n.message}
                          </p>
                          <div className="mt-1 text-[10px] text-muted-foreground/70">
                            {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {isSub && (
                          <Link to="/app/subscription/plans">
                            <Button size="sm" variant={isExpired ? "destructive" : isExpiring ? "default" : "outline"} className="cursor-pointer">
                              {isExpired || isExpiring ? "Renew Subscription →" : "View Plans"}
                            </Button>
                          </Link>
                        )}
                        {!n.is_read && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => markRead.mutate(n.id)}
                            disabled={markRead.isPending}
                            className="cursor-pointer text-xs"
                          >
                            Mark as read
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        ) : (
          <SectionCard>
            <div className="flex gap-3 border-b border-border px-5 py-3">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {approvalsQuery.isLoading && !demo ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading approvals…</div>
            ) : approvals.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No approval requests.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase">
                  <tr>
                    <th className="px-5 py-2 text-left">Title</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-5 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {approvals.map(a => (
                    <tr key={a.id}>
                      <td className="px-5 py-3">
                        <div className="font-medium">{a.title}</div>
                        <div className="text-xs text-muted-foreground">{a.created_at ? new Date(a.created_at).toLocaleString() : ""}</div>
                      </td>
                      <td className="px-3 py-3 text-xs">{a.request_type}</td>
                      <td className="px-3 py-3"><StatusBadge status={a.status} /></td>
                      <td className="px-5 py-3 text-right">
                        {!demo && a.status === "pending" && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => approve.mutate({ requestId: a.id })}>Approve</Button>
                            <Button size="sm" variant="outline" onClick={() => reject.mutate({ requestId: a.id })}>Reject</Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        )}
      </PageBody>
    </>
  );
}

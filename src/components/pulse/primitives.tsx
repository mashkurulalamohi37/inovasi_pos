import { isValidElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Inbox } from "lucide-react";

export function PageHeader({
  title, subtitle, actions, eyebrow,
}: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="flex flex-col gap-2 border-b border-border/60 bg-background/50 px-4 py-3 sm:py-3.5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between lg:px-6">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl lg:text-2xl">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("p-3 sm:p-4 lg:p-5", className)}>{children}</div>;
}

export function StatCard({
  label, value, delta, deltaTone = "up", icon: Icon, hint, className,
}: {
  label: string; value: string; delta?: string; deltaTone?: "up" | "down" | "flat";
  icon?: any; hint?: string; className?: string;
}) {
  const renderedIcon = isValidElement(Icon)
    ? Icon
    : typeof Icon === "function" || (typeof Icon === "object" && Icon !== null)
      ? <Icon className="h-4 w-4" />
      : null;

  return (
    <Card className={cn("p-3.5 sm:p-4 card-gradient", className)}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10.5px] sm:text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 font-display text-xl sm:text-2xl font-semibold leading-none tracking-tight tabular">
            {value}
          </div>
        </div>
        {renderedIcon && (
          <div className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-lg brand-gradient-soft text-primary ring-1 ring-primary/10">
            {renderedIcon}
          </div>
        )}
      </div>
      {(delta || hint) && (
        <div className="mt-2.5 sm:mt-3 flex items-center gap-1.5 text-xs">
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium",
                deltaTone === "up" && "bg-success/10 text-success",
                deltaTone === "down" && "bg-destructive/10 text-destructive",
                deltaTone === "flat" && "bg-muted text-muted-foreground",
              )}
            >
              {deltaTone === "up" && <ArrowUp className="h-3 w-3" />}
              {deltaTone === "down" && <ArrowDown className="h-3 w-3" />}
              {delta}
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const map: Record<string, string> = {
    active: "bg-success/10 text-success border-success/20",
    paid: "bg-success/10 text-success border-success/20",
    completed: "bg-success/10 text-success border-success/20",
    verified: "bg-success/10 text-success border-success/20",
    received: "bg-success/10 text-success border-success/20",
    posted: "bg-success/10 text-success border-success/20",
    ok: "bg-success/10 text-success border-success/20",
    free: "bg-success/10 text-success border-success/20",
    open: "bg-primary/10 text-primary border-primary/20",
    approved: "bg-primary/10 text-primary border-primary/20",
    "in-progress": "bg-primary/10 text-primary border-primary/20",
    partial: "bg-warning/10 text-warning border-warning/20",
    pending: "bg-warning/10 text-warning border-warning/20",
    pending_approval: "bg-warning/10 text-warning border-warning/20",
    rejected: "bg-destructive/10 text-destructive border-destructive/20",
    suspended: "bg-destructive/10 text-destructive border-destructive/20",
    cancelled: "bg-muted text-muted-foreground border-border",
    reverted: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    inactive: "bg-muted text-muted-foreground border-border",
    "near-expiry": "bg-warning/10 text-warning border-warning/20",
    "on-hold": "bg-warning/10 text-warning border-warning/20",
    busy: "bg-warning/10 text-warning border-warning/20",
    cleaning: "bg-muted text-muted-foreground border-border",
    draft: "bg-muted text-muted-foreground border-border",
    refunded: "bg-destructive/10 text-destructive border-destructive/20",
    expired: "bg-destructive/10 text-destructive border-destructive/20",
    // Serial-stock states, so the electronics registry can show its real status
    // instead of collapsing every state into active/completed.
    available: "bg-success/10 text-success border-success/20",
    sold: "bg-primary/10 text-primary border-primary/20",
    reserved: "bg-warning/10 text-warning border-warning/20",
    returned: "bg-warning/10 text-warning border-warning/20",
    warranty: "bg-primary/10 text-primary border-primary/20",
    rma: "bg-destructive/10 text-destructive border-destructive/20",
    damaged: "bg-destructive/10 text-destructive border-destructive/20",
    blocked: "bg-destructive/10 text-destructive border-destructive/20",
    retired: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Badge variant="outline" className={cn("rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize", map[s] ?? "bg-muted text-muted-foreground")}>
      {status}
    </Badge>
  );
}

export function EmptyState({
  title, description, action, icon: Icon = Inbox,
}: { title: string; description?: string; action?: ReactNode; icon?: any }) {
  const renderedIcon = isValidElement(Icon)
    ? Icon
    : typeof Icon === "function" || (typeof Icon === "object" && Icon !== null)
      ? <Icon className="h-5 w-5" />
      : <Inbox className="h-5 w-5" />;

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-gradient-to-br from-secondary/40 to-background p-8 sm:p-12 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-background text-muted-foreground shadow-sm">
        {renderedIcon}
      </div>
      <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SectionCard({
  title, description, subtitle, actions, children, className,
}: { title?: string; description?: string; subtitle?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  const desc = description ?? subtitle;
  return (
    <Card className={cn("overflow-hidden", className)}>
      {(title || actions || desc) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 border-b border-border px-3.5 py-2.5 sm:px-4 sm:py-2.5">
          <div className="min-w-0">
            {title && <h3 className="font-display text-sm font-semibold tracking-tight">{title}</h3>}
            {desc && <p className="text-[11px] text-muted-foreground">{desc}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className="overflow-x-auto">{children}</div>
    </Card>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-background px-3 py-2 sm:px-4 sm:py-2">
      {children}
    </div>
  );
}
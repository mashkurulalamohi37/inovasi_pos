import { cn } from "@/lib/utils";

export interface StatusStyle {
  label: string;
  badge: string;
  dot: string;
  ring: string;
}

const STATUS_STYLES: Record<string, StatusStyle> = {
  active: {
    label: "Active",
    badge:
      "border-emerald-300/80 bg-gradient-to-r from-emerald-100 via-teal-50 to-green-100 text-emerald-800 shadow-sm shadow-emerald-200/50 dark:from-emerald-950/60 dark:via-teal-950/50 dark:to-green-900/40 dark:text-emerald-200 dark:border-emerald-700/50",
    dot: "bg-gradient-to-br from-emerald-400 to-teal-500",
    ring: "ring-emerald-400/30",
  },
  pending_approval: {
    label: "Pending approval",
    badge:
      "border-amber-300/80 bg-gradient-to-r from-amber-100 via-orange-50 to-yellow-100 text-amber-900 shadow-sm shadow-amber-200/50 dark:from-amber-950/60 dark:via-orange-950/50 dark:to-yellow-900/40 dark:text-amber-200 dark:border-amber-700/50",
    dot: "bg-gradient-to-br from-amber-400 to-orange-500",
    ring: "ring-amber-400/30",
  },
  suspended: {
    label: "Suspended",
    badge:
      "border-rose-300/80 bg-gradient-to-r from-rose-100 via-red-50 to-orange-50 text-rose-900 shadow-sm shadow-rose-200/50 dark:from-rose-950/60 dark:via-red-950/50 dark:to-orange-950/40 dark:text-rose-200 dark:border-rose-700/50",
    dot: "bg-gradient-to-br from-rose-500 to-red-600",
    ring: "ring-rose-400/30",
  },
  cancelled: {
    label: "Cancelled",
    badge:
      "border-slate-300/80 bg-gradient-to-r from-slate-100 via-zinc-50 to-slate-200 text-slate-700 shadow-sm dark:from-slate-900/60 dark:via-zinc-900/50 dark:to-slate-800/40 dark:text-slate-300 dark:border-slate-600/50",
    dot: "bg-gradient-to-br from-slate-400 to-zinc-500",
    ring: "ring-slate-400/30",
  },
  offboarding: {
    label: "Offboarding",
    badge:
      "border-orange-300/80 bg-gradient-to-r from-orange-100 via-amber-50 to-yellow-50 text-orange-900 shadow-sm dark:from-orange-950/50 dark:text-orange-200 dark:border-orange-700/50",
    dot: "bg-gradient-to-br from-orange-400 to-amber-500",
    ring: "ring-orange-400/30",
  },
  deleted: {
    label: "Deleted",
    badge:
      "border-neutral-400/60 bg-gradient-to-r from-neutral-200 to-neutral-100 text-neutral-600 dark:from-neutral-900 dark:to-neutral-800 dark:text-neutral-400",
    dot: "bg-neutral-500",
    ring: "ring-neutral-400/20",
  },
};

const DEFAULT_STATUS_STYLE: StatusStyle = {
  label: "Unknown",
  badge:
    "border-primary/30 bg-gradient-to-r from-primary/10 to-teal-50 text-primary dark:from-primary/20 dark:to-teal-950/40",
  dot: "bg-primary",
  ring: "ring-primary/20",
};

export function normalizeTenantStatus(status: string): string {
  return status?.toLowerCase().trim().replace(/\s+/g, "_") ?? "";
}

export function getTenantStatusStyle(status: string): StatusStyle {
  const key = normalizeTenantStatus(status);
  const style = STATUS_STYLES[key];
  if (style) return style;
  return {
    ...DEFAULT_STATUS_STYLE,
    label: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  };
}

export interface PlanStyle {
  badge: string;
}

const PLAN_STYLES: Record<string, PlanStyle> = {
  trial: {
    badge:
      "border-sky-300/70 bg-gradient-to-r from-sky-100 to-cyan-100 text-sky-800 dark:from-sky-950/50 dark:to-cyan-950/40 dark:text-sky-200 dark:border-sky-700/50",
  },
  starter: {
    badge:
      "border-emerald-300/70 bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-800 dark:from-emerald-950/50 dark:to-teal-950/40 dark:text-emerald-200 dark:border-emerald-700/50",
  },
  enterprise: {
    badge:
      "border-violet-300/70 bg-gradient-to-r from-violet-100 to-purple-100 text-violet-800 dark:from-violet-950/50 dark:to-purple-950/40 dark:text-violet-200 dark:border-violet-700/50",
  },
  professional: {
    badge:
      "border-amber-300/70 bg-gradient-to-r from-amber-100 to-orange-100 text-amber-900 dark:from-amber-950/50 dark:to-orange-950/40 dark:text-amber-200 dark:border-amber-700/50",
  },
};

const PLAN_FALLBACKS = Object.values(PLAN_STYLES);

export function getPlanCodeStyle(planCode: string, index = 0): PlanStyle {
  const key = planCode?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  return PLAN_STYLES[key] ?? PLAN_FALLBACKS[index % PLAN_FALLBACKS.length] ?? {
    badge: "border-primary/25 bg-gradient-to-r from-primary/10 to-teal-50 text-primary",
  };
}

export function statusBadgeClassName(status: string, className?: string): string {
  return cn(
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize tracking-wide",
    getTenantStatusStyle(status).badge,
    className
  );
}

export function planBadgeClassName(planCode: string, index = 0, className?: string): string {
  return cn(
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
    getPlanCodeStyle(planCode, index).badge,
    className
  );
}

/** Status values platform admins can set from the companies table. */
export const PLATFORM_TENANT_STATUS_OPTIONS = [
  "active",
  "suspended",
  "cancelled",
  "pending_approval",
] as const;

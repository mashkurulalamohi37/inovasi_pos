import { cn } from "@/lib/utils";
import { getTenantStatusStyle, normalizeTenantStatus } from "@/components/platform/tenant-status-styles";

interface TenantStatusBadgeProps {
  status: string;
  showDot?: boolean;
  className?: string;
}

export function TenantStatusBadge({ status, showDot = true, className }: TenantStatusBadgeProps) {
  const style = getTenantStatusStyle(status);
  const key = normalizeTenantStatus(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-sm",
        style.badge,
        className
      )}
      data-status={key}
    >
      {showDot ? (
        <span className={cn("h-2 w-2 shrink-0 rounded-full ring-2 ring-white/50", style.dot)} />
      ) : null}
      {style.label}
    </span>
  );
}

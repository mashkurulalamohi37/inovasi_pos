import { cn } from "@/lib/utils";
import { getPlanCodeStyle } from "@/components/platform/tenant-status-styles";

interface PlanCodeBadgeProps {
  planCode: string;
  index?: number;
  className?: string;
}

export function PlanCodeBadge({ planCode, index = 0, className }: PlanCodeBadgeProps) {
  const style = getPlanCodeStyle(planCode, index);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide shadow-sm",
        style.badge,
        className
      )}
    >
      {planCode}
    </span>
  );
}

import type { ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export { EmptyState } from "@/components/pulse/primitives";

/**
 * Standard async states for list/detail pages. Every data-driven production
 * page should render one of LoadingState / ErrorState / EmptyState instead of
 * silently falling back to mock data in backend mode.
 */

export function LoadingState({
  rows = 5,
  label,
  className,
}: {
  rows?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2 p-5", className)} role="status" aria-busy="true" aria-live="polite">
      {label && <p className="mb-2 text-sm text-muted-foreground">{label}</p>}
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  className,
  children,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive",
        className,
      )}
    >
      <AlertCircle className="h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <span className="font-medium">{title}</span>
        {description && <span className="ml-1 text-destructive/80">{description}</span>}
      </div>
      {children}
      {onRetry && (
        <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      )}
    </div>
  );
}

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Prev/next control for a paged list.
 *
 * The list endpoints return a plain array with no total count, so "is there a
 * next page?" is inferred from a full page having come back. That is the honest
 * signal available: showing a page count would mean inventing one.
 */
export function Pager({
  page,
  pageSize,
  count,
  onPageChange,
  isFetching,
}: {
  /** Zero-based. */
  page: number;
  pageSize: number;
  /** Rows returned for the current page. */
  count: number;
  onPageChange: (page: number) => void;
  isFetching?: boolean;
}) {
  const hasPrev = page > 0;
  // A short page means the server had nothing more to give.
  const hasNext = count === pageSize;

  // Nothing to page through.
  if (!hasPrev && !hasNext) return null;

  const first = page * pageSize + 1;
  const last = page * pageSize + count;

  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {count === 0 ? "No rows on this page" : `Showing ${first}–${last}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1"
          disabled={!hasPrev || isFetching}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1"
          disabled={!hasNext || isFetching}
          onClick={() => onPageChange(page + 1)}
        >
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

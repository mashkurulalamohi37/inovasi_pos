import { useEffect, useMemo, useState } from "react";
import { LIST_PAGE_SIZE } from "@/components/pulse/ListPagination";

/** Client-side pagination helper for list tables. Resets to page 1 when `resetKey` changes. */
export function useClientPagination<T>(items: T[], pageSize = LIST_PAGE_SIZE, resetKey?: string) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize) || 1);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const safePage = Math.min(Math.max(1, page), pages);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  const setPageSafe = (next: number) => {
    setPage(Math.max(1, Math.min(next, pages)));
  };

  return {
    page: safePage,
    setPage: setPageSafe,
    pageSize,
    total,
    pages,
    pageItems,
  };
}

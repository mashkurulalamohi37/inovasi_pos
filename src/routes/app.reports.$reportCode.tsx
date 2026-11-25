import { createFileRoute } from "@tanstack/react-router";
import { ReportRunner } from "@/features/reports/ReportRunner";

type ReportSearch = {
  from_date?: string;
  to_date?: string;
  product_id?: string;
  store_id?: string;
  customer_id?: string;
  supplier_id?: string;
};

export const Route = createFileRoute("/app/reports/$reportCode")({
  validateSearch: (search: Record<string, unknown>): ReportSearch => ({
    from_date: typeof search.from_date === "string" ? search.from_date : undefined,
    to_date: typeof search.to_date === "string" ? search.to_date : undefined,
    product_id: typeof search.product_id === "string" ? search.product_id : undefined,
    store_id: typeof search.store_id === "string" ? search.store_id : undefined,
    customer_id: typeof search.customer_id === "string" ? search.customer_id : undefined,
    supplier_id: typeof search.supplier_id === "string" ? search.supplier_id : undefined,
  }),
  component: ReportDetailPage,
});

function ReportDetailPage() {
  const { reportCode } = Route.useParams();
  const search = Route.useSearch();
  return <ReportRunner reportCode={reportCode} initialSearch={search} />;
}

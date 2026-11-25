import { createFileRoute } from "@tanstack/react-router";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard } from "@/components/pulse/primitives";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cutTypes } from "@/lib/industry-mock";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useBeefCuts } from "@/hooks/use-industry-data";

export const Route = createFileRoute("/app/beef-shop/cuts")({ component: Page });

function Page() {
  const useApi = shouldUseBackend();
  const cutsQuery = useBeefCuts();
  const apiCuts = cutsQuery.data ?? [];
  const cuts = useApi ? apiCuts.map(c => ({ code: c.code, name: c.name })) : cutTypes.map(c => ({ code: c, name: c }));

  return (
    <BackOfficePage
      title="Cut Catalog"
      subtitle={useApi ? "Cut types from tenant master data" : "Regular, boneless, minced, ribs, steak — demo catalog"}
      eyebrow="Beef Shop"
      stats={[{ label: "Cut types", value: String(cuts.length) }]}
    >
      <SectionCard title="Available cut types">
        {useApi && cutsQuery.isLoading ? (
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : cuts.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No cut types configured</div>
        ) : (
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {cuts.map(c => (
              <div key={c.code} className="rounded-xl border border-border p-4">
                <div className="font-medium">{c.name}</div>
                <Badge variant="outline" className="mt-2 font-mono text-[10px]">{c.code}</Badge>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </BackOfficePage>
  );
}

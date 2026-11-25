import { createFileRoute, notFound } from "@tanstack/react-router";
import { PackMasterDataPage } from "@/features/industry-master/PackMasterDataPage";
import { INDUSTRY_PACK_IDS, type IndustryPackId } from "@/lib/industry-registry";

export const Route = createFileRoute("/app/$packId/master-data")({
  beforeLoad: ({ params }) => {
    if (!INDUSTRY_PACK_IDS.includes(params.packId as IndustryPackId)) {
      throw notFound();
    }
  },
  component: PackMasterDataRoute,
});

function PackMasterDataRoute() {
  const { packId } = Route.useParams();
  return <PackMasterDataPage packId={packId as IndustryPackId} />;
}

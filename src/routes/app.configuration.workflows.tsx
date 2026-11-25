import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";

export const Route = createFileRoute("/app/configuration/workflows")({ component: Workflows });

function Workflows() {
  return (
    <>
      <PageHeader title="Workflows" subtitle="Approval and notification flows triggered by POS or admin events." />
      <PageBody>
        <SectionCard title="Workflow builder">
          <div className="flex flex-col items-start gap-4 p-8">
            <p className="text-sm text-muted-foreground max-w-lg">
              Workflow definitions exist in the database schema but the builder API is not yet exposed.
              Purchase approval and refund approval flows are handled by the existing approval matrix until this module is completed.
            </p>
            <DisabledReasonButton label="New workflow" reason="Workflow builder will be completed in workflow automation phase." />
          </div>
        </SectionCard>
      </PageBody>
    </>
  );
}

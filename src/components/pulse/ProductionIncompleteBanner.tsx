import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Honest banner for incomplete backlog modules (beef / tailoring / rice / furniture).
 * Surfaces production-incomplete status without fake success actions.
 */
export function ProductionIncompleteBanner({
  moduleName,
  reason,
}: {
  moduleName: string;
  reason: string;
}) {
  return (
    <Alert className="mb-4 border-amber-500/40 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50">
      <AlertTitle>{moduleName} — production incomplete</AlertTitle>
      <AlertDescription>
        {reason} Mutations stay disabled in backend mode until a dedicated hardening phase. Tracked as backlog debt.
      </AlertDescription>
    </Alert>
  );
}


import type { ReactNode } from "react";
import { PageHeader, PageBody, StatCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";

export function BackOfficePage({
  title, subtitle, eyebrow, stats, children, actions,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  stats?: Array<{ label: string; value: string }>;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} eyebrow={eyebrow} actions={actions} />
      <PageBody className="space-y-5">
        {stats && stats.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map(s => <StatCard key={s.label} label={s.label} value={s.value} />)}
          </div>
        )}
        {children}
      </PageBody>
    </>
  );
}

/**
 * ActionButton — standard back-office action trigger. It performs the real
 * handler when one is supplied. When no handler exists yet (capability not
 * wired), it renders as disabled with a clear reason instead of faking a
 * success toast. This enforces the global action-wiring standard.
 */
export function ActionButton({
  label,
  onClick,
  disabledReason,
}: {
  label: string;
  onClick?: () => void;
  disabledReason?: string;
}) {
  if (!onClick) {
    return (
      <DisabledReasonButton
        label={label}
        reason={disabledReason ?? "This action is not available yet"}
      />
    );
  }
  return (
    <Button size="sm" onClick={onClick} disabled={Boolean(disabledReason)} title={disabledReason}>
      {label}
    </Button>
  );
}

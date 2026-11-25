import type { FormEvent, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/pulse/states";

export type PurchaseFormLayout = "drawer" | "page";

/**
 * Shared wrapper so purchase workflows can render as a full page (preferred)
 * or reuse the shared entity form page shell.
 */
export function PurchaseFormShell({
  layout = "page",
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitLabel = "Save",
  cancelLabel = "Back",
  isPending = false,
  submitDisabled = false,
  errorMessage,
  footer,
  className,
}: {
  layout?: PurchaseFormLayout;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit: () => void | Promise<void>;
  submitLabel?: string;
  cancelLabel?: string;
  isPending?: boolean;
  submitDisabled?: boolean;
  errorMessage?: string | null;
  footer?: ReactNode;
  className?: string;
}) {
  if (layout === "page") {
    if (!open) return null;
    const handleSubmit = (e: FormEvent) => {
      e.preventDefault();
      if (isPending || submitDisabled) return;
      void onSubmit();
    };
    return (
      <>
        <PageHeader
          title={title}
          subtitle={description}
          actions={
            <>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onOpenChange(false)} disabled={isPending}>
                <ArrowLeft className="h-3.5 w-3.5" />
                {cancelLabel}
              </Button>
              {!footer ? (
                <Button type="submit" size="sm" form="purchase-form-page" disabled={isPending || submitDisabled}>
                  {isPending ? "Saving…" : submitLabel}
                </Button>
              ) : null}
            </>
          }
        />
        <PageBody>
          <div className="mx-auto w-full max-w-5xl">
            <SectionCard>
              <form id="purchase-form-page" onSubmit={handleSubmit} className="space-y-5 p-4 sm:p-6">
                {errorMessage ? (
                  <ErrorState title="Could not save" description={errorMessage} />
                ) : null}
                {children}
                {footer}
              </form>
            </SectionCard>
          </div>
        </PageBody>
      </>
    );
  }

  return (
    <EntityFormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      onSubmit={onSubmit}
      submitLabel={submitLabel}
      cancelLabel={cancelLabel}
      isPending={isPending}
      submitDisabled={submitDisabled}
      errorMessage={errorMessage}
      footer={footer}
      className={className}
    >
      {children}
    </EntityFormDrawer>
  );
}

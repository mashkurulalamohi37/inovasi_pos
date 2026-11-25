import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Trash2, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/pulse/states";

/**
 * EntityFormDrawer — sleek dialog/drawer container for create/edit forms.
 * Supports modal windowed and full-screen modes with responsive backdrop.
 */
export function EntityFormDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  onDelete,
  deleteLabel = "Delete",
  isPending = false,
  submitDisabled = false,
  errorMessage,
  onRetry,
  maxWidth = "2xl",
  fullScreen = false,
  allowFullScreenToggle = true,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit?: (e?: FormEvent) => void | Promise<void>;
  submitLabel?: string;
  cancelLabel?: string;
  onDelete?: () => void | Promise<void>;
  deleteLabel?: string;
  isPending?: boolean;
  submitDisabled?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  maxWidth?: "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl" | "7xl" | "full";
  fullScreen?: boolean;
  allowFullScreenToggle?: boolean;
  side?: "right" | "left";
  footer?: ReactNode;
  className?: string;
}) {
  const formId = useId();
  const [isMaximized, setIsMaximized] = useState(fullScreen);

  useEffect(() => {
    if (open) {
      setIsMaximized(fullScreen);
    }
  }, [open, fullScreen]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isPending, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const main = document.querySelector<HTMLElement>("[data-app-main]");
    if (main) { main.style.overflow = "hidden"; }
    return () => { if (main) { main.style.overflow = ""; } };
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isPending || submitDisabled) return;
    void onSubmit?.();
  };

  const maxWidthClass = {
    xl: "max-w-md",
    "2xl": "max-w-lg",
    "3xl": "max-w-xl",
    "4xl": "max-w-2xl",
    "5xl": "max-w-3xl",
    "6xl": "max-w-5xl",
    "7xl": "max-w-6xl",
    full: "max-w-full",
  }[maxWidth] || "max-w-lg";

  const content = (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs transition-all animate-in fade-in duration-200 ${
        isMaximized ? "p-0 sm:p-2 md:p-3 lg:p-4" : "p-2.5 sm:p-4"
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${formId}-title`}
    >
      {/* Click backdrop to dismiss (only in windowed mode) */}
      {!isMaximized && (
        <div className="absolute inset-0" onClick={() => !isPending && onOpenChange(false)} />
      )}

      {/* Dialog container */}
      <div
        className={`relative z-10 flex flex-col border border-border/80 bg-card shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden ${
          isMaximized
            ? "h-full w-full max-w-none max-h-none rounded-none sm:rounded-2xl"
            : `max-h-[92dvh] w-full ${maxWidthClass} rounded-xl`
        } ${className || ""}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-4 py-3 sm:px-6 sm:py-4 bg-muted/25 shrink-0">
          <div>
            <h2 id={`${formId}-title`} className="text-base sm:text-lg font-bold tracking-tight text-foreground">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
                {description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {allowFullScreenToggle && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80"
                onClick={() => setIsMaximized(prev => !prev)}
                title={isMaximized ? "Restore window" : "Maximize full screen"}
              >
                {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                <span className="sr-only">{isMaximized ? "Restore" : "Maximize"}</span>
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          <form id={formId} onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
            {errorMessage && (
              <ErrorState title="Could not save" description={errorMessage} onRetry={onRetry} />
            )}
            {children}
          </form>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-border/80 px-4 py-3 sm:px-6 sm:py-4 bg-muted/30 shrink-0">
          <div>
            {onDelete && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={onDelete}
                disabled={isPending}
                className="gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleteLabel}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {cancelLabel}
            </Button>
            {!footer ? (
              <Button
                type="submit"
                size="sm"
                form={formId}
                disabled={isPending || submitDisabled}
                className="bg-primary text-primary-foreground font-medium px-4"
              >
                {isPending ? "Saving…" : submitLabel}
              </Button>
            ) : (
              footer
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const mountNode = typeof document !== "undefined"
    ? document.querySelector<HTMLElement>("[data-app-main]")
    : null;

  if (mountNode) return createPortal(content, mountNode);
  return content;
}

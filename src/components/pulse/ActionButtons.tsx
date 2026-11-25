import type { ReactNode } from "react";
import { Download, Printer, Lock } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * DisabledReasonButton — the standard way to keep a business action visible but
 * disabled with a clear, honest reason (missing permission, feature flag off,
 * or backend capability not yet available). This replaces fake "coming soon" /
 * toast-only success patterns. Never renders a fake success.
 */
export function DisabledReasonButton({
  label,
  reason,
  icon,
  variant = "outline",
  size = "sm",
  className,
}: {
  label: ReactNode;
  reason: string;
  icon?: ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled
      title={reason}
      aria-label={typeof label === "string" ? `${label} — ${reason}` : reason}
      className={cn("gap-1.5", className)}
    >
      {icon ?? <Lock className="h-3.5 w-3.5" />} {label}
    </Button>
  );
}

/**
 * ExportButton — triggers a real export handler (backend export endpoint). It
 * must not fake a download; when export is unavailable it renders a
 * DisabledReasonButton with the supplied reason.
 */
export function ExportButton({
  onExport,
  isExporting = false,
  disabledReason,
  label = "Export",
  icon,
  variant = "outline",
  size = "sm",
  className,
}: {
  onExport: () => void | Promise<void>;
  isExporting?: boolean;
  disabledReason?: string;
  label?: string;
  icon?: ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  if (disabledReason) {
    return <DisabledReasonButton label={label} reason={disabledReason} icon={icon ?? <Download className="h-3.5 w-3.5" />} variant={variant} size={size} className={className} />;
  }
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("gap-1.5", className)}
      disabled={isExporting}
      onClick={() => void onExport()}
    >
      {icon ?? <Download className="h-3.5 w-3.5" />} {isExporting ? "Exporting…" : label}
    </Button>
  );
}

/**
 * PrintButton — triggers a real print/PDF handler. Same contract as
 * ExportButton: no fake success, disabled-with-reason when unavailable.
 */
export function PrintButton({
  onPrint,
  isPrinting = false,
  disabledReason,
  label = "Print",
  icon,
  variant = "outline",
  size = "sm",
  className,
}: {
  onPrint?: () => void | Promise<void>;
  isPrinting?: boolean;
  disabledReason?: string;
  label?: string;
  icon?: ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  if (disabledReason) {
    return <DisabledReasonButton label={label} reason={disabledReason} icon={icon ?? <Printer className="h-3.5 w-3.5" />} variant={variant} size={size} className={className} />;
  }
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("gap-1.5", className)}
      disabled={isPrinting}
      onClick={() => void onPrint?.()}
    >
      {icon ?? <Printer className="h-3.5 w-3.5" />} {isPrinting ? "Printing…" : label}
    </Button>
  );
}

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CompanyIdCopyFieldProps {
  companyId: string;
  label?: string;
  hint?: string;
  className?: string;
  id?: string;
}

/** Read-only company / workspace ID with copy action (matches auth workspace input styling). */
export function CompanyIdCopyField({
  companyId,
  label = "Company ID",
  hint,
  className,
  id = "company-id",
}: CompanyIdCopyFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!companyId.trim()) return;
    try {
      await navigator.clipboard.writeText(companyId.trim());
      setCopied(true);
      toast.success("Company ID copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — select and copy manually");
    }
  };

  return (
    <div className={cn("auth-workspace-block w-full", className)}>
      <label htmlFor={id} className="mb-1 block w-full text-left text-xs text-muted-foreground">
        {label}
      </label>
      <div className="auth-workspace-row">
        <input
          id={id}
          type="text"
          readOnly
          value={companyId}
          className="auth-workspace-input font-mono tracking-wide"
          aria-readonly
        />
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="auth-workspace-verify-btn inline-flex items-center justify-center gap-1 min-w-[4.5rem]"
          title="Copy company ID"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copy
            </>
          )}
        </button>
      </div>
      {hint ? (
        <p className="mt-1 w-full text-left text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

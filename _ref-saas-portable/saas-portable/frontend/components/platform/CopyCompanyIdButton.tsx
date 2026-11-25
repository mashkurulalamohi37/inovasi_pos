import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

interface CopyCompanyIdButtonProps {
  companyId: string;
  className?: string;
}

export function CopyCompanyIdButton({ companyId, className }: CopyCompanyIdButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(companyId);
      setCopied(true);
      toast.success("Company ID copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      onClick={() => void handleCopy()}
      title="Copy company ID"
      aria-label="Copy company ID"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

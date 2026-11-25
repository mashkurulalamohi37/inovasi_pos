import { useMemo } from "react";
import { useApp, companyToReceiptBrand, type ReceiptBrand } from "@/lib/app-store";
import { useCompanyProfile, useReceiptTemplates } from "@/hooks/use-api-config";
import { resolveReceiptTemplate, receiptTemplateToBrand } from "@/lib/receipt-templates";
import { shouldUseBackend } from "@/lib/demo-mode";
import type { PosMode } from "@/lib/industry-registry";

/**
 * Receipt identity, most specific first: a receipt template the tenant configured,
 * then their own company profile, then the local brand.
 *
 * This lived inline in PosShell, so anything printing outside the shell — the
 * restaurant's split bill, for one — either re-derived it or fell back to a
 * hardcoded brand belonging to one real tenant. Resolving it in one place keeps
 * every printed slip on the same letterhead.
 */
export function useReceiptBrand(industry: PosMode): ReceiptBrand {
  const app = useApp();
  const backend = shouldUseBackend();
  const { data: cloudTemplates } = useReceiptTemplates(backend);
  const { data: companyProfile } = useCompanyProfile(backend);

  return useMemo(() => {
    const fromCompany = companyToReceiptBrand(companyProfile, app.receiptBrand);
    return receiptTemplateToBrand(resolveReceiptTemplate(cloudTemplates, industry), fromCompany);
  }, [cloudTemplates, companyProfile, industry, app.receiptBrand]);
}

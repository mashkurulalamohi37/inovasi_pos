import type { ReceiptBrand } from "@/lib/app-store";
import type { ApiReceiptTemplate } from "@/hooks/use-api-config";

/** Pick pack default → pack any → company default (same pack only) → undefined.
 *  Never fall through to a template from a DIFFERENT industry pack to avoid
 *  showing fashion taglines / exchange notes on a restaurant receipt. */
export function resolveReceiptTemplate(
  templates: ApiReceiptTemplate[] | undefined,
  packCode: string,
): ApiReceiptTemplate | undefined {
  if (!templates?.length) return undefined;

  // 1. Exact pack match that is the default
  const packDefault = templates.find((t) => t.pack_code === packCode && t.is_default);
  if (packDefault) return packDefault;

  // 2. Any template for the same pack
  const packAny = templates.find((t) => t.pack_code === packCode);
  if (packAny) return packAny;

  // 3. Company-level default — only if it has no pack_code (generic / company-wide)
  const companyDefault = templates.find((t) => (!t.pack_code || t.pack_code === "all") && t.is_default);
  if (companyDefault) return companyDefault;

  // 4. Do NOT fall through to a template from a different pack
  return undefined;
}

export function parseReceiptAddressLines(raw?: string | null): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((s) => String(s).trim()).filter(Boolean);
      }
    } catch {
      /* fallback */
    }
  }
  return trimmed.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

export function receiptTemplateToBrand(
  template: ApiReceiptTemplate | undefined,
  fallback: ReceiptBrand,
): ReceiptBrand {
  if (!template) return fallback;
  const address = parseReceiptAddressLines(template.address_lines);
  return {
    ...fallback,
    brandName: template.brand_name || fallback.brandName,
    tagline: template.tagline ?? fallback.tagline,
    addressLines: address.length ? address : fallback.addressLines,
    footerNotes: template.footer_notes ?? fallback.footerNotes,
    paperWidthMm: template.paper_width_mm === 58 ? 58 : 80,
  };
}

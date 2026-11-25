/**
 * Company logo resolution, shared by the app chrome and printed receipts.
 *
 * These per-tenant asset paths were previously inlined in `AppLayout`'s BrandMark,
 * so the sidebar showed the right logo while receipts fell back to a hardcoded
 * default belonging to a different tenant. One resolver keeps them in step.
 *
 * The mapping is a stopgap: `Company` has no logo column and
 * `/org/company/profile` returns none, so there is nowhere for a tenant to upload
 * one. An uploaded URL already wins when present — once the backend can store it,
 * the table below can go.
 */

const TENANT_LOGOS: Record<string, string> = {
  OUTFIT: "/outfit-logo.jpg",
  EIMAMA: "/ei-mama-logo.png",
  "SIDDIKY-SURGICAL": "/siddiky-surgical-logo.png",
  SIDDIKY: "/siddiky-surgical-logo.png",
  SURGICAL: "/siddiky-surgical-logo.png",
};

/** Name fragments for tenants whose company_code is not carried on the session. */
const NAME_HINTS: Array<[RegExp, string]> = [
  [/OUTFIT/i, "/outfit-logo.jpg"],
  [/EI\s*MAMA|EIMAMA/i, "/ei-mama-logo.png"],
  [/SIDDIKY|SURGICAL/i, "/siddiky-surgical-logo.png"],
];

export function getCompanyLogoStorageKey(companyId?: string | null): string {
  if (companyId && companyId.trim()) {
    return `pulse.companyLogo:${companyId.trim()}`;
  }
  return "pulse.companyLogo:default";
}

export function getStoredCompanyLogo(companyId?: string | null): string {
  if (typeof window === "undefined" || !window.localStorage) return "";
  try {
    // If specific company provided, check scoped key first
    if (companyId && companyId.trim()) {
      const scoped = localStorage.getItem(getCompanyLogoStorageKey(companyId));
      if (scoped) return scoped;
      return "";
    }
    // For non-tenant/unspecified sessions, never leak arbitrary logos
    return "";
  } catch {
    return "";
  }
}

export function setStoredCompanyLogo(companyId: string | null | undefined, logoUrl: string | null): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const key = getCompanyLogoStorageKey(companyId);
    if (logoUrl) {
      localStorage.setItem(key, logoUrl);
    } else {
      localStorage.removeItem(key);
    }
    // Clean up any legacy unscoped key so it never leaks across accounts
    localStorage.removeItem("pulse.companyLogo");

    // Dispatch a storage event so all tabs/components refresh
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "pulse.companyLogo",
        newValue: logoUrl || "",
        storageArea: localStorage,
      })
    );
  } catch {
    /* non-fatal */
  }
}

export function clearAllStoredCompanyLogos(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.removeItem("pulse.companyLogo");
    const keysToRemove = new Set<string>();

    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith("pulse.companyLogo")) {
          keysToRemove.add(k);
        }
      });
    } catch {
      /* non-fatal */
    }

    if (typeof localStorage.length === "number" && typeof localStorage.key === "function") {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("pulse.companyLogo")) {
          keysToRemove.add(k);
        }
      }
    }

    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* non-fatal */
  }
}

export function resolveCompanyLogo(source?: {
  company_code?: string | null;
  code?: string | null;
  company_name?: string | null;
  name?: string | null;
  logo_url?: string | null;
  company_logo_url?: string | null;
  role?: string | null;
  is_super_admin?: boolean;
}): string | undefined {
  if (!source) return undefined;

  const uploaded = source.logo_url || source.company_logo_url;
  if (uploaded) return uploaded;

  // Never assign preset tenant fallback logos to Super Admin or platform admin sessions
  if (source.is_super_admin || source.role === "super_admin") {
    return undefined;
  }

  const code = (source.company_code || source.code || "").trim().toUpperCase();
  if (code && TENANT_LOGOS[code]) return TENANT_LOGOS[code];

  const name = (source.company_name || source.name || "").trim();
  if (!name) return undefined;
  return NAME_HINTS.find(([pattern]) => pattern.test(name))?.[1];
}

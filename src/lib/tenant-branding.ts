import { api } from "@/lib/api";
import type { TenantBranding } from "@/components/auth/TenantBrandingHeader";

const WORKSPACE_KEY = "pulse.workspace_code";

export function getStoredWorkspaceCode(): string {
  if (typeof sessionStorage === "undefined") return "";
  return sessionStorage.getItem(WORKSPACE_KEY) ?? "";
}

export function setStoredWorkspaceCode(code: string) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(WORKSPACE_KEY, code.trim().toUpperCase());
}

const KNOWN_TENANTS: Record<string, TenantBranding> = {
  "PULSE-DEMO": {
    tenant_id: "demo-1",
    name: "Pulse Demo Retail",
    company_code: "PULSE-DEMO",
    logo_url: null,
    is_suspended: false,
    approval_status: "approved",
    is_active: true,
  },
  "AURA-JEWELRY": {
    tenant_id: "demo-jw",
    name: "Aura Fine Jewelry & Gems",
    company_code: "AURA-JEWELRY",
    logo_url: null,
    is_suspended: false,
    approval_status: "approved",
    is_active: true,
  },
  "VOLT-ELECTRONICS": {
    tenant_id: "demo-el",
    name: "Volt Electronics & Gadgets",
    company_code: "VOLT-ELECTRONICS",
    logo_url: null,
    is_suspended: false,
    approval_status: "approved",
    is_active: true,
  },
  "OUTFIT": {
    tenant_id: "outfit-1",
    name: "OUTFIT FASHION",
    company_code: "OUTFIT",
    logo_url: null,
    is_suspended: false,
    approval_status: "approved",
    is_active: true,
  },
  "EIMAMA": {
    tenant_id: "eimama-1",
    name: "EI MAMA STREET FOOD",
    company_code: "EIMAMA",
    logo_url: null,
    is_suspended: false,
    approval_status: "approved",
    is_active: true,
  },
  "TALICO": {
    tenant_id: "talico-1",
    name: "Tali Co Kitchen",
    company_code: "TALICO",
    logo_url: null,
    is_suspended: false,
    approval_status: "approved",
    is_active: true,
  },
  "TALI-CO-KITCHEN": {
    tenant_id: "talico-1",
    name: "Tali Co Kitchen",
    company_code: "TALICO",
    logo_url: null,
    is_suspended: false,
    approval_status: "approved",
    is_active: true,
  },
};

export async function resolveTenantBranding(companyCode: string): Promise<TenantBranding> {
  const code = companyCode.trim().toUpperCase();
  try {
    const remote = await api.get<TenantBranding>(`/public/tenant/${encodeURIComponent(code)}`);
    if (remote && remote.name) return remote;
  } catch (err) {
    if (KNOWN_TENANTS[code]) {
      return KNOWN_TENANTS[code];
    }
    throw err;
  }
  if (KNOWN_TENANTS[code]) {
    return KNOWN_TENANTS[code];
  }
  throw new Error("Company workspace not found");
}

export function slugCompanyCode(name: string): string {
  const base = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return base ? `${base}-${suffix}` : `TENANT-${suffix}`;
}

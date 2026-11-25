import { useState } from "react";
import { Building2, Pill } from "lucide-react";
import { resolveTenantLogoSrc } from "@/lib/tenant-logo";

export interface TenantBranding {
  tenant_id: string;
  name: string;
  company_code: string;
  logo_url: string | null;
  theme_primary?: string;
}

interface TenantBrandingHeaderProps {
  branding: TenantBranding | null;
  fallbackTitle?: string;
  fallbackSubtitle?: string;
}

function TenantLogoMark({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  const src = resolveTenantLogoSrc(logoUrl);

  if (!src || failed) {
    return (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
        <Building2 className="h-8 w-8" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      className="h-16 w-16 shrink-0 rounded-xl object-contain bg-muted/50 p-1.5"
      onError={() => setFailed(true)}
    />
  );
}

/** Company logo + name after workspace verify, or default MediFlow brand. */
export function TenantBrandingHeader({
  branding,
  fallbackTitle = "PharmaCare",
  fallbackSubtitle = "Pharmacy Management System",
}: TenantBrandingHeaderProps) {
  if (branding) {
    return (
      <div className="auth-slide-brand-inline auth-slide-brand-inline--tenant gap-3">
        <TenantLogoMark name={branding.name} logoUrl={branding.logo_url} />
        <div className="min-w-0 text-left">
          <p className="truncate text-sm font-semibold leading-tight">{branding.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{branding.company_code}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-slide-brand-inline">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
        <Pill className="h-5 w-5" />
      </div>
      <div className="text-left">
        <p className="text-sm font-semibold leading-tight">{fallbackTitle}</p>
        <p className="text-xs text-muted-foreground">{fallbackSubtitle}</p>
      </div>
    </div>
  );
}

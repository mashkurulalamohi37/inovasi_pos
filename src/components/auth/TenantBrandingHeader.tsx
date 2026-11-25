import { useState } from "react";
import { Building2 } from "lucide-react";

export type TenantBranding = {
  tenant_id: string;
  name: string;
  company_code: string;
  logo_url: string | null;
  is_suspended?: boolean;
  approval_status?: string;
  is_active?: boolean;
};

function TenantLogoMark({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const [failed, setFailed] = useState(false);

  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className="h-16 w-16 shrink-0 rounded-xl object-contain bg-muted/50 p-1.5 ring-1 ring-border"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl brand-gradient text-primary-foreground shadow-md">
      <Building2 className="h-8 w-8" />
    </div>
  );
}

export function TenantBrandingHeader({
  branding,
  fallbackTitle = "Inovasi POS",
  fallbackSubtitle = "Powered by Inovasi Tech Pvt. Ltd.",
}: {
  branding: TenantBranding | null;
  fallbackTitle?: string;
  fallbackSubtitle?: string;
}) {
  if (branding) {
    return (
      <div className="auth-slide-brand-inline">
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
      <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-white p-1.5 shadow-md ring-1 ring-primary/20">
        <img src="/inovasi-logo.png" alt="Inovasi POS" className="h-full w-full object-contain" />
      </div>
      <div className="text-left">
        <p className="text-sm font-semibold leading-tight">{fallbackTitle}</p>
        <p className="text-xs text-muted-foreground">{fallbackSubtitle}</p>
      </div>
    </div>
  );
}

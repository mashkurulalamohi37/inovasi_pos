import React from "react";
import { Building2, MapPin, Phone, Mail, FileText, Calendar, Store } from "lucide-react";
import { resolveCompanyLogo } from "@/lib/company-branding";
import type { ApiCompanyProfile } from "@/hooks/use-api-config";

export type ReportCompanyHeaderProps = {
  company?: ApiCompanyProfile | null;
  reportTitle?: string;
  reportSubtitle?: string;
  period?: string;
  storeName?: string;
  generatedAt?: string;
  className?: string;
};

export function ReportCompanyHeader({
  company,
  reportTitle,
  reportSubtitle,
  period,
  storeName,
  generatedAt,
  className = "",
}: ReportCompanyHeaderProps) {
  const companyName = company?.name || company?.legal_name || "Pulse POS & ERP";
  const logo = resolveCompanyLogo(company ?? undefined);

  return (
    <div className={`rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs mb-4 text-card-foreground ${className}`}>
      {/* Top Company Info Letterhead */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3.5 border-b border-border/60">
        <div className="flex items-center gap-3.5">
          {logo ? (
            <img
              src={logo}
              alt={companyName}
              className="h-12 w-12 rounded-lg object-contain bg-white/80 p-1 border border-border/60 shadow-2xs"
            />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
              <Building2 className="h-6 w-6" />
            </div>
          )}
          <div className="space-y-0.5">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">{companyName}</h2>
            {company?.legal_name && company.legal_name !== company.name && (
              <p className="text-xs text-muted-foreground font-medium">{company.legal_name}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pt-0.5">
              {company?.address && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-muted-foreground/70" />
                  {company.address}
                </span>
              )}
              {company?.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3 text-muted-foreground/70" />
                  {company.phone}
                </span>
              )}
              {company?.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3 text-muted-foreground/70" />
                  {company.email}
                </span>
              )}
              {company?.tax_id && (
                <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-secondary/80 px-1.5 py-0.5 rounded">
                  <FileText className="h-3 w-3 text-muted-foreground/70" />
                  BIN/VAT: {company.tax_id}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right side report meta badge */}
        {(period || storeName || generatedAt) && (
          <div className="flex flex-col sm:items-end justify-center text-xs space-y-1 text-muted-foreground sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40">
            {storeName && (
              <div className="flex items-center sm:justify-end gap-1.5 font-medium text-foreground">
                <Store className="h-3.5 w-3.5 text-primary" />
                <span>Outlet: {storeName}</span>
              </div>
            )}
            {period && (
              <div className="flex items-center sm:justify-end gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span>Period: <strong className="font-semibold text-foreground">{period}</strong></span>
              </div>
            )}
            <div className="text-[11px]">
              Generated: {generatedAt || new Date().toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {/* Report Title & Subtitle Banner */}
      {reportTitle && (
        <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div>
            <h3 className="text-base font-bold text-primary uppercase tracking-wide">{reportTitle}</h3>
            {reportSubtitle && <p className="text-xs text-muted-foreground">{reportSubtitle}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

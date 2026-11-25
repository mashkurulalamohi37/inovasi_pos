/**
 * Client-side helper for SSO handoff to Central Referral & Support Platform (@platform/referral-sso).
 * Calls backend GET /api/referrals/sso-url and opens the returned SSO URL in a new tab.
 */

import { api } from "@/lib/api";
import { toast } from "sonner";

export interface ReferralSsoResponse {
  success: boolean;
  sso_url?: string;
  handoff_token?: string;
  redirect_url?: string;
  expires_in?: number;
  fallback?: boolean;
  error?: string;
}

export async function openReferralSSO(): Promise<void> {
  const toastId = "referral-sso";
  toast.loading("Connecting to Referral & Support platform...", { id: toastId });

  try {
    let ssoUrl: string | undefined;

    // Attempt through standard API client
    try {
      const res = await api.get<ReferralSsoResponse>("/referrals/sso-url");
      if (res?.sso_url) {
        ssoUrl = res.sso_url;
      }
    } catch {
      // Fallback: direct relative GET /api/referrals/sso-url
      try {
        const raw = await fetch("/api/referrals/sso-url", {
          headers: { "Content-Type": "application/json" },
        });
        if (raw.ok) {
          const body: ReferralSsoResponse = await raw.json();
          ssoUrl = body.sso_url;
        }
      } catch {
        // Handled below
      }
    }

    toast.dismiss(toastId);

    const targetUrl = ssoUrl || "http://118.179.223.42:8085";
    window.open(targetUrl, "_blank", "noopener,noreferrer");
    toast.success("Opened Referral & Support Platform");
  } catch (err: any) {
    toast.dismiss(toastId);
    toast.error(err?.message || "Failed to open Referral & Support platform");
    window.open("http://118.179.223.42:8085", "_blank", "noopener,noreferrer");
  }
}

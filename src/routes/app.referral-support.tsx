import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { LifeBuoy, ExternalLink, Gift, Sparkles, MessageSquare, Headphones, ShieldCheck, ArrowRight } from "lucide-react";
import { PageHeader, PageBody } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { openReferralSSO } from "@/lib/referral-sso";
import { ReferralRewardsCard } from "@/components/subscription/ReferralRewardsCard";

export const Route = createFileRoute("/app/referral-support")({
  component: ReferralSupportPage,
});

function ReferralSupportPage() {
  // Automatically trigger SSO handoff upon landing
  useEffect(() => {
    const timer = setTimeout(() => {
      openReferralSSO();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Referral & Support (রেফারেল ও সাপোর্ট)"
        subtitle="Manage your partner earnings, vanity referral links, and direct support tickets via our central platform"
        actions={
          <Button
            onClick={() => openReferralSSO()}
            className="gap-2 bg-primary text-primary-foreground shadow hover:opacity-95"
          >
            <LifeBuoy className="h-4 w-4" />
            <span>Launch Portal Now</span>
            <ExternalLink className="h-4 w-4 opacity-70" />
          </Button>
        }
      />

      <PageBody>
        <div className="space-y-6">
          {/* Hero Launch Card */}
          <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-card to-emerald-500/10 p-6 md:p-8 shadow-sm">
            <div className="max-w-2xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Unified Merchant Partner Network</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                One-Click Seamless Sign-In to Partner & Support Portal
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
                Your PulsePOS account is fully federated with our Central Referral & Support Platform.
                View your recurring commissions, share vanity invite links, and raise priority support tickets
                directly without needing a separate password.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  size="lg"
                  onClick={() => openReferralSSO()}
                  className="gap-2 px-6 font-semibold"
                >
                  <LifeBuoy className="h-5 w-5" />
                  <span>Open Partner & Support Portal</span>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Quick Summary Component */}
          <ReferralRewardsCard />

          {/* Features Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <Gift className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-foreground">Partner Earnings & Commissions</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Earn recurring cash payouts whenever retail shops, pharmacies, and restaurants subscribe to PulsePOS through your referral link.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MessageSquare className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-foreground">Dedicated Support Desk</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Report POS terminal issues, request hardware setup, or get live assistance with full SLA tracking and automated updates.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-foreground">Instant SSO Enrollment</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Secure 60-second HMAC-authenticated token exchange automatically provisions your partner account and referral code.
              </p>
            </div>
          </div>
        </div>
      </PageBody>
    </div>
  );
}

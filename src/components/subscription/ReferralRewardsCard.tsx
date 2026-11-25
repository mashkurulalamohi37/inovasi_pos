import React, { useState } from "react";
import { Gift, Copy, Check, ExternalLink, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useSubscriptionReferralSummary, useApplyReferralCredits } from "@/hooks/use-api-config";

export function ReferralRewardsCard() {
  const { data: referral, isLoading } = useSubscriptionReferralSummary();
  const applyCredit = useApplyReferralCredits();
  const [copied, setCopied] = useState(false);

  if (isLoading || !referral || !referral.enabled) {
    return null;
  }

  const handleCopyLink = () => {
    if (!referral.share_url) return;
    navigator.clipboard.writeText(referral.share_url);
    setCopied(true);
    toast.success("Referral link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyCredit = () => {
    if (referral.spendable_bdt <= 0) return;
    applyCredit.mutate(referral.spendable_bdt);
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Gift className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">Partner & Referral Rewards</h3>
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[11px] gap-1">
                <Sparkles className="h-3 w-3" /> Active Program
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Refer other retail businesses to Pulse POS and earn recurring subscription credits & cash commissions.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs font-medium"
          onClick={() => window.open(referral.portal_url, "_blank")}
        >
          <span>Partner Portal</span>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Your Referral Code */}
        <div className="rounded-lg border border-border bg-background/50 p-3.5 space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your Referral Code</span>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-base font-bold text-foreground tracking-wider">
              {referral.merchant_referral_code}
            </span>
            <Button variant="ghost" size="sm" onClick={handleCopyLink} className="h-8 px-2 text-xs gap-1">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>

        {/* Spendable Subscription Credits */}
        <div className="rounded-lg border border-border bg-background/50 p-3.5 space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Spendable Credits</span>
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-xl font-bold font-mono text-primary">
              ৳{referral.spendable_bdt.toLocaleString(undefined, { minimumFractionDigits: 0 })}
            </div>
            {referral.spendable_bdt > 0 && (
              <Button
                size="sm"
                variant="secondary"
                disabled={applyCredit.isPending}
                onClick={handleApplyCredit}
                className="h-7 text-xs font-medium px-2.5"
              >
                {applyCredit.isPending ? "Applying…" : "Apply to Bill"}
              </Button>
            )}
          </div>
        </div>

        {/* Total Available Balances */}
        <div className="rounded-lg border border-border bg-background/50 p-3.5 space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cash Wallet Balance</span>
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-xl font-bold font-mono text-foreground">
              ৳{referral.available_bdt.toLocaleString(undefined, { minimumFractionDigits: 0 })}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-primary gap-1 px-2"
              onClick={() => window.open(referral.portal_url, "_blank")}
            >
              <span>Payouts</span>
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

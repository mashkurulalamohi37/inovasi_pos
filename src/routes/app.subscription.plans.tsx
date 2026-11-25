import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, StatCard, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SubscriptionPlanCards } from "@/components/subscription/SubscriptionPlanCards";
import { ReferralRewardsCard } from "@/components/subscription/ReferralRewardsCard";
import {
  useSubscriptionCurrent,
  useSubscriptionPlans,
  useChangeSubscriptionPlan,
  useSubmitSubscriptionPayment,
  useMySubscriptionPaymentRequests,
  type ApiSubscriptionPlan,
} from "@/hooks/use-api-config";
import { isDemoMode } from "@/lib/demo-mode";
import { fmtBDT } from "@/lib/pos-data";
import { cn } from "@/lib/utils";
import {
  Crown,
  CreditCard,
  AlertTriangle,
  Receipt,
  Smartphone,
  Building2,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/app/subscription/plans")({ component: SubscriptionPlansPage });

function SubscriptionPlansPage() {
  const demo = isDemoMode();
  const current = useSubscriptionCurrent(!demo);
  const plans = useSubscriptionPlans(!demo);
  const changePlan = useChangeSubscriptionPlan();
  const submitPayment = useSubmitSubscriptionPayment();
  const myRequests = useMySubscriptionPaymentRequests(!demo);

  const sub = current.data;
  const planList = plans.data ?? [];

  // Manual payment dialog state
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [selectedPlanCode, setSelectedPlanCode] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bkash");
  const [billingMonths, setBillingMonths] = useState(1);
  const [senderNumber, setSenderNumber] = useState("");
  const [trxId, setTrxId] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const now = Date.now();
  const expiresTime = sub?.expires_at ? new Date(sub.expires_at).getTime() : null;
  const isExpired = expiresTime ? expiresTime < now : false;
  const daysRemaining = expiresTime ? Math.ceil((expiresTime - now) / (1000 * 60 * 60 * 24)) : null;

  const targetPlan =
    planList.find((p) => p.code === (selectedPlanCode || sub?.plan_code)) ||
    planList[0];

  const calculatedAmount = (targetPlan?.price_monthly || 0) * billingMonths;

  const openPayDialog = (planCode?: string) => {
    setSelectedPlanCode(planCode || sub?.plan_code || "starter");
    setBillingMonths(1);
    setPaymentMethod("bkash");
    setSenderNumber("");
    setTrxId("");
    setPaymentNote("");
    setPayDialogOpen(true);
  };

  const handlePaymentSubmit = async () => {
    if (!trxId.trim() || !senderNumber.trim() || !targetPlan) return;
    await submitPayment.mutateAsync({
      plan_code: targetPlan.code,
      method: paymentMethod,
      trx_id: trxId.trim(),
      sender_number: senderNumber.trim(),
      amount: calculatedAmount,
      months: billingMonths,
      note: paymentNote.trim() || undefined,
    });
    setPayDialogOpen(false);
  };

  if (demo) {
    return (
      <>
        <PageHeader eyebrow="Billing" title="Subscription" subtitle="Sign in with backend to manage your plan." />
        <PageBody>
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Subscription management requires backend authentication.
          </div>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Billing"
        title="Subscription & Billing"
        subtitle={`Current plan: ${sub?.plan_name ?? sub?.plan_code ?? "None"}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge
              variant={isExpired ? "destructive" : "outline"}
              className={cn("gap-1 py-1 px-2.5", !isExpired && "border-primary/50 text-primary")}
            >
              <Crown className="h-3 w-3" />
              {isExpired ? "Expired" : sub?.status ?? "—"}
            </Badge>
            <Button
              size="sm"
              onClick={() => openPayDialog()}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium cursor-pointer shadow-xs"
            >
              <CreditCard className="h-3.5 w-3.5" />
              <span>Pay via bKash / Nagad</span>
            </Button>
          </div>
        }
      />
      <PageBody className="space-y-6">
        {/* Expiry Warning Alerts */}
        {isExpired && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/15 p-4 text-destructive dark:text-red-300 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <div>
                <div className="font-semibold text-sm">Subscription Expired</div>
                <div className="text-xs opacity-90">
                  Your store subscription expired on {sub?.expires_at ? new Date(sub.expires_at).toLocaleDateString() : "recently"}.
                  POS checkout is locked until renewed.
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => openPayDialog()}
              className="cursor-pointer font-bold shadow-xs"
            >
              Renew Immediately →
            </Button>
          </div>
        )}

        {!isExpired && daysRemaining !== null && daysRemaining <= 7 && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/15 p-4 text-amber-500 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <div>
                <div className="font-semibold text-sm">Subscription Expiring Soon</div>
                <div className="text-xs opacity-90">
                  Your plan will expire in <strong>{daysRemaining} day{daysRemaining === 1 ? "" : "s"}</strong> ({new Date(sub!.expires_at!).toLocaleDateString()}). Renew now to maintain seamless POS operations.
                </div>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => openPayDialog()}
              className="bg-amber-600 hover:bg-amber-700 text-white cursor-pointer font-medium shadow-xs"
            >
              Renew Plan →
            </Button>
          </div>
        )}

        <ReferralRewardsCard />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Plan" value={sub?.plan_name ?? "—"} />
          <StatCard label="Billing cycle" value={String(sub?.billing_cycle ?? "monthly")} />
          <StatCard
            label="Validity Period"
            value={
              sub?.started_at || sub?.expires_at
                ? `${sub?.started_at ? new Date(sub.started_at).toLocaleDateString() : "—"} → ${sub?.expires_at ? new Date(sub.expires_at).toLocaleDateString() : "—"}`
                : "—"
            }
          />
          <StatCard label="Stores limit" value={String(sub?.limits?.max_stores ?? "—")} />
        </div>

        {/* Packages Grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Available Subscription Packages</h2>
            <Button variant="outline" size="sm" onClick={() => openPayDialog()} className="gap-1.5 text-xs">
              <CreditCard className="h-3.5 w-3.5" />
              <span>Renew / Upgrade via Mobile Banking</span>
            </Button>
          </div>
          <SubscriptionPlanCards plans={planList} currentPlanCode={sub?.plan_code} />
          <div className="mt-6 flex flex-wrap gap-2">
            {planList.map((p) => (
              <Button
                key={p.code}
                size="sm"
                variant={sub?.plan_code === p.code ? "secondary" : "default"}
                onClick={() => openPayDialog(p.code)}
                className="cursor-pointer"
              >
                {sub?.plan_code === p.code ? `Pay / Extend ${p.name}` : `Upgrade to ${p.name}`}
              </Button>
            ))}
          </div>
        </div>

        {/* Payment History / Submitted Requests */}
        <SectionCard
          title="Payment Requests & Renewal History"
          description="Track the status of your manual mobile banking & bank transfers"
        >
          {(myRequests.data ?? []).length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No manual payment requests submitted yet. Click "Pay via bKash / Nagad" above to submit a renewal.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase">
                  <tr>
                    <th className="px-5 py-2 text-left">Package</th>
                    <th className="px-5 py-2 text-left">Method & TrxID</th>
                    <th className="px-5 py-2 text-left">Sender Phone</th>
                    <th className="px-5 py-2 text-left">Amount</th>
                    <th className="px-5 py-2 text-left">Submitted</th>
                    <th className="px-5 py-2 text-left">Status</th>
                    <th className="px-5 py-2 text-left">Note / Feedback</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(myRequests.data ?? []).map((req) => {
                    const detail = req.detail || {};
                    return (
                      <tr key={req.id}>
                        <td className="px-5 py-3 font-medium">
                          {detail.plan_name || detail.plan_code || "—"} ({detail.months ?? 1} mo)
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="uppercase text-[10px] font-bold">
                              {detail.method || "manual"}
                            </Badge>
                            <span className="font-mono text-xs">{detail.trx_id || "—"}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                          {detail.sender_number || "—"}
                        </td>
                        <td className="px-5 py-3 font-semibold text-emerald-500">
                          {fmtBDT(detail.amount || 0)}
                        </td>
                        <td className="px-5 py-3 text-xs text-muted-foreground">
                          {req.created_at ? new Date(req.created_at).toLocaleString() : "—"}
                        </td>
                        <td className="px-5 py-3">
                          {req.status === "pending" && (
                            <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-500 gap-1">
                              <Clock className="h-3 w-3" /> Under Review
                            </Badge>
                          )}
                          {req.status === "approved" && (
                            <Badge variant="outline" className="border-emerald-500/50 bg-emerald-500/10 text-emerald-500 gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Approved & Extended
                            </Badge>
                          )}
                          {req.status === "rejected" && (
                            <Badge variant="destructive" className="gap-1">
                              <XCircle className="h-3 w-3" /> Rejected
                            </Badge>
                          )}
                        </td>
                        <td className="px-5 py-3 text-xs text-muted-foreground">
                          {req.comment ? (
                            <span className="italic text-destructive/90">{req.comment}</span>
                          ) : (
                            detail.note || "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </PageBody>

      {/* Manual Payment Submission Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <span>Renew / Upgrade via bKash / Nagad / Bank</span>
            </DialogTitle>
            <DialogDescription>
              Transfer the subscription amount to our merchant account and submit the Transaction ID below for instant Super Admin verification.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            {/* Account Details Callout */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-2 text-xs">
              <div className="font-semibold text-foreground text-xs uppercase tracking-wide flex items-center gap-1.5">
                <Smartphone className="h-3.5 w-3.5 text-primary" />
                <span>Official Payment Accounts (Bangladesh)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                <div className="bg-background/80 p-2 rounded border border-border/60">
                  <div className="text-muted-foreground font-sans text-[10px]">bKash Merchant / Personal:</div>
                  <div className="font-bold text-foreground">01711-223344</div>
                  <div className="text-[10px] text-muted-foreground font-sans">Option: Send Money / Payment</div>
                </div>
                <div className="bg-background/80 p-2 rounded border border-border/60">
                  <div className="text-muted-foreground font-sans text-[10px]">Nagad Personal:</div>
                  <div className="font-bold text-foreground">01811-223344</div>
                  <div className="text-[10px] text-muted-foreground font-sans">Option: Send Money</div>
                </div>
              </div>
              <div className="bg-background/80 p-2 rounded border border-border/60 text-[11px]">
                <div className="text-muted-foreground font-sans text-[10px] flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Bank Transfer:
                </div>
                <div className="font-semibold text-foreground">City Bank Ltd · A/C: 1502938475001</div>
                <div className="text-[10px] text-muted-foreground">Account Name: Pulse POS BD</div>
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Select Package</Label>
                <Select value={selectedPlanCode || targetPlan?.code} onValueChange={setSelectedPlanCode}>
                  <SelectTrigger><SelectValue placeholder="Choose package" /></SelectTrigger>
                  <SelectContent>
                    {planList.map((p) => (
                      <SelectItem key={p.code} value={p.code}>
                        {p.name} ({fmtBDT(p.price_monthly)}/mo)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Duration (Months)</Label>
                <Select value={String(billingMonths)} onValueChange={(v) => setBillingMonths(Number(v) || 1)}>
                  <SelectTrigger><SelectValue placeholder="Duration" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 Month</SelectItem>
                    <SelectItem value="3">3 Months</SelectItem>
                    <SelectItem value="6">6 Months</SelectItem>
                    <SelectItem value="12">12 Months (1 Year)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg bg-secondary/50 p-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Total Payable Amount:</div>
                <div className="font-mono text-lg font-bold text-emerald-500">
                  {fmtBDT(calculatedAmount)}
                </div>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                {billingMonths} mo × {fmtBDT(targetPlan?.price_monthly || 0)}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue placeholder="Payment Method" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bkash">bKash</SelectItem>
                    <SelectItem value="nagad">Nagad</SelectItem>
                    <SelectItem value="rocket">Rocket</SelectItem>
                    <SelectItem value="bank">Bank Transfer</SelectItem>
                    <SelectItem value="cash">Cash / Direct</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Sender Phone / Account <span className="text-destructive">*</span></Label>
                <Input
                  value={senderNumber}
                  onChange={(e) => setSenderNumber(e.target.value)}
                  placeholder="017xxxxxxxx"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Transaction ID (TrxID) <span className="text-destructive">*</span></Label>
              <Input
                value={trxId}
                onChange={(e) => setTrxId(e.target.value.toUpperCase())}
                placeholder="e.g. 9JA8KL429P"
                className="font-mono uppercase tracking-wider font-semibold"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Enter the exact Transaction ID received in SMS after payment.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Additional Note (Optional)</Label>
              <Input
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="e.g. Reference name or branch details"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!trxId.trim() || !senderNumber.trim() || submitPayment.isPending}
              onClick={handlePaymentSubmit}
              className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer font-semibold shadow-xs"
            >
              {submitPayment.isPending ? "Submitting…" : "Submit Payment Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

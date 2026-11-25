import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { INDUSTRY_PACKS } from "@/lib/industry-registry";
import { useOnboardTenantPublic, useSubscriptionPlans } from "@/hooks/use-api-config";
import { isDemoMode } from "@/lib/demo-mode";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Check, Gift, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { slugCompanyCode } from "@/lib/tenant-branding";
import { fmtBDT } from "@/lib/pos-data";
import { getStoredReferralContext } from "@/lib/referral-browser";

export const Route = createFileRoute("/onboarding")({ component: OnboardingPage });

const STEPS = ["company", "packs", "store", "warehouse", "counter", "admin", "plan", "review"] as const;
type Step = typeof STEPS[number];

const STEP_LABELS: Record<Step, string> = {
  company: "Company",
  packs: "Industry packs",
  store: "Store",
  warehouse: "Warehouse",
  counter: "Counter",
  admin: "Admin user",
  plan: "Plan",
  review: "Review",
};

function OnboardingPage() {
  const navigate = useNavigate();
  const demo = isDemoMode();
  const { data: plans } = useSubscriptionPlans(!demo);
  const onboard = useOnboardTenantPublic();
  const [stepIdx, setStepIdx] = useState(0);

  const initialReferral = getStoredReferralContext()?.referralCode || "";

  const [form, setForm] = useState({
    company_code: "",
    company_name: "",
    legal_name: "",
    tax_id: "",
    brand_name: "",
    store_code: "STORE-01",
    store_name: "Main Store",
    store_address: "",
    warehouse_code: "WH-01",
    warehouse_name: "Main Warehouse",
    counter_code: "CTR-01",
    counter_name: "Counter 1",
    admin_email: "",
    admin_username: "",
    admin_name: "",
    admin_password: "",
    industry_packs: ["grocery"] as string[],
    plan_code: "starter",
    referral_code: initialReferral,
  });


  const step = STEPS[stepIdx];
  const set = (k: string, v: string | string[]) => setForm(prev => ({ ...prev, [k]: v }));

  const togglePack = (code: string) => {
    setForm(prev => ({
      ...prev,
      industry_packs: prev.industry_packs.includes(code)
        ? prev.industry_packs.filter(p => p !== code)
        : [...prev.industry_packs, code],
    }));
  };

  const next = () => setStepIdx(i => Math.min(i + 1, STEPS.length - 1));
  const back = () => setStepIdx(i => Math.max(i - 1, 0));

  const submit = () => {
    if (demo) {
      toast.success("Demo mode — onboarding preview only");
      navigate({ to: "/login" });
      return;
    }
    const payload = {
      ...form,
      company_code: form.company_code.trim() || slugCompanyCode(form.company_name || "TENANT"),
    };
    onboard.mutate(payload, { onSuccess: () => navigate({ to: "/login" }) });
  };

  const planOptions = plans ?? [
    { code: "starter", name: "Starter", price_monthly: 2990, max_stores: 1, max_counters: 2, max_users: 2, max_industry_packs: 1, advanced_reports: false, offline_sync: false, api_integration: false },
    { code: "professional", name: "Professional", price_monthly: 7990, max_stores: 5, max_counters: 20, max_users: 50, max_industry_packs: 3, advanced_reports: true, offline_sync: true, api_integration: false },
    { code: "enterprise", name: "Enterprise", price_monthly: 19990, max_stores: 999, max_counters: 999, max_users: 999, max_industry_packs: 99, advanced_reports: true, offline_sync: true, api_integration: true },
  ];

  return (
    <div className="min-h-screen page-gradient">
      <PageHeader
        eyebrow="SaaS signup"
        title="Create your workspace"
        subtitle="Set up your company and request a subscription. A platform admin must approve before you can sign in."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/landing">Back to home</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        }
      />
      <PageBody className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap gap-2">
          {STEPS.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setStepIdx(i)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                i === stepIdx ? "bg-primary text-primary-foreground" : i < stepIdx ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground",
              )}
            >
              {i < stepIdx ? <Check className="h-3 w-3" /> : null}
              {STEP_LABELS[s]}
            </button>
          ))}
        </div>

        <SectionCard title={STEP_LABELS[step]}>
          <div className="p-4 sm:p-5 space-y-4">
            {step === "company" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Company code</Label><Input value={form.company_code} onChange={e => set("company_code", e.target.value.toUpperCase())} placeholder="ACME-RETAIL" /></div>
                <div><Label>Company name</Label><Input value={form.company_name} onChange={e => set("company_name", e.target.value)} /></div>
                <div><Label>Legal name</Label><Input value={form.legal_name} onChange={e => set("legal_name", e.target.value)} /></div>
                <div><Label>Tax ID</Label><Input value={form.tax_id} onChange={e => set("tax_id", e.target.value)} /></div>
                <div className="sm:col-span-2"><Label>Brand name</Label><Input value={form.brand_name} onChange={e => set("brand_name", e.target.value)} /></div>
                <div className="sm:col-span-2 pt-2 border-t border-border">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Gift className="h-4 w-4 text-primary" />
                    <Label className="font-medium text-xs text-foreground">Referral Code (Optional)</Label>
                  </div>
                  <div className="relative">
                    <Input
                      value={form.referral_code}
                      onChange={e => set("referral_code", e.target.value.toUpperCase())}
                      placeholder="e.g. RAHIM82 or STORE-01"
                      className="font-mono text-sm tracking-wider uppercase pr-10"
                    />
                    {form.referral_code && form.referral_code.length >= 3 && (
                      <div className="absolute right-3 top-2.5 text-emerald-600">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  {form.referral_code && form.referral_code.length >= 3 && (
                    <p className="mt-1 text-[11px] text-emerald-600 font-medium">
                      ✓ Referral code applied! Connected affiliate benefits will be attributed.
                    </p>
                  )}
                </div>
              </div>
            )}

            {step === "packs" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Select one or more retail vertical packs for your stores. The first selected pack will be configured as your primary default POS lane.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {INDUSTRY_PACKS.map(p => {
                    const isSelected = form.industry_packs.includes(p.id);
                    const isPrimary = form.industry_packs[0] === p.id;
                    return (
                      <label key={p.id} className={cn("flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors", isSelected ? "border-primary/50 bg-primary/5" : "border-border hover:bg-secondary/50")}>
                        <Checkbox checked={isSelected} onCheckedChange={() => togglePack(p.id)} className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-foreground">{p.shortName}</span>
                            {isPrimary && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/20">
                                Primary Default
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{p.description}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {step === "store" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Store code</Label><Input value={form.store_code} onChange={e => set("store_code", e.target.value)} /></div>
                <div><Label>Store name</Label><Input value={form.store_name} onChange={e => set("store_name", e.target.value)} /></div>
                <div className="sm:col-span-2"><Label>Address</Label><Input value={form.store_address} onChange={e => set("store_address", e.target.value)} /></div>
              </div>
            )}
            {step === "warehouse" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Warehouse code</Label><Input value={form.warehouse_code} onChange={e => set("warehouse_code", e.target.value)} /></div>
                <div><Label>Warehouse name</Label><Input value={form.warehouse_name} onChange={e => set("warehouse_name", e.target.value)} /></div>
              </div>
            )}
            {step === "counter" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Counter code</Label><Input value={form.counter_code} onChange={e => set("counter_code", e.target.value)} /></div>
                <div><Label>Counter name</Label><Input value={form.counter_name} onChange={e => set("counter_name", e.target.value)} /></div>
              </div>
            )}
            {step === "admin" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Admin email</Label><Input type="email" value={form.admin_email} onChange={e => set("admin_email", e.target.value)} /></div>
                <div><Label>Username</Label><Input value={form.admin_username} onChange={e => set("admin_username", e.target.value)} /></div>
                <div><Label>Full name</Label><Input value={form.admin_name} onChange={e => set("admin_name", e.target.value)} /></div>
                <div><Label>Password</Label><PasswordInput value={form.admin_password} onChange={e => set("admin_password", e.target.value)} /></div>
              </div>
            )}
            {step === "plan" && (
              <div className="grid gap-3">
                {planOptions.map(p => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => set("plan_code", p.code)}
                    className={cn(
                      "rounded-lg border p-4 text-left transition-colors",
                      form.plan_code === p.code ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/50",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{p.name}</span>
                      <Badge variant="outline">{fmtBDT(p.price_monthly)}/mo</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {p.max_stores} stores · {p.max_counters} counters · {p.max_users} users · {p.max_industry_packs} packs
                    </div>
                  </button>
                ))}
              </div>
            )}
            {step === "review" && (
              <div className="space-y-3 text-sm">
                <div><span className="text-muted-foreground">Company:</span> {form.company_name} ({form.company_code})</div>
                <div><span className="text-muted-foreground">Packs:</span> {form.industry_packs.join(", ")}</div>
                <div><span className="text-muted-foreground">Store:</span> {form.store_name} · {form.store_code}</div>
                <div><span className="text-muted-foreground">Admin:</span> {form.admin_email}</div>
                <div><span className="text-muted-foreground">Plan:</span> {form.plan_code}</div>
                {form.referral_code && (
                  <div>
                    <span className="text-muted-foreground">Referral:</span>{" "}
                    <Badge variant="secondary" className="font-mono text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                      {form.referral_code}
                    </Badge>
                  </div>
                )}
                {demo && <p className="text-xs text-warning">Demo mode — submit will not call the API.</p>}
              </div>
            )}

          </div>
          <div className="flex justify-between border-t border-border px-5 py-3">
            <Button variant="outline" size="sm" onClick={back} disabled={stepIdx === 0} className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            {step === "review" ? (
              <Button size="sm" onClick={submit} disabled={onboard.isPending} className="gap-1">
                {onboard.isPending ? "Creating…" : "Create workspace"}
              </Button>
            ) : (
              <Button size="sm" onClick={next} className="gap-1">
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </SectionCard>
      </PageBody>
    </div>
  );
}

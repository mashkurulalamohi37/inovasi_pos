import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles } from "lucide-react";
import type { ApiSubscriptionPlan } from "@/hooks/use-api-config";
import { fmtBDT } from "@/lib/pos-data";

type PlanCardTheme = {
  card: string;
  glow: string;
  accent: string;
  check: string;
  topBar: string;
};

const PLAN_THEMES: Record<string, PlanCardTheme> = {
  starter: {
    card: "border-sky-200/80 bg-gradient-to-br from-sky-50/90 via-cyan-50/60 to-card dark:from-sky-950/45 dark:via-cyan-950/35 dark:to-card dark:border-sky-800/50",
    glow: "bg-sky-400/20",
    accent: "text-sky-700 dark:text-sky-300",
    check: "text-sky-600 dark:text-sky-400",
    topBar: "from-sky-500 via-cyan-400 to-sky-400",
  },
  professional: {
    card: "border-orange-300/80 bg-gradient-to-br from-orange-50 via-amber-50/90 to-card dark:from-orange-950/50 dark:via-amber-950/40 dark:to-card dark:border-orange-700/60",
    glow: "bg-orange-400/25",
    accent: "text-orange-700 dark:text-orange-300",
    check: "text-orange-600 dark:text-orange-400",
    topBar: "from-orange-500 via-amber-500 to-yellow-500",
  },
  enterprise: {
    card: "border-amber-300/80 bg-gradient-to-br from-stone-100 via-amber-50/70 to-orange-50/60 dark:from-stone-900/70 dark:via-amber-950/35 dark:to-orange-950/30 dark:border-amber-700/50",
    glow: "bg-amber-500/20",
    accent: "text-amber-800 dark:text-amber-300",
    check: "text-amber-700 dark:text-amber-400",
    topBar: "from-amber-700 via-orange-500 to-amber-400",
  },
};

const DEFAULT_THEME: PlanCardTheme = {
  card: "border-primary/25 bg-gradient-to-br from-primary/5 via-card to-amber-50/50 dark:from-primary/10 dark:via-card dark:to-amber-950/30",
  glow: "bg-primary/15",
  accent: "text-primary",
  check: "text-primary",
  topBar: "from-primary via-amber-500 to-orange-400",
};

function getPlanTheme(planCode: string, index: number): PlanCardTheme {
  const key = planCode.toLowerCase().replace(/[^a-z0-9]/g, "");
  const themes = Object.values(PLAN_THEMES);
  return PLAN_THEMES[key] ?? themes[index % themes.length] ?? DEFAULT_THEME;
}

export function SubscriptionPlanCards({
  plans,
  currentPlanCode,
  className,
  mode = "view",
  selectedPlanCode,
  onSelectPlan,
  billingInterval = "monthly",
}: {
  plans: ApiSubscriptionPlan[];
  currentPlanCode?: string | null;
  className?: string;
  mode?: "view" | "select";
  selectedPlanCode?: string | null;
  onSelectPlan?: (planCode: string) => void;
  billingInterval?: "monthly" | "annual";
}) {
  const isSelectMode = mode === "select";
  const isAnnual = billingInterval === "annual";

  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {plans.map((plan, index) => {
        const isCurrent = currentPlanCode && plan.code.toLowerCase() === currentPlanCode.toLowerCase();
        const isSelected =
          isSelectMode && selectedPlanCode && plan.code.toLowerCase() === selectedPlanCode.toLowerCase();
        const theme = getPlanTheme(plan.code, index);
        const CardWrapper = isSelectMode ? "button" : "div";
        const displayedMonthlyPrice = isAnnual && plan.price_monthly > 0
          ? Math.round(plan.price_monthly * 0.8)
          : plan.price_monthly;

        return (
          <CardWrapper
            key={plan.code}
            type={isSelectMode ? "button" : undefined}
            onClick={isSelectMode && onSelectPlan ? () => onSelectPlan(plan.code) : undefined}
            className={cn(
              "group relative w-full overflow-hidden rounded-2xl border p-5 text-left shadow-md transition-all duration-500",
              theme.card,
              "hover:-translate-y-1.5 hover:shadow-xl",
              isSelectMode && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              (isCurrent || isSelected) && "border-primary/60 shadow-lg shadow-primary/15 ring-2 ring-primary/70",
            )}
          >
            <div className={cn("absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r opacity-90", theme.topBar, isCurrent && "animate-pulse")} />
            <div className={cn("absolute -right-8 -top-8 h-28 w-28 rounded-full blur-2xl transition-transform duration-500 group-hover:scale-150", theme.glow)} />
            <div className="relative mb-3 flex items-start justify-between gap-2">
              <div>
                <p className={cn("text-xs font-semibold uppercase tracking-wider opacity-80", theme.accent)}>{plan.code}</p>
                <h3 className="mt-0.5 text-lg font-bold text-foreground">{plan.name}</h3>
              </div>
              {isSelected || isCurrent ? (
                <Badge className="shrink-0 gap-1 border-0 brand-gradient text-white shadow-sm">
                  <Sparkles className="h-3 w-3" />
                  {isSelected ? "Selected" : "Current"}
                </Badge>
              ) : isAnnual && plan.price_monthly > 0 ? (
                <Badge variant="outline" className="shrink-0 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px]">
                  Save 20%
                </Badge>
              ) : null}
            </div>
            <p className={cn("relative text-3xl font-bold tracking-tight", theme.accent)}>
              {plan.price_monthly > 0 ? (
                <>
                  {fmtBDT(displayedMonthlyPrice)}
                  <span className="text-sm font-normal opacity-70">/mo</span>
                  {isAnnual && <span className="block text-[11px] font-normal text-muted-foreground mt-0.5">billed annually</span>}
                </>
              ) : (
                <span className="text-xl">Contact us</span>
              )}
            </p>
            <ul className="relative mt-4 space-y-2 text-sm text-foreground/80">
              <li className="flex items-center gap-2">
                <Check className={cn("h-4 w-4 shrink-0", theme.check)} />
                {plan.max_users} users · {plan.max_stores} stores
              </li>
              <li className="flex items-center gap-2">
                <Check className={cn("h-4 w-4 shrink-0", theme.check)} />
                {plan.max_counters} counters · {plan.max_industry_packs} industry packs
              </li>
              {plan.offline_sync && (
                <li className="flex items-center gap-2">
                  <Check className={cn("h-4 w-4 shrink-0", theme.check)} />
                  Offline sync included
                </li>
              )}
              {plan.advanced_reports && (
                <li className="flex items-center gap-2">
                  <Check className={cn("h-4 w-4 shrink-0", theme.check)} />
                  Advanced reports
                </li>
              )}
            </ul>
          </CardWrapper>
        );
      })}
    </div>
  );
}

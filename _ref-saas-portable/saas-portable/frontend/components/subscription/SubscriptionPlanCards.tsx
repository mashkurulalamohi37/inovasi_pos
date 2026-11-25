import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles } from "lucide-react";
import type { SubscriptionPlanRow } from "@/lib/api-client";

interface SubscriptionPlanCardsProps {
  plans: SubscriptionPlanRow[];
  currentPlanCode?: string | null;
  className?: string;
  /** When set, cards are clickable to pick a plan (onboarding). */
  mode?: "view" | "select";
  selectedPlanCode?: string | null;
  onSelectPlan?: (planCode: string) => void;
}

interface PlanCardTheme {
  card: string;
  glow: string;
  accent: string;
  check: string;
  topBar: string;
}

const PLAN_THEMES: Record<string, PlanCardTheme> = {
  trial: {
    card: "border-sky-200/80 bg-gradient-to-br from-sky-50 via-cyan-50 to-blue-100/70 dark:from-sky-950/50 dark:via-cyan-950/40 dark:to-blue-900/30 dark:border-sky-800/50",
    glow: "bg-sky-400/20",
    accent: "text-sky-700 dark:text-sky-300",
    check: "text-sky-600 dark:text-sky-400",
    topBar: "from-sky-400 via-cyan-400 to-blue-500",
  },
  starter: {
    card: "border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-teal-50 to-green-100/70 dark:from-emerald-950/50 dark:via-teal-950/40 dark:to-green-900/30 dark:border-emerald-800/50",
    glow: "bg-emerald-400/20",
    accent: "text-emerald-700 dark:text-emerald-300",
    check: "text-emerald-600 dark:text-emerald-400",
    topBar: "from-emerald-400 via-teal-400 to-green-500",
  },
  enterprise: {
    card: "border-violet-200/80 bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-100/60 dark:from-violet-950/50 dark:via-purple-950/40 dark:to-fuchsia-900/30 dark:border-violet-800/50",
    glow: "bg-violet-400/20",
    accent: "text-violet-700 dark:text-violet-300",
    check: "text-violet-600 dark:text-violet-400",
    topBar: "from-violet-500 via-purple-400 to-fuchsia-500",
  },
  professional: {
    card: "border-amber-200/80 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-100/60 dark:from-amber-950/50 dark:via-orange-950/40 dark:to-yellow-900/30 dark:border-amber-800/50",
    glow: "bg-amber-400/25",
    accent: "text-amber-800 dark:text-amber-300",
    check: "text-amber-600 dark:text-amber-400",
    topBar: "from-amber-400 via-orange-400 to-yellow-500",
  },
};

const DEFAULT_THEME: PlanCardTheme = {
  card: "border-primary/25 bg-gradient-to-br from-primary/5 via-card to-teal-50/50 dark:from-primary/10 dark:via-card dark:to-teal-950/30",
  glow: "bg-primary/15",
  accent: "text-primary",
  check: "text-primary",
  topBar: "from-primary via-emerald-400 to-teal-500",
};

const FALLBACK_PALETTE: PlanCardTheme[] = [
  PLAN_THEMES.trial,
  PLAN_THEMES.starter,
  PLAN_THEMES.enterprise,
  PLAN_THEMES.professional,
];

function getPlanTheme(planCode: string, index: number): PlanCardTheme {
  const key = planCode.toLowerCase().replace(/[^a-z0-9]/g, "");
  return PLAN_THEMES[key] ?? FALLBACK_PALETTE[index % FALLBACK_PALETTE.length] ?? DEFAULT_THEME;
}

export function SubscriptionPlanCards({
  plans,
  currentPlanCode,
  className,
  mode = "view",
  selectedPlanCode,
  onSelectPlan,
}: SubscriptionPlanCardsProps) {
  const activePlans = plans.filter((p) => p.is_active !== false);
  const isSelectMode = mode === "select";

  return (
    <div
      className={cn(
        "grid gap-4 sm:grid-cols-2 xl:grid-cols-4",
        className
      )}
    >
      {activePlans.map((plan, index) => {
        const isCurrent =
          currentPlanCode &&
          plan.code.toLowerCase() === currentPlanCode.toLowerCase();
        const isSelected =
          isSelectMode &&
          selectedPlanCode &&
          plan.code.toLowerCase() === selectedPlanCode.toLowerCase();
        const theme = getPlanTheme(plan.code, index);
        const CardWrapper = isSelectMode ? "button" : "div";
        return (
          <CardWrapper
            key={plan.code}
            type={isSelectMode ? "button" : undefined}
            onClick={
              isSelectMode && onSelectPlan
                ? () => onSelectPlan(plan.code)
                : undefined
            }
            className={cn(
              "group relative overflow-hidden rounded-2xl border p-5 shadow-md transition-all duration-500 text-left w-full",
              theme.card,
              "hover:-translate-y-1.5 hover:shadow-xl",
              isSelectMode && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              (isCurrent || isSelected) &&
                "ring-2 ring-primary/70 border-primary/60 shadow-lg shadow-primary/15",
              !isCurrent && !isSelected && "animate-in fade-in slide-in-from-bottom-4"
            )}
            style={{ animationDelay: `${index * 80}ms`, animationFillMode: "backwards" }}
          >
            <div
              className={cn(
                "absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r opacity-90",
                theme.topBar,
                isCurrent && "animate-pulse"
              )}
            />
            <div
              className={cn(
                "absolute -right-8 -top-8 h-28 w-28 rounded-full blur-2xl transition-transform duration-500 group-hover:scale-150",
                theme.glow
              )}
            />
            <div
              className={cn(
                "absolute -left-10 bottom-0 h-20 w-20 rounded-full blur-2xl opacity-60",
                theme.glow
              )}
            />
            <div className="relative flex items-start justify-between gap-2 mb-3">
              <div>
                <p
                  className={cn(
                    "text-xs font-semibold uppercase tracking-wider opacity-80",
                    theme.accent
                  )}
                >
                  {plan.code}
                </p>
                <h3 className="text-lg font-bold mt-0.5 text-foreground">{plan.name}</h3>
              </div>
              {isSelected ? (
                <Badge className="shrink-0 gap-1 bg-gradient-to-r from-primary to-emerald-600 border-0 shadow-sm">
                  <Sparkles className="h-3 w-3" />
                  Selected
                </Badge>
              ) : isCurrent ? (
                <Badge className="shrink-0 gap-1 bg-gradient-to-r from-primary to-emerald-600 border-0 shadow-sm">
                  <Sparkles className="h-3 w-3" />
                  Current
                </Badge>
              ) : null}
            </div>
            <p className={cn("relative text-3xl font-bold tracking-tight", theme.accent)}>
              {plan.price_monthly > 0 ? (
                <>
                  <span className="text-base font-normal opacity-70">৳</span>
                  {plan.price_monthly}
                  <span className="text-sm font-normal opacity-70">/mo</span>
                </>
              ) : (
                <span className="text-xl">Free trial</span>
              )}
            </p>
            <ul className="relative mt-4 space-y-2 text-sm text-foreground/80">
              <li className="flex items-center gap-2">
                <Check className={cn("h-4 w-4 shrink-0", theme.check)} />
                {plan.max_users < 0 ? "Unlimited" : plan.max_users} users
              </li>
              <li className="flex items-center gap-2">
                <Check className={cn("h-4 w-4 shrink-0", theme.check)} />
                {plan.max_locations < 0 ? "Unlimited" : plan.max_locations} stores
              </li>
            </ul>
          </CardWrapper>
        );
      })}
    </div>
  );
}

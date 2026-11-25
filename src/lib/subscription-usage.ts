export type UsageMetric = {
  current: number;
  limit: number;
};

export type SubscriptionUsage = {
  plan_code: string | null;
  usage: Record<string, UsageMetric>;
  warnings?: Array<{ metric: string; usage_pct: number; message: string }>;
};

export function computeUsageWarnings(usage: Record<string, UsageMetric>) {
  const warnings: Array<{ metric: string; usage_pct: number; message: string }> = [];
  for (const [metric, data] of Object.entries(usage)) {
    if (!data.limit) continue;
    const pct = (data.current / data.limit) * 100;
    if (pct >= 80) {
      warnings.push({
        metric,
        usage_pct: Math.round(pct * 10) / 10,
        message: pct >= 100 ? "Limit reached" : "80% usage reached",
      });
    }
  }
  return warnings;
}

export function hasUsageWarnings(sub: SubscriptionUsage): boolean {
  const warnings = sub.warnings ?? computeUsageWarnings(sub.usage);
  return warnings.length > 0;
}

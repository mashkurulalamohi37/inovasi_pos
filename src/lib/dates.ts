/** Local calendar date as `YYYY-MM-DD` for `<input type="date">` defaults. */
export function todayInputDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local calendar date N days before today as `YYYY-MM-DD`. */
export function daysAgoInputDate(days: number, d = new Date()): string {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - days);
  return todayInputDate(copy);
}

/** Default From/To range: both set to today so date inputs are never blank. */
export function todayDateRange(): { from: string; to: string } {
  const today = todayInputDate();
  return { from: today, to: today };
}

/** Inclusive local-day range for list APIs (avoids midnight cutoff on `to`). */
export function dateInputRangeForApi(from?: string, to?: string): {
  from_date?: string;
  to_date?: string;
} {
  return {
    ...(from ? { from_date: `${from}T00:00:00` } : {}),
    ...(to ? { to_date: `${to}T23:59:59.999` } : {}),
  };
}

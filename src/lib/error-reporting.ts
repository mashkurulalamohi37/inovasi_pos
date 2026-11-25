/** Client-side error reporting hook — extend for Sentry/Datadog in production. */
export function reportAppError(error: unknown, context: Record<string, unknown> = {}) {
  if (import.meta.env.DEV) {
    console.error("[Pulse POS]", context, error);
  }
}

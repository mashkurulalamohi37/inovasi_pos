import { shouldUseBackend } from "./demo-mode";

/** True when authenticated live session — never show mock catalog/data. */
export function isLiveSession(): boolean {
  return shouldUseBackend();
}

export type LiveDataResult<T> = {
  rows: T[];
  isEmpty: boolean;
  usingDemo: boolean;
};

/**
 * Resolve table rows: demo data only when not on backend; live sessions never fall back to mocks.
 */
export function resolveLiveRows<T>(
  useApi: boolean,
  apiRows: T[],
  isLoading: boolean,
  demoRows: T[],
): LiveDataResult<T> {
  if (!useApi) {
    return { rows: demoRows, isEmpty: demoRows.length === 0, usingDemo: true };
  }
  if (isLoading) {
    return { rows: [], isEmpty: false, usingDemo: false };
  }
  return { rows: apiRows, isEmpty: apiRows.length === 0, usingDemo: false };
}

export const EMPTY_LIVE_LABEL = "No records yet. Add data or import from CSV.";

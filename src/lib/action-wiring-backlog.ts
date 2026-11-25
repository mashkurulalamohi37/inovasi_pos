/**
 * Action-wiring backlog (single source of truth for the production route guard).
 *
 * Files listed here still contain a demo/mock-style success action that has NOT
 * yet been professionalised. Each is scheduled for a later stabilization phase.
 * The guard test (src/test/production-route-guard.test.ts) allows these known
 * files to contain a demo-success pattern but FAILS if any *other* production
 * route introduces one — creating a ratchet that can only shrink.
 *
 * RULES:
 *  - Never add a new entry to reintroduce a fake success. Fix it instead.
 *  - When a phase professionalises a file, REMOVE it from this list so the
 *    guard permanently locks that file against regressions.
 *  - `coming soon` / `demo only` / `not implemented` / `placeholder action` /
 *    `fake success` are hard-forbidden everywhere and are NOT waivable here.
 */

export type BacklogPhase = "phase-2" | "phase-3" | "phase-4" | "phase-5" | "phase-6" | "phase-7";

export interface BacklogEntry {
  /** Path relative to repo root, POSIX separators. */
  file: string;
  phase: BacklogPhase;
  reason: string;
}

export const ACTION_WIRING_BACKLOG: BacklogEntry[] = [
  // ---- Phase 4: Reporting rebuild ----
  {
    file: "src/routes/app.beef-shop.reports.tsx",
    phase: "phase-4",
    reason: "Client-side export toast instead of server report export.",
  },
  {
    file: "src/routes/app.beef-shop.dashboard.tsx",
    phase: "phase-4",
    reason: "Dashboard CSV export is client-side toast.",
  },
  {
    file: "src/routes/app.audit-logs.tsx",
    phase: "phase-4",
    reason: "Audit export shows queued toast; wire real export endpoint.",
  },

  // ---- Phase 6: Vertical back-office wiring ----
  {
    file: "src/routes/app.tailoring.measurements.tsx",
    phase: "phase-6",
    reason: "Measurements save is toast-only.",
  },
  {
    file: "src/routes/app.rice-mill.variety.tsx",
    phase: "phase-6",
    reason: "Variety stock update is toast-only.",
  },
  {
    file: "src/routes/app.furniture.delivery.tsx",
    phase: "phase-6",
    reason: "Delivery schedule/status are toast-only.",
  },
];

export const BACKLOG_FILES: ReadonlySet<string> = new Set(
  ACTION_WIRING_BACKLOG.map((e) => e.file),
);

export function backlogForPhase(phase: BacklogPhase): BacklogEntry[] {
  return ACTION_WIRING_BACKLOG.filter((e) => e.phase === phase);
}

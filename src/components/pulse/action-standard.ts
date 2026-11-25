/**
 * Global Action Wiring Standard (Phase 1)
 * =======================================
 * Every production page in backend mode must follow this contract:
 *
 *  - List pages render one of LoadingState / ErrorState / EmptyState — never a
 *    silent mock fallback while authenticated.
 *  - Create/Edit forms use EntityFormDrawer as a full page (Back returns to the
 *    previous menu) with a real async submit wired to a TanStack Query mutation
 *    (loading + inline error surfaced by the form shell).
 *  - Destructive / financial / posting actions (delete, cancel, approve, post,
 *    refund) route through ConfirmActionDialog.
 *  - Actions are gated by RBAC via PermissionGate and by tenant capability via
 *    FeatureFlagGate.
 *  - An action button must EITHER perform the real action OR render as a
 *    DisabledReasonButton with an honest reason. It must never fire a fake
 *    success toast, "coming soon", "demo only", or "not implemented".
 *  - Export/Print use ExportButton / PrintButton which call real handlers.
 *  - Business documents expose history via AuditTrailPanel (real audit data).
 *
 * The production route guard test (src/test/production-route-guard.test.ts)
 * enforces the "no fake success / no forbidden strings" part of this standard.
 */

export { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
export { PermissionGate, FeatureFlagGate } from "@/components/pulse/gates";
export { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
export { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
export { ExportButton, PrintButton, DisabledReasonButton } from "@/components/pulse/ActionButtons";
export { AuditTrailPanel, type AuditTrailEntry } from "@/components/pulse/AuditTrailPanel";

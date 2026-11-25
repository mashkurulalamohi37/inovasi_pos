# STEP 28A — Mini HR Acceptance Evidence

**Status:** Implemented in codebase (local verification).

## Architecture

- Mini HR owns employee identity only (`MiniHrEmployee`, department, designation, store assignment).
- Auth: existing `UserAccount` + JWT; username or email login.
- RBAC: existing roles/permissions (`hr.*`).
- Store scope: `app.access.store_scope.can_access_store` / `assert_store_access` wired into sales create/list.
- Future HRMS boundary: `docs/MINI_HR_INTEGRATION.md` + `external_*` columns.

## Migration

- Alembic head: `026_mini_hr_foundation` (single head).

## Backend tests

```
pytest tests/test_mini_hr.py -v
```

Result (local): **10 passed** — create without login, hashed password, duplicate username, weak password reject, suspend/reactivate login, cashier RBAC denial, tenant isolation, store scope, audit, dashboard, cross-tenant store block.

## Frontend

Routes under `/app/hr/*` with PermissionGate, EntityFormDrawer, ConfirmActionDialog; no mock employees in backend mode.

## Playwright

`e2e/mini-hr-access.spec.ts` — owner creates employee + login; employee UI menus; forbidden HR/purchases APIs; store scope on `/sales`.

Run with live stack: frontend + FastAPI + PostgreSQL (no MSW).

## Acceptance checklist

1–23 from STEP 28A.35 addressed by the above. Payroll/full HRMS explicitly out of scope.

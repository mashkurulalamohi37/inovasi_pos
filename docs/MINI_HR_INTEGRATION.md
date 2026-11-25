# Mini HR — Integration Boundary (STEP 28A)

Mini HR is a **bounded employee-identity layer**. It does not replace authentication, RBAC, or store master data.

## Ownership split

| Concern | Owner |
|--------|--------|
| Employee profile, department, designation, employment status | Mini HR |
| Credentials (username, password hash, login enable/disable) | `UserAccount` + JWT auth |
| Roles & permissions | Existing RBAC (`Role`, `Permission`, `UserRole`) |
| Menu visibility | Frontend gates driven by permissions |
| API authorization | Backend `require_permission` |
| Where work is allowed | Store assignments + `app.access.store_scope` |

```
External Full HRMS (future)
        ↓
Mini HR Integration Adapter (future)
        ↓
Employee Identity (MiniHrEmployee)
        ↓
User Account (optional 0..1)
        ↓
RBAC
        ↓
Store Scope
```

## Future HRMS fields (schema ready, sync not implemented)

- `external_employee_id`
- `external_source`
- `external_sync_at`

Future sync should support create / update / deactivate. **Never** hard-delete historical employees or overwrite local RBAC unless an explicit integration policy allows it.

## Out of scope (full HRMS later)

Payroll, tax, PF, recruitment, appraisal, biometric attendance, overtime, leave encashment, loans, final settlement, government forms.

## APIs

All under `/api/v1/mini-hr/...` — see OpenAPI and `backend/app/api/v1/mini_hr.py`.

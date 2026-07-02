# settings/users — detail parity audit (Cohort L)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Reference:** `analitika/sozlamalar/rollar` (sibling role/employee admin surface). moysklad capture `00-module/role` (access module).
**Pages:** `settings/users/[id]` (no `/new`).

## A. Structural / field deltas

- **READ-ONLY BY DESIGN (documented BE-gap)** — the page shows ONLY the currently-authenticated user (GET `/auth/me`). A header comment enumerates the missing backend endpoints (GET `/admin/employees/:id`, GET `/admin/roles`, POST roles, PATCH, archive/restore) required to enable edit + role assignment.
- Rows: name, full name, email, position, last login, state (Active badge), roles (shows `roles_not_available`). All i18n'd via `pages.user_admin`.
- **NOT a bug** (premise immunization): a diff agent comparing against an editable EditForm sibling would flag "missing Save/edit/roles" — this is a deliberate backend gap, not a frontend parity defect. **No code change.**

## B. Interactive deltas

- No mutations (read-only). Breadcrumb link to list. Loading / not-found states i18n'd.
- Edit + role-assignment deferred to Phase-2/BE-backlog (endpoints above).

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ · web Vitest 1306 green (no regress). No code change required (clean, read-only by design).

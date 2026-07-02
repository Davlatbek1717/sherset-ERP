# settings/regions — detail parity audit (Cohort L)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Reference:** `settings/uoms` / `settings/expense-items` (simplest name-only settings CRUD, already audited & i18n-clean). NO moysklad capture (bespoke geographic-region dictionary).
**Pages:** `settings/regions/[id]`, `settings/regions/new`.

## A. Structural / field deltas

- Fields: name (col_name), code (ISO code), externalCode — all i18n'd via `pages.region_admin`. Validation `t('name_required')`.
- **No deltas.** Page was already fully internationalised (confirm-clean, per premise immunization — did NOT manufacture missing fields vs an EditForm sibling).

## B. Interactive deltas

- Save → PATCH `/regions/:id` (edit) / POST `/regions` (new); delete wired via `useDestructiveMutation` confirm. Optional code/externalCode sent only when non-empty (correct).
- No archive/restore (regions have no soft-delete) — legitimate absence, not a bug.

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ · web Vitest 1306 green (no regress). No code change required (clean).

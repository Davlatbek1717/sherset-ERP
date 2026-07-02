# settings/custom-entities — detail parity audit (Cohort L)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Reference:** moysklad capture `00-module/customentity` («Пользовательские справочники») + sibling settings CRUD.
**Pages:** `settings/custom-entities/[id]`, `settings/custom-entities/new`.

## A. Structural / field deltas

- Fields: name (col_name) + a Values sub-list (add / edit / delete dictionary values). i18n'd via `pages.custom_entity_admin` (10 useTranslations occurrences). Validation `t('name_required')`.
- **No deltas.** Already fully internationalised (confirm-clean; premise immunization prevented manufacturing structural gaps).

## B. Interactive deltas

- Save → PATCH `/custom-entities/:id` / POST (new); delete wired via confirm.
- Values: add (POST `/custom-entities/:id/values`), inline edit (PATCH), delete (with confirm), Enter-to-add — all wired with proper invalidation + `addValueMut` error Alert surfaced.
- No deltas.

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ · web Vitest 1306 green (no regress). No code change required (clean).

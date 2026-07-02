# uoms — LIST parity audit (Cohort L12 · Settings-org)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_9bba0f00-850`) — diff flagged the missing columns + label drift (MED/LOW), grounded against the clean PNG.
**Ground-truth (§4): CLEAN capture — one of only two groundable L12 pages.** `docs/moysklad-reference/visual-captures/04-module/uom/dom/00-clean-default.html` renders the real grid header row as element content (`>LABEL<`) AND `title="LABEL"` — DOM-role verified 2026-06-05, added to the permanent GROUNDING-LOCK registry. (The entity-root `dom-default.html` body is contaminated; the `00-clean-default.html` is the clean grid.)
**DEDUP:** uom detail/new form covered by the top-level audit. This pass = LIST axis.

## A. Structural / columns + i18n — 🔴 FIX (column-set realignment, §4 DOM-grounded)
- **Ground-truth columns:** «Тип» · «Краткое наименование» · «Полное наименование» · «Цифровой код». **Ours had only** `name`(labelled «Название») + `code` — missing «Тип» and «Полное наименование», and the short-name column mislabelled.
- **Fix:**
  - Added leftmost **«Тип»** column: `row.shared` → «Системный» (`type_system`) / «Пользовательский» (`type_custom`) — new keys.
  - Added **«Полное наименование»** column rendering `row.description` (new `col_full_name`). `UomRow` already carries `description` + `shared`; the BE `findMany` returns all scalar fields.
  - `col_name`=«Название» → **«Краткое наименование»** (the `name` field holds the short name; DOM-grounded). Shared with `uoms/[id]`+`uoms/new` — correct there too (the form's name field IS the short name).
  - `col_code` was already «Цифровой код» (matches the PNG — no change).
- All four labels locked in `label-grounding.test.ts` (GROUNDING-LOCK + VALUE_LOCKS).

## B. Interactive chrome — 1 fix
- **Search placeholder:** «По названию или коду...» → **«Наименование»** (the §4 PNG shows «Наименование», and the BE searches `name` only — so the old «...или коду» promise was dishonest). List-only key (not shared with the form).
- Search wired (`searchInput`+`useDebounce`). Sort wired. `UomBulkActionsDropdown` (2-item system-catalog menu) present.

## DEFER / Phase-2
- Pagination: BE `take:200`, FE `hasNext={false}` — 59 seeded units (low-cardinality) → DEFER class.
- Browser-smoke: confirm the 4-column grid + «Системный»/«Пользовательский» rendering (runtime-unverified).

## Gates
typecheck 0 (web+api) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding 106 · web Vitest 1374 (+13, 0 regress) · api Vitest 2607 (+2, 0 regress).

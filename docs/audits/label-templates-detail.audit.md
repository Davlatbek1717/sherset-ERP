# settings/label-templates — detail parity audit (Cohort L)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Reference:** NO moysklad analog — bespoke barcode/price-tag template editor («Шаблоны этикеток и ценников»). Parity axis = **i18n completeness** (paper-size/grid/margins/barcode fields are page-unique, not missing EditForm scaffolding).
**Pages:** `settings/label-templates/[id]`, `settings/label-templates/new`.

## A. Structural / field deltas

- **FIXED — whole-page hardcoded Uzbek-Latin, ZERO `useTranslations`** on BOTH pages (~35 strings: section titles, field captions, radio labels, danger-zone, validation throws, preview). → Full i18n via new `pages.label_templates` namespace (ru+uz, 37 keys), reusing `common.save/cancel/archive/delete/loading/action_irreversible`, `form.section_main`, `fields.name/description`. `[id]` and `new` wording **unified** through shared keys (e.g. margins/cols/labels-per-page) — was inconsistent before.
- A4/A5/A6/custom paper presets, cols×rows grid, mm dims, include-fields toggles, barcode format (EAN13/CODE128/QR), live preview — all present; technical bespoke fields (faithful translation, no moysklad term invented per §4).

## B. Interactive deltas

- **FIXED (a11y, LOW) — `new` `Field` helper rendered an orphan `<label>`** (no htmlFor, control is a sibling) → `noLabelWithoutControl` error. Changed to `<span>` caption, matching `[id]`'s already-correct `Field`. Consistent across the twin pages.
- **FIXED (MED, silent-failure) — `[id]` `archive` + `delete` mutations had NO `onError`** → swallowed failures. Added `onError: (e) => setError(e.message)` to both (only `saveMut` had one); the `error` Alert renders.
- Save → PATCH `/label-templates/:id` / POST (new); archive + delete (confirm) wired; live grid preview keyed by computed pixel offset (stable).

## Gates
typecheck 0 · biome 0/0 (fixed pre-existing a11y + useSortedClasses) · i18n ru+uz ✓ · no-hardcoded (route in DONE_ROUTES) ✓ · web Vitest 1306 green.

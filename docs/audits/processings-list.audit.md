# processings — LIST parity audit (Cohort L5)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_68a1e798-7d2`, 41 agents, 25 confirmed).
**Ground-truth (§4):** CLEAN screenshot + DOM `10-module/processing/dom/00-clean-default.html` (the `01-default.html`/`dom-default.html` list captures are CONTAMINATED = «Корзина»; only `dom/00-clean-default.html` renders the real «Технологические операции» grid). moysklad default grid header row (read myself, DOM-role `title="…"`, NOT the column-config dropdown nor the Tasks/Files side-panel `<th>`):
`☑ · № · Время · Организация · Технологическая карта · Объём производства · Себестоимость · Отправлено · Напечатано · Комментарий · ⚙`.

## A. Structural / column deltas (FIXED — DOM-grounded)

- **date column** `tFields('moment')` («Дата») → `tFields('time')` («Время») — moysklad grid header is «Время» (same cohort-wide date bug-class as L2/L3/L4). DOM-role: «Себестоимость»/«Дата» absent from grid header.
- **cost column** `t('cost_basis')` (the verbose «База себестоимости (из стандарт. цены техкарты)») → `tFields('cost')` («Себестоимость») — a parenthetical help-string was being rendered as a grid column header; moysklad header is the short «Себестоимость».
- **output-volume column** `t('output_quantity')` («Количество выпуска») → **new** `t('col_output_volume')` («Объём производства») — moysklad header is «Объём производства». `output_quantity` is also the DETAIL-form field label (4 detail pages) → added a list-only key instead of mutating the shared one.
- **doc-number column** raw `'№'` string literal → `tFields('number')` («№», same glyph) — i18n discipline (the raw literal is gate-blind).

- **+«Организация» column** added between «Время» and «Склад материалов» (`tFields('organization')`). `ProcessingRow.organization` is already returned by the BE list — moysklad shows «Организация» in the default grid; data-present add (mirrors the L4 enters/losses «Организация» add).

## B. Interactive / data deltas

- No interactive / data-cell deltas this pass. The hardcoded `'UZS'` money cell is **BE-consistent** (Processing has no currency column) — see DEFER.

## DEFER (Phase-2 / BE feature — documented, not fixed)

- 🟡 **Trailing «Отправлено» · «Напечатано» · «Комментарий» columns** — present in moysklad's grid; `ProcessingRow` has no `published`/`printed`/`description` scalars (only filter-panel booleans). BE-include gap.
- 🟢 **«Склад материалов»/«Склад продукции» extra columns** — moysklad's default grid shows «Организация» where ours shows the dual stores; the stores are likely a ⚙-optional column in moysklad. Kept as useful extras (removal = behavior change), not flagged.
- 🟢 **«Выходной продукт» / «Статус» extra columns** — not in moysklad default; kept as extras.
- 🟢 **Hardcoded `'UZS'`** money cell — BE-consistent: `processing.controller.ts` has **no currency column** (`Processing schema has no sumMinor/currency`), so the L4 `r.currency` fix does NOT apply (no field to thread). Currency column = BE feature-gap.
- 🟢 **«Технологическая карта»** vs our column header «Техкарта» (`processing_plan`) — abbreviation matches the moysklad menu «Техкарты»; kept (low value), grounded label registered in the guard.

## Gates
typecheck 0 · biome 0/0 (staged) · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ (`Время/Организация/Технологическая карта/Объём производства/Себестоимость` grounded + col_output_volume value-lock + cost/№/org wiring-lock) · web Vitest 1331 pass/1 skip (no regress).

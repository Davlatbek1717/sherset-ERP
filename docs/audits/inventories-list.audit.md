# inventories — LIST parity audit (Cohort L4)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_a606f369-20b`). **Ground-truth (§4):** capture `06-module/inventory/dom-default.html` SORTABLE grid header row (DOM-role, read myself): `Тип документа · № · Время · Со склада · Организация · Отправлено · Напечатано · Комментарий` — Инвентаризация = stock-take, single store «Со склада», has a «Тип документа» column, and NOTE: **NO «Сумма» grid column** in moysklad's default grid.

## A. Structural / column deltas (FIXED)

- **date** `tFields('moment')` («Дата») → `tFields('time')` («Время») [cohort-wide bug-class].
- **store** `tFields('store')` («Склад») → `tFields('store_from')` («Со склада») [DOM-role grid header].
- **money header label** `tFields('cost')` («Себестоимость») → `tFields('sum')` («Сумма») — relabel only (so the column, while shown, reads the correct term). The deeper question of whether inventory should show a «Сумма» column at all is DEFERRED (see below) — currency-threading also deferred for the same reason.
- **positions** hardcoded `'Pos.'` → `tFields('positions_count')` («Позиции»).
- **«Организация» column added** — `InventoryRow` carries organization and `inventory.service` selects + sorts by it; moysklad grid has «Организация» default-visible. Added column + default-visibility entry (mirrors moves/enters/losses).

## B. Interactive / data deltas

- **money cell currency-threading DEFERRED** — unlike moves/enters/losses (which got `r.currency`), inventories keeps the `'UZS'` arg this pass because the «Сумма» column's very existence in the default grid is unresolved (moysklad's inventory grid has none). Threading currency into a possibly-removed column would be premature; tracked with the «Сумма» column-existence defer below. No other interactive/wiring delta confirmed (mass-edit gap is cohort-wide, deferred).

## DEFER (Phase-2 / uncertain — documented)

- 🟡 **«Сумма» column existence** — moysklad's inventory default grid has NO «Сумма» column; we render one. Kept (relabeled «Сумма») pending a clean closed-inventory capture to confirm whether to remove from default-visible. Currency-threading deferred with it.
- 🟡 **Missing «Тип документа» first column** — inventory-unique in moysklad (count subtype); needs a BE doc-type field. DEFER (BE feature).
- 🟡 Missing trailing «Отправлено»/«Напечатано»/«Комментарий» (BE-include); «Массовое редактирование» disabled (BE endpoint+modal).

## Gates
typecheck 0 · biome 0/0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ · web Vitest 1319 pass/1 skip (no regress).

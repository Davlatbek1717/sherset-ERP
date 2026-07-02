# enters — LIST parity audit (Cohort L4)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_a606f369-20b`). **Ground-truth (§4):** capture `06-module/enter/dom-default.html` SORTABLE grid header row (DOM-role, read myself): `№ · Время · На склад · Организация · Сумма · Отправлено · Напечатано · Комментарий` — Оприходование = stock-IN, so TARGET store «На склад» only, NO «Со склада», NO counterparty.

## A. Structural / column deltas (FIXED)

- **date** `tFields('moment')` («Дата») → `tFields('time')` («Время») [cohort-wide bug-class].
- **money** `tFields('cost')` («Себестоимость») → `tFields('sum')` («Сумма») [grid header is «Сумма»; resolves in-file inconsistency with the «Сумма» filter].
- **store** `tFields('store')` («Склад») → `tFields('store_to')` («На склад») — stock-IN direction (DOM-role grid header «На склад»).
- **positions** hardcoded `'Pos.'` → `tFields('positions_count')` («Позиции»).
- **«Организация» column added (HIGH)** — moysklad's enter grid has «Организация» as a default-visible column; our page defined NO organization column at all (not even gear-recoverable), though `EnterRow` carries it and `enter.service` selects + sorts by it. Added a default `organization` column (mirrors moves) + added `'organization'` to the `useColumnVisibility` defaults.
- **«Причина» removed from default-visible (MED)** — moysklad's enter grid has no «Причина» column (it's a detail-form field). Removed `'reason'` from the default-visible set; the column definition is KEPT so the ⚙ column-customizer can still expose it.

Net default grid now: `№ · Время · На склад · Организация · Сумма` (+ state/reason/positions available via ⚙) — matches the moysklad ground-truth visible prefix.

## B. Interactive / data deltas (FIXED)

- **money cell currency** `'UZS'` → `r.currency` (+ `currency: string` on `EnterRow`; BE returns it via include-only list()). Mirrors internal-orders.

## DEFER (Phase-2 / BE feature)

- 🟡 «Массовое редактирование» disabled (onMassEdit never wired; needs BE endpoint + modal + `pages.enters.mass_edit_*` keys) — Phase-2/BE.
- 🟡 Missing trailing «Отправлено»/«Напечатано»/«Комментарий» columns (BE-include: no published/printed/description scalars).

## Gates
typecheck 0 · biome 0/0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ · web Vitest 1319 pass/1 skip (no regress).

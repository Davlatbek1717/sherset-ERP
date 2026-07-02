# moves — LIST parity audit (Cohort L4)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_a606f369-20b`, 78 agents, 14 confirmed cohort-wide). **Ground-truth (§4):** capture `06-module/move/dom-default.html` SORTABLE grid header-content `title=` row (read myself, DOM-role — NOT grep-count, NOT the column-config dropdown, NOT the embedded Tasks/Files side-panel `<th>`): `№ · Время · Со склада · На склад · Организация · Сумма · Отправлено · Напечатано · Комментарий`.

## A. Structural / column deltas (FIXED)

Cohort-wide grid-header label bug-class — the L4 pages used the wrong `fields.*` i18n key (invisible to every gate: tc/biome/i18n-key check existence not VALUE). All target keys already existed in ru+uz (zero new i18n):
- **date column** `tFields('moment')` («Дата») → `tFields('time')` («Время») — moysklad grid header is «Время» (same fix L2/L3 applied on sibling lists).
- **money column** `tFields('cost')` («Себестоимость») → `tFields('sum')` («Сумма») — «Себестоимость» is a detail-form/cost concept; the LIST grid header is «Сумма» (internal-orders already used `sum`). DOM-role: «Себестоимость» = 0 grid-header occurrences.
- **store columns** `tFields('source_store')`/`tFields('destination_store')` («Склад-источник»/«Склад-получатель») → `tFields('store_from')`/`tFields('store_to')` («Со склада»/«На склад») — the same keys the moves DETAIL/NEW pages already use. Filter-panel labels left unchanged (separate «Откуда/Куда» concept, deferred).
- **positions column** hardcoded Latin `'Pos.'` literal → `tFields('positions_count')` («Позиции») — gate-blind (no-hardcoded gate is Cyrillic-only).

## B. Interactive / data deltas (FIXED)

- **money cell currency** `formatMoney(r.sumMinor, 'UZS', …)` → `formatMoney(r.sumMinor, r.currency, …)` (+ `currency: string` added to `MoveRow`). BE already returns `currency` (move.service list() is `include`-only, no root `select` whitelist; Prisma `Move.currency`). Display unchanged for UZS accounts (`displayAs:'none'` ignores the arg); fixes the CSV-export suffix for non-UZS rows. Mirrors internal-orders.

## DEFER (Phase-2 / BE feature — documented, not fixed)

- 🟡 **«Массовое редактирование» bulk-action permanently disabled** — `MoveBulkActionsDropdown` rendered without `onMassEdit`; moves also lacks the BE `/moves/mass-edit` endpoint (siblings internal-orders/supplies have it). Needs BE endpoint + FE modal + i18n keys = Phase-2/BE feature (not a label fix).
- 🟡 **Missing trailing default columns «Отправлено» · «Напечатано» · «Комментарий»** — present in moysklad's grid; our `MoveRow` lacks `published`/`printed`/`description` scalars (BE-include gap).
- 🟢 filter-panel «Откуда»/«Куда» label grounding — uncertain (verify-degraded).

## Gates
typecheck 0 · biome 0/0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ (capture `Время/Со склада/На склад/Организация/Сумма` grounded + regression-lock) · web Vitest 1319 pass/1 skip (no regress).

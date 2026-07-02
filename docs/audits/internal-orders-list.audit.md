# internal-orders — LIST parity audit (Cohort L4)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_a606f369-20b`). **Ground-truth (§4):** capture `06-module/internalorder/dom-default.html` SORTABLE grid header row (DOM-role, read myself; dom-default.html is the clean list view — `<title>Внутренние заказы` — only the `dom/01-default.html`+ siblings are the cohort-B-flagged `Корзина` contamination): `№ · Время · Организация · Сумма · Отгружено · Отправлено · Напечатано · Комментарий` — internal request: NO store column in the default grid, has «Отгружено» (shipped-fulfilment), NO counterparty.

## A. Structural / column deltas (FIXED — pure label only)

- **date** `tFields('moment')` («Дата») → `tFields('time')` («Время») [cohort-wide bug-class].
- **«№» header** hardcoded `'№'` literal → `tFields('number')` (i18n consistency; both resolve «№», but no raw literal).

Money column already correct (`tFields('sum')` + `r.currency`) and is the cohort's parity template for the other four pages.

## B. Interactive / data deltas

- **No interactive fix needed** — the money cell already threads per-row currency (`formatMoney(r.sumMinor, r.currency, …)`), which is exactly the template moves/enters/losses were aligned to this cohort. The engine's "missing print-dropdown / missing ⚙ column-customizer" candidates were verify-DEGRADED (agent crashed on schema), not confirmed; the page does mount both. No confirmed interactive/data delta this pass.

## DEFER (Phase-2 — column-set realignment, order-type doc)

internal-orders is an order-TYPE doc and diverges most from the warehouse-IN/OUT grids; its column-set realignment is held as one coherent Phase-2 unit rather than churned piecemeal:
- 🟡 **Missing «Организация» default column** — `InternalOrderRow` carries it; grounded vs capture. Deferred to land together with the rest of the realignment.
- 🟡 **Missing «Отгружено» (shipped-fulfilment) column** — needs a BE shipped-sum/status field (BE feature).
- 🟡 **Extra default columns** «Целевой склад» (store), «План. дата поставки» (deliveryPlanned), «Статус», «Позиции» — not in moysklad's default grid; whether to demote them to ⚙-only needs a populated capture to confirm intent.

## Gates
typecheck 0 · biome 0/0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ (capture `Время/Организация/Сумма/Отгружено` grounded) · web Vitest 1319 pass/1 skip (no regress).

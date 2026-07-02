# purchase-returns/[id] — detail page parity audit

- **Module:** `purchase-returns` (Возврат поставщику) detail/edit page (`apps/web/src/app/(app)/purchase-returns/[id]/page.tsx`)
- **Date:** 2026-06-03
- **Protocol:** v2.2 detail-page audit (15th detail page) — **sibling-parity method** (no fresh capture; route-walled / demo-empty)
- **Twin (reference):** `supplies/[id]` (AUDITED, real capture `docs/moysklad-reference/supplies/detail/`). A supply can CREATE
  a purchase-return (supplies audit I3), so they are the supplier-side receipt/return pair (Приёмка ↔ Возврат поставщику).
- **Method:** sibling-parity diff via the `returns-sibling-parity-audit` workflow (`scripts/wf-returns-sibling-parity-audit.js`,
  run `wf_a6f943b0-216`, 8 agents) → each `real_delta`/`uncertain` finding **blind-verified** by an independent agent.
  Locale compared = Russian (`ru.json`).

## Verdict

A faithful supplier-side mirror of the supply twin, already carrying every shared fix and prior bug-class sweep — S2
«Задачи» inline (`PurchaseReturn` ∈ `TASK_ENTITY_WHITELIST`), PositionEditor i18n, comment = `tFields('description')`,
counterparty field (⚠️ **corrected 2026-06-04: was `tFields('supplier')`=«Поставщик» — the gold capture labels this
field «Контрагент» (`gwt-Label">Контрагент`, «Поставщик» 0× as a field label); «Поставщик» was an invented directional
rename. Now `tFields('agent')`=«Контрагент»**), singular `titlePrefix={tDetailTitles('purchase_return')}`,
draft/posted/cancelled FSM with posted=success tone, BigInt money math. This audit fixed **1 confirmed delta (S1)**. One
candidate (per-position customs ГТД/Страна) was **refuted by blind verification** — ours is correct as-is. The rest are
deferred identically to the twin or are correct-by-direction.

## A. Structural

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| S1 | Tab-1 label | «Главная» | was «Позиции» (`positionsLabel` omitted → `DetailContentTabs` default) | delta | high | **FIXED** — added `tDetailTabs` hook + `positionsLabel={tDetailTabs('main')}` (blind-verified `confirmed_real_delta`; mirrors supplies S1) |
| S2 | «Задачи» surface | inline section | inline `<DocumentTasksSection entity="PurchaseReturn">` | match | — | parity ✓ |
| S3 | Tab strip set | 2 tabs (Главная + Связанные) | + Файлы / История | delta | low | DEFERRED — same as supplies S3 |
| S4 | Position stock columns (Принято/Остаток/РНПТ) | present | 7 cols (shared `PositionEditor`) | partial | low | DEFERRED — backend = supplies S4 |
| S5 | Totals «Накладные расходы» (overhead) | present on Приёмка | **absent** | — | — | **correct-by-direction ✓** — landed-cost overhead allocation is a *receipt* (Приёмка) concept; goods leaving back to the supplier do not allocate overhead. Core totals mirror the twin. |
| S6 | Контрагент «Баланс» sub-line | shown | absent | missing_in_ours | low | DEFERRED — backend = supplies S6 |
| S7 | Payment chip / «Запросить оплату» | (none on twin) | absent | match | — | parity ✓ (neither renders it) |
| S8 | customs ГТД/Страна (positions) | **none** (per moysklad data model) | **none** (no `customs` prop; backend has no gtd/country) | match | — | **VERIFIED PARITY ✓** — see I-refuted below |

## B. Interactive

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| I1 | counterparty label / picker | **«Контрагент»** (gold capture `gwt-Label">Контрагент` on the `tutorial-counter-party-field`; «Поставщик» 0× as a field label) | was `tFields('supplier')`=«Поставщик» | delta | med | **FIXED 2026-06-04 → `tFields('agent')`=«Контрагент»** (label + placeholder + picker title). The earlier «correct-by-direction» was wrong — moysklad uses the universal «Контрагент» on supplier-side docs too. |
| I2 | comment field | «Комментарий» | `tFields('description')`=«Комментарий» | match | — | parity ✓ (#15 class) |
| I3 | titlePrefix | singular doc name | `tDetailTitles('purchase_return')`=«Возврат поставщику» | match | — | parity ✓ |
| I4 | FSM state set + tone | draft/posted/cancelled, posted=brand | identical via shared `buildDocStateMenu` + `DOC_STATE_VERB`, `states.purchase_return.*` | match | — | parity ✓ |
| I5 | linked-source link + «Причина» reason | created FROM a supply | read-only linked-supply back-link (`tFields('linked_supply')`) + reason input (`tFields('reason')`); omits incoming_number/date | uncertain | low | linked-supply back-link = correct. ⚠️ **«Причина» reason input DEFERRED (2026-06-04): moysklad's `_purchase_return.md` has NO «Причина»/reason attribute — a return's basis is the `supply` (основание) link, comment is `description`=«Комментарий». The free-text «Причина» Input has no moysklad counterpart; needs a clean detail capture to decide keep-as-extra vs remove (NOT a label rename). No guess.** |
| **I-refuted** | **customs ГТД/Страна column** | **none** | **none** | **refuted_not_a_delta** | — | **VERIFIED CORRECT.** The diff agent hedged ("the sales-returns sibling has customs, maybe this does too"). Blind verify checked moysklad's official «Позиции Возврата поставщику» attribute table (`_purchase_return.md`): purchase-return positions have **no gtd, no country** (vs `_sales_return.md` which explicitly does). ГТД/Страна track goods *entering* stock (Приёмка) or coming *back into* stock (customer returns); a Возврат поставщику sends goods *back to the supplier* → no per-line customs. Our page + `PositionDetail` + backend schema all correctly omit it. **No fix — inverse-direction error avoided.** |
| I6 | «Печать» base print form | opens `/print/supply` (works) | **no `onPrintList` wired; no `/print/purchase-return` route** | missing_in_ours | low | DEFERRED — the page omits the button rather than mis-scoping to a supply print. Adding a `/print/purchase-return` base page + wiring the button is a clean follow-up (mirror of `print/supply`); deferred this session as a feature-add, not a confirmed bug. The per-doc print templates are backend = supplies I4. |
| I7 | «Создать документ» menu | present (a «Создать» trigger exists) | **absent** (no `createMenuItems`) | missing_in_ours | med | **DEFERRED — needs capture.** Blind-verify verdict = `needs_capture`: the supply twin's 7-item set is the *forward* direction (a supply creates a purchase-return), not transferable to the return's own menu. Inverse-direction items are unobservable (route-walled). Do NOT invent. |
| I8 | «Изменить» / «Отправить» items | {Удалить, Копировать} / print-by-email | shared `DetailToolbar` / generic composer | delta | low | DEFERRED — same as supplies I2/I5 (shared toolbar) |

## Fixed this session

| Ref | Fix | File | Scope |
|---|---|---|---|
| S1 | Tab-1 «Позиции» → «Главная» — added `tDetailTabs` hook + `positionsLabel={tDetailTabs('main')}` on `DetailContentTabs` | purchase-returns page | scoped (mirrors supplies S1; no new keys) |

**Gates:** web typecheck 0 · biome 0 · i18n key-existence 8017 ru+uz + no-hardcoded · web 1230 pass / 1 skip — no regression.
**HONEST:** S1 is a structural label override (no new keys; `detail_tabs.main` exists ru+uz); not browser-smoked
(demo-empty/route-walled). 0 new logic.

## Deferred / verified

- **I-refuted (customs)** — VERIFIED CORRECT as-is (moysklad data model omits gtd/country on purchase-return positions).
- **I7** «Создать документ» menu — `needs_capture` (inverse-direction item set; route-walled). Clean capture required.
- **I6** base «Печать» — follow-up: add `/print/purchase-return/[id]` mirroring `/print/supply` + wire `onPrintList` (feature, not a confirmed bug).
- **S4/S6** position stock columns · counterparty balance — backend.
- **S3** «Файлы» tab vs inline + «История» — shared `DetailContentTabs` restructure.

# sales-returns/[id] — detail page parity audit

- **Module:** `sales-returns` (Возврат покупателя) detail/edit page (`apps/web/src/app/(app)/sales-returns/[id]/page.tsx`)
- **Date:** 2026-06-03
- **Protocol:** v2.2 detail-page audit (14th detail page) — **sibling-parity method** (no fresh capture; route-walled / demo-empty)
- **Twin (reference):** `demands/[id]` (AUDITED, real capture `docs/moysklad-reference/demands/detail/`). A demand can CREATE a
  sales-return (demands audit I6), so they are the customer-side forward/return pair (Отгрузка ↔ Возврат покупателя).
- **Method:** sibling-parity diff (the un-audited page vs its audited twin's proven implementation + the twin's audit doc,
  adjusting for direction) via the `returns-sibling-parity-audit` workflow (`scripts/wf-returns-sibling-parity-audit.js`,
  run `wf_a6f943b0-216`, 8 agents) → each `real_delta`/`uncertain` finding **blind-verified** by an independent agent that
  re-derived the truth from scratch. Locale compared = Russian (`ru.json`).

## Verdict

Structurally a faithful customer-side mirror of the demand twin: it already carries every shared fix and prior bug-class
sweep — S2 «Задачи» inline (`SalesReturn` ∈ `TASK_ENTITY_WHITELIST`, added 2026-06-02L), PositionEditor i18n
(`usePositionEditorLabels`), comment = `tFields('description')`=«Комментарий», direction-correct counterparty =
`tFields('customer')`=«Покупатель», singular `titlePrefix={tDetailTitles('sales_return')}`, draft/posted/cancelled FSM
with posted=success tone. This audit fixed **2 confirmed deltas**; the rest are deferred identically to the twin.

## A. Structural

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| S1 | Tab-1 label | «Главная» | was «Позиции» (`positionsLabel` omitted → `DetailContentTabs` default `tDetailTabs('positions')`) | delta | high | **FIXED** — added `tDetailTabs` hook + `positionsLabel={tDetailTabs('main')}` (blind-verified `confirmed_real_delta`; mirrors demands S1) |
| S2 | «Задачи» surface | inline section | inline `<DocumentTasksSection entity="SalesReturn">` | match | — | parity ✓ (added 2026-06-02L Задачи sweep) |
| S3 | Tab strip set | 2 tabs (Главная + Связанные; Файлы/Задачи inline) | + Файлы / История | delta | low | DEFERRED — same as demands S3 (shared `DetailContentTabs` restructure) |
| S4 | Position stock columns | Принято/Доступно/Остаток/Резерв/… | 7 cols (shared `PositionEditor`) | partial | low | DEFERRED — backend per-row stock = demands S4 |
| S5 | Totals sidebar rows | + Прибыль/Вес/Объём | subtotal/НДС/Итого/Кол-во | partial | low | DEFERRED — same as demands S5 |
| S6 | Контрагент «Баланс» sub-line | shown | absent | missing_in_ours | low | DEFERRED — backend balance fetch = demands S6 |
| S7 | Refund payment chip / «Запросить оплату» | (refund flow) | absent (`SalesReturnDetail` has no `payedSumMinor`) | missing_in_ours | med | DEFERRED — backend field = demands S7/I12 |

## B. Interactive

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| I1 | counterparty label / picker | «Покупатель» (customer side) | `tFields('customer')`=«Покупатель» (field + picker title) | match | — | correct-by-direction ✓ (inverse of demand=customer) |
| I2 | comment field | «Комментарий» | `tFields('description')`=«Комментарий» | match | — | parity ✓ (#15 class) |
| I3 | titlePrefix | singular doc name | `tDetailTitles('sales_return')`=«Возврат покупателя» | match | — | parity ✓ |
| I4 | FSM state set + tone | draft/posted/cancelled, posted=brand | identical via shared `buildDocStateMenu` + `DOC_STATE_VERB`, `states.sales_return.*` | match | — | parity ✓ |
| I5 | customs ГТД/Страна (positions) | (returned goods may be imported) | `customs={{gtdSum, gtdSumLabel: tFields('gtd_cost'), country, countryFetcher}}` | match | — | correct-by-direction ✓ — sales-return backend carries gtd/country (unlike demand); superset appropriate for a customer return |
| I6 | «Печать» → base print form | opens a working print page | **was `window.open('/print/sales-return/…')` → 404 (route absent)** | delta | med | **FIXED** — added `apps/web/src/app/print/sales-return/[id]/page.tsx` (mirrors `print/demand/[id]`) + `pages.print.doc_title.sales_return` (ru+uz). Blind-verified `confirmed_real_delta` (every other sibling's `onPrintList` resolves to a real route; this one 404'd). The 13 named print *templates* remain deferred = demands I7. |
| I7 | «Создать документ» menu | present (a «Создать» trigger exists on the moysklad page) | **absent** (no `createMenuItems` on `DetailToolbar`) | missing_in_ours | med | **DEFERRED — needs capture.** Blind-verify verdict = `needs_capture`: the demand twin's 6-item set is **wrong-direction** (a sales-return is a *child* of a demand, not a parent); API relations (`_sales_return.md`: losses/payments/factureOut) suggest refund-side docs, but the exact item set/order/labels are unobservable (all `salesreturn` «Создать» captures are corrupt with the systemic 03-module edit-capture bug). Do NOT invent items. |
| I8 | «Изменить» / «Отправить» items | {Удалить, Копировать} / print-by-email | shared `DetailToolbar` (+ «Открыть в API» dev superset) / generic composer | delta | low | DEFERRED — same dispositions as demands I5/I8 (shared toolbar) |

## Fixed this session

| Ref | Fix | File | Scope |
|---|---|---|---|
| S1 | Tab-1 «Позиции» → «Главная» — added `tDetailTabs` hook + `positionsLabel={tDetailTabs('main')}` on `DetailContentTabs` | sales-returns page | scoped (mirrors demands S1; no new keys — `detail_tabs.main` exists ru+uz) |
| I6 | «Печать» base form no longer 404s — created `print/sales-return/[id]/page.tsx` (mirror of `print/demand/[id]`) + `pages.print.doc_title.sales_return` (ru+uz) | new print page + ru.json/uz.json | scoped |

**Gates:** web typecheck 0 · biome 0 · i18n key-existence 8017 ru+uz + no-hardcoded · web 1230 pass / 1 skip — no regression.
**HONEST:** the new print page is **not browser-smoked** — it is a typed mirror of the proven `print/demand/[id]` page, its
data contract (agent/organization/positions/demand) is verified against the detail page that consumes the same
`/sales-returns/:id` endpoint, and sales-returns is demo-empty/route-walled (no seeded record to navigate to). 0 new logic.

## Deferred — backend / design (same dispositions as demands)

- **I7** «Создать документ» menu — `needs_capture` (item set is inverse-direction; corrupt captures only). A clean
  Возврат покупателя detail capture is required before wiring (do not copy the demand set).
- **S4/S5/S6/S7** position stock columns · profit/weight/volume totals · counterparty balance · refund payment chip — backend.
- **S3** «Файлы» tab vs inline + extra «История» tab — shared `DetailContentTabs` restructure.
- **I6 (templates)** the 13 named print forms (ТТН/Акт/…) — per-doc print-template system (backend); the base print page now works.

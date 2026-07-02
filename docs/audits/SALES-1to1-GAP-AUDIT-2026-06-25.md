# Продажи (Sales) section — 1:1 gap audit (2026-06-25)

Structural audit of the 9 remaining Sales sub-sections vs the proven customer-orders (CO) /
purchase-orders shell + moysklad list-grid pattern. «Заказы покупателей» (CO) is the DONE reference.
4 parallel read-only auditors; this is a STRUCTURAL gap-list for prioritization — NOT a live pixel audit.

## Scoreboard (rough 1:1 readiness)

| Sub-section | route | list | new | detail | biggest gap |
|---|---|---|---|---|---|
| Счета покупателям | invoices-out | 75% | 65% | 50% | detail on OLD shell (DetailHeader, no footer totals) |
| Отгрузки | demands | 72% | 68% | 55% | DetailHeader→DocumentHeader + footer totals |
| Возвраты покупателей | sales-returns | 65% | 70% | 50% | same as demands |
| Счета-фактуры выданные | factures-out | 70% | — | **20%** | detail is a SKELETON; blocked on VAT/soliq |
| Воронка продаж | opportunities | 50% | ? | 75% | board 85%, but board/list split unverified vs moysklad |
| Отчёт комиссионера | commission-reports | **92%** | — | — | export btn + agent drill-down |
| Товары на реализации | consignments | **88%** | — | — | export btn + qty col + product drill-down |
| Прибыльность | reports/profitability | **95%** | — | — | trivial (date presets) |
| Юнит-экономика | reports/unit-economics | **96%** | — | — | trivial (store filter) |

## The repeated pattern (document pages: invoices-out · demands · sales-returns)
These 3 are all on the **OLD document shell**; CO got the new one. The SAME gaps repeat — converging them
= re-applying the CO convergence (well-trodden). Shared gaps:
- **LIST**: no footer «Итого» totals (needs `/{doc}/aggregate/totals` endpoint + footer row) · no custom
  «Статус» (account states) · no custom-field (доп.поля) filters · published/printed as checkmarks not cyan pills.
- **DETAIL**: still uses read-only `DetailHeader` (not the editable shared `DocumentHeader` №/date/payment-pill/
  custom-status/«? Проведено») · no toolbar `rightSlot` (owner popover + presence «Смотрит» + «Изменения» history)
  · single-column meta (not 3-col + top-right Адрес/Комментарий) · no «Баланс (нам/мы должны)» · no «Курс валюты»
  rate modal · no position column-customizer / VAT-click-edit / PositionNameCell · custom fields at bottom not inline.
- **NEW**: no custom statuses/fields · (invoices-out) no owner popover / column customizer / external-code collapse.

Doc-specifics (legit divergences, NOT gaps): demand = shipment (no «Зарезерв.», has cost/«Отгружено»);
sales-return reverses a shipment (+ГТД/Страна customs cols); invoices-out = billing (no delivery address/reserve,
has «План. дата оплаты»).

## factures-out — detail is a 20% skeleton
List is fine (~70%). Detail = read-only stub (title + 6 fields), NO positions / toolbar / print / edit.
The tax-invoice (Счёт-фактура) form + print needs **live moysklad grounding** + likely the soliq.uz VAT
integration. → DEFER detail; it's blocked on an external dependency.

## opportunities (Воронка) — needs live grounding
Board (kanban, drag-stage) ~85%, detail ~75%, list ~50%. Open question: moysklad shows воронка as ONE view
with a «Доска / Таблица» toggle; ours has SEPARATE routes (/opportunities + /opportunities/board). Also list
lacks saved-filters/footer/bulk; detail lacks stage-dropdown + lost-reason display. → Ground the unified-view
question before refactoring.

## reports (commission · consignments · profitability · unit-economics) — already ~90%+
All 4 are FUNCTIONAL (not stubs), fully wired to real backends. Gaps are polish: missing CSV export buttons
(commission, consignments), drill-down links (agent/product), a qty column (consignments), date presets. NOT
visually grounded vs moysklad — labels/column order need a live cross-check. Cheap wins.

## Recommended order
1. **invoices-out** — closest to CO; this session's work (rate modal, «Баланс», record-nav, VAT-click-edit,
   pixel fixes) transfers directly. Highest leverage.
2. **demands** + **sales-returns** — same convergence pattern; batchable (shared shell work).
3. **reports polish** — quick 90%→100% wins (export + drill-down), once visually grounded.
4. **opportunities** — live-ground the board/list question first, then converge.
5. **factures-out detail** — deferred (VAT/soliq dependency).

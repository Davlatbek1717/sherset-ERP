# cash-in/[id] — detail page parity audit

- **Module:** `cash-in` (Приходный ордер) detail/edit page (`apps/web/src/app/(app)/cash-in/[id]/page.tsx`)
- **Date:** 2026-06-01
- **Protocol:** v2.2 detail-page audit (4th detail page; first **money document** audited — different shape from the
  position docs: no positions table, payment-allocation tab instead).
- **Reference:** `docs/moysklad-reference/cash-in/detail/` — clean live `--detail` capture.
- **Method:** operator (Opus) judged from the clean capture (edit-default DOM/screenshot + 4 dropdown dumps + the one
  real tab). Locale = Russian (`ru.json`).

## Verdict

cash-in is a money document: a single form (Организация/Контрагент/Сумма/Основание/Валюта) + a payment-allocation
tab + inline Задачи/Файлы. Two clean deltas fixed (tab-1 label was hardcoded Uzbek; missing Задачи). The allocation
tab carries more hardcoded-Uzbek strings and a structural difference from moysklad's «Оплаченные документы» layout —
documented as bounded follow-ups (the i18n keys partly exist already in `pages.cash_in`).

## A. Structural

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| S1 | Tab-1 label | «Оплаченные документы» | was **hardcoded Uzbek** «Taqsimlanish» | delta | high | **FIXED** — `positionsLabel={tDetailTabs('paid_documents')}` (new `detail_tabs.paid_documents` ru+uz) |
| S2 | «Задачи» surface | inline section | **absent** | missing_in_ours | high | **FIXED** — added inline `<DocumentTasksSection entity="CashIn">` (whitelisted) |
| S3 | Allocation-tab body i18n | RU throughout | title/empty were hardcoded Uzbek; now wired to `pages.cash_in.allocation_title`/`allocation_empty` (already existed). Column headers «Schyot-faktura»/«Summa (tiyin)», picker placeholders, «Schyot qo'shish» button, row-remove aria **still hardcoded Uzbek** | partial | med | **PARTIAL** — headline strings fixed; remaining ~5 need keys added to `pages.cash_in` (ru+uz). Bounded follow-up. |
| S4 | «Оплаченные документы» tab layout | Привязать платёж · Перераспределить сумму платежа + table (Тип документа/№/Дата/Орг/Контрагент/Статус/К оплате/Не оплачено/Оплачено) + Привязано/Не привязано | simpler allocation editor (Счёт-фактура + Сумма rows) + Привязано/Не привязано | delta | med | DEFERRED — table redesign (design/backend) |
| S5 | Counterparty field label | «Контрагент» | was **«Плательщик»** (`tFields('payer')`) | delta | high | **FIXED** (corrected 2026-06-01 session-start audit) — `tFields('payer')`→`tFields('agent')`=«Контрагент» (label+placeholder+picker title). Original audit mismarked this «match». |
| S5b | Other meta fields | Организация · Договор · Проект · Канал продаж · Сумма · Включая НДС · Основание · Валюта | same set | match | — | parity ✓ |
| S6 | Inline Файлы | present | present (AttachmentsSection) | match | — | parity ✓ |

## B. Interactive

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| I1 | Save/Close/pager | «Сохранить»/«Закрыть»/pager | same (shared) | match | — | — |
| I2 | «Изменить» items | {Удалить, Копировать} | Копировать · **Открыть в API** · Удалить | delta | low | DEFERRED — «Открыть в API» intentional dev superset (shared `DetailToolbar`) |
| I3 | «Создать документ» | 1: «Счёт-фактура выданный на аванс» | **absent** (no createMenuItems → no dropdown) | missing_in_ours | med | DEFERRED — add a disabled label-parity placeholder (needs `create_related.facture_out_advance`) + advance-facture backend |
| I4 | «Печать» items | Приходный ордер · Настроить... | «Список заказов» (disabled) · Настроить... | delta | med | DEFERRED — needs the «Приходный ордер» print form (backend); «Список заказов» mis-scoped shared label (= customer-orders I7) |
| I5 | «Отправить» items | Приходный ордер | email composer (disabled — no onSendEmail) | delta | low | DEFERRED — print-form email (backend) |
| I6 | Status pill + «Проведено» + «?» | colored pill + ☑ Проведено + «?» | pill + ☑ Проведено (no «?») | delta | low | DEFERRED — help tooltip (shared DetailHeader) |

## Fixed this session

| Ref | Fix | File |
|---|---|---|
| S1 | Tab-1 hardcoded Uzbek «Taqsimlanish» → «Оплаченные документы» (`positionsLabel={tDetailTabs('paid_documents')}`) | cash-in page + `detail_tabs.paid_documents` (ru+uz) |
| S2 | Added inline `<DocumentTasksSection entity="CashIn">` | cash-in page |
| S3 (partial) | Allocation tab title/empty hardcoded Uzbek → existing `t('allocation_title'/'allocation_empty')` | cash-in page |
| S5 | Counterparty label «Плательщик» (`tFields('payer')`) → «Контрагент» (`tFields('agent')`) ×3 (label/placeholder/picker title) | cash-in page |

### S5 correction (2026-06-01 session-start audit) — counterparty-label bug-class

The original S5 verdict was **wrong**: it listed «Контрагент» in the moysklad column but marked status «match»
without noticing our code rendered «Плательщик» (`tFields('payer')`). Verified against the reference
(`docs/moysklad-reference/cash-in/detail/edit-default.html` shows «Контрагент» ×2; payments-in + demands references
confirm «Контрагент» is moysklad's **universal** counterparty-field label — never «Плательщик»/«Получатель»).

**Bug-class swept across all 4 money docs** (same `DocumentMetaField` + `CatalogPicker` shape):
- `cash-in` (Приходный ордер): `tFields('payer')`→`tFields('agent')` — **directly verified** against reference.
- `cash-out` (Расходный ордер): `tFields('payee')`→`tFields('agent')` — inferred (no detail capture; demo account empty).
- `payments-out` (Исходящий платёж): `tFields('payee')`→`tFields('agent')` — inferred (same).
- `payments-in` (Входящий платёж): already fixed in its own audit (`fe377059`).

Evidence basis for cash-out/payments-out (HALOL): no direct capture exists (those docs are empty in the moysklad
demo account → `--detail` openFirstRow fails). The fix relies on the **verified universal convention** (3 independent
reference captures: cash-in, payments-in, demands all show «Контрагент») + structural-twin equivalence. High confidence,
but if a cash-out/payments-out seed doc is ever created, capture should confirm.

**Gates:** web typecheck 0 · biome clean · web tests pass — no regression. **HALOL:** not browser-smoked; the
allocation tab's column headers / picker placeholders / add-button remain hardcoded Uzbek (documented S3 follow-up).

## Deferred (documented for follow-up)

- **S3 (rest)** wire the allocation table's column headers «Счёт-фактура»/«Сумма», picker placeholders, «Добавить счёт»
  button, and row-remove aria to `pages.cash_in` i18n (add ~5 keys ru+uz — note `cash_in`/`cash_out` share the namespace
  shape, edit the cash_in block specifically).
- **S4** «Оплаченные документы» tab → moysklad's Привязать платёж + full allocation table layout.
- **I3** «Создать документ» «Счёт-фактура выданный на аванс» placeholder + backend.
- **I4/I5** «Приходный ордер» print form (Печать/Отправить) — per-doc print-template system.
- **I2/I6** «Открыть в API» extra + «?» help — shared `DetailToolbar`/`DetailHeader`.

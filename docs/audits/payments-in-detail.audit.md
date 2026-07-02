# payments-in/[id] — detail page parity audit

- **Module:** `payments-in` (Входящий платёж — incoming bank payment) detail/edit page
  (`apps/web/src/app/(app)/payments-in/[id]/page.tsx`)
- **Date:** 2026-06-01
- **Protocol:** v2.2 detail-page audit (6th detail page; 2nd **money document** — the structural twin of
  cash-in: no positions table, a payment-allocation tab instead).
- **Reference:** `docs/moysklad-reference/payments-in/detail/` — clean live `--detail` capture
  (edit-default DOM/PNG + 4 dropdown dumps + the «Связанные документы» tab).
- **Method:** 6-dimension fact-gathering workflow (`scripts/wf-payments-in-detail-audit.js`, 6 parallel agents,
  476k tokens) → operator (Opus) judged. Locale = Russian (`ru.json`). Precedent: `cash-in-detail.audit.md`.

## Verdict

payments-in is the unfixed twin of cash-in. It carried the **same three cash-in deltas** (tab-1 label hardcoded
Uzbek; missing inline «Задачи»; allocation block hardcoded Uzbek) **plus one new label delta** the cash-in audit
mismarked: the counterparty field showed «Плательщик» where moysklad shows «Контрагент». All four are fixed.
The allocation block is now **fully i18n'd** (going beyond cash-in's partial S3 — column headers / placeholders /
add-button / aria / picker secondary all wired). The remaining deltas (Создать/Печать/Отправить menus, Канал
продаж / Включая НДС / Валюта документа fields, the «Привязать платёж» table redesign, field order/grouping,
help/status-dropdown) are the same defer-classes as cash-in.

## A. Structural

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| S1 | Tab-1 label | «Оплаченные документы» | was **hardcoded Uzbek** «Taqsimlanish» | delta | high | **FIXED** — `positionsLabel={tDetailTabs('paid_documents')}` (key already existed) |
| S2 | «Задачи» surface | inline collapsible section | **absent** | missing_in_ours | high | **FIXED** — added inline `<DocumentTasksSection entity="PaymentIn">` (PaymentIn is whitelisted) |
| S3 | Allocation-tab body i18n | RU throughout | every string was **hardcoded Uzbek** (summary «Taqsimlangan»/«Qoldiq», header, empty, column headers, placeholders, add-button, row-remove aria, picker secondary) | delta | med | **FIXED (full)** — wired existing `allocation_title`/`allocation_empty` + added 9 keys to `pages.payments_in` (ru+uz): `allocated`(«Привязано»)/`remainder`(«Не привязано»)/`alloc_col_invoice`/`alloc_col_amount`/`select_payer_first`/`select_invoice`/`add_invoice`/`remove_row`/`invoice_remaining` |
| S4 | «Оплаченные документы» tab layout | «Привязать платеж» + «Перераспределить сумму платежа» + 10-col table (Тип документа/№/Пров./Дата/Орг/Контрагент/Статус/К оплате/Не оплачено/Оплачено из этого платежа) + Привязано/Не привязано | simpler 2-col allocation editor (Счёт-фактура + Сумма rows) | delta | med | DEFERRED — table/flow redesign (design + backend), same as cash-in S4 |
| S5 | Counterparty field label | «Контрагент» | was «Плательщик» (`tFields('payer')`) | delta | med | **FIXED** — `tFields('agent')` («Контрагент», the canonical key) on the field label, placeholder, and picker title. **Bug-class:** cash-in/cash-out/payments-out share this (cash-in reference also shows «Контрагент» — its S5 mismarked it «match»; cash-out/payments-out unverified — see follow-up) |
| S6 | «Файлы» surface | inline collapsible section | a separate TAB (filesSlot) | delta | med | DEFERRED — shared `DetailContentTabs` structural choice |
| S7 | «История»/«События» tab | — (no history tab in edit view) | a separate «История» tab (auditEntity) | extra_in_ours | low | DEFERRED — shared `DetailContentTabs` |
| S8 | «Связанные документы» tab | present | present (relatedGroups empty) | match | — | parity ✓ |

## B. Interactive

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| I1 | Save/Close/pager | «Сохранить»/«Закрыть»/pager | same (shared `DetailToolbar`) | match | — | — |
| I2 | «Изменить» items | {Удалить, Копировать} | Копировать · **Открыть в API** · Удалить | delta | low | DEFERRED — «Открыть в API» intentional dev superset (shared) + order |
| I3 | «Создать документ» | 1: «Счет-фактура выданный на аванс» | **absent** (no createMenuItems → no button) | missing_in_ours | med | DEFERRED — disabled label-parity placeholder + advance-facture backend (= cash-in I3) |
| I4 | «Печать» items | «Настроить...» only (no named form) | «Список заказов» (enabled, mis-scoped) · «Настроить...» | delta | med | DEFERRED — drop/disable «Список заказов» for money docs (shared print menu); «Настроить...» byte-matches |
| I5 | «Отправить» items | EMPTY (0 items) | «По электронной почте» (disabled) | delta | low | DEFERRED — print-form email (backend) |
| I6 | Inline «Статус ▾» dropdown | present | read-only state Badge (no dropdown) | missing_in_ours | med | DEFERRED — shared `DetailHeader` supports `stateMenuItems`; not wired for money docs |
| I7 | «?» help icon (title row) | present | absent | missing_in_ours | low | DEFERRED — shared `DetailHeader` has no help icon |
| I8 | Author «Изменения:» line | «Изменения: <name> <date>» | «Изменения: <name> <date>» | match | — | parity ✓ (the shared label fixed in the moves audit) |
| I9 | «Проведено» toggle | ☑ Проведено | ☑ Проведено | match | — | parity ✓ |

## Meta-field deltas (all deferred — backend/layout)

| Field | moysklad | ours | Disposition |
|---|---|---|---|
| Канал продаж | present (+ picker, + add) | absent | DEFER — needs SalesChannel entity (i18n key `detail_form.sales_channel` already exists) |
| Включая НДС | present (amount) | absent | DEFER — VAT not modeled (UZS-only) |
| Валюта документа * | «сум (UZS)» (required) | absent | DEFER — multi-currency not modeled (key `detail_form.currency` exists) |
| Счёт организации / Счёт контрагента | not visible in this capture | present (pickers) | UNCERTAIN — may be conditional on an existing bank account; needs a populated-account capture |
| Дата проведения (posted_at) | not shown; the right-col date is the **incoming date** paired with «Входящий номер» | shown disabled («Дата проведения») | DEFER — wire `incomingDate` into the form (interface already carries it) and drop posted_at slot |
| Комментарий | full-width textarea below the allocation table | single-line Input in the meta panel | DEFER — layout (control type + placement) |
| Field order/grouping | column-grouped (LEFT org/contract/project/channel/purpose/currency · RIGHT counterparty/sum/vat/incoming) | paired 2-col rows, different sequence | DEFER — layout |
| Назначение платежа | textarea | single-line Input (label matches) | DEFER — widget (input vs textarea) |
| Входящий номер | «Входящий номер» | `fields.incoming_number` = «Входящий №» | DEFER (low) — shared key (invoices-in, supplies); un-abbreviate only after verifying those refs |

## Fixed this session

| Ref | Fix | File |
|---|---|---|
| S1 | Tab-1 hardcoded Uzbek «Taqsimlanish» → «Оплаченные документы» | payments-in page (`positionsLabel={tDetailTabs('paid_documents')}`) |
| S2 | Added inline `<DocumentTasksSection entity="PaymentIn">` | payments-in page |
| S3 | Full allocation-block i18n (wired existing 2 keys + 9 new keys ru+uz) | payments-in page + `pages.payments_in` (ru.json/uz.json) |
| S5 | Counterparty label «Плательщик» → «Контрагент» (`tFields('payer')`→`tFields('agent')`, 3 spots) | payments-in page |

**Gates:** web typecheck 0 · biome clean · web **1214 pass / 1 skip** — no regression.
**HALOL:** not browser-smoked (additive i18n/label/prop only, no logic change).

## Deferred (documented for follow-up)

- **S4** «Оплаченные документы» tab → moysklad's «Привязать платеж» + «Перераспределить сумму платежа» + full
  10-column allocation table layout (design + backend). Same as cash-in S4.
- **S5 bug-class** the «Плательщик»/«Получатель»→«Контрагент» money-doc label delta: cash-in's reference also
  shows «Контрагент» (its audit mismarked it «match»); cash-out/payments-out unverified. Sweep when those are
  captured: `fields.payer`/`fields.payee` on the money-doc detail forms should resolve to «Контрагент».
- **I3** «Создать документ» «Счет-фактура выданный на аванс» placeholder + advance-facture backend.
- **I4** money-doc «Печать» menu: drop/disable the mis-scoped «Список заказов»; add named print forms (backend).
- **I5/I6/I7** «Отправить» email, inline «Статус ▾» dropdown, «?» help — shared `DetailToolbar`/`DetailHeader`.
- **Meta fields** Канал продаж / Включая НДС / Валюта документа / incoming-date / Комментарий-textarea /
  field-order — backend + layout (see table above).
- **Save-handler validation messages** (`'Forma yuklanmadi'`, `"To'lov summasi 0 dan katta bo'lsin"`, `schyot
  tanlang`, …) remain hardcoded Uzbek — a cross-cutting i18n debt identical across **all** money-doc detail
  pages (cash-in/cash-out/payments-out too); not a moysklad-comparable label. Dedicated i18n pass.

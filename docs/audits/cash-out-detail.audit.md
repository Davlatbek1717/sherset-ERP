# cash-out/[id] — detail page parity audit

- **Module:** `cash-out` (Расходный кассовый ордер / РКО) detail/edit page (`apps/web/src/app/(app)/cash-out/[id]/page.tsx`)
- **Date:** 2026-06-02
- **Protocol:** v2.2 detail-page audit — **sibling-parity method** (12th detail page audited). cash-out is the money-out
  mirror of the already-audited `cash-in` ([[cash-in-detail.audit.md]]).
- **Reference:** no fresh `--detail` capture exists (РКО is empty in the moysklad demo account → `openFirstRow` fails).
  Ground truth = (a) the **real cash-in capture** `docs/moysklad-reference/cash-in/detail/` (ПКО form; РКО is its
  structural twin, mutatis mutandis the in↔out direction) + (b) the **proven-correct cash-in implementation** (audited
  + fixed 2026-06-01).
- **Method:** byte-level normalized diff of `cash-out/[id]` vs `cash-in/[id]` (normalizing `in↔out`, `CashIn↔CashOut`,
  `invoiceOut↔invoiceIn`) to isolate every divergence, then judge each divergence as either a correct direction
  difference or a real delta. Locale = Russian (`ru.json`), UZ cross-checked.

## Verdict

cash-out is a **byte-perfect structural twin of the audited cash-in** with exactly **two** divergences from the
normalized diff:

1. `targetKind: 'invoicein'` vs cash-in's `'invoiceout'` — **correct** (РКО pays supplier invoices = invoices-in;
   ПКО closes customer invoices = invoices-out). Not a delta.
2. **Missing `<DocumentTasksSection>`** (no import, no render) — cash-in carries the inline «Задачи» section (added as
   its own audit's S2, "high"); cash-out never received it. **Real delta → FIXED this session.**

Everything else (counterparty label, allocation-tab i18n, FSM states, picker titles, validation messages, cash-desk
balance block) is already correct — the cash-in bug-class sweeps had already reached cash-out. Two earlier-suspected
deltas were investigated and **refuted** (see B-notes). The discovery of the Задачи gap triggered a **whitelist-grounded
bug-class sweep across 9 document-type detail pages** (see «Задачи bug-class» below).

## A. Structural

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| S1 | Tab-1 label | «Оплаченные документы» | `positionsLabel={tDetailTabs('paid_documents')}` | match | — | parity ✓ (shared `detail_tabs.paid_documents`, fixed during cash-in S1) |
| S2 | «Задачи» surface | inline section (universal moysklad document affordance) | **absent** (no `DocumentTasksSection`) | missing_in_ours | high | **FIXED** — added inline `<DocumentTasksSection entity="CashOut">` mirroring cash-in S2 (`CashOut` ∈ `TASK_ENTITY_WHITELIST`) |
| S3 | Allocation-tab body i18n | RU throughout | `t('allocation_title'/'allocation_empty'/'alloc_col_invoice'/'alloc_col_amount'/'select_invoice'/'add_invoice'/'remove_row')` | match | — | parity ✓ — cash-in S3 follow-up was completed in the money-group i18n conveyor (`d7006ee8`); `pages.cash_out` namespace is complete (verified 31 keys ru+uz) |
| S4 | «Оплаченные документы» tab layout | Привязать платёж + full allocation table | simpler allocation editor (Счёт + Сумма rows) | delta | med | DEFERRED — table redesign (design/backend), identical to cash-in S4 |
| S5 | Counterparty field label | «Контрагент» | `tFields('agent')` = «Контрагент» | match | — | parity ✓ — counterparty-label bug-class already swept here (cash-in S5 correction: `tFields('payee')`→`tFields('agent')`) |
| S5b | Other meta fields | Касса · Сумма · Назначение платежа · Проведён · Договор · Проект · Комментарий · Внешний код | same set | match | — | parity ✓ |
| S6 | Inline Файлы | present | present (`AttachmentsSection entity="CashOut"`) | match | — | parity ✓ |
| S7 | Cash-desk balance block | «Распределено / Остаток / Остаток в кассе» | same (`t('allocated'/'remainder'/'cash_desk_balance')`) | match | — | parity ✓ |

## B. Interactive

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| I1 | Save/Close/pager | «Сохранить»/«Закрыть»/pager | same (shared `DetailToolbar`) | match | — | — |
| I2 | «Изменить» items | {Удалить, Копировать} | Копировать · Открыть в API · Удалить | delta | low | DEFERRED — «Открыть в API» intentional dev superset (shared toolbar); identical to cash-in I2 |
| I3 | «Создать документ» | (advance-facture for outgoing) | absent (no createMenuItems) | missing_in_ours | med | DEFERRED — placeholder + advance-facture backend; mirrors cash-in I3 |
| I4 | «Печать» items | Расходный ордер · Настроить... | «Список заказов» (disabled) · Настроить... | delta | med | DEFERRED — needs «Расходный ордер» print form (backend); «Список заказов» mis-scoped shared label (= cash-in I4 / customer-orders I7) |
| I5 | «Отправить» items | Расходный ордер | email composer (disabled) | delta | low | DEFERRED — print-form email (backend); mirrors cash-in I5 |
| I6 | Status pill + «Проведено» + «?» | colored pill + ☑ Проведено + «?» | pill + ☑ Проведено (no «?») | delta | low | DEFERRED — help tooltip (shared `DetailHeader`); mirrors cash-in I6 |
| I7 | `select_payer_first` referent | counterparty is the **получатель** for РКО | key **name** is `select_payer_first` but its **value** = «Сначала выберите контрагента» (counterparty) | match | — | **refuted as a bug** — the user-visible string says «контрагента», correct for both ПКО/РКО; only the legacy key *name* says "payer" (not rendered). No churn. |
| I8 | Allocation target filter | supplier invoices, posted/partially_paid | `invoiceInFetcher` filters `state === 'posted' || 'partially_paid'` | match | — | parity ✓ (correct in↔out direction) |

## Fixed this session

| Ref | Fix | File |
|---|---|---|
| S2 | Added inline `<DocumentTasksSection entity="CashOut">` (import + render block, mirroring cash-in S2) | `cash-out/[id]/page.tsx` |

## Задачи bug-class (whitelist-grounded sweep — `DocumentTasksSection`)

Discovering cash-out's missing «Задачи» exposed a **bug-class**: the universal moysklad document affordance «Задачи»
(inline `<DocumentTasksSection>`) was present on only 7 detail pages, while `apps/api/src/modules/task/task.schema.ts`
`TASK_ENTITY_WHITELIST` (the codebase's own contract for which entities support tasks) lists **19 entities**. Ten
whitelist-confirmed entity detail pages were missing the section.

**Swept this session (9 document-type pages → all now carry the inline section):**

| Page | Entity | How |
|---|---|---|
| cash-out | CashOut | manual (primary audit) |
| payments-out | PaymentOut | manual (direct mirror of payments-in) |
| invoices-out | InvoiceOut | codemod sweep |
| invoices-in | InvoiceIn | codemod sweep |
| sales-returns | SalesReturn | codemod sweep |
| purchase-returns | PurchaseReturn | codemod sweep |
| losses | Loss | codemod sweep |
| enters | Enter | codemod sweep |
| inventories | Inventory | codemod sweep |

All 9 use the identical deterministic edit (import + a `mt-6` Задачи block immediately before the `mt-4` AttributesEditor),
matching the proven placement in demands/[id]:1022 and supplies/[id]:843. Each verified: biome clean, correct entity name.

**Coverage after this session:** **16 of 19** `TASK_ENTITY_WHITELIST` entities now have the inline section
(the 9 swept + the 7 pre-existing: customer-orders, demands, supplies, moves, purchase-orders, cash-in, payments-in).

**Deferred (whitelist-confirmed but CRM/catalog layout — not a simple inline add):**

- **counterparties** (Counterparty) — «Задачи» belongs to the deferred RIGHT CRM widget (counterparties-detail.audit.md
  **S17**, "high", big structural refactor + Activity/Tasks/Показатели backend). Not an inline section.
- **opportunities** (Opportunity) — CRM card, same right-rail widget concern.
- **products** (Product) — catalog card; moysklad surfaces tasks differently. Placement needs judgment (products audited
  separately; not lumped into a document-style inline add).

These three await the S17 CRM right-rail widget work — tracked there, not re-opened here. _(Entities NOT in the whitelist —
internal-orders, counterparty-adjustments, prepayments, prepayment-returns, processings, processing-orders, productions,
work-orders — are intentionally out of scope: the codebase contract says their entity does not support tasks. If
moysklad is later confirmed to show «Задачи» on any of them, that is a separate decision to extend the whitelist.)_

**Gates (whole session):** web typecheck 0 · biome 0 (9 files) · web **1230 pass/1 skip** · i18n key-existence **8014**
ru+uz + no-hardcoded. **HONEST:** not browser-smoked — the change is additive (renders a component already proven on
7 pages, server-whitelisted per entity); no new i18n keys, no logic change.

## Deferred (documented for follow-up)

- **S3 (rest)** / **S4** «Оплаченные документы» tab → moysklad's «Привязать платёж» + full allocation table layout
  (shared with cash-in S4 — one redesign covers both ПКО/РКО).
- **I3** «Создать документ» advance-facture placeholder + backend.
- **I4/I5** «Расходный ордер» print form (Печать/Отправить) — per-doc print-template system.
- **I2/I6** «Открыть в API» extra + «?» help — shared `DetailToolbar`/`DetailHeader`.
- **Задачи on CRM/catalog cards** (counterparties/opportunities/products) — via the S17 right-rail CRM widget.

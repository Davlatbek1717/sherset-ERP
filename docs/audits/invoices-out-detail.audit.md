# invoices-out/[id] — detail page parity audit

- **Module:** `invoices-out` (Счёт покупателю / customer invoice) detail/edit page
  (`apps/web/src/app/(app)/invoices-out/[id]/page.tsx`)
- **Date:** 2026-06-03
- **Protocol:** v2.2 detail-page audit — **sibling-parity method** (16th detail page audited).
- **Reference:** no usable fresh `--detail` capture for invoices-out (route-walled / demo-empty;
  `docs/moysklad-reference/invoices-out/detail/` is an empty placeholder; `states/` holds only LIST-page
  captures). Ground truth = a hybrid of:
  - (a) the **already-audited in↔out twin** `invoices-in/[id]` ([[invoices-in-detail.audit.md]], Счёт family,
    mirrored direction: customer↔supplier, payment-in↔payment-out, customer-order↔purchase-order);
  - (b) the **real moysklad detail captures** for the goods-document siblings `demands/detail/edit-tab-main.html`
    and `supplies/detail/edit-tab-main.html` (these PROVE the first content tab label — see «Главная» bug-class).
- **Method:** field-by-field diff of `invoices-out/[id]` against the audited `invoices-in/[id]` twin, judging each
  divergence as a correct in↔out direction difference or a real delta. Run as an adversarial workflow
  (`scripts/wf-invoices-out-sibling-parity-audit.js`, `wf_0405b09c-30e`): a diff agent + a first-tab bug-class agent
  in parallel, then **each candidate delta independently blind-verified** by a direction-aware agent (which also
  re-checked the backend schema/service). Locale = RU (`ru.json`), UZ cross-checked.

## Verdict

invoices-out is a **correct, doc-appropriate sibling of the Счёт family**. The full field-by-field diff against the
audited invoices-in twin found that **almost every divergence is a correct in↔out mirror** (counterparty=customer,
downstream payment-in, linked customer-order, sales_channel, email wiring, print wiring, FSM derived states,
sell-price source). **Two** divergences were NOT explained by direction (both **FIXED**), plus a **shared** first-tab
label bug (FIXED + swept):

1. **«План. дата оплаты» (paymentPlannedMoment) was read-only** on invoices-out (and dropped from the PATCH), while
   editable + saved on invoices-in. **HIGH — FIXED.** The invoice-out backend already accepts and persists it
   (schema + service), AND the invoices-out `/new` form lets you set it at creation — so you could set the planned
   payment date when creating but never edit it afterward. Made it an editable `<Input type="date">` bound to form
   state + added to the PATCH payload (mirrors invoices-in). Blind-verified **confirmed (high)**.
2. **«Запросить оплату» header button render-guard** differed: invoices-out rendered it *disabled* in non-payable
   states; invoices-in *hides* it entirely (renders only when `!isPaid && canCreatePayment`). **LOW — FIXED** by
   aligning invoices-out to the audited twin (hide when not payable — you cannot request payment on a non-payable
   doc). Twin-consistency reconciliation; not capture-proven (no detail-header capture), low-risk.
3. **First content tab showed «Позиции»** (DetailContentTabs default) instead of moysklad's **«Главная»** — the same
   S1-class bug the returns audit fixed. **FIXED** on invoices-out + **swept across 8 more goods-document pages**
   (see «Главная» bug-class). `productions` deliberately EXCLUDED (its first tab is a child-orders list, not goods).

The absence of supplier-only fields (Вх. номер / Вх. дата) and the presence of sales_channel + email are **correct**
for a customer invoice.

## A. Structural

| # | Element | moysklad (expected) | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| S1 | «План. дата оплаты» (paymentPlannedMoment) | editable date (overdue derives from it) | was read-only disabled `<Input>`, omitted from PATCH | delta | **high** | **FIXED** → editable `<Input type="date">` bound to form + added to payload (mirrors invoices-in; backend persists it) |
| S2 | Counterparty field label | «Покупатель» | `tFields('customer')` = «Покупатель» | match | — | parity ✓ (correct customer referent; in↔out mirror of invoices-in `supplier`) |
| S3 | First content tab label | «Главная» (proven by demand/supply capture) | was default «Позиции» (positionsLabel omitted) | delta | med | **FIXED** → `positionsLabel={tDetailTabs('main')}` (+ swept 8 more pages, see below) |
| S4 | sales_channel «Канал продаж» | present (sales-side) | `tFields('sales_channel')` CatalogPickerField | match | — | parity ✓ (correct — sales channel is sales-only; invoices-in has none) |
| S5 | Linked document | «Заказ покупателя» link | `tFields('customer_order')` → `/customer-orders/:id` | match | — | parity ✓ (in↔out mirror of invoices-in `linked_purchase_order`) |
| S6 | Payment tracking | Оплачено / Остаток + «Не оплачен» badge + «Запросить оплату» | `paid`/`balance` fields + `not_paid` badge + `request_payment` button | match | — | parity ✓ (button render-guard reconciled, see I-row below) |
| S7 | Supplier-only meta (Вх. номер / Вх. дата) | — (absent on a customer invoice) | absent | match | — | parity ✓ (these are supplier-invoice-only; correctly omitted) |
| S8 | «Задачи» surface | inline section | `<DocumentTasksSection entity="InvoiceOut">` | match | — | parity ✓ (`InvoiceOut` ∈ `TASK_ENTITY_WHITELIST`) |
| S9 | Inline Файлы + Attributes | present | `AttachmentsSection` + `AttributesEditor entity="InvoiceOut"` | match | — | parity ✓ |

## B. Interactive

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| I1 | Save/Close/pager/clone/delete | shared `DetailToolbar` | same | match | — | — |
| I2 | «Запросить оплату» button guard | (request-payment is a posted/payable affordance) | was rendered-disabled in draft; twin hides it | delta | low | **FIXED** → `{!isPaid && canCreatePayment && …}` + `disabled={createPaymentMut.isPending}` (mirrors invoices-in; hides when not payable) |
| I3 | FSM inline state dropdown | draft/posted (+ derived sent/overdue/paid) | inline menu offers draft/posted; STATE_TONE has sent/partially_paid/paid/overdue/cancelled | match | — | parity ✓ — sales-invoice FSM (derived sent/overdue via InvoiceOutOverdueService); intentionally differs from invoices-in's explicit cancelled |
| I4 | «Создать документ» menu | payment-in | `tDetailTitles('payment_in')` = «Входящий платёж» | match | — | parity ✓ (singular detail_titles convention; in↔out mirror of invoices-in payment-out) |
| I5 | «Печать» | Счёт покупателю print form | `onPrintList` → `/print/invoice-out/:id` (route exists) | match | — | parity ✓ — invoices-out print IS wired (unlike invoices-in, whose `/print/invoice-in` is deferred) |
| I6 | «Отправить» (email) | sales invoice emailed to customer | `onSendEmail` + `SendEmailDialog` (email_template subject_invoice/body_invoice) | match | — | parity ✓ (correct — sales doc; invoices-in correctly has none) |
| I7 | State tone | posted = blue/brand (billing doc) | `STATE_TONE.posted='brand'` | match | — | parity ✓ (matches invoices-in) |

## Fixed this session

| Ref | Fix | File |
|---|---|---|
| S1 | paymentPlannedMoment: read-only → editable `<Input type="date">`; added to FormState/seed/snapshot + PATCH payload | `invoices-out/[id]/page.tsx` |
| I2 | «Запросить оплату» button: `{!isPaid && …}` disabled-guard → `{!isPaid && canCreatePayment && …}` hide-guard (mirror twin) | `invoices-out/[id]/page.tsx` |
| S3 | first tab `positionsLabel={tDetailTabs('main')}` = «Главная» (+ tDetailTabs hook) | `invoices-out/[id]/page.tsx` |

No new i18n keys — `fields.payment_planned` and `detail_tabs.main` already exist in ru + uz.

## «Главная» first-tab bug-class (capture-grounded sweep)

invoices-out's «Позиции» first tab exposed a **bug-class**: `<DetailContentTabs>` defaults its first-tab label to
`tDetailTabs('positions')` = «Позиции» (detail-content-tabs.tsx:73), but moysklad shows **«Главная»** for goods
documents. **Capture proof:** `docs/moysklad-reference/{demands,supplies}/detail/edit-tab-main.html` show «Главная»
(the tab) + «Товары» (the goods section) — «Позиции» appears in NEITHER. The audited goods siblings
(demands/supplies/customer-orders/moves/sales-returns/purchase-returns) all pass `positionsLabel={tDetailTabs('main')}`;
money docs (cash/payments) pass a different label («Оплаченные документы») — correctly NOT «Главная».

**10 pages omitted positionsLabel. A blind bug-class agent classified each by its first-tab CONTENT; 9 are goods
documents → «Главная», 1 is NOT.** Swept (added `tDetailTabs` hook + `positionsLabel={tDetailTabs('main')}`):

| Page | First-tab content | Confidence | Result |
|---|---|---|---|
| invoices-out | PositionEditor goods table | proven | «Главная» (this audit) |
| invoices-in | PositionEditor goods table | proven | «Главная» (twin; closes its S9 "ambiguous") |
| enters | PositionEditor goods table | proven | «Главная» |
| losses | PositionEditor goods table | proven | «Главная» |
| purchase-orders | PositionEditor goods table | proven (twin of customer-orders = «Главная») | «Главная» |
| internal-orders | PositionEditor goods table (+moved-qty overlay) | proven | «Главная» |
| inventories | goods qty/variance table | high | «Главная» |
| processing-orders | BOM materials goods table + totals | high | «Главная» |
| processings | 2× PositionEditor (materials + output) + BOM | high | «Главная» |
| **productions** | **child processing-orders LIST + posted card — NOT a goods table** | **uncertain** | **DEFERRED — «Позиции» is wrong but «Главная» is not clearly correct; needs a real moysklad production-detail capture (over-reach guard)** |

This closes invoices-in's S9 ("«Позиции» vs «Товары» — awaiting capture"): the demand/supply captures resolve it to
«Главная» for the whole goods-document class.

## Gates

web typecheck **0** · biome **0** · i18n key-existence ru+uz + no-hardcoded (0 new keys) · web Vitest suite (no
regress — the DetailContentTabs default «Позиции» component test is unchanged; e2e asserts demands/customer-orders by
test-id, not «Позиции»). **HONEST:** not browser-smoked — invoices-out is demo-empty (no seeded record to navigate);
the paymentPlannedMoment edit is a typed mirror of the proven invoices-in field (same backend endpoint, schema +
service verified to persist it); the «Главная» sweep is a value-only i18n key already proven on the sibling pages.

## Deferred (documented for follow-up)

- **productions** first-tab label — needs a real moysklad production-detail capture before relabeling (the only
  member of the 10 that is NOT a goods table).
- **invoices-out I-row / «Запросить оплату»** — reconciled to the twin on a consistency basis; a real detail-header
  capture (draft state) would confirm show-disabled vs hide as canonical.
- **«Печать»** parity of the actual print template content (`/print/invoice-out` route exists and is wired; template
  fidelity is a separate print-template audit).

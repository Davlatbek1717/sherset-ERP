# invoices-in/[id] — detail page parity audit

- **Module:** `invoices-in` (Счёт поставщика / supplier invoice) detail/edit page
  (`apps/web/src/app/(app)/invoices-in/[id]/page.tsx`)
- **Date:** 2026-06-02
- **Protocol:** v2.2 detail-page audit — **sibling-parity method** (13th detail page audited).
- **Reference:** no usable fresh `--detail` capture for invoices-in (route-walled / demo-empty;
  `docs/moysklad-reference/invoices-in/detail/` does not exist, only `states/`). Ground truth =
  a **hybrid** of:
  - (a) the **in↔out structural twin** `invoices-out/[id]` (Счёт покупателю — same «Счёт» document
    family, mirrored direction: supplier↔customer, payment-out↔payment-in, purchase-order↔customer-order);
  - (b) the **audited** purchase-group sibling `supplies/[id]` ([[supplies-detail.audit.md]], has a real
    moysklad capture) for the shared scaffolding (toolbar / header / meta-panel idiom / position editor /
    «Задачи» / attributes) and the **«Создать документ» singular-label convention**.
- **Method:** field-by-field diff of `invoices-in/[id]` against the `invoices-out/[id]` twin (judging each
  divergence as a correct direction difference or a real delta), cross-checked against the audited supplies
  convention. Every finding was **independently re-derived** by a 6-agent verification workflow
  (`create-menu-label-verify`, blind to these conclusions) and the singular-vs-plural convention was
  **grounded in real moysklad captures** (see «Создать документ» bug-class below). Locale = RU (`ru.json`),
  UZ cross-checked.

## Verdict

invoices-in is a **correct, doc-appropriate sibling of the Счёт family** with exactly **one** real,
fixable delta and **one** deferred (backend) gap:

1. **«Создать документ» menu item mislabeled** (`tCreate('cash_in')` = «Приходные ордеры») while its action
   creates a **payment-out** (`/payments-out/from-invoice-in/`). Wrong direction (incoming-cash name on an
   outgoing-payment action) **and** the wrong namespace (list-page plural list-title on a detail-page
   create-action). **Real delta → FIXED this session** (`tDetailTitles('payment_out')` = «Исходящий платёж»).
   The discovery triggered a **bug-class sweep across 6 detail pages** (see below).
2. **«Печать» not wired** — no `onPrintList`, and no `/print/invoice-in/[id]` route exists.
   **DEFERRED** (needs a supplier-invoice print template page; same disposition as cash-out I4).

Everything else is **correct for a supplier invoice** and either mirrors the invoices-out twin (payment
tracking, counterparty=supplier, FSM/tone) or matches the audited supplies convention (meta-panel idiom,
«Задачи», attributes). The absence of «Отправить» (email) is **correct** — a supplier invoice is not emailed
out (supplies likewise has none).

## A. Structural

| # | Element | moysklad (expected) | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| S1 | «Создать документ» payment item | singular «Исходящий платёж» (detail-page convention) | was `tCreate('cash_in')`=«Приходные ордеры» (plural, incoming) | delta | **high** | **FIXED** → `tDetailTitles('payment_out')` (mirrors audited supplies create-menu) |
| S2 | Counterparty field label | «Поставщик» | `tFields('supplier')` = «Поставщик» | match | — | parity ✓ (correct purchase-side referent; in↔out mirror of invoices-out `customer`) |
| S3 | Supplier-invoice meta fields | Вх. номер · Вх. дата · План. дата оплаты · Договор · Проект · Склад · счета · Оплачено · Остаток · Комментарий · Внешний код | same set | match | — | parity ✓ — `incoming_number`/`incoming_date` present (correct: a supplier invoice carries the supplier's own number/date; invoices-out has neither) |
| S4 | План. дата оплаты | editable | editable `Input type=date` (+ saved in PATCH payload) | match | — | parity ✓ (correct for a supplier invoice; note: the invoices-out twin renders it **read-only** — a possible invoices-out gap, out of scope here) |
| S5 | Linked document | «Заказ поставщику» link | `tFields('linked_purchase_order')` → `/purchase-orders/:id` link | match | — | parity ✓ (in↔out mirror of invoices-out `customer_order`) |
| S6 | Payment tracking | Оплачено / Остаток + «Не оплачен» badge + «Запросить оплату» | `paid`/`balance` fields + `not_paid` badge + `request_payment` button | match | — | parity ✓ (correctly mirrors invoices-out payment-tracking; supplier invoices track «Оплачено»/«Остаток») |
| S7 | «Задачи» surface | inline section (universal moysklad document affordance) | `<DocumentTasksSection entity="InvoiceIn">` | match | — | parity ✓ (added in the 2026-06-02L «Задачи» bug-class sweep; `InvoiceIn` ∈ `TASK_ENTITY_WHITELIST`) |
| S8 | Inline Файлы + Attributes | present | `AttachmentsSection` + `AttributesEditor entity="InvoiceIn"` | match | — | parity ✓ |
| S9 | Tab-1 label | «Главная» (proven by demand/supply `edit-tab-main.html` captures) | was default `tDetailTabs('positions')` = «Позиции» | delta | low | **FIXED 2026-06-03** → `positionsLabel={tDetailTabs('main')}` = «Главная». Resolved by the invoices-out audit: the demand/supply captures show «Главная»+«Товары» (no «Позиции»), so the whole goods-document class = «Главная»; swept here too (see invoices-out-detail.audit.md «Главная» bug-class) |

## B. Interactive

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| I1 | Save/Close/pager/clone/delete | shared `DetailToolbar` | same | match | — | — |
| I2 | FSM inline state dropdown | draft/posted/cancelled | `buildDocStateMenu(['draft','posted','cancelled'])` | match | — | parity ✓ — matches the audited supplies purchase-doc FSM (cancelled in the inline menu); invoices-out (sales) differs intentionally (sent/overdue derived) |
| I3 | State tone | posted = blue/brand (billing doc) | `STATE_TONE.posted='brand'` | match | — | parity ✓ (matches invoices-out; supplies=success green because Приёмка completes stock) |
| I4 | «Создать документ» menu completeness | multiple downstream docs (Приёмка / Исходящий платёж / Расходный ордер / Возврат / факт.) | single payment-out item | partial | med | DEFERRED — menu expansion needs from-invoice-in backends (same pattern as cash-out I3) |
| I5 | «Печать» | Счёт поставщика print form | `onPrintConfigure` only, **no `onPrintList`** (no `/print/invoice-in` route) | missing_in_ours | med | DEFERRED — needs a `/print/invoice-in/[id]` template page (cf. cash-out I4) |
| I6 | «Отправить» (email) | — | absent (no `onSendEmail`) | match | — | parity ✓ — a supplier invoice is not emailed out; matches audited supplies (only sales docs — invoices-out/demands/customer-orders — carry SendEmailDialog) |

## Fixed this session

| Ref | Fix | File |
|---|---|---|
| S1 | `tCreate('cash_in')` («Приходные ордеры») → `tDetailTitles('payment_out')` («Исходящий платёж»); removed now-unused `tCreate` hook | `invoices-in/[id]/page.tsx` |

## «Создать документ» bug-class (verified + capture-grounded sweep)

invoices-in's mislabeled create-item exposed a **bug-class**: several detail-page «Создать документ» menus
borrowed the **list-page** `create_related.*` namespace (plural list-titles, sometimes the wrong referent)
instead of the **detail-page** `detail_titles.*` namespace (singular document names).

**Root cause confirmed by real captures.** Two distinct moysklad surfaces, two namespaces:
- **List-page** «Создать ▾» dropdown → **plural** list-titles. Captured: `create-related-dropdown.tsx`
  cites `docs/moysklad-reference/.../03-module/demand/screenshots/i-dropdown-sozdat.dom.html` showing
  «Приходные ордеры» / «Входящие платежи». This component is **correct as-is** — left untouched.
- **Detail-page** «Создать документ» dropdown → **singular** document names. Captured:
  `docs/moysklad-reference/{demands,supplies}/detail/edit-dropdown-sozdat.png` showing «Входящий платёж» /
  «Приходный ордер» / «Отгрузка». The already-audited `supplies/[id]` and `demands/[id]` deliberately use
  `tDetailTitles('…')` here. The bug was other detail pages reusing the list namespace.

**Swept this session (6 detail pages → all now use the singular `detail_titles` create-action names):**

| Page | Item | Was → Now | Action creates | Sev |
|---|---|---|---|---|
| invoices-in | payment-out | `cash_in` «Приходные ордеры» → `payment_out` «Исходящий платёж» | payment-out | high |
| purchase-orders | invoice-in | `demand` «Отгрузки» → `invoice_in` «Счёт поставщика» | invoice-in | high |
| purchase-orders | payment-out | `cash_in` «Приходные ордеры» → `payment_out` «Исходящий платёж» | payment-out | high |
| purchase-orders | supply | `supply` «Снабжение» → `supply` «Приёмка» | supply | med |
| internal-orders | move | hardcoded uz `"Ombor o'tkazish"` → `move` «Перемещение» | move | high |
| customer-orders | demand | `demand` «Отгрузки» → `demand` «Отгрузка» | demand | low |
| customer-orders | payment-in | `payment_in` «Входящие платежи» → `payment_in` «Входящий платёж» | payment-in | low |
| invoices-out | payment-in | `payment_in` «Входящие платежи» → `payment_in` «Входящий платёж» | payment-in | low |
| counterparties | demand | `demand` «Отгрузки» → `demand` «Отгрузка» | demand | low |

Notes:
- **3 high-severity wrong-referent** items (purchase-orders invoice-in named «Отгрузки»; two payment-out
  items named «Приходные ордеры»/incoming) — the «Создать» menu literally offered the wrong / opposite
  document. + **1 med** wrong-word («Снабжение» instead of «Приёмка»). + **1 high** hardcoded-uz leak
  (internal-orders). + **4 low** plural→singular.
- All fixes are pure **call-site key swaps** (no new i18n keys — every `detail_titles.*` target already
  exists in **both** ru + uz); RU and UZ are corrected simultaneously. Now-unused `tCreate` hooks removed
  from the 5 pages that no longer reference `create_related`.
- **No change** (already-correct singular values, left to avoid churn): customer-orders `invoice_out`
  (= «Счёт покупателю», switched to detail_titles for namespace consistency only — identical rendered value);
  counterparties `customer_order`/`invoice_out` (identical values, switched for consistency). Legit remaining
  `tCreate` uses: supplies `facture_in`, demands `facture_out`/`sales_return` (singular values with no
  detail_titles equivalent — correct).

**Coverage:** all detail-page createMenuItems audited. Pages with empty/absent create menus
(opportunities, pipelines, cash-in/out, payments) or HR-specific labels (payrolls `create_cashout` =
«Наличная выплата», a deliberate doc-appropriate cash-payout label) need no change.

## Gates

web typecheck **0** · biome **0** (6 files) · i18n key-existence **8015** ru+uz + no-hardcoded · web
**1230 pass / 1 skip**. **HONEST:** not browser-smoked — the change is value-only i18n (call-site key swaps
to keys already proven on the audited supplies/demands pages); no new keys, no logic change. The list-page
`DemandCreateRelatedDropdown` test still passes (its plural labels are correct per its own capture and were
not touched).

## Deferred (documented for follow-up)

- **I4** «Создать документ» menu expansion (Приёмка / Расходный ордер / Возврат поставщику / Счёт-фактура
  полученный from-invoice-in) — backends.
- **I5** «Печать» — needs a `/print/invoice-in/[id]` supplier-invoice template page + `onPrintList` wiring.
- ~~**S9** tab-1 label («Позиции» vs «Товары») — awaits a real invoices-in/invoices-out detail capture.~~ ✅ FIXED 2026-06-03 → «Главная» (demand/supply `edit-tab-main.html` captures resolved it; goods-document class = «Главная»).
- **invoices-out S4** План. дата оплаты is read-only on the twin (possibly should be editable, as on
  invoices-in) — a candidate finding for a future invoices-out detail audit.

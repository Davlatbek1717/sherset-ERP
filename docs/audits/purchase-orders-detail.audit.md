# purchase-orders/[id] — detail page parity audit

- **Module:** `purchase-orders` detail/edit page (`apps/web/src/app/(app)/purchase-orders/[id]/page.tsx`)
- **Date:** 2026-06-03c
- **Protocol:** v2.2 detail-page audit (17/63) — **capture-grounded sibling-parity**
- **Twin reference:** `customer-orders/[id]` («Заказ покупателя») — the sales↔purchase mirror, audited
  2026-06-01 (`docs/audits/customer-orders-detail.audit.md`).
- **Real moysklad capture (unlike the customer-orders audit, the PO DETAIL page IS captured):**
  `docs/moysklad-reference/visual-captures/02-module/purchaseorder/` — edit form (`09/23/39/54-edit-default`),
  all four detail toolbar dropdowns (`10-izmenit`, `11-sozdat-dokument`, `12-pechat`, `13-otpravit`),
  status dropdown (`04`), and per-tab captures (`14-positions`, `15-linked`, `16-files`, `17-tasks`, `18-events`).
- **Method:** capture-grounded adversarial workflow `scripts/wf-purchase-orders-sibling-parity-audit.js`
  (run `wf_49ec851a-c8f`, 25 agents): 4 parallel gather lenses (sibling-diff vs twin · real-capture structural ·
  detail-page dropdowns · targeted bug-hunt) → dedup (21 findings) → **blind direction-aware verification** of each.
  Operator (Opus) then independently re-verified every confirmed delta against the backend before fixing.
  Locale compared = **Russian** (reference is RU; our labels via `apps/web/src/messages/ru.json`).

## Verdict

The PO detail page was **structurally strong** (toolbar, header, meta labels, FSM, create-menu all mirror-correct),
but the audit surfaced a **high-value cross-cutting money bug** plus a cluster of PO-specific deltas — several of
which the workflow's own brief initially mis-classified as "correct mirrors" and were caught only by the operator's
independent backend verification (most importantly the missing **currency selector**).

**🔴 Cross-cutting bug-class — totals VAT math (F20, HIGH):** the totals sidebar computed
`subtotal = vatIncluded ? sum−vat : sum` / `total = vatIncluded ? sum : sum+vat`. The backend (`computeTotals`,
identical across every document service) stores `sumMinor` as the **GROSS** total (net+VAT) and `vatSumMinor` as
the VAT in **both** `vatIncluded` modes. So in the schema-DEFAULT `vatIncluded=false` case the page showed the
gross as the subtotal and **double-counted VAT in the total** (net + 2·VAT). The identical buggy expression lived
in **9 document detail pages** (customer-orders, demands, internal-orders, invoices-in/out, purchase-orders,
purchase/sales-returns, supplies) — including the already-audited customer-orders (the first audit missed it).
Fixed by extracting the math into a single tested helper `apps/web/src/lib/doc-totals.ts`
(`{ subtotal: sum−vat, total: sum }`, correct in all modes incl. VAT-disabled) consumed by all 9 pages, with a
unit test (`doc-totals.test.ts`, 5 cases). Decision logged with the user (scope = fix all 9 + test).

---

## A. Structural / fields

| # | Element | moysklad | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| S1 | Tab 1 label | «Главная» | «Главная» | match | — | already fixed (2026-06-03b «Главная» sweep) |
| F1 | «План. дата ___» field label | «План. дата приёмки» (RECEIPT — capture `09-edit-default`) | «Планируемая дата отгрузки» (SHIPMENT — `tFields('delivery_planned')`) | delta | high | **FIXED** — new `detail_form.delivery_planned_receipt` (ru «План. дата приёмки» / uz), rewired |
| F5 | «Внешний код» placement | below the positions (capture: bottom comment cluster) | inside the top meta panel, no maxLength | delta | low | **FIXED** — moved to `<FormField>` under positions tab, `maxLength={50}`, mirror customer-orders |
| Fcur | «Валюта документа» currency selector | present (backend persists it; our `/new` sets it) | **absent entirely** — page never read/sent `currency` | missing_in_ours | high | **FIXED** — `<select>` mirror of customer-orders; wired into interface/form/snapshot/PATCH (draft-only). Backend already accepts it (`purchase-order.service.ts:354`) |
| F2 | Position actions: «Проверить комплектацию» | present (capture `54-edit-default` + twin) | only «Добавить из справочника» | missing_in_ours | med | **FIXED** — added disabled («скоро») button, mirror customer-orders (`detail_form.check_bundle`) |
| F3 | «Связанные документы» tab content | populated diagram (capture `15-edit-tab-linked`: Приёмки/Счета поставщиков/Возвраты) | empty `RelatedDocsPanel` (`relatedGroups=[]`, no slot) | missing_in_ours | med | **DEFERRED** — needs a `GET /purchase-orders/:id/related` endpoint (FKs exist: Supply/InvoiceIn/PaymentOutOperation.purchaseOrderId); mirror customer-orders' RelatedDocsTab |
| F6 | «Дата проведения» (posted_at) meta field | not shown on twin | shown (read-only) | extra_in_ours | low | **DEFERRED** — twins disagree; capture too shallow to adjudicate; read-only, no save impact |

## B. Interactive / behaviour

| # | Element | moysklad | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| F16 | «Принято»/received_sum display | formatted money | **raw minor-units** (`value={data.receivedSumMinor}` → "150000000") | bug | high | **FIXED** — `formatMoney(…, data.currency, {displayAs:'none'})` (mirror enters/[id]) |
| F17 | «Ожидание» checkbox value | persisted `waiting` flag (capture: disabled checkbox) | **fabricated** from `receivedSum < sum` (could disagree with the stored flag) | bug | med | **FIXED** — bound to `data.waiting` (read-only, mirrors capture) |
| F21 | «Ожидание» checkbox tooltip | none (bare label) | `title=locked_when_posted` (a posting-lock message, mis-pasted) | bug | low | **FIXED** — removed |
| F18 | Position qty/discount in PATCH | string (backend `z.coerce.string()`) | `Number(p.quantity)` / `Number(p.discount)` — loses precision, can 400 on large/precise qty | bug | med | **FIXED** — pass raw strings (mirror `/new`) |
| F7 | «Договор» picker scope | scoped to the order's counterparty | unscoped (`/contracts?search` — lists all suppliers' contracts) | delta | low | **FIXED** — adds `agentId` filter (mirror customer-orders detail) |
| F19 | «Счёт организации» picker scope | scoped to the chosen organization | unscoped (`/organization-accounts?search`) | delta | med | **DEFERRED** — shared bug-class (customer-orders detail also unscoped); the `/new` page uses a *different* endpoint (`/bank-accounts?organizationId=`); avoid introducing a possibly-broken filter — fix the bug-class in a dedicated pass |
| F11/F12 | «Печать» single-order print | working «Заказ поставщику» print form (capture `06`/`09` toolbar) | only «Настроить…»; «Список заказов» disabled (no `onPrintList`, no print route) | missing_in_ours | med | **FIXED** — created `print/purchase-order/[id]/page.tsx` (mirror `print/customer-order`) + wired `onPrintList`. Reuses existing `doc_title.purchase_order` |
| F13 | «Отправить» → «По электронной почте» | functional (real PO toolbar shows live «Отправить ▾»; `PurchaseOrder` is email-whitelisted) | disabled (no `onSendEmail`) | missing_in_ours | med | **FIXED** — wired `onSendEmail` + `<SendEmailDialog entity="PurchaseOrder">` (reuses `email_template.subject_order`/`body_order`) |
| F4 | Posted-doc field editability | (unconfirmed) | PO PATCHes contract/project/accounts/externalCode/deliveryPlanned even when posted; twin freezes them | uncertain | med | **DEFERRED** — twins disagree; needs moysklad confirmation of which fields are editable post-проведение |
| F8 | «Проведено» toggle in terminal states | (unconfirmed) | PO guards cancelled/closed; twin does not | uncertain | low | **DEFERRED** — PO is *more* guarded; backend rejects illegal transitions either way |
| F9 | «Изменить» → «Открыть в API» item | absent (capture `10-izmenit` = only Удалить + Копировать) | present (shared `DetailToolbar` passes `apiData`) | extra_in_ours | low | **DEFERRED** — shared component issue affecting ~25 pages incl. the twin; «Открыть в API» is a real moysklad feature elsewhere; do not strip per-page inconsistently |
| F10 | «Изменить» menu item order | Удалить first, then Копировать (capture `10`) | Копировать first, separator, Удалить last | delta | low | **DEFERRED** — shared `DetailToolbar` ordering; verify across all doc captures before flipping globally |
| F14 | «Создать документ» full item list | not capturable (the menu popped a save-changes dialog; GWT portal not serialized) | Приёмка / Счёт поставщика / Исходящий платёж | uncertain | low | **NEEDS-CAPTURE** — our 3 targets are the mirror-correct purchase-side docs; can't confirm exhaustiveness |
| F15 | Inline «Статус» model | admin-configurable custom statuses (capture `04` = only «Настроить статусы») | fixed 3-state enum (draft/confirmed/cancelled) | uncertain | med | **NEEDS-CAPTURE** — structurally different model; underlying receipt FSM (Проведено/Ожидание) is the correct purchase mirror |

## Confirmed mirrors (correct sales↔purchase divergences — NO fix)

Counterparty «Поставщик» vs «Контрагент»/customer · no `sales_channel` · no ship-to `delivery_address` (goods are
received into a store) · «Ожидание» indicator vs «Не отгружено» pill · create-menu Приёмка/Счёт поставщика/Исходящий
платёж vs Отгрузка/Счёт покупателю/Входящий платёж · 3 manually-settable states (receipt-progression auto-advances)
vs 8 · buy-price (`buyPrice.value`) vs sale-price default · `CounterpartyBalanceInline` present on PO (ahead of the
twin — a customer-orders gap, S6, not a PO defect). Full list in the workflow output.

## Fixed (commit — this session, 2026-06-03c)

| Ref | Fix | Scope |
|---|---|---|
| **F20** | totals VAT math → shared `docTotals()` helper + unit test | **9 pages** (bug-class) |
| Fcur | «Валюта» currency selector wired (interface/form/snapshot/PATCH draft-only) | purchase-orders |
| F1 | «План. дата приёмки» label (new `detail_form.delivery_planned_receipt` ru+uz) | purchase-orders |
| F16 | received_sum `formatMoney(displayAs:'none')` | purchase-orders |
| F17/F21 | «Ожидание» → persisted `data.waiting`, mis-pasted tooltip removed | purchase-orders |
| F18 | position qty/discount as raw strings (precision) | purchase-orders |
| F7 | «Договор» picker scoped by `agentId` | purchase-orders |
| F2 | disabled «Проверить комплектацию» button | purchase-orders |
| F5 | «Внешний код» → `<FormField>` under positions, `maxLength={50}` | purchase-orders |
| F11/F12 | `print/purchase-order/[id]/page.tsx` + `onPrintList` | new print route |
| F13 | email: `onSendEmail` + `<SendEmailDialog entity="PurchaseOrder">` | purchase-orders |

**i18n:** 1 new key (`detail_form.delivery_planned_receipt`, ru+uz); everything else reused existing keys
(`detail_form.currency`/`check_bundle`/`external_code`, `form.currency_*`, `email_template.subject_order`/
`body_order`, `pages.print.doc_title.purchase_order` — already present, singular, correct).

**Gates:** web typecheck 0 · biome clean (12 files) · web **1235 pass/1 skip** (was 1230; +5 from `doc-totals.test.ts`,
0 regression) · i18n key-existence ru+uz green.

**HALOL (honest gaps):** not browser-smoked — purchase-orders demo data is empty, so the live render of the new
currency selector / received_sum format / email dialog / print page could not be exercised. F20 (money math) is
unit-tested at the helper level and verified against the backend `computeTotals` storage semantics, but a live
render with positions across both `vatIncluded` modes is the final confirmation — **recommended before shipping**
(applies to all 9 pages, incl. the re-opened customer-orders). The PO print page omits the supplier STIR line
because `purchase-order.findById` does not `include` the `uzRequisites` relation (graceful `?.inn` fallback);
adding it is a small backend follow-up.

## Deferred — follow-up

- **F19 + shared** «Счёт организации» picker scoping (bug-class: PO + customer-orders detail both unscoped) — fix
  with the `/bank-accounts?organizationId=` endpoint in a dedicated pass.
- **F3** «Связанные документы» population — needs `GET /purchase-orders/:id/related` (FKs already exist).
- **F4/F8** posted-doc editability + terminal-state toggle — need moysklad behaviour confirmation.
- **F9/F10** shared `DetailToolbar` «Открыть в API» item + «Изменить» menu order — cross-page, decide globally.
- **F14/F15** «Создать документ» exhaustiveness + custom-status model — need live capture.
- PO print STIR line — add `uzRequisites` to `purchase-order.findById` include.

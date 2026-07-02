# payments-out/[id] — detail page parity audit

- **Module:** `payments-out` (Исходящий платёж — outbound bank payment) detail/edit page
  (`apps/web/src/app/(app)/payments-out/[id]/page.tsx`)
- **Date:** 2026-06-03 (session 2026-06-03d)
- **Protocol:** capture-grounded sibling-parity (18th detail page; the incoming↔outgoing **money-doc twin** of
  the already-audited `payments-in` — `docs/audits/payments-in-detail.audit.md`).
- **Reference:** `docs/moysklad-reference/visual-captures/07-module/paymentout/` — a RICH real capture: detail
  (47-detail-default) + edit form (34-edit-default) + all 4 toolbar dropdowns (35-38, izmenit/sozdat/pechat/
  otpravit) + 5 edit tabs (39-43, positions/linked/files/tasks/events) + 3 field-picker modals (44 agent / 45 org /
  46 store). Cross-checked vs `paymentin/dom/47-detail-default.html` for the in↔out form diff.
- **Method:** 24-agent adversarial workflow `scripts/wf-payments-out-sibling-parity-audit.js` (`wf_94f8524c-a93`):
  4 parallel gather lenses (sibling-diff vs payments-in · capture-structural · detail-dropdowns · backend-anti-bias
  bug-hunt) → dedup (20 findings) → blind direction-aware verify. Briefs were **hardened against the
  purchase-orders "biased brief" failure** (verifiers told to treat the in↔out brief as non-authoritative and
  check the backend independently). **Operator (Opus) independently re-verified every confirmed delta against the
  Prisma schema + service + /new + the reference endpoint** — which caught two corrections the agents missed
  (see F19 currency / work-orders below). Locale = Russian (`ru.json`).

## Verdict

payments-out is the **well-mirrored twin** of payments-in: the fixes the payments-in audit applied
(counterparty label = «Контрагент», inline «Задачи», fully-i18n'd allocation block) were already inherited here,
so payments-out carried **no payments-in-style label/i18n debt**. The audit's value was the **in↔out asymmetry +
anti-bias backend cross-check**, which surfaced one genuinely payment-out-specific data-loss bug (clone drops the
purchase-order advance allocation) and confirmed a documented out-only required field («Статья расходов») is
unwired end-to-end. Most other deltas are **symmetric shared money-doc gaps** (currency / sales-channel / VAT /
status-dropdown / create-doc menu / comment widget / org-account picker scope / `/new` document-date) that
payments-in shares and the payments-in audit deferred — fixing them on payments-out alone would desync the twins,
so they are dispositioned as shared/cohort defers, not payments-out spot-fixes.

**Fixed this session:** F20 (clone data-loss, payment-out-specific) + the document-date silent-drop bug-class on
5 `/new` pages (user-approved sweep). **Deferred:** the out-specific «Статья расходов» feature, the shared
money-doc parity gaps, and the org-account picker-scope bug-class (user-deferred to a Phase-2 QA sweep + capture).

## A. Structural / field deltas

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| F1/F14/F17 | «Статья расходов» (expense item) | **required** form picker on the Исходящий form (capture 47/35); the *defining* out-vs-in field — absent from the Входящий form | no field; `PaymentOut.expenseItem` column + `ExpenseItem` catalog + list filter EXIST, but Create/Update schema + service + `/new` + detail PATCH all omit it | missing_in_ours | high | **DEFER (needs backend)** — add `expenseItem` to Create/Update schema + persist in create()/update(); then wire a picker on detail + /new. Out-specific (payment-in has no such column). No migration (column exists). |
| F2/F15/F19 | «Валюта документа» (currency + rate) | required, editable currency selector + rate view (capture 34) | no control; backend persists `currency`/`rateValue` (default UZS) but `/new` never sets them and detail PATCH omits them → UZS-only in-app | missing_in_ours | low | **DEFER (shared money-doc)** — symmetric with payments-in (its audit deferred «Валюта документа»). Multi-currency not modeled UI-wide. `/new` does NOT expose it either, so it is NOT the "set-at-creation-never-editable" class (the PO trap) — operator correction of the workflow's framing. |
| F4 | «Канал продаж» (sales channel) | form selector on the Исходящий form (capture 47) | no field; `salesChannelId` column exists, list-filter only | missing_in_ours | med | **DEFER (needs backend)** — symmetric with payments-in (both forms have it, both ours lack it). Add to Create/Update + findById include, then wire picker. |
| F5 | «Включая НДС» (VAT amount) | right-aligned amount input on the form (capture 47; **symmetric** — payment-in form has it too) | no field; `vatSumMinor` column exists, never read/written by API | missing_in_ours | low | **DEFER (needs backend)** — shared money-doc gap (payments-in lacks it too). |
| F3 | «Дата начисления» / document date | editable required calendar on the form (= the document `moment`) | detail shows `moment` only as read-only header text; `/new` had a date control that **dropped the value** (see bug-class below) | delta | med | `/new` drop **FIXED** (bug-class below). Detail in-form editable date = the deferred header-date-as-text design (`components/document-detail/README.md`). NB: the workflow finder mis-equated this with read-only `posted_at`=«Дата проведения» — that field is OUR system-timestamp addition (0 occurrences in capture), correctly read-only; operator correction. |
| F9 | «Счёт организации»/«Счёт контрагента» placement | not on the default form surface in this capture (likely in «Другие поля» / conditional) | rendered inline in the meta panel | uncertain | low | **DEFER (needs populated-account capture)** — do NOT remove (backend persists both, `/new` sets them; removal would orphan data). Same UNCERTAIN as payments-in. |

## B. Interactive deltas (all shared money-doc gaps — same defer-class as payments-in I3–I7)

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| F12 | «Создать документ» dropdown | enabled trigger (≥1 item: facture-IN advance «Счёт-фактура полученный») | dropdown hidden (no `createMenuItems`) | missing_in_ours | med | **DEFER (shared, do as a twin pass)** — payments-in also hides it (its audit I3). **Backend now exists** (`POST /factures-in/generate/from-payment-out`, `facture-in.service.generateFromPaymentOut`) → web-wireable; best done across both twins, not payments-out alone. |
| F13 | inline «Статус ▾» dropdown | interactive doc-status control (capture 26) | read-only state Badge (no `stateMenuItems`) | missing_in_ours | med | **DEFER (shared, do as a money-doc pass)** — payments-in/cash-in/cash-out also lack it (payments-in I6). Web-only (mirror invoices-out `stateMenuItems` → post/unpost/cancel) but should land across all money docs together. |
| F10 | «Печать» «Список заказов» item | money-doc «Печать» = «Настроить...» only | shared `DetailToolbar` renders «Список заказов» **disabled** + «Настроить...» (no `onPrintList`) | delta | low | **DEFER (shared toolbar)** — payments-in I4. Fix belongs in `DetailToolbar` (omit the named item when no `onPrintList`); payments-out is actually closer to moysklad than payments-in here (item already disabled). |
| F11 | «Отправить» email item | money-doc «Отправить» = empty | shared toolbar renders disabled «По электронной почте» | delta | low | **DEFER (shared toolbar)** — payments-in I5; print-form email is backend-gated. |
| F6 | «Назначение платежа» widget | 3-row `textarea` | single-line `Input` (label correct, field editable + persisted) | delta | low | **DEFER (shared widget class)** — payments-in deferred the identical Input-vs-textarea on both purpose + comment. |
| F7 | «Комментарий» widget | multi-line `textarea` | single-line `Input` (editable + persisted) | delta | low | **DEFER (shared layout class)** — payments-in S/comment row deferred. |

## Confirmed mirrors (correct in↔out differences — NOT deltas)

- Counterparty label «Контрагент» (`tFields('agent')`) — matches the moysklad outgoing form exactly (capture: «Контрагент» ×1, «Плательщик» ×0). **Resolves the payments-in S5 «Плательщик»→«Контрагент» bug-class for the OUT direction.**
- Allocation targets = invoice-IN + purchase-order (advance) vs payments-in's invoice-OUT + customer-order; tab-1 «Оплаченные документы»; title «Исходящий платёж»; query invalidations on invoice-in/purchase-order.
- `agentAccountFetcher` correctly scoped to `/counterparties/:agentId/bank-accounts`; raw-minor money inputs = shared money-doc pattern (precision-safe BigInt); posted-doc edit guard; negative-allocation guards. «Склад» field absence is correct (the 46-store-picker is a stray list-filter/nav artifact, not a payment-out form field).

## Fixed this session

| Ref | Fix | File | Test |
|---|---|---|---|
| **F20** | `clone()` op-map dropped `purchaseOrderId` → cloning a purchase-order (advance) allocation produced a target-less, schema-invalid row (advance allocation **silently lost**). Now mirrors `create()`'s targetKind-aware FK mapping. **Payment-out-specific** (PaymentOutOperation is polymorphic; PaymentIn ops are single-FK). | `apps/api/src/modules/payment-out/payment-out.service.ts` | `payment-out.service.test.ts` (3 cases: PO-advance / invoice-in / mixed) |
| **doc-date bug-class** (user-approved) | `/new` create payload omitted `moment`, so the operator-chosen document date was **silently discarded** → server `now()` (wrong period/ledger dating). Added `moment: docDate ? new Date(docDate).toISOString() : undefined` (mirrors the ~16 correct peer pages) to **5** pages: cash-in, cash-out, inventories, payments-in, payments-out. | each `/new/page.tsx` | `apps/web/src/__tests__/doc-date-payload.test.ts` (source-scan gate: every doc `/new` with a `docDate` control forwards it as `moment`/`plannedStartAt`) |

> **work-orders excluded from the doc-date sweep (operator correction).** The grep flagged 6 candidate pages, but
> `production/work-orders` has **no `moment` field** — its create uses `plannedStartAt`/`plannedEndAt`, and its
> `docDate` control is decorative (bound but never sent, no backend target). Adding `moment` there would be a
> no-op. The decorative work-order date control is a **separate** issue (needs product clarity on whether the date
> should map to `plannedStartAt`) — deferred, NOT part of this bug-class.

## Deferred (documented for follow-up)

- **«Статья расходов» (expenseItem)** — the out-specific required field; needs backend (Create/Update schema +
  service persist) + a `/settings/expense-items` picker on detail + `/new`. HIGH (it is required-on-create in
  moysklad). No migration (column + catalog exist).
- **Shared money-doc parity** (do as a **money-doc-wide pass across payments-in/out + cash-in/out**, not
  payments-out-alone): inline «Статус ▾» dropdown (F13, web-only), «Создать документ» facture menu (F12, backend
  endpoint exists), «Печать» «Список заказов» mis-scope (F10, shared `DetailToolbar`), «Отправить» email (F11),
  purpose/comment Input→textarea (F6/F7).
- **Backend-feature parity:** «Валюта документа» (multi-currency, F2), «Канал продаж» (F4), «Включая НДС» (F5) —
  all symmetric with payments-in; cross-cutting product decisions.
- 🔴 **org-account picker SCOPE bug-class (money-critical; deferred to Phase-2 QA sweep + capture by user
  decision):** `organizationAccountFetcher` calls `/organization-accounts` **without** `organizationId`, so the
  «Счёт организации» picker lists bank accounts across **ALL** organizations — an operator could post a payment
  from another legal entity's account. Live on **~13 detail + several `/new` pages** (customer-orders, invoices-in,
  invoices-out, payments-in [id]+new, payments-out [id]+new, prepayments [id]+new, prepayment-returns [id]+new,
  purchase-orders, purchase-returns, sales-returns, supplies). The reference endpoint **already accepts an
  `organizationId` filter** (`reference.controller.ts:19-60`), so the FE fix is one line per page. Adversarial
  verdict was **uncertain** on strict moysklad-parity (the captures don't surface the account picker to prove
  moysklad scopes it), so this is dispositioned as a **behavior-change sweep for Phase-2 QA**: confirm moysklad's
  scoping with a populated-account capture, then sweep all pickers (+ ideally a server-side org/account
  consistency guard in `post()`). Tracked in `NEXT.md` QA-backlog.

**Gates:** web typecheck 0 · biome 0 (changed files) · web Vitest (no regression; +1 doc-date gate file) · api
typecheck 0 · api Vitest (+3 clone tests). **HONEST:** not browser-smoked — payments-out is demo-empty. The F20
clone fix is unit-tested + mirrors `create()`; the doc-date fix is a peer-mirrored one-liner guarded by a
source-scan gate. A live "create-with-chosen-date → persisted date" smoke + the org-account-scope verification
belong to Phase-2 QA.

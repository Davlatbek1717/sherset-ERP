# work-orders/[id] — detail page parity audit

- **Module:** `production/work-orders` (Производственное задание / ТЗ — work order) detail page
  (`apps/web/src/app/(app)/production/work-orders/[id]/page.tsx`)
- **Date:** 2026-06-03 (session 2026-06-03f — Cohort C: Production-config)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_9c1c1462-736`, 24-agent:
  premise → diff → completeness critic → blind refute-default verify). **Operator (Opus) re-verified every confirmed
  delta against code + backend (schema/service + audit-log query path) + i18n before applying.**
- **Reference:** ⚠️ **NO moysklad gold capture for the production module.** work-orders/[id] has **no true structural
  sibling** — it is a Container+PageHeader **read-only FSM detail** (draft→in_progress→completed, +cancelled) driven by
  transition buttons. Audited **intrinsically** (FSM verb→route, guards, read-only body integrity) with `productions/[id]`
  / `customer-orders/[id]` as feature-source only (richer FSM docs with post/applicable/counterparty work-orders
  legitimately lacks).

## Verdict

work-orders is correctly a read-only FSM detail: the verbs (start/complete/cancel) exactly match the backend
transition matrix (`work-order.service.ts:641-651`), `/transition` exists with the matching `producedQty` payload, the
canStart/canComplete/canCancel guards are right, and the body (BOM/store/qty) is correctly display-only. Real findings:
**1 HIGH wiring bug (History tab permanently empty — auditEntity slug mismatch) + 2 display deltas (date locale, dropped
description) — all FIXED.** One backend feature-gap (settable doc-date) and one terminology question deferred honestly.

## A. Structural / field deltas

| # | Element | moysklad/expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| W1 | date rendering (L243/249/255/261) | the shared `formatDate`/`formatDateOnly` helpers (ru-RU `DD.MM.YYYY[ HH:mm]`, `'—'` guard) used by ~83 pages incl. `productions/[id]` | all 4 dates via `new Date(x).toLocaleDateString('uz-UZ')` — wrong locale + **dropped the time** on startedAt/completedAt timestamps | delta | med | **FIXED** → `formatDateOnly(plannedStartAt/EndAt)`, `formatDate(startedAt/completedAt)` (imported from `@moysklad/ui`). |
| W2 | `description` (Комментарий) display (interface L34; body L217-307) | a value set via mass-edit / API should be visible read-only on the detail (sibling `productions/[id]:570-577` renders it) | `description` declared on the type + persisted/serialized by the backend (create L150, update L205, massEditApply L236-250) but **never rendered** — a dead type field; settable via list mass-edit yet invisible | delta | med | **FIXED** → read-only `{wo.description && …}` row after owner, `tFields('description')` (key exists, no new key). |

## B. Interactive deltas

| # | Element | moysklad/expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| W3 | DocumentTabs History tab `auditEntity` (L309) | the exact entity string the backend writes — app convention is the PascalCase model name (`Demand`→`'Demand'`, `Move`→`'Move'`, … the same page's `AttachmentsSection` uses PascalCase) | `auditEntity="work_order"` while `work-order.service.ts:686 logAudit` writes `entity: 'WorkOrder'`; `AuditLogService.list` filters `entity` by **EXACT equality** (`audit-log.service.ts:21`) → query `entity=work_order` matches **zero** rows → **History tab permanently empty** despite create/update/transition/delete all logging | delta | high | **FIXED** → `auditEntity="WorkOrder"` (one-liner; backend already writes the right string). |

## Confirmed mirrors (correct work-orders specifics — NOT deltas)

- FSM verbs {start/complete/cancel} match `validateTransition` exactly; `producedQty` sent on complete and validated
  `>0`; canCancel includes `completed` (manual override, backend allows it). Read-only body (BOM/store/qty fixed at
  creation) is correct — NOT an EditForm.
- No counterparty/org/currency/totals/VAT/print/email/createDoc menu — correct (it is not a financial doc).
- BOM-components informational table read-only. Status badge tones correct.

## Deferred (documented for Phase-2 / feature backlog)

- 🟡 **`/new` docDate silent-drop (feature gap, NOT fixed):** `work-orders/new` binds an editable `docDate` to the
  DocumentEditor header (L68-72, L299-300) but the create payload (L110-116) sends only
  `bomId/storeId/plannedQty/plannedStartAt/plannedEndAt` — **the chosen document date is silently discarded.** Unlike
  the `doc-date moment` bug-class (`77195e2d`), the backend `CreateWorkOrderSchema` has **NO `date`/`moment` column**
  (only system `createdAt` + plannedStartAt/EndAt); conflating createdAt (audit timestamp) with a business doc-date is
  semantically wrong, and there is no capture to confirm the intended behaviour. → **needs a backend doc-date column +
  schema/service + a clean production capture** (Phase-2 QA / feature). Matches the prior operator decision to exclude
  work-orders from the moment fix.
- 🟡 **uz title terminology (uncertain):** `pages.work_orders.title` is uz «Tex. zayavkalar» (zayavka = request) vs ru
  «Производственные задания» (zadanie = task) — the whole uz namespace is internally consistent on "zayavka", so it's a
  deliberate (arguably mis-)translation, not a key drift. No production capture → canonical uz label unprovable →
  Phase-2 QA.
- 🔴 **auditEntity slug bug-class (cross-cohort):** the same "lowercase slug ≠ PascalCase entity the service writes"
  defect exists at **`tasks/[id]`** (`"task"` vs writes `'Task'`) — **FIXED this session** (clean) — and at
  **`opportunities/[id]`** (`"opportunity"` vs writes `'Opportunity'`) — **DEFERRED to Cohort G** (that page carries a
  pre-existing non-auto-fixable a11y biome error that would block a scoped commit; fix the slug + a11y together when
  Cohort G is audited). Slugs whose services write no audit log (bom/processingstage/processingprocess/retail_sale/
  online_order) are vacuously empty, not data-loss mismatches.

**Gates:** web tc 0 · api tc 0 · biome 0 (changed) · web Vitest 1262 pass/1 skip · api Vitest 2590 pass/2 skip ·
i18n key-existence ru+uz + no-hardcoded. **HONEST: Phase-1 — NOT browser-smoked.** W3 is fully backend-traced
(writer string + exact-match query) but a live "open a transitioned WO → History tab shows rows" smoke is Phase-2 QA.
Note: the work-orders **list** page (`work-orders/page.tsx:194,198`) has the same uz-UZ date drift — left for the
list-audit track to keep this commit detail-scoped.

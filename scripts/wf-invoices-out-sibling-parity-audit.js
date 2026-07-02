export const meta = {
  name: 'invoices-out-sibling-parity-audit',
  description: 'Adversarial sibling-parity audit of invoices-out/[id] vs the audited invoices-in twin + first-tab «Главная» bug-class verification across 10 goods-document detail pages',
  phases: [
    { title: 'Diff', detail: 'invoices-out vs invoices-in twin field-by-field + first-tab bug-class scan' },
    { title: 'Verify', detail: 'blind direction-aware re-derivation of each candidate delta' },
  ],
}

// ----------------------------------------------------------------------------
// Context shared by all agents. The two pages are in↔out mirrors of the Счёт
// (invoice) family. invoices-in/[id] was ALREADY audited (sibling-parity, 13/63,
// docs/audits/invoices-in-detail.audit.md) — it is the trusted twin reference.
// Real moysklad detail captures exist for demands + supplies (goods documents);
// their edit-tab-main.html PROVE the first content tab is «Главная» (not «Позиции»).
// ----------------------------------------------------------------------------
const REPO = 'd:/projects/moysklad'
const OUT_PAGE = `apps/web/src/app/(app)/invoices-out/[id]/page.tsx`
const IN_PAGE = `apps/web/src/app/(app)/invoices-in/[id]/page.tsx`
const IN_AUDIT = `docs/audits/invoices-in-detail.audit.md`

const DIRECTION = `
in↔out MIRROR FACTS (a divergence in these directions is CORRECT, not a delta):
- invoices-out = «Счёт покупателю» (customer invoice): counterparty = CUSTOMER (tFields('customer')),
  downstream doc = payment-IN, linked doc = customer-order, HAS sales_channel, IS emailed (SendEmailDialog),
  HAS print wired (/print/invoice-out route exists), FSM = draft/posted + derived sent/partially_paid/paid/overdue.
- invoices-in = «Счёт поставщика» (supplier invoice): counterparty = SUPPLIER, downstream = payment-OUT,
  linked = purchase-order, HAS incoming_number/incoming_date (supplier's own № + date), NOT emailed,
  print NOT wired (no /print/invoice-in route — deferred), FSM = draft/posted/cancelled.
A "real_delta" is something that DIVERGES in a way NOT explained by the in↔out direction — i.e. a field/control
that should behave identically on both (both are billing docs) but does not.
`

const DIFF_SCHEMA = {
  type: 'object',
  required: ['deltas', 'confirmed_mirrors', 'summary'],
  properties: {
    deltas: {
      type: 'array',
      description: 'Divergences that are NOT explained by in↔out direction (real candidate deltas)',
      items: {
        type: 'object',
        required: ['id', 'element', 'invoices_out', 'invoices_in', 'classification', 'severity', 'reasoning'],
        properties: {
          id: { type: 'string', description: 'short stable id, e.g. D1' },
          element: { type: 'string' },
          invoices_out: { type: 'string', description: 'behavior on invoices-out (cite line)' },
          invoices_in: { type: 'string', description: 'behavior on invoices-in (cite line)' },
          classification: { type: 'string', enum: ['real_delta', 'uncertain'] },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          reasoning: { type: 'string' },
        },
      },
    },
    confirmed_mirrors: {
      type: 'array',
      description: 'Divergences that ARE correct in↔out direction differences (no fix)',
      items: { type: 'string' },
    },
    summary: { type: 'string' },
  },
}

const BUGCLASS_SCHEMA = {
  type: 'object',
  required: ['pages', 'overall'],
  properties: {
    pages: {
      type: 'array',
      items: {
        type: 'object',
        required: ['page', 'first_tab_content', 'current_label', 'correct_label', 'confidence', 'reasoning'],
        properties: {
          page: { type: 'string' },
          first_tab_content: { type: 'string', description: 'what the default tab renders (e.g. PositionEditor goods table / allocations table / other)' },
          current_label: { type: 'string', description: 'what it shows now (default «Позиции» if positionsLabel omitted)' },
          correct_label: { type: 'string', description: 'moysklad-correct label: «Главная» | «Позиции» | other' },
          confidence: { type: 'string', enum: ['proven', 'high', 'uncertain'] },
          reasoning: { type: 'string' },
        },
      },
    },
    overall: { type: 'string' },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['claim', 'verdict', 'confidence', 'evidence'],
  properties: {
    claim: { type: 'string' },
    verdict: { type: 'string', enum: ['confirmed', 'refuted', 'uncertain'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    evidence: { type: 'string', description: 'cite concrete files/lines/captures/API-doc that ground the verdict' },
  },
}

// ── Phase 1: Diff & discover (parallel) ─────────────────────────────────────
phase('Diff')

const [diff, bugclass] = await parallel([
  () => agent(
    `You are auditing ${OUT_PAGE} for moysklad 1:1 parity by FIELD-BY-FIELD diff against its ALREADY-AUDITED
in↔out twin ${IN_PAGE}. Working dir = ${REPO}.

Read BOTH page files in full. Also read the twin's audit doc ${IN_AUDIT} (it lists what was judged correct on the
twin). ${DIRECTION}

Your job: find EVERY divergence between invoices-out and invoices-in, then classify each as either a correct
in↔out mirror (list in confirmed_mirrors) or a real_delta/uncertain (list in deltas). Be exhaustive — meta-panel
fields, field labels, read-only vs editable, save payload contents, FSM/state menu, create-menu items, print/email
wiring, Задачи/attributes/files, totals sidebar, pickers.

Pay SPECIFIC attention to (do not skip):
1. «План. дата оплаты» (paymentPlannedMoment): invoices-out renders it DISABLED/read-only (around line 606-613)
   and OMITS it from the PATCH payload; invoices-in renders it as an editable <Input type="date"> AND saves it
   (around line 276 + 627). Is this a real_delta (both are billing docs with a user-set planned payment date)?
2. The first content tab label: BOTH pages call <DetailContentTabs> WITHOUT a positionsLabel prop, so both fall
   back to the component default tDetailTabs('positions') = «Позиции» (detail-content-tabs.tsx:73). The audited
   goods-document siblings (demands/supplies/customer-orders/sales-returns/purchase-returns) all pass
   positionsLabel={tDetailTabs('main')} = «Главная». Is «Позиции» a real_delta?
3. Anything else that diverges without an in↔out reason.

Return the structured diff. Cite line numbers. Do NOT propose fixes — only classify.`,
    { label: 'diff:invoices-out-vs-in', phase: 'Diff', schema: DIFF_SCHEMA },
  ),
  () => agent(
    `You are verifying a "first content tab label" bug-class for moysklad parity. Working dir = ${REPO}.

BACKGROUND: <DetailContentTabs> (apps/web/src/components/document-detail/detail-content-tabs.tsx) renders a tab
strip whose FIRST tab holds the document body. Its label defaults to tDetailTabs('positions') = «Позиции» but can
be overridden with a positionsLabel prop. detail_tabs i18n: main=«Главная», positions=«Позиции», paid_documents=
«Оплаченные документы».

GROUND TRUTH (real moysklad captures): docs/moysklad-reference/demands/detail/edit-tab-main.html and
docs/moysklad-reference/supplies/detail/edit-tab-main.html. grep them: they show «Главная» (the tab) + «Товары»
(the goods-table section inside it). «Позиции» does NOT appear in either capture. So a moysklad GOODS document's
first tab is «Главная». Money documents differ: cash-in/[id] and payments-in/[id] pass
positionsLabel={tDetailTabs('paid_documents')} = «Оплаченные документы» (their body is an allocations table, not goods).

TASK: these 10 detail pages OMIT positionsLabel (so they currently show «Позиции»):
  invoices-in, invoices-out, enters, internal-orders, inventories, losses, processing-orders, processings,
  productions, purchase-orders
For EACH page (apps/web/src/app/(app)/<page>/[id]/page.tsx), open the file, find the <DetailContentTabs> call and
inspect what its children (the default-tab content) actually render. Decide the moysklad-correct first-tab label:
  - if the body is a GOODS/position table (PositionEditor or a products/materials line table) → correct_label
    «Главная» (matches the proven demand/supply pattern + the customer-orders/returns precedent). confidence:
    "proven" only if directly analogous to demand/supply/customer-order; else "high".
  - if the body is an allocations/paid-documents/sum table (money-style) → it should NOT be «Главная»; say so.
  - if you cannot tell → "uncertain".
Flag ANY page that does NOT cleanly belong to the «Главная» goods-document class (guard against over-reach).
purchase-orders is the in↔out twin of customer-orders (which uses «Главная») — sanity-check that.

Return the structured per-page verdict. Do NOT edit files.`,
    { label: 'bugclass:first-tab-главная', phase: 'Diff', schema: BUGCLASS_SCHEMA },
  ),
])

// Collect candidate claims to blind-verify: each real_delta + the payment-date
// direction question + any bug-class page that is uncertain / not-«Главная».
const claims = []
for (const d of (diff?.deltas ?? [])) {
  claims.push({
    label: `verify:${d.id}`,
    text: `BLIND direction-aware verification (you have NOT seen the diff agent's reasoning). Working dir = ${REPO}.
Claim to test: on ${OUT_PAGE} vs ${IN_PAGE}, element "${d.element}" — invoices-out: ${d.invoices_out}; invoices-in:
${d.invoices_in}. Is this a REAL parity delta that should be FIXED on invoices-out (a customer invoice / «Счёт
покупателю»), or is it a correct in↔out direction difference?
${DIRECTION}
Read both files yourself. For the «План. дата оплаты» / paymentPlannedMoment claim SPECIFICALLY: verify against
moysklad knowledge whether a CUSTOMER invoice (Счёт покупателю) has an EDITABLE planned-payment-date field (it is
NOT a supplier-only field — both Счёт types carry «План. дата оплаты»; overdue is derived from it). Also confirm
the backend supports it: read apps/api/src/modules/invoice-out/invoice-out.schema.ts (CreateInvoiceOutSchema has
paymentPlannedMoment) + invoice-out.service.ts (update path persists parsed.paymentPlannedMoment). Conclude
confirmed (real delta, fixable now) / refuted (correct mirror, no fix) / uncertain. Cite lines.`,
  })
}

// ── Phase 2: Blind verify (parallel) ────────────────────────────────────────
phase('Verify')

const verdicts = claims.length
  ? (await parallel(claims.map((c) => () =>
      agent(c.text, { label: c.label, phase: 'Verify', schema: VERDICT_SCHEMA }).then((v) => ({ ...c, v })),
    ))).filter(Boolean)
  : []

return {
  diff,
  bugclass,
  verdicts: verdicts.map((x) => ({ label: x.label, ...x.v })),
}

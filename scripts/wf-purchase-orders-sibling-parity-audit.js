export const meta = {
  name: 'purchase-orders-sibling-parity-audit',
  description: 'Capture-grounded adversarial audit of purchase-orders/[id]: 4 parallel gather lenses (sibling-diff vs customer-orders twin, real-capture structural, detail-page dropdowns, targeted bug-hunt) → dedup → blind direction-aware verification of each candidate delta',
  phases: [
    { title: 'Gather', detail: 'sibling-diff + capture-structural + dropdown + bug-hunt in parallel' },
    { title: 'Verify', detail: 'blind direction-aware re-derivation of each deduped candidate delta' },
  ],
}

// ----------------------------------------------------------------------------
// purchase-orders/[id] («Заказ поставщику») is the sales↔purchase MIRROR of the
// ALREADY-AUDITED customer-orders/[id] («Заказ покупателя», docs/audits/
// customer-orders-detail.audit.md — the FIRST detail page audited, the template).
// UNLIKE customer-orders, purchase-orders HAS a real moysklad DETAIL capture:
//   docs/moysklad-reference/visual-captures/02-module/purchaseorder/
// incl. the edit/detail page itself + all four detail-page toolbar dropdowns
// (Изменить / Создать документ / Печать / Отправить) + the status dropdown +
// per-tab captures. So this audit is CAPTURE-GROUNDED, not sibling-inferred —
// it can resolve the I5–I8/I14 "needs-capture" gaps the customer-orders audit
// could not. Locale compared = Russian (reference is RU; our labels via ru.json).
// ----------------------------------------------------------------------------
const REPO = 'd:/projects/moysklad'
const PO_PAGE = 'apps/web/src/app/(app)/purchase-orders/[id]/page.tsx'
const CO_PAGE = 'apps/web/src/app/(app)/customer-orders/[id]/page.tsx'
const CO_AUDIT = 'docs/audits/customer-orders-detail.audit.md'
const CAP = 'docs/moysklad-reference/visual-captures/02-module/purchaseorder'
const PO_SCHEMA = 'apps/api/src/modules/purchase-order/purchase-order.schema.ts'
const PO_SERVICE = 'apps/api/src/modules/purchase-order/purchase-order.service.ts'

const DIRECTION = `
sales↔purchase MIRROR FACTS (a divergence in these directions is CORRECT, not a delta):
- customer-orders = «Заказ покупателя» (SALES): counterparty = CUSTOMER, downstream docs = demand (Отгрузка) /
  invoice-out (Счёт покупателю) / payment-in; HAS sales_channel, HAS structured delivery_address (ship TO the
  customer), HAS a «Валюта» currency selector, IS emailed (SendEmailDialog — send order to customer), HAS print
  wired (/print/customer-order route), header pills = Не оплачено / Запросить оплату / Не отгружено, FSM = 8 states.
- purchase-orders = «Заказ поставщику» (PURCHASE): counterparty = SUPPLIER (tFields('supplier')), downstream docs
  = supply (Приёмка) / invoice-in (Счёт поставщика) / payment-out (Исходящий платёж); NO sales_channel, NO ship-to
  delivery_address (goods are RECEIVED into the store), has «План. дата поступления» delivery_planned, header
  indicator = «Ожидание» (awaiting receipt — read-only checkbox; CONFIRMED present in the real capture
  09-edit-default), FSM = receipt-progression with only 3 manually-settable states (draft/confirmed/cancelled).
A "real_delta" = something that should behave IDENTICALLY on both order types (both are order documents) but does
NOT — OR (stronger) something where our purchase-orders page diverges from the REAL moysklad purchaseorder CAPTURE.
Mirror-correct divergences (customer↔supplier label, sales_channel/delivery_address absent, payment-out vs
payment-in, supply vs demand, «Ожидание» vs «Не отгружено») are NOT deltas — list them as confirmed_mirrors.`

// Shared finding shape so the 4 gather lenses merge uniformly.
const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings', 'confirmed_mirrors', 'summary'],
  properties: {
    findings: {
      type: 'array',
      description: 'Candidate parity deltas (NOT explained by the sales↔purchase direction)',
      items: {
        type: 'object',
        required: ['element', 'ours', 'moysklad', 'classification', 'severity', 'source', 'reasoning'],
        properties: {
          element: { type: 'string', description: 'the UI element / field / control' },
          ours: { type: 'string', description: 'how our purchase-orders page behaves (cite PO_PAGE line)' },
          moysklad: { type: 'string', description: 'how moysklad behaves (cite capture file OR twin line)' },
          classification: { type: 'string', enum: ['real_delta', 'uncertain'] },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          source: { type: 'string', enum: ['sibling', 'capture', 'dropdown', 'bughunt'], description: 'which lens found it' },
          reasoning: { type: 'string' },
        },
      },
    },
    confirmed_mirrors: {
      type: 'array',
      description: 'Divergences that ARE correct sales↔purchase direction differences (no fix)',
      items: { type: 'string' },
    },
    summary: { type: 'string' },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['claim', 'verdict', 'confidence', 'fixable_now', 'evidence'],
  properties: {
    claim: { type: 'string' },
    verdict: { type: 'string', enum: ['confirmed', 'refuted', 'uncertain'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    fixable_now: { type: 'string', enum: ['yes', 'no_needs_backend', 'no_needs_capture', 'no'], description: 'can it be fixed in the web layer right now, or is it gated on backend/capture?' },
    evidence: { type: 'string', description: 'cite concrete files/lines/captures/API-doc that ground the verdict' },
  },
}

// ── Phase 1: Gather (4 parallel lenses) ─────────────────────────────────────
phase('Gather')

const [sibling, capture, dropdown, bughunt] = await parallel([
  // Lens 1 — sibling-parity diff vs the audited customer-orders twin.
  () => agent(
    `You audit ${PO_PAGE} for moysklad 1:1 parity by FIELD-BY-FIELD diff against its ALREADY-AUDITED sales↔purchase
twin ${CO_PAGE}. Working dir = ${REPO}.

Read BOTH page files IN FULL. Also read the twin's audit doc ${CO_AUDIT} (it records what was judged correct/fixed/
deferred on the twin — reuse those judgements; do not re-litigate shared-component issues already deferred there).
${DIRECTION}

Find EVERY divergence between purchase-orders and customer-orders, then classify each as a correct sales↔purchase
mirror (→ confirmed_mirrors) or a real_delta/uncertain (→ findings, source:"sibling"). Be exhaustive: meta-panel
field SET + ORDER + labels, required markers, read-only vs editable, the SAVE payload contents (what each PATCHes),
FSM/state menu (PO lists only 3 states draft/confirmed/cancelled vs CO's 8 — which is right?), create-menu items,
print wiring (CO has onPrintList → /print/customer-order; PO has none), email (CO has onSendEmail; PO none),
header pills/indicators, position action buttons (CO has «Проверить комплектацию»; PO does not), totals sidebar,
external_code placement (PO puts it in the meta panel; CO under the positions tab — internal inconsistency?),
Задачи/attributes/files, pickers. Cite line numbers on BOTH sides. Do NOT propose fixes — only classify.`,
    { label: 'gather:sibling-diff', phase: 'Gather', schema: FINDINGS_SCHEMA },
  ),

  // Lens 2 — capture-grounded structural audit vs the REAL moysklad PO detail capture.
  () => agent(
    `You audit ${PO_PAGE} against the REAL moysklad «Заказ поставщику» DETAIL/edit capture. Working dir = ${REPO}.

Read ${PO_PAGE} in full. Then study the real capture under ${CAP}:
  - meta/09-edit-default.json (+ meta/23-/39-edit-default.json are re-capture runs) and grep dom/09-edit-default.html
    for the meta-panel FIELD labels (Russian) the real detail form shows.
  - dom/14-edit-tab-positions.html (position table columns + action buttons) — use meta/14 first.
  - dom/15-edit-tab-linked.html (the «Связанные документы» tab content).
  - dom/16-edit-tab-files.html, dom/17-edit-tab-tasks.html, dom/18-edit-tab-events.html (other tabs).
DOM files are large — read the meta/NN-*.json summaries first, then GREP the matching dom/NN-*.html for specific
Russian labels rather than reading whole files.

Goal: structural parity of the detail FORM. For the meta panel, build moysklad's field list from the capture and
diff it against ours (organization, supplier, store, contract, project, delivery_planned, organization_account,
agent_account, description, external_code, AND our extra read-only «Проведён»/posted_at + «Принято»/received_sum
inputs). Decide for EACH: present in both / missing_in_ours / extra_in_ours, and whether field ORDER/pairing
matches. SPECIFICALLY assess: (a) does moysklad's PO detail show a «Валюта» currency field? we have none; (b) does
it show «Принято» (received sum) and «Проведён» (posted date) as meta inputs at all? (c) position-table columns +
the action-button row (real capture lists «Добавить из справочника / Проверить комплектацию / Импорт / Привязать
документ» — we render only «Добавить из справочника»). ${DIRECTION}
Record each gap as a finding with source:"capture", citing the capture file. Do NOT propose fixes.`,
    { label: 'gather:capture-structural', phase: 'Gather', schema: FINDINGS_SCHEMA },
  ),

  // Lens 3 — detail-page toolbar dropdowns vs the REAL captured dropdowns.
  () => agent(
    `You audit the purchase-orders DETAIL toolbar dropdowns against the REAL captured moysklad detail-page dropdowns
(this resolves what the customer-orders audit marked "NEEDS-CAPTURE", because PO HAS these captures). Working dir
= ${REPO}.

Our side: read ${PO_PAGE} (toolbar = <DetailToolbar ...>: createMenuItems, onPrintList/onPrintConfigure,
onSendEmail, onClone/onDelete; the inline status <DetailHeader> stateMenuItems). Also read
apps/web/src/components/document-detail/detail-toolbar.tsx to see which menus DetailToolbar renders and the labels
it uses (Изменить/Создать документ/Печать/Отправить).

moysklad side — under ${CAP}, read these captured DETAIL-PAGE dropdowns (use meta/NN-*.json then grep dom/NN-*.html
for the Russian menu-item text):
  - 10-edit-dropdown-izmenit (the «Изменить» menu items),
  - 11-edit-dropdown-sozdat-dokument (the «Создать документ» menu — what downstream docs PO offers),
  - 12-edit-dropdown-pechat (the «Печать» menu — what print templates; does it have a «Заказ»/order form + «Список»?),
  - 13-edit-dropdown-otpravit (the «Отправить» menu — DOES moysklad PO offer email/«По электронной почте»? this
    decides whether our missing onSendEmail is a real delta or correct),
  - 04-dropdown-status (the status options + colors — decides whether our 3-state PO dropdown matches moysklad).

For EACH dropdown, list moysklad's items vs ours and record each mismatch (missing item, wrong label, wrong
singular/plural, wrong target) as a finding with source:"dropdown", citing the capture file. ${DIRECTION}
Note: 03/05/06-dropdown-* are the LIST-page bulk menus — do NOT confuse them with the 10–13 detail-page menus.
Do NOT propose fixes.`,
    { label: 'gather:detail-dropdowns', phase: 'Gather', schema: FINDINGS_SCHEMA },
  ),

  // Lens 4 — targeted real-bug hunt on the PO page (capture-independent correctness).
  () => agent(
    `You hunt for REAL implementation bugs on ${PO_PAGE} (correctness, not just label parity). Working dir = ${REPO}.
Read the file in full. Look hard for:
1. MONEY DISPLAY: any place that renders a *Minor (minor-units integer) string RAW into the UI instead of via
   formatMoney(...). SPECIFICALLY inspect the «Принято»/received_sum field (~line 700-707): it binds
   <Input value={data.receivedSumMinor} disabled> — that shows a raw integer like "150000000" rather than
   "1 500 000,00". Compare to the parity pattern enters/[id]/page.tsx (formatMoney(data.sumMinor,'UZS',
   {displayAs:'none'}) inside a disabled meta Input). Is this a real display bug?
2. INTERNAL INCONSISTENCY: a field that can be SET at creation (purchase-orders/new) or persisted by the backend
   but is read-only / dropped from the PATCH here, or vice-versa. Cross-check the save payload (~line 279-307)
   against the backend ${PO_SCHEMA} (update schema) + ${PO_SERVICE} (update path) — list any field the backend
   accepts that the page never sends, or any field the page sends that the schema rejects.
3. BigInt / number coercion: Number(p.quantity) precision, BigInt parsing of sums, totals math (subtotal/total
   when vatIncluded), totalQty.
4. State/guard bugs: editable gating (data.applicable), the «Ожидание» indicator logic, the createMenu canCreate*
   guards (off-by-one on FSM states, wrong sum comparison).
5. Any hardcoded Uzbek/English string that should be an i18n key; any ASCII «...» that should be «…».
Record each as a finding with source:"bughunt", severity by user impact. Cite lines. Do NOT fix anything.`,
    { label: 'gather:bug-hunt', phase: 'Gather', schema: FINDINGS_SCHEMA },
  ),
])

// Merge + dedup across the 4 lenses (barrier is correct here: verification needs
// the de-duplicated union, and identical findings from two lenses should be one).
const lenses = [sibling, capture, dropdown, bughunt].filter(Boolean)
const allMirrors = lenses.flatMap((l) => l.confirmed_mirrors ?? [])
const raw = lenses.flatMap((l) => l.findings ?? [])
const deduped = []
for (const f of raw) {
  const key = (f.element || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32)
  const hit = deduped.find((d) => d._key === key)
  if (hit) {
    hit._sources = Array.from(new Set([...(hit._sources ?? [hit.source]), f.source]))
    continue
  }
  deduped.push({ ...f, _key: key, _sources: [f.source], id: `F${deduped.length + 1}` })
}
log(`Gather: ${raw.length} raw findings → ${deduped.length} deduped; ${allMirrors.length} confirmed mirrors`)

// ── Phase 2: Blind direction-aware verify (parallel) ────────────────────────
phase('Verify')

const verdicts = deduped.length
  ? (await parallel(deduped.map((f) => () =>
      agent(
        `BLIND direction-aware verification — you have NOT seen the finder's reasoning. Working dir = ${REPO}.
Claim to test on ${PO_PAGE} («Заказ поставщику», the sales↔purchase mirror of the audited customer-orders page):
  element  = "${f.element}"
  ours     = ${f.ours}
  moysklad = ${f.moysklad}
Is this a REAL parity delta that should be FIXED on purchase-orders, or a correct sales↔purchase direction
difference / non-issue?
${DIRECTION}
Verify INDEPENDENTLY: read ${PO_PAGE} (and ${CO_PAGE} if it's a sibling claim) yourself; if the claim references a
capture, open the cited file under ${CAP} and confirm the moysklad behavior with your own eyes (grep the dom/ for
the Russian text). If it's a backend/data claim, read ${PO_SCHEMA} and ${PO_SERVICE}. For money-format claims,
confirm formatMoney is the established pattern (e.g. enters/[id]/page.tsx). Decide:
  verdict = confirmed (real, should fix) | refuted (correct mirror / non-issue) | uncertain
  fixable_now = yes | no_needs_backend | no_needs_capture | no
Default to "refuted" if the divergence is plausibly a correct sales↔purchase mirror and you cannot positively prove
it should be identical. Cite concrete lines/captures.`,
        { label: `verify:${f.id}`, phase: 'Verify', schema: VERDICT_SCHEMA },
      ).then((v) => ({ id: f.id, element: f.element, severity: f.severity, sources: f._sources, ...v })),
    ))).filter(Boolean)
  : []

return {
  confirmed_mirrors: allMirrors,
  findings: deduped.map(({ _key, ...f }) => f),
  verdicts,
  confirmed: verdicts.filter((v) => v.verdict === 'confirmed'),
}

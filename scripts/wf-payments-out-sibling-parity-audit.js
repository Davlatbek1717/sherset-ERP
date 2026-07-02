export const meta = {
  name: 'payments-out-sibling-parity-audit',
  description:
    'Capture-grounded adversarial audit of payments-out/[id] («Исходящий платёж»): 4 parallel gather lenses (sibling-diff vs the audited payments-in twin, real-capture structural, detail-page dropdowns, targeted bug-hunt) → dedup → blind direction-aware verification of each candidate delta. Hardened against the purchase-orders "biased brief" failure: verifiers MUST treat the in↔out brief as non-authoritative and check the backend independently.',
  phases: [
    { title: 'Gather', detail: 'sibling-diff + capture-structural + dropdown + bug-hunt in parallel' },
    { title: 'Verify', detail: 'blind direction-aware re-derivation of each deduped candidate delta' },
  ],
}

// ----------------------------------------------------------------------------
// payments-out/[id] («Исходящий платёж» — outbound bank payment) is the
// incoming↔outgoing MIRROR of the ALREADY-AUDITED payments-in/[id]
// («Входящий платёж», docs/audits/payments-in-detail.audit.md). Both are MONEY
// documents (no goods/positions table — a payment-allocation editor instead).
//
// UNLIKE the payments-in audit (which used a simpler clean --detail capture),
// payments-out HAS a RICH real moysklad capture:
//   docs/moysklad-reference/visual-captures/07-module/paymentout/
// incl. the detail page (47-detail-default), the edit form (34-edit-default),
// all four detail-page toolbar dropdowns (Изменить/Создать документ/Печать/
// Отправить — 27-30 detail + 35-38 edit), per-tab captures (39-43:
// positions/linked/files/tasks/events) AND three field-picker modals
// (44-agent-picker / 45-org-picker / 46-store-picker). So this audit is
// CAPTURE-GROUNDED and can resolve THREE items the payments-in audit deferred:
//   (a) the «Плательщик/Получатель»→«Контрагент» counterparty-label bug-class,
//   (b) the «Счёт организации»/«Счёт контрагента» conditional-render UNCERTAIN,
//   (c) the F20 org-account picker SCOPE question (does moysklad scope org
//       accounts to the chosen organization?).
// Locale compared = Russian (reference is RU; our labels via ru.json).
// ----------------------------------------------------------------------------
const REPO = 'd:/projects/moysklad'
const PMT_OUT_PAGE = 'apps/web/src/app/(app)/payments-out/[id]/page.tsx'
const PMT_OUT_NEW = 'apps/web/src/app/(app)/payments-out/new/page.tsx'
const PMT_IN_PAGE = 'apps/web/src/app/(app)/payments-in/[id]/page.tsx'
const PMT_IN_AUDIT = 'docs/audits/payments-in-detail.audit.md'
const CAP = 'docs/moysklad-reference/visual-captures/07-module/paymentout'
const PO_SCHEMA = 'apps/api/src/modules/payment-out/payment-out.schema.ts'
const PO_SERVICE = 'apps/api/src/modules/payment-out/payment-out.service.ts'

const DIRECTION = `
incoming↔outgoing MONEY-DOC MIRROR FACTS (a divergence in these directions is CORRECT, not a delta):
- payments-in = «Входящий платёж» (money flows IN from a counterparty): counterparty label = «Контрагент»
  (tFields('agent')); allocation targets = documents the counterparty owes US (invoice-OUT / customer-order);
  tab-1 = «Оплаченные документы».
- payments-out = «Исходящий платёж» (money flows OUT to a counterparty/supplier): counterparty label =
  «Контрагент» (tFields('agent')); allocation targets = documents WE owe (invoice-IN / purchase-order advance);
  tab-1 = «Оплаченные документы».
- Both are BANK/MONEY documents: NO goods/positions table — a payment-allocation editor instead; 3-state FSM
  (draft/posted/cancelled) + a «Проведено» applicable toggle (post/unpost).
- DOCUMENTED in↔out ASYMMETRY (from payment-out.schema.ts): an OUTGOING payment carries «Статья расходов»
  (expense item); an INCOMING one does NOT. So «Статья расходов» PRESENT on moysklad's payment-out form but
  MISSING on ours is a real_delta, NOT a mirror difference.
Correct mirror divergences (→ confirmed_mirrors, NOT deltas): invoice-in/purchase-order allocation targets (vs
payments-in's invoice-out/customer-order), «Исходящий платёж» title (vs «Входящий платёж»), add-advance-PO button
(vs add-customer-order), invalidation of purchase-order/invoice-in queries.

⚠️ ANTI-BIAS RULE (this audit's most important instruction — read twice):
These mirror facts describe document SEMANTICS, not a verdict on what is "correct" in our code. Do NOT treat this
list as exhaustive. In particular, a field's ABSENCE on our page is NOT automatically correct just because this
brief is silent about it. ALWAYS cross-check the backend: if CreatePaymentOutSchema/UpdatePaymentOutSchema
(${PO_SCHEMA}) PERSISTS a field and payments-out/new (${PMT_OUT_NEW}) lets you SET it, but the detail page
(${PMT_OUT_PAGE}) hides it or makes it read-only / drops it from the PATCH payload, that asymmetry is a real_delta
(the "set-at-creation, never-editable" bug-class). The previous purchase-orders audit MISSED its currency-selector
delta precisely because a biased brief framed the field's absence as "established/correct". Known backend-persisted
fields worth this check: currency + rateValue (schema default UZS), organizationAccountId, agentAccountId,
externalCode, contractId, projectId. Verify each against the page + /new.`

// Shared finding shape so the 4 gather lenses merge uniformly.
const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings', 'confirmed_mirrors', 'summary'],
  properties: {
    findings: {
      type: 'array',
      description: 'Candidate parity deltas (NOT explained by the incoming↔outgoing direction)',
      items: {
        type: 'object',
        required: ['element', 'ours', 'moysklad', 'classification', 'severity', 'source', 'reasoning'],
        properties: {
          element: { type: 'string', description: 'the UI element / field / control' },
          ours: { type: 'string', description: 'how our payments-out page behaves (cite PMT_OUT_PAGE line)' },
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
      description: 'Divergences that ARE correct incoming↔outgoing direction differences (no fix)',
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
  // Lens 1 — sibling-parity diff vs the audited payments-in twin.
  () => agent(
    `You audit ${PMT_OUT_PAGE} for moysklad 1:1 parity by FIELD-BY-FIELD diff against its ALREADY-AUDITED
incoming↔outgoing twin ${PMT_IN_PAGE}. Working dir = ${REPO}.

Read BOTH page files IN FULL. Also read the twin's audit doc ${PMT_IN_AUDIT} — it records what was judged
correct/fixed/deferred on payments-in. REUSE those judgements: do NOT re-report the twin's DEFERRED shared-component
items (S6 Файлы-as-tab, S7 История-tab, I2 «Открыть в API», I3 Создать-menu, I4 Печать «Список», I5 Отправить-email,
I6 inline Статус-dropdown, I7 help-icon, meta-field layout/order) as NEW findings UNLESS payments-out DIVERGES from
payments-in on them (e.g. one has a control the other lacks). If payments-out carries the SAME defer-class, say so in
the summary, don't add a finding.
${DIRECTION}

Find EVERY divergence between payments-out and payments-in, then classify each as a correct incoming↔outgoing mirror
(→ confirmed_mirrors) or a real_delta/uncertain (→ findings, source:"sibling"). Be exhaustive: meta-panel field SET +
ORDER + labels + required markers, read-only vs editable, the SAVE payload contents (what each PATCHes — does
payments-out drop a field payments-in sends, or vice-versa?), allocation editor (kinds, picker gating, amount
prefill, validation), tab-1 label, totals/allocated/remainder block, «Задачи»/files/attributes/history surfaces,
FSM/applicable toggle, toolbar (createMenuItems / onPrintList / onSendEmail / onClone / onDelete), DetailHeader
(stateMenuItems? authorSlot?), pickers (which endpoints each fetcher hits + scoping). Cite line numbers on BOTH
sides. Do NOT propose fixes — only classify.`,
    { label: 'gather:sibling-diff', phase: 'Gather', schema: FINDINGS_SCHEMA },
  ),

  // Lens 2 — capture-grounded structural audit vs the REAL moysklad paymentout capture.
  () => agent(
    `You audit ${PMT_OUT_PAGE} against the REAL moysklad «Исходящий платёж» DETAIL/edit capture. Working dir = ${REPO}.

Read ${PMT_OUT_PAGE} in full. Then study the real capture under ${CAP}. DOM files are large — read the
meta/NN-*.json summary first, then GREP the matching dom/NN-*.html for specific Russian labels rather than reading
whole files. Key capture files:
  - 47-detail-default + 34-edit-default → the meta-panel FIELD labels (Russian) the real form shows + their ORDER.
  - 39-edit-tab-positions → the «Оплаченные документы» / allocation tab columns + buttons.
  - 40-edit-tab-linked (Связанные документы), 41-edit-tab-files, 42-edit-tab-tasks, 43-edit-tab-events.
  - 44-field-modal-agent-picker, 45-field-modal-org-picker, 46-field-modal-store-picker → the picker MODALS
    (what each picker shows + how it is SCOPED — critical for the account-picker questions below).

Goal: structural parity of the detail FORM. Build moysklad's meta-field list from the capture and diff it against
ours (organization, agent/counterparty, sum, payment_purpose, posted_at, description, contract, project,
organization_account, agent_account, external_code). Decide for EACH: present in both / missing_in_ours /
extra_in_ours, and whether field ORDER/grouping matches. SPECIFICALLY assess and report:
  (a) Counterparty label — moysklad shows «Контрагент»; we use tFields('agent') (line ~576). Confirm it MATCHES
      (this RESOLVES the payments-in S5 «Плательщик»→«Контрагент» bug-class for the out direction).
  (b) «Статья расходов» (expense item) — does moysklad's payment-out form show this field? We have NONE. The
      backend documents it as the key out-vs-in difference. If present in the capture → real_delta.
  (c) «Валюта документа» — does the real form show a currency field? We show none (but the backend persists
      currency+rateValue). Report what the capture shows.
  (d) «Счёт организации» / «Счёт контрагента» — are BOTH present in the real form (44/45 modals exist)? Does the
      45-org-picker modal scope accounts to the chosen ORGANIZATION? Does 44-agent-picker scope to the chosen
      counterparty? (We fetch org accounts via /organization-accounts WITHOUT an organizationId filter — line
      ~344-353; we fetch agent accounts via /counterparties/:id/bank-accounts — line ~358.)
  (e) 46-store-picker — does payment-out reference a STORE / «Склад»? We have no store field. Why is there a
      store-picker capture — is it a real field or a stray capture? Report.
  (f) posted_at vs incoming-date, «Включая НДС», «Канал продаж», comment widget (Input vs textarea), purpose widget.
${DIRECTION}
Record each gap as a finding with source:"capture", citing the capture file. Do NOT propose fixes.`,
    { label: 'gather:capture-structural', phase: 'Gather', schema: FINDINGS_SCHEMA },
  ),

  // Lens 3 — detail-page toolbar dropdowns vs the REAL captured dropdowns.
  () => agent(
    `You audit the payments-out DETAIL toolbar dropdowns against the REAL captured moysklad detail-page dropdowns.
Working dir = ${REPO}.

Our side: read ${PMT_OUT_PAGE} — the <DetailToolbar ...> props (createMenuItems? onPrintList/onPrintConfigure?
onSendEmail? onClone/onDelete) and the <DetailHeader> (stateMenuItems? — is there an inline «Статус ▾» dropdown?).
Also read apps/web/src/components/document-detail/detail-toolbar.tsx to see which menus DetailToolbar renders by
default and the labels it uses (Изменить/Создать документ/Печать/Отправить).

moysklad side — under ${CAP}, read these captured DETAIL-PAGE dropdowns (use meta/NN-*.json then grep dom/NN-*.html
for the Russian menu-item text). Prefer the edit-mode captures 35-38; the detail-mode 27-30 are the same menus on
the read view:
  - 35-edit-dropdown-izmenit (the «Изменить» menu items — expect {Удалить, Копировать}),
  - 36-edit-dropdown-sozdat-dokument (the «Создать документ» menu — what downstream docs payment-out offers, if any),
  - 37-edit-dropdown-pechat (the «Печать» menu — named print form(s)? «Список»? «Настроить...» only?),
  - 38-edit-dropdown-otpravit (the «Отправить» menu — is it EMPTY, or does payment-out offer email/«По
    электронной почте»? this decides whether our missing onSendEmail is a real delta or correct),
  - the status dropdown if captured (decides whether payment-out exposes an inline «Статус ▾» we lack).

For EACH dropdown, list moysklad's items vs ours and record each mismatch (missing item, extra item, wrong label,
wrong singular/plural, wrong target) as a finding with source:"dropdown", citing the capture file. Cross-check
against payments-in's audit I2-I7 dispositions — if payment-out carries the SAME defer-class as payments-in, note it
in the summary rather than as a new finding. ${DIRECTION} Do NOT propose fixes.`,
    { label: 'gather:detail-dropdowns', phase: 'Gather', schema: FINDINGS_SCHEMA },
  ),

  // Lens 4 — targeted real-bug hunt (capture-independent correctness + backend asymmetry).
  () => agent(
    `You hunt for REAL implementation bugs on ${PMT_OUT_PAGE} (correctness, not just label parity). Working dir =
${REPO}. Read the file in full, plus ${PO_SCHEMA} (Create/Update/Filter schemas), ${PO_SERVICE} (the update path +
findById include/select), and ${PMT_OUT_NEW} (the create form — what fields it lets you SET). Look hard for:

1. ACCOUNT-PICKER SCOPE (high-priority): organizationAccountFetcher (line ~344-353) calls
   /organization-accounts?search=... with NO organizationId filter — so it lists org accounts across ALL
   organizations, not the selected form.organizationId. agentAccountFetcher (line ~358) IS scoped to
   /counterparties/:agentId/bank-accounts. Is the org-account picker scope a real bug (wrong account selectable for
   the org)? Check the 45-field-modal-org-picker capture and whether an organizationId-filtered endpoint exists
   (grep the api for organization-accounts route + an organizationId query param). Classify severity by data-integrity
   impact (posting a payment from another org's bank account).

2. SET-AT-CREATION-NEVER-EDITABLE (the purchase-orders bug-class): does CreatePaymentOutSchema persist + does
   ${PMT_OUT_NEW} let you set fields that the detail page hides or drops from its PATCH? Concretely:
   - currency + rateValue (schema default UZS) — detail page has NO currency field and the PATCH payload (line
     ~271-289) omits currency/rateValue. If /new sets a non-UZS currency, the detail page can never show/edit it.
   - any other Create field missing from the detail payload.
   Report each asymmetry as a finding (do NOT assume absence is correct — see the anti-bias rule).

3. EXPENSE ITEM «Статья расходов»: the Filter schema has expenseItem (VarChar 100) and the schema comment calls it
   the key out-vs-in difference, but Create/Update OMIT it and the page has no field. Grep the Prisma schema for a
   PaymentOut.expenseItem column and the service for where it is set. Is «Статья расходов» a real document field the
   detail form should expose (and PATCH), or a list-only/derived concept? Report with evidence.

4. MONEY DISPLAY / COERCION: sumMinor (line ~606) and each allocation amountMinor (line ~793) are bound to RAW
   minor-unit strings in editable Inputs (e.g. "150000000" for 1 500 000,00). Is that the established shared
   money-doc pattern (compare payments-in / cash-in / cash-out), or a payments-out-specific display bug? Check
   BigInt parsing (totalAllocated line ~239, remaining line ~465) for precision/negative-allocation issues, and the
   save-handler guards (sum<=0, per-op sum, totalAllocated>sum).

5. i18n / cosmetics: any hardcoded Uzbek/English string that should be an i18n key (check the save-error throws —
   are they t(...) keys or hardcoded?); any ASCII "..." that should be «…»; any tFields key whose VALUE is wrong for
   the out direction (note: a KEY literally named 'payer' is fine if its VALUE renders «...контрагента» — that was a
   refuted false-positive in the cash-out audit).

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
Claim to test on ${PMT_OUT_PAGE} («Исходящий платёж», the incoming↔outgoing mirror of the audited payments-in page):
  element  = "${f.element}"
  ours     = ${f.ours}
  moysklad = ${f.moysklad}
Is this a REAL parity delta that should be FIXED on payments-out, or a correct incoming↔outgoing direction
difference / non-issue?
${DIRECTION}
Verify INDEPENDENTLY: read ${PMT_OUT_PAGE} (and ${PMT_IN_PAGE} if it's a sibling claim) yourself; if the claim
references a capture, open the cited file under ${CAP} and confirm moysklad's behavior with your own eyes (grep the
dom/ for the Russian text). If it's a backend/data/payload claim, read ${PO_SCHEMA} and ${PO_SERVICE} and
${PMT_OUT_NEW} — do NOT assume a field's absence is correct without checking whether the backend persists it and
/new sets it. For money-format claims, confirm whether raw-minor inputs are the shared money-doc pattern (compare
payments-in). Decide:
  verdict = confirmed (real, should fix) | refuted (correct mirror / non-issue) | uncertain
  fixable_now = yes | no_needs_backend | no_needs_capture | no
Default to "refuted" ONLY when you can POSITIVELY show the divergence is a correct incoming↔outgoing mirror or a
backend-gated limitation; do NOT refute merely because the in↔out brief is silent about the field (that is the bias
trap that hid the purchase-orders currency delta). Cite concrete lines/captures/schema.`,
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

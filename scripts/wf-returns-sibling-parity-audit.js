export const meta = {
  name: 'returns-sibling-parity-audit',
  description: 'Sibling-parity detail audit of sales-returns (vs demands) + purchase-returns (vs supplies), with blind adversarial verification of each real delta',
  phases: [
    { title: 'Diff', detail: 'per-module field-by-field sibling-parity diff vs audited twin' },
    { title: 'Verify', detail: 'blind independent re-derivation of each real-delta / uncertain finding' },
  ],
}

const DIFF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['module', 'twin', 'findings'],
  properties: {
    module: { type: 'string' },
    twin: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['dim', 'element', 'twin_value', 'this_value', 'location', 'classification', 'severity', 'reasoning'],
        properties: {
          dim: { type: 'string', description: 'dimension id e.g. S1, I3, counterparty-label, comment-label, fsm, currency, customs, print-route, title' },
          element: { type: 'string' },
          twin_value: { type: 'string', description: 'what the audited twin does (the proven reference)' },
          this_value: { type: 'string', description: 'what this return module does' },
          location: { type: 'string', description: 'file:line in the return module page' },
          classification: { type: 'string', enum: ['real_delta', 'correct_by_direction', 'matches_twin', 'deferred_same_as_twin', 'uncertain_needs_capture'] },
          severity: { type: 'string', enum: ['high', 'med', 'low'] },
          proposed_fix: { type: 'string', description: 'concrete fix if real_delta (prop/key/hook to add). empty otherwise.' },
          reasoning: { type: 'string' },
        },
      },
    },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dim', 'verdict', 'reasoning'],
  properties: {
    dim: { type: 'string' },
    verdict: { type: 'string', enum: ['confirmed_real_delta', 'refuted_not_a_delta', 'needs_capture'] },
    canonical_value: { type: 'string', description: 'the correct value/behavior, grounded in the twin reference' },
    reasoning: { type: 'string' },
  },
}

const COMMON = `
You are auditing a moysklad.uz clone detail page for 1:1 parity, using the SIBLING-PARITY method:
the target page has NO fresh moysklad capture (route-walled), so the reference is (a) its AUDITED TWIN's page
source (a proven, already-audited implementation) + (b) the twin's audit doc (which distilled the real moysklad
capture) + (c) optionally the twin's captured DOM. You compare field-by-field, accounting for DIRECTION.

DIMENSION CHECKLIST (from the twin audit docs — assess EACH):
- S1  Tab-1 label: moysklad = «Главная». Component DetailContentTabs defaults the first tab to tDetailTabs('positions')=«Позиции» UNLESS the page passes positionsLabel={tDetailTabs('main')}. Twin passes it; does this page?
- S2  «Задачи» inline: <DocumentTasksSection entity="..."> present? (both returns ALREADY have it — only flag if MISSING)
- S3  Tab strip set (related/files/history) — usually DEFERRED same as twin
- S4  Position table columns (stock cols Принято/Остаток/Резерв etc.) — usually DEFERRED backend
- S5  Totals sidebar rows — usually DEFERRED
- S6  Контрагент «Баланс» sub-line — usually DEFERRED backend
- S7  Payment chip / «Запросить оплату» — depends on backend field; note if twin has it and this doesn't
- comment-label: comment field must be tFields('description')=«Комментарий», NOT tCommon('description')=«Описание»
- counterparty-label: DIRECTION-SENSITIVE. sales-return = customer side → tFields('customer')=«Покупатель». purchase-return = supplier side → tFields('supplier')=«Поставщик». (This MIRRORS the twin's direction: demand=customer, supply=supplier.)
- fsm: state set + STATE_TONE + buildDocStateMenu — should be draft/posted/cancelled with posted=brand tone
- title: titlePrefix = tDetailTitles('<doc>') (singular doc name), NOT a plural/list key
- create-menu («Создать документ»): does the page pass createMenuItems to DetailToolbar? The TWIN has 6-7 items. If ABSENT, that is a structural gap — but enumerating the correct items for a RETURN needs a moysklad return-capture which does NOT exist. Classify as uncertain_needs_capture (do NOT invent items).
- print-route: onPrintList window.open('/print/<doc>/...') — does a /print route exist for this return type? note if mis-scoped.
- currency / customs (ГТД/Страна): direction + doc-type appropriate?

CLASSIFICATION:
- real_delta: the twin (proven) does X, this page does Y, and X is correct for this page too (direction-adjusted). FIXABLE without a capture. (e.g. S1 positionsLabel.)
- correct_by_direction: differs from twin but CORRECT because of in↔out / customer↔supplier direction.
- matches_twin: same as twin (parity OK).
- deferred_same_as_twin: a gap the twin also defers (backend/design) — same disposition.
- uncertain_needs_capture: can't decide without a fresh moysklad capture of THIS return type.

KNOWN-ALREADY-FIXED (do NOT report these as deltas unless they REGRESSED):
S2 Задачи (DocumentTasksSection present), PositionEditor i18n (usePositionEditorLabels), comment=tFields('description'),
direction-correct counterparty label, titlePrefix=tDetailTitles(...). Focus on deltas the twin fixed but THIS page did not.

Read the FULL target page and the twin page. Use the twin AUDIT DOC for the proven dispositions. Report a finding for
every dimension you assessed (so the operator sees coverage), with accurate file:line locations in the TARGET page.
Your final output is the StructuredOutput object — raw data, not prose.
`

function diffPrompt(m) {
  return `${COMMON}

TARGET (un-audited): apps/web/src/app/(app)/${m.module}/[id]/page.tsx
AUDITED TWIN (reference): apps/web/src/app/(app)/${m.twin}/[id]/page.tsx
TWIN AUDIT DOC: docs/audits/${m.twin}-detail.audit.md
TWIN CAPTURE DOM (optional, large): docs/moysklad-reference/${m.twin}/detail/edit-tab-main.html

DIRECTION MAP: ${m.direction}

Produce the sibling-parity diff for ${m.module} vs ${m.twin}.`
}

function verifyPrompt(m, f) {
  return `You are a BLIND adversarial verifier for a moysklad-clone parity audit. Default to SKEPTICISM.

A prior auditor claims this is a parity delta in apps/web/src/app/(app)/${m.module}/[id]/page.tsx:
- dimension: ${f.dim} — ${f.element}
- twin (${m.twin}, proven reference) value: ${f.twin_value}
- this page's value: ${f.this_value}
- claimed location: ${f.location}
- proposed fix: ${f.proposed_fix || '(none)'}
- claim reasoning: ${f.reasoning}

DIRECTION MAP: ${m.direction}

INDEPENDENTLY re-derive the truth from scratch:
1. Read the claimed location in the target page AND the corresponding code in the twin page (apps/web/src/app/(app)/${m.twin}/[id]/page.tsx) and the twin audit doc (docs/audits/${m.twin}-detail.audit.md).
2. Is the twin's value genuinely the moysklad-correct reference (per its audit doc)? Is the target page actually divergent?
3. Is the divergence a REAL bug, or correct-by-direction, or something that needs a fresh capture of THIS return type to decide?
4. If real, what is the exact canonical value/fix (grounded in the twin)?

Verdict: confirmed_real_delta (only if you independently re-derived it as a genuine, capture-independent bug),
refuted_not_a_delta (correct-by-direction, or twin reference is not authoritative, or no real divergence),
or needs_capture (genuine uncertainty requiring a moysklad return-type capture). Output the StructuredOutput object.`
}

const modules = [
  {
    module: 'sales-returns',
    twin: 'demands',
    direction: 'sales-return (Возврат покупателя) is the CUSTOMER-side return — the inverse of a demand (Отгрузка). A demand can CREATE a sales-return (demand audit I6). Counterparty = «Покупатель» (customer). Created from a demand/sale. Refund flow = pay money back to customer.',
  },
  {
    module: 'purchase-returns',
    twin: 'supplies',
    direction: 'purchase-return (Возврат поставщику) is the SUPPLIER-side return — the inverse of a supply (Приёмка). A supply can CREATE a purchase-return (supply audit I3). Counterparty = «Поставщик» (supplier). Created from a supply/receipt. Refund flow = receive money back from supplier.',
  },
]

phase('Diff')
const results = await pipeline(
  modules,
  (m) => agent(diffPrompt(m), { label: `diff:${m.module}`, phase: 'Diff', schema: DIFF_SCHEMA }),
  (diff, m) => {
    const toVerify = (diff?.findings ?? []).filter(
      (f) => f.classification === 'real_delta' || f.classification === 'uncertain_needs_capture',
    )
    if (!toVerify.length) return { module: m.module, twin: m.twin, diff, verified: [] }
    return parallel(
      toVerify.map((f) => () =>
        agent(verifyPrompt(m, f), { label: `verify:${m.module}:${f.dim}`, phase: 'Verify', schema: VERIFY_SCHEMA })
          .then((v) => ({ finding: f, verdict: v }))
          .catch(() => ({ finding: f, verdict: null })),
      ),
    ).then((verified) => ({ module: m.module, twin: m.twin, diff, verified }))
  },
)

log(`Diff+verify complete for ${results.filter(Boolean).length}/${modules.length} modules`)
return results

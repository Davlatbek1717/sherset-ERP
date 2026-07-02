export const meta = {
  name: 'label-grounding-audit',
  description: 'Re-verify every COMMITTED "capture-grounded" RU label across prior cohorts against the actual gold-capture DOM context — hunt the misread-capture bug-class (label claimed capture-grounded but the term is a grep-count / promo-banner / wrong-field, not that field\'s label).',
  phases: [
    { title: 'Verify', detail: 'per-page: extract capture-grounded label claims + verify each vs DOM context' },
    { title: 'Reverify', detail: 'blind refute-default re-check of every flagged (misgrounded) label' },
  ],
}

const REPO = 'd:/projects/moysklad'
const CAP = `${REPO}/docs/moysklad-reference/visual-captures`
let A = args
if (typeof A === 'string') { try { A = JSON.parse(A) } catch (e) { A = {} } }
const pages = A?.pages ?? []
if (!pages.length) { log('ERROR: no pages'); return { error: 'no pages' } }
log(`Label-grounding audit: ${pages.length} pages`)

const EXTRACT_SCHEMA = {
  type: 'object',
  required: ['page', 'capture_usable', 'findings'],
  properties: {
    page: { type: 'string' },
    capture_usable: { type: 'boolean', description: 'false if the capture is contaminated (wrong form, e.g. <title>Корзина</title>) / missing / shows a different document' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'field', 'committed_label', 'verdict', 'evidence'],
        properties: {
          id: { type: 'string' },
          field: { type: 'string', description: 'the UI field/element the label is for' },
          committed_label: { type: 'string', description: 'the RU value currently committed (the term in question)' },
          verdict: { type: 'string', enum: ['correct', 'misgrounded', 'cant_verify'] },
          evidence: { type: 'string', description: 'the DOM context found around the term (the enclosing element + the field it labels), or why cant_verify' },
        },
      },
    },
  },
}

const REVERDICT_SCHEMA = {
  type: 'object',
  required: ['id', 'verdict', 'confidence', 'evidence', 'fix_hint'],
  properties: {
    id: { type: 'string' },
    verdict: { type: 'string', enum: ['misgrounded', 'correct', 'uncertain'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    evidence: { type: 'string' },
    fix_hint: { type: 'string', description: 'if misgrounded: the correct RU label (with DOM-context proof) + file:line to change' },
  },
}

const results = await pipeline(
  pages,
  (p) => agent(
    `You are re-verifying whether COMMITTED Russian UI labels are actually correct vs the moysklad GOLD CAPTURE.
Working dir = ${REPO}.
HUNTED BUG-CLASS: a label was committed claiming it was "capture-grounded", but the grounding was a MISREAD — e.g. the
term was found by a grep COUNT (presence ≠ role), or it appears in the capture ONLY as a promo/marketing banner, a column
header for a different concept, a tooltip, or a DIFFERENT field — NOT as the label of the field it was applied to. (Real
example just found: a variant buy-price field was labeled «Себестоимость» citing the capture, but «Себестоимость» only
appeared in a promo banner «Новое решение: Маржа и Себестоимость» — the correct label was «Закупочная цена».)

Audit doc: ${REPO}/docs/audits/${p.page}.audit.md
GOLD CAPTURE DOM: ${CAP}/${p.captureDir}/dom-default.html  (also screenshots/ + capture.json there)
${p.note ? `NOTE: ${p.note}` : ''}

STEPS:
1. Read the audit doc. Extract EVERY place a SPECIFIC Russian field label / term was CHOSEN and a capture was cited as
   justification (e.g. «Контрагент», «План. дата приёмки», «Комментарий», «Изменения»/«Изменено», «Главная», «Выручка»,
   «Внесение»/«Изъятие», «Накладные расходы», create-document item labels, tab labels, etc.). For each note the FIELD it
   labels + the committed RU value. If unsure of the current value, cross-check ${REPO}/apps/web/src/messages/ru.json.
2. For EACH term: Grep the capture DOM for it, then READ the surrounding DOM context (the enclosing element + which field
   it labels). A grep COUNT is NOT proof — read context. Decide:
   - 'correct' = the term appears in the capture AS THE LABEL OF THAT FIELD (a <label>, form caption, the matching column
     header, the matching tab) — role matches.
   - 'misgrounded' = the term is ABSENT, or appears ONLY in unrelated context (promo/banner, different field, tooltip,
     unrelated menu) → the hunted bug. Give the CORRECT label from the capture if you can find it.
   - 'cant_verify' = the capture is CONTAMINATED (wrong form — check <title> / whether the DOM is a different document),
     missing, or the audit doc itself says no/contaminated capture (then set capture_usable=false).
3. Be precise and bounded: Grep first, Read only the needed DOM slices. Do NOT invent. If you cannot positively confirm
   the term labels that field AND the capture is usable, mark 'misgrounded' (we ground-truth those by hand). If the
   capture is unusable, mark 'cant_verify' (NOT misgrounded — no false alarm on contaminated/absent captures).
Return the structured findings.`,
    { label: `verify:${p.page}`, phase: 'Verify', schema: EXTRACT_SCHEMA },
  ).then((r) => ({ p, r })),
  ({ p, r }) => {
    const flagged = (r?.findings ?? []).filter((f) => f.verdict === 'misgrounded')
    if (!flagged.length) return { page: p.page, capture_usable: r?.capture_usable, all: r?.findings ?? [], confirmed: [] }
    return parallel(flagged.map((f) => () =>
      agent(
        `BLIND adversarial re-verification (you have NOT seen the first reviewer's reasoning). Working dir = ${REPO}.
A committed Russian label may be MISGROUNDED (the hunted bug-class: label claimed capture-grounded but the term is a
grep-count / promo-banner / wrong-field, not that field's label).
Page audit doc: ${REPO}/docs/audits/${p.page}.audit.md
GOLD CAPTURE DOM: ${CAP}/${p.captureDir}/dom-default.html
Field: "${f.field}". Committed RU label: "${f.committed_label}". First reviewer's evidence: ${f.evidence}
Independently: Grep the capture DOM for the term, READ the DOM context, and decide — is "${f.committed_label}" REALLY the
moysklad label for "${f.field}" (verdict 'correct'), or is it MISGROUNDED (verdict 'misgrounded', the bug)? Try hard to
CONFIRM it is correct (default 'correct' if the term plausibly labels that field in the capture); only say 'misgrounded'
if you positively find the term is NOT that field's label. If misgrounded, give the CORRECT label + file:line. Cite the
exact DOM snippet.`,
        { label: `reverify:${p.page}:${f.id}`, phase: 'Reverify', schema: REVERDICT_SCHEMA },
      ).then((v) => ({ ...f, reverify: v })),
    )).then((vs) => ({
      page: p.page,
      capture_usable: r?.capture_usable,
      all: r?.findings ?? [],
      confirmed: vs.filter(Boolean).filter((x) => x.reverify?.verdict === 'misgrounded'),
    }))
  },
)

const clean = results.filter(Boolean)
const confirmedBugs = clean.flatMap((x) => (x.confirmed ?? []).map((c) => ({ page: x.page, field: c.field, committed_label: c.committed_label, correct: c.reverify?.fix_hint, confidence: c.reverify?.confidence, evidence: c.reverify?.evidence })))
const cantVerify = clean.filter((x) => x.capture_usable === false).map((x) => x.page)
return {
  pages_checked: clean.length,
  total_label_claims: clean.reduce((n, x) => n + (x.all?.length ?? 0), 0),
  correct: clean.reduce((n, x) => n + (x.all?.filter((f) => f.verdict === 'correct').length ?? 0), 0),
  cant_verify_pages: cantVerify,
  confirmed_misgrounded: confirmedBugs,
}

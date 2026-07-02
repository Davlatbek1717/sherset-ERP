export const meta = {
  name: 'cohort-detail-audit',
  description: 'Reusable batch sibling-parity audit of a COHORT of detail pages (v2). Premise-challenge AUTO-CORRECTS the reference + immunizes bias; per-page dual-framing diff (schema-retry hardened); cohort completeness critic emits STRUCTURED candidates; then BOTH diff-deltas AND critic-candidates get blind direction-aware verify. Quality self-vetted — no heavy operator review.',
  phases: [
    { title: 'Premise', detail: 'challenge brief, auto-correct reference, immunize bias' },
    { title: 'Analyze', detail: 'per-page diff (hardened) + cohort completeness critic, in parallel' },
    { title: 'Verify', detail: 'blind refute-default verify of every diff-delta AND critic-candidate' },
  ],
}

const REPO = 'd:/projects/moysklad'
// args may arrive parsed OR as a JSON string (harness-dependent) — handle both.
let A = args
if (typeof A === 'string') { try { A = JSON.parse(A) } catch (e) { A = {} } }
const family = A?.family ?? '(no family description)'
const directionFacts = A?.directionFacts ?? ''
const pages = A?.pages ?? []
if (!pages.length) { log('ERROR: args.pages empty'); return { error: 'no pages' } }
log(`Cohort audit v2: ${pages.length} pages — ${pages.map((p) => p.page).join(', ')}`)

// ── schema-retry wrapper: a schema agent that nudges once more, then degrades
// gracefully instead of dropping the whole unit to null. ──────────────────────
async function safeAgent(prompt, opts, fallback) {
  try {
    return await agent(prompt, opts)
  } catch (e) {
    try {
      return await agent(
        `${prompt}\n\n‼️ You MUST finish by calling the StructuredOutput tool with the exact schema. Keep prose to a minimum — put all content INSIDE the tool call.`,
        { ...opts, label: `${opts.label}:retry` },
      )
    } catch (e2) {
      log(`agent ${opts.label} failed schema after retry — degraded`)
      return typeof fallback === 'function' ? fallback() : fallback
    }
  }
}

const PREMISE_SCHEMA = {
  type: 'object',
  required: ['biases', 'extra_checks', 'corrected_references'],
  properties: {
    biases: { type: 'array', items: { type: 'string' }, description: 'ways the brief/framing would PRODUCE WRONG findings' },
    extra_checks: { type: 'array', items: { type: 'string' }, description: 'intrinsic dimensions the sibling-diff cannot catch and MUST be checked per page' },
    corrected_references: {
      type: 'array',
      description: 'the reference each page should ACTUALLY be diffed against (override the brief if it was wrong)',
      items: {
        type: 'object',
        required: ['page', 'primary_reference', 'demote'],
        properties: {
          page: { type: 'string' },
          primary_reference: { type: 'string', description: 'the true structural sibling to diff against' },
          demote: { type: 'string', description: 'references to use as feature-source only (NOT parity baseline), or "" ' },
        },
      },
    },
  },
}

const DIFF_SCHEMA = {
  type: 'object',
  required: ['page', 'findings', 'confirmed_mirrors'],
  properties: {
    page: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'element', 'ours', 'expected', 'severity', 'reasoning'],
        properties: {
          id: { type: 'string' }, element: { type: 'string' },
          ours: { type: 'string' }, expected: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          reasoning: { type: 'string' },
        },
      },
    },
    confirmed_mirrors: { type: 'array', items: { type: 'string' } },
  },
}

const CRITIC_SCHEMA = {
  type: 'object',
  required: ['candidates', 'overall'],
  properties: {
    candidates: {
      type: 'array',
      description: 'STRUCTURED candidate bugs that sibling-diff cannot catch (intrinsic / cohort-wide). Each will be blind-verified.',
      items: {
        type: 'object',
        required: ['id', 'page', 'element', 'ours', 'expected', 'severity', 'reasoning'],
        properties: {
          id: { type: 'string' }, page: { type: 'string' }, element: { type: 'string' },
          ours: { type: 'string' }, expected: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          reasoning: { type: 'string' },
        },
      },
    },
    overall: { type: 'string' },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['id', 'verdict', 'confidence', 'fix_hint', 'evidence'],
  properties: {
    id: { type: 'string' },
    verdict: { type: 'string', enum: ['confirmed', 'refuted', 'uncertain'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    fix_hint: { type: 'string', description: 'if confirmed: the concrete minimal fix (file:line + change)' },
    evidence: { type: 'string', description: 'concrete files/lines/captures/backend grounding' },
  },
}

// ── Phase 1: premise — auto-correct reference + immunize bias ─────────────────
phase('Premise')
const premise = await safeAgent(
  `You are the BIAS-CHECK + REFERENCE-CORRECTOR for a batch detail-page parity audit. Working dir = ${REPO}.
FAMILY: ${family}
DIRECTION FACTS (a naive diff would mis-flag): ${directionFacts}
PAGES + the brief's (possibly WRONG) chosen references:
${pages.map((p) => `- ${p.page} (${p.titleRu}, ${p.entity}) → brief says: ${p.reference}`).join('\n')}

Do NOT audit. ATTACK the framing before it runs so systematic errors don't propagate across all ${pages.length} pages:
1. For EACH page output corrected_references: the TRUE structural sibling to diff against. If the brief's reference
   carries scaffolding this doc-type legitimately lacks (sidebar/createMenu/print/counterparty/accounts/etc.),
   pick a better sibling and DEMOTE the brief's choice to "feature-source only".
2. biases: every way a diff agent could manufacture a FALSE delta here (the full family of legitimate absences —
   not just one). Be exhaustive.
3. extra_checks: intrinsic dimensions sibling-diff CANNOT catch (reason-code namespace+options, doc-unique meta
   fields, posted-state layout, FSM verb mapping, i18n keys in BOTH uz+ru, dead/unwired buttons). These are where
   the real bugs hide.
SPEED RULE — be FAST and BOUNDED (the diff agents do the deep full-file reads, NOT you): use mostly Grep/Glob to
scan the cohort pages + the candidate reference for scaffolding markers (agent/counterparty, DetailTotalsSidebar,
createMenuItems, onPrintList, SendEmailDialog, buildDocStateMenu/DOC_STATE_VERB, store pickers, reason select,
PositionEditor mode). Read AT MOST one short file only if essential. Aim for ≤8 tool calls total — do NOT read
every page in full — then return the structured output immediately.`,
  { label: 'premise-correct', phase: 'Premise', schema: PREMISE_SCHEMA },
  { biases: [], extra_checks: [], corrected_references: [] },
)
log(`Premise: ${premise?.corrected_references?.length ?? 0} refs corrected, ${premise?.biases?.length ?? 0} bias warnings, ${premise?.extra_checks?.length ?? 0} extra checks`)

const refFor = (page) => premise?.corrected_references?.find((r) => r.page === page)
const immunBrief = `
BIAS WARNINGS — do NOT flag any of these as deltas: ${(premise?.biases ?? []).map((b) => `\n  - ${b}`).join('')}
EXTRA INTRINSIC CHECKS — cover each explicitly (this is where real bugs hide): ${(premise?.extra_checks ?? []).map((c) => `\n  - ${c}`).join('')}`

// ── Phase 2: per-page diff (hardened) + cohort critic, all in parallel ────────
phase('Analyze')
const analyzeTasks = [
  ...pages.map((p) => () => {
    const corr = refFor(p.page)
    const refLine = corr
      ? `PRIMARY structural reference (diff against THIS): ${corr.primary_reference}. Feature-source only (do NOT use as parity baseline): ${corr.demote || p.reference}`
      : `Reference: ${p.reference}`
    return safeAgent(
      `Audit ${REPO}/apps/web/src/app/(app)/${p.page}/[id]/page.tsx for moysklad 1:1 parity (sibling-parity).
This is ${p.titleRu} (${p.entity}), family: ${family}
${refLine}${p.capturePaths ? `\nCAPTURES: ${p.capturePaths}` : ''}
DIRECTION FACTS: ${directionFacts}
${immunBrief}

Read the page IN FULL + the PRIMARY reference. For every element weigh BOTH "should match" and "legitimately
differs" before classifying. List legitimate doc-specific differences as confirmed_mirrors (esp. DIRECTION FACTS &
BIAS WARNINGS — never flag a legitimately-absent feature). List as findings ONLY genuine real-delta/uncertain
divergences. Cite line numbers. Do NOT propose fixes.`,
      { label: `diff:${p.page}`, phase: 'Analyze', schema: DIFF_SCHEMA },
      { page: p.page, findings: [], confirmed_mirrors: [], _failed: true },
    ).then((d) => ({ kind: 'diff', page: p.page, d }))
  }),
  () => safeAgent(
    `Completeness critic for a cohort parity audit. Working dir = ${REPO}. Family: ${family}.
Pages: ${pages.map((p) => p.page).join(', ')}. DIRECTION FACTS: ${directionFacts}.
The sibling-diff agents only catch divergences vs a reference. YOUR job is the INTRINSIC + COHORT-WIDE bugs they
cannot see — where ALL siblings share the same mistake, or where a field/button/FSM is internally wrong with no
reference. Read the page files. Hunt specifically for: dead/unwired props (e.g. a bulk/mass-edit or print handler
NOT passed so the button renders dead), wrong i18n namespace/missing keys (uz AND ru), FSM verb mismatches (firing
a transition with no backend route), Number()/precision coercions on money/qty, posted/cancelled-state render
branches that fall through wrong, label drift on a shared field. Emit STRUCTURED candidates (each will be
blind-verified — so include concrete element + ours + expected + file:line in reasoning). Be specific, not vague.`,
    { label: 'completeness-critic', phase: 'Analyze', schema: CRITIC_SCHEMA },
    { candidates: [], overall: '(critic degraded)' },
  ).then((c) => ({ kind: 'critic', c })),
]
const analyzed = (await parallel(analyzeTasks)).filter(Boolean)

const diffs = analyzed.filter((x) => x.kind === 'diff')
const critic = analyzed.find((x) => x.kind === 'critic')?.c ?? { candidates: [], overall: '' }

// Pool every candidate (diff findings + critic candidates) for one verify pass.
const candidates = [
  ...diffs.flatMap((x) => (x.d?.findings ?? []).map((f) => ({ ...f, page: x.page, source: 'diff' }))),
  ...(critic.candidates ?? []).map((c) => ({ ...c, source: 'critic' })),
]
log(`Candidates to verify: ${candidates.length} (${diffs.reduce((n, x) => n + (x.d?.findings?.length ?? 0), 0)} diff + ${critic.candidates?.length ?? 0} critic)`)

// ── Phase 3: blind refute-default verify of EVERY candidate (diff + critic) ───
phase('Verify')
const verdicts = (await parallel(candidates.map((c, i) => () =>
  safeAgent(
    `BLIND adversarial verification (you have NOT seen the finder's reasoning). Working dir = ${REPO}.
Page: ${REPO}/apps/web/src/app/(app)/${c.page}/[id]/page.tsx (family: ${family}).
DIRECTION FACTS: ${directionFacts}
Claim — element "${c.element}": ours = ${c.ours}; expected = ${c.expected}. Stated reasoning: ${c.reasoning}
Independently decide: REAL bug that must be FIXED (confirmed), or NOT a bug / doc-correct (refuted)? Try HARD to
REFUTE — default 'refuted' if the divergence is explained by this doc-type genuinely differing, or if the claim is
wrong on the code. If it implies a backend change, verify the backend actually supports the fix. If confirmed, give
a concrete minimal fix_hint (file:line + change). Read files yourself; cite lines.`,
    { label: `verify:${c.page}:${c.id}`, phase: 'Verify', schema: VERDICT_SCHEMA },
    { id: c.id, verdict: 'uncertain', confidence: 'low', fix_hint: '', evidence: '(verify degraded)' },
  ).then((v) => ({ candidate: c, v })),
))).filter(Boolean)

const confirmed = verdicts.filter((x) => x.v?.verdict === 'confirmed')
  .map((x) => ({ page: x.candidate.page, source: x.candidate.source, element: x.candidate.element, severity: x.candidate.severity, ours: x.candidate.ours, expected: x.candidate.expected, confidence: x.v.confidence, fix_hint: x.v.fix_hint, evidence: x.v.evidence }))

return {
  cohort: pages.map((p) => p.page),
  premise: { corrected_references: premise?.corrected_references ?? [], biases: premise?.biases ?? [], extra_checks: premise?.extra_checks ?? [] },
  failedDiffs: diffs.filter((x) => x.d?._failed).map((x) => x.page),
  counts: { candidates: candidates.length, confirmed: confirmed.length, refuted: verdicts.filter((x) => x.v?.verdict === 'refuted').length, uncertain: verdicts.filter((x) => x.v?.verdict === 'uncertain').length },
  confirmed,
  uncertain: verdicts.filter((x) => x.v?.verdict === 'uncertain').map((x) => ({ page: x.candidate.page, element: x.candidate.element, source: x.candidate.source, evidence: x.v.evidence })),
  criticOverall: critic.overall,
}

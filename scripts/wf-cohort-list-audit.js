export const meta = {
  name: 'cohort-list-audit',
  description: 'Reusable batch parity audit of a COHORT of LIST pages (column-set/filters/sort/bulk-actions/toolbar/empty-state/pagination/money+date format/i18n). Premise auto-corrects the reference + immunizes bias; per-page list-diff (schema-retry hardened); cohort completeness critic; then BOTH diff-deltas AND critic-candidates get blind direction-aware refute-default verify. Self-vetted. Sibling-engine of wf-cohort-detail-audit.js but for the LIST axis.',
  phases: [
    { title: 'Premise', detail: 'challenge brief, auto-correct reference, immunize bias' },
    { title: 'Analyze', detail: 'per-list-page diff (hardened) + cohort completeness critic, in parallel' },
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
log(`List-cohort audit: ${pages.length} pages — ${pages.map((p) => p.page).join(', ')}`)

// ── schema-retry wrapper: nudge once more, then degrade gracefully ────────────
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
    biases: { type: 'array', items: { type: 'string' }, description: 'ways the brief/framing would PRODUCE WRONG list-parity findings' },
    extra_checks: { type: 'array', items: { type: 'string' }, description: 'intrinsic list dimensions the sibling-diff cannot catch and MUST be checked per page' },
    corrected_references: {
      type: 'array',
      description: 'the reference each LIST page should ACTUALLY be diffed against (override the brief if wrong)',
      items: {
        type: 'object',
        required: ['page', 'primary_reference', 'demote'],
        properties: {
          page: { type: 'string' },
          primary_reference: { type: 'string', description: 'the true structural sibling LIST page (or moysklad list-capture) to diff against' },
          demote: { type: 'string', description: 'references to use as feature-source only (NOT parity baseline), or ""' },
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
      description: 'STRUCTURED candidate bugs that sibling-diff cannot catch (intrinsic / cohort-wide on list pages). Each will be blind-verified.',
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

// The list-parity axes every diff/critic agent weighs (shared brief).
const LIST_AXES = `LIST-PARITY AXES (weigh each; a list page is NOT a document form — no positions/totals/FSM/save):
- COLUMN SET + labels: which columns render, their order, and their RU/uz labels (DOM-role/§4 — read the column
  header/accessor, NOT a grep-count). Missing/extra column, wrong label, wrong order.
- FILTERS: status/date/counterparty/store/etc filter controls + saved-filter chips; default filter.
- SORT: which columns are sortable, default sort column+direction.
- BULK ACTIONS: row selection + bulk-delete / bulk-transition / export dropdown (and whether it is wired or a dead button).
- TOOLBAR: Create button (+ its label), import/export, print, refresh, search box + its placeholder.
- ROW ACTIONS: row click → detail route; inline archive/delete/restore; context menu.
- EMPTY-STATE: text + CTA. PAGINATION / infinite-scroll. LOADING state.
- MONEY/DATE FORMAT in cells: formatMoney (BigInt-safe, NOT Number(minor)/100+suffix) and date-locale.
- i18n: Cyrillic AND Latin-uz hardcoded leaks (no-hardcoded gate is Cyrillic-only → Latin-uz is gate-blind).
- STATE/STATUS rendering: status badge mapping, posted/cancelled/archived visual.`

// ── Phase 1: premise — auto-correct reference + immunize bias ─────────────────
phase('Premise')
const premise = await safeAgent(
  `You are the BIAS-CHECK + REFERENCE-CORRECTOR for a batch LIST-page parity audit. Working dir = ${REPO}.
FAMILY: ${family}
DIRECTION FACTS (a naive diff would mis-flag): ${directionFacts}
${LIST_AXES}
PAGES + the brief's (possibly WRONG) chosen references:
${pages.map((p) => `- ${p.page} (${p.titleRu}, ${p.entity}) → brief says: ${p.reference}`).join('\n')}

Do NOT audit. ATTACK the framing before it runs so systematic errors don't propagate across all ${pages.length} pages:
1. For EACH page output corrected_references: the TRUE structural sibling LIST page to diff against (or a moysklad
   list-capture if one exists). If the brief's reference carries scaffolding this list legitimately lacks
   (bulk-transition on a non-FSM catalog list, Create on a read-only/system list, counterparty-filter on a settings
   list, money columns on a non-money entity), pick a better sibling and DEMOTE the brief's choice to feature-source only.
2. biases: every way a diff agent could manufacture a FALSE list-delta here (the full family of legitimate absences —
   settings lists lack doc-toolbars; read-only lists lack Create/bulk; a catalog list has no status filter; etc.). Be exhaustive.
3. extra_checks: intrinsic list dimensions sibling-diff CANNOT catch (dead/unwired bulk-action dropdown, money cell
   using Number()/100 instead of formatMoney, Latin-uz i18n leak in a column header/empty-state, wrong default sort,
   a column label misgrounded vs moysklad). These are where the real bugs hide.
SPEED RULE — be FAST and BOUNDED (the diff agents do the deep reads): mostly Grep/Glob to scan the cohort list pages +
the candidate reference for the list-axis markers above. Read AT MOST one short file if essential. Aim for ≤8 tool
calls total — then return the structured output immediately.`,
  { label: 'premise-correct', phase: 'Premise', schema: PREMISE_SCHEMA },
  { biases: [], extra_checks: [], corrected_references: [] },
)
log(`Premise: ${premise?.corrected_references?.length ?? 0} refs corrected, ${premise?.biases?.length ?? 0} bias warnings, ${premise?.extra_checks?.length ?? 0} extra checks`)

const refFor = (page) => premise?.corrected_references?.find((r) => r.page === page)
const immunBrief = `
BIAS WARNINGS — do NOT flag any of these as deltas: ${(premise?.biases ?? []).map((b) => `\n  - ${b}`).join('')}
EXTRA INTRINSIC CHECKS — cover each explicitly (this is where real bugs hide): ${(premise?.extra_checks ?? []).map((c) => `\n  - ${c}`).join('')}`

// ── Phase 2: per-page list-diff (hardened) + cohort critic, in parallel ───────
phase('Analyze')
const analyzeTasks = [
  ...pages.map((p) => () => {
    const corr = refFor(p.page)
    const refLine = corr
      ? `PRIMARY structural reference (diff against THIS): ${corr.primary_reference}. Feature-source only (do NOT use as parity baseline): ${corr.demote || p.reference}`
      : `Reference: ${p.reference}`
    return safeAgent(
      `Audit the LIST page ${REPO}/apps/web/src/app/(app)/${p.page}/page.tsx for moysklad 1:1 parity (sibling-parity).
This is ${p.titleRu} (${p.entity}), family: ${family}
${refLine}${p.capturePaths ? `\nCAPTURES: ${p.capturePaths}` : ''}
DIRECTION FACTS: ${directionFacts}
${LIST_AXES}
${immunBrief}

Read the LIST page IN FULL + the PRIMARY reference list page. The list often delegates to a shared table component
(DataTable / columns config / a *-list-view.tsx or bulk-actions-dropdown.tsx) — READ those too. For every list-axis
element weigh BOTH "should match" and "legitimately differs" before classifying. List legitimate list-specific
differences as confirmed_mirrors (esp. DIRECTION FACTS & BIAS WARNINGS — never flag a legitimately-absent toolbar/
bulk/filter). List as findings ONLY genuine real-delta/uncertain divergences. Cite line numbers. Do NOT propose fixes.`,
      { label: `diff:${p.page}`, phase: 'Analyze', schema: DIFF_SCHEMA },
      { page: p.page, findings: [], confirmed_mirrors: [], _failed: true },
    ).then((d) => ({ kind: 'diff', page: p.page, d }))
  }),
  () => safeAgent(
    `Completeness critic for a cohort LIST-page parity audit. Working dir = ${REPO}. Family: ${family}.
Pages: ${pages.map((p) => p.page).join(', ')}. DIRECTION FACTS: ${directionFacts}.
${LIST_AXES}
The sibling-diff agents only catch divergences vs a reference. YOUR job is the INTRINSIC + COHORT-WIDE bugs they
cannot see — where ALL sibling lists share the same mistake, or where a column/filter/bulk-action is internally wrong
with no reference. Read the list page files + their shared table/columns/bulk components. Hunt specifically for:
dead/unwired bulk-action or export handlers (button renders but no onClick/mutation), money columns using
Number(minor)/100 + a hardcoded suffix instead of formatMoney, Latin-uz OR Cyrillic hardcoded leaks in column headers/
empty-state/toolbar, wrong default sort, a column label drifted from moysklad, a status-badge mapping that falls
through wrong. Emit STRUCTURED candidates (each will be blind-verified — include concrete element + ours + expected +
file:line in reasoning). Be specific, not vague.`,
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
LIST page: ${REPO}/apps/web/src/app/(app)/${c.page}/page.tsx (family: ${family}). Also read its shared table/columns/
bulk components if relevant.
DIRECTION FACTS: ${directionFacts}
Claim — element "${c.element}": ours = ${c.ours}; expected = ${c.expected}. Stated reasoning: ${c.reasoning}
Independently decide: REAL list-parity bug that must be FIXED (confirmed), or NOT a bug / legitimately-different
(refuted)? Try HARD to REFUTE — default 'refuted' if the divergence is explained by this list-type genuinely differing
(settings/read-only/non-money/non-FSM), or if the claim is wrong on the code. If it implies a backend change, verify
the backend actually supports it. If confirmed, give a concrete minimal fix_hint (file:line + change). Read files
yourself; cite lines.`,
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

/**
 * .claude/workflows/session-start-audit.js — reusable 3-agent audit for
 * every new session, invoked when the user types "davom et" / "NEXT" /
 * "keyingi" / "qaytdik".
 *
 * Born from the 2026-05-31 sessiya (run wgu1om7d6) which independently
 * caught two real bugs the prose handoff was glossing over:
 *   (1) Q1.1 "next session" was actually a 5-min task left undone
 *   (2) NEXT.md said 16/56 at the top but still 26/56 at line 285
 *
 * Cost: 3 sonnet auditors + 1 sonnet synthesizer (~100k tokens, ~2-3 min)
 * Saving: catches at least the same bug-class without manual review
 *
 * Invoke from main loop: Workflow({ name: "session-start-audit" })
 */

export const meta = {
  name: 'session-start-audit',
  description: 'Independent 3-agent audit of recent commits + current state before starting work — catches "talk vs done" gaps and stale claims',
  whenToUse: 'On every new session before resuming work. Cheap insurance against the drift bug-class.',
  phases: [
    { title: 'Audit', detail: 'inventory + claims-vs-evidence + freshness in parallel' },
    { title: 'Synthesize', detail: 'short go/no-go verdict for the user' },
  ],
}

const SCHEMA = {
  type: 'object',
  required: ['solid', 'risky', 'verdict'],
  properties: {
    solid: { type: 'array', items: { type: 'string' } },
    risky: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string', description: '2-3 sentence honest verdict' },
  },
}

phase('Audit')

const [inventory, claims, freshness] = await parallel([
  () => agent(`INVENTORY check — verify the 5 most recent commits against their own messages.

Tasks (use Bash, Read, Grep):
1. \`git log -5 --format='%h %s'\` — list the last 5 commits
2. For EACH commit, \`git show --stat <hash>\` — confirm:
   - Files actually changed match what the commit message claims
   - If message says "X verified" or "X tugadi", a smoke log path or test count is mentioned in the body
3. Read NEXT.md — does it list a next task? Does that task already appear as DONE in any recent commit (drift signal)?
4. Read docs/progress.json — do the counts (list_pages.phase2_pct, detail_pages.audited_pct) match what NEXT.md prose says?

Mark each claim VERIFIED or INFLATED. Be ruthless. Bullet points, no prose.`, { schema: SCHEMA, label: 'inventory', phase: 'Audit', model: 'sonnet' }),

  () => agent(`CLAIMS-VS-EVIDENCE check — find "talk vs done" gaps.

Tasks (use Bash, Read, Glob):
1. Read NEXT.md "Aniq keyingi vazifa" section — what work is claimed as next?
2. For each claim:
   - If it says "BAJARILDI/DONE/TUGADI" → grep the codebase for the artifact (file/test/endpoint) and confirm it exists with real content (not empty file)
   - If it says "keyingi sessiyada" → check if a previous commit already did it (talk-vs-done gap)
3. Check the .husky/ directory: do the hooks actually do what NEXT.md prose claims?
4. Check scripts/ for any helper scripts mentioned in NEXT.md — do they exist and run cleanly?

For each gap found: cite the file/line + what the prose claimed + what is actually true.

Bullet points, no prose. Be specific.`, { schema: SCHEMA, label: 'claims-vs-evidence', phase: 'Audit', model: 'sonnet' }),

  () => agent(`FRESHNESS check — is the documented "current state" still true?

Tasks (use Bash, Read):
1. \`pnpm progress\` — run it and read the output. Does docs/progress.json reflect reality?
2. Compare progress.json timestamp (generatedAt) with git log -1 timestamp — is the file fresh?
3. Read MEMORY.md (auto-loaded) — does the latest session entry contradict NEXT.md "Aniq keyingi vazifa"?
4. Check open todos in any docs/audits/*-FINDING.md files — any of them already addressed in recent commits (stale findings)?
5. Quick scope check: are the timeline numbers in NEXT.md (e.g. "5-7 oy", "6-8 hafta") still consistent across all sections of the same file?

For each staleness found: cite file + what's stale + what's now true.

Bullet points, no prose.`, { schema: SCHEMA, label: 'freshness', phase: 'Audit', model: 'sonnet' }),
])

phase('Synthesize')

const verdict = await agent(`Synthesize 3 independent audit checks into ONE short verdict in Uzbek (uz-latin).

INVENTORY: ${JSON.stringify(inventory).slice(0, 4000)}
CLAIMS-VS-EVIDENCE: ${JSON.stringify(claims).slice(0, 4000)}
FRESHNESS: ${JSON.stringify(freshness).slice(0, 4000)}

PRODUCE markdown, MAX 150 words:

## Sessiya boshlash audit (3-agent)

### Holat
GO yoki NO-GO (NO-GO = oldin teshikni yopish kerak).

### Solid (3 bullet max)
Real qilingan ishlar.

### Topilgan gap (3 bullet max)
Real teshiklar — file:line + nima yolg'on.

### Tavsiya
1 jumla: ish boshlanadi YOKI gap yopiladi.

No flattery. If everything is clean, say "go — gap topilmadi". If there's a gap, name it concretely.`, { label: 'synthesis', phase: 'Synthesize', model: 'sonnet' })

return { inventory, claims, freshness, verdict }

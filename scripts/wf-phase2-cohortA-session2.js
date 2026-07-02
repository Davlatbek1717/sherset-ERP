export const meta = {
  name: 'phase2-cohortA-session2',
  description: 'Phase-2 Session-2 A-battery: API-adversarial QA fan-out over the 7 seed-bor Hujjat-detail pages',
  phases: [{ title: 'A-battery', detail: 'one Opus agent per page, live API probe on own ZZ-QA records' }],
}

// ---- Per-page metadata (file pointers verified at author time) ----
const PAGES = [
  {
    page: 'customer-orders', route: 'customer-orders', module: 'customer-order',
    fe: 'apps/web/src/app/(app)/customer-orders/[id]/page.tsx',
    ctrl: 'apps/api/src/modules/customer-order/customer-order.controller.ts',
    kind: 'positions',
    notes:
      'Positions document (lines array → A6 totals must equal sum of positions incl. VAT, F20 class). ' +
      'Optimistic-lock conflict-dialog was ALREADY browser-verified in session 08d — do NOT re-test the lock; cover the rest. ' +
      'Has a state/FSM — read the controller for the transition endpoint (post/unpost or state change). Reverse your own ZZ-QA state changes.',
  },
  {
    page: 'demands', route: 'demands', module: 'demand',
    fe: 'apps/web/src/app/(app)/demands/[id]/page.tsx',
    ctrl: 'apps/api/src/modules/demand/demand.controller.ts',
    kind: 'positions',
    notes:
      'Positions document; posting moves stock OUT of a store → BALANCE-AFFECTING: reverse your own ZZ-QA chain (unpost → delete). ' +
      'The «Грузополучатель» (consignee) LIST column is a known BE-include DEFER (list-axis), NOT detail-QA scope — do NOT flag it.',
  },
  {
    page: 'supplies', route: 'supplies', module: 'supply',
    fe: 'apps/web/src/app/(app)/supplies/[id]/page.tsx',
    ctrl: 'apps/api/src/modules/supply/supply.controller.ts',
    kind: 'positions',
    notes:
      'Positions document; posting moves stock IN → BALANCE-AFFECTING: reverse your own ZZ-QA chain (unpost → delete). ' +
      'A6 totals: check VAT math (vatIncluded true/false) equals sum of positions (F20 class).',
  },
  {
    page: 'cash-in', route: 'cash-in', module: 'cash-in',
    fe: 'apps/web/src/app/(app)/cash-in/[id]/page.tsx',
    ctrl: 'apps/api/src/modules/cash-in/cash-in.controller.ts',
    kind: 'money-header',
    notes:
      'ПКО — header-only money document (NO positions array → A6 = sumMinor string-shape + scale check only). ' +
      'BALANCE-AFFECTING: posting credits a cash-desk balance. You MUST reverse your own ZZ-QA chain strictly: unpost → delete, ' +
      'so the desk balance is fully restored. NEVER post/unpost an existing seed record.',
  },
  {
    page: 'cash-out', route: 'cash-out', module: 'cash-out',
    fe: 'apps/web/src/app/(app)/cash-out/[id]/page.tsx',
    ctrl: 'apps/api/src/modules/cash-out/cash-out.controller.ts',
    kind: 'money-header',
    notes:
      'РКО — header-only money document (NO positions → A6 = sumMinor shape/scale only). ' +
      'BALANCE-AFFECTING: posting debits a cash-desk balance. Reverse your own ZZ-QA chain: unpost → delete. ' +
      'NEVER touch existing seed records’ state.',
  },
  {
    page: 'moves', route: 'moves', module: 'move',
    fe: 'apps/web/src/app/(app)/moves/[id]/page.tsx',
    ctrl: 'apps/api/src/modules/move/move.controller.ts',
    kind: 'positions',
    notes:
      'Stock transfer between two stores (sourceStore → targetStore). Only ~4 seed records — pick one for read checks. ' +
      'Positions document; posting moves stock between stores → BALANCE-AFFECTING: reverse your own ZZ-QA chain (unpost → delete). ' +
      'Add to browserChecklist: the money cell uses r.currency (L4 money-fix) — operator must visually confirm formatted money (no raw minor).',
  },
  {
    page: 'payments-in', route: 'payments-in', module: 'payment-in',
    fe: 'apps/web/src/app/(app)/payments-in/[id]/page.tsx',
    ctrl: 'apps/api/src/modules/payment-in/payment-in.controller.ts',
    kind: 'money-header',
    notes:
      'Header-only money document (bank payment in). BALANCE-AFFECTING: reverse your own ZZ-QA chain (unpost → delete). ' +
      'org-account scope was ALREADY browser-verified in session 06c — do NOT re-test the org-account picker; cover the rest of the battery.',
  },
]

const AUTH_RECIPE = `
AUTH + HTTP RECIPE (tested on this machine — follow exactly to avoid wasted time):
- BASE = http://localhost:4000/api/v1
- Login: POST $BASE/auth/login  body {"email":"admin@demo.local","password":"admin123"}.
  Response body has a JWT "accessToken". Auth is **Bearer token in the Authorization header**, NOT the cookie
  (the cookie ms_rt is only the refresh token scoped to /auth — a Bearer-less or cookie-only request returns 401).
- Every probe: -H "Authorization: Bearer <accessToken>".
- WINDOWS PATH PITFALL: you are in Git-Bash but node is Windows-native. Git-Bash /tmp ≠ node's path.
  Write curl output to a RELATIVE file in the project cwd (e.g. ./zz-<page>-tmp.json) and read it with
  node relative path. Delete your temp files at the end. Example:
    curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \\
      -d '{"email":"admin@demo.local","password":"admin123"}' -o ./zz-login.json -w "login %{http_code}\\n"
    TOKEN=$(node -e "console.log(require('./zz-login.json').accessToken)")
    curl -s "$BASE/customer-orders?limit=1" -H "Authorization: Bearer $TOKEN" -o ./zz-r.json -w "%{http_code}\\n"
`

const PROHIBITIONS = `
HARD PROHIBITIONS (multi-agent wiring + balance-safety protocol — violating these corrupts shared state):
- NO git commands of any kind (no stash / checkout / reset / commit / add). You only read code and probe the live API.
- NO file edits to source. You MAY create/delete your own ./zz-*.json scratch files in the cwd (and you MUST delete them at the end).
- NEVER mutate the STATE of an existing seed record (no posting/unposting/deleting records you did not create).
- Prefix EVERY record you create with "ZZ-QA-S2 " in its name/comment field so it is identifiable.
- BALANCE SAFETY: if your entity affects cash/stock balance, you MUST reverse every posting you did on YOUR records
  (unpost before delete), in strict LIFO order, then delete the record. End state: ZERO ZZ-QA records of your entity remain,
  balances restored. Verify with a final GET filtered by your name prefix → empty.
`

const OUTPUT_CONTRACT = `
For each battery item produce a real apiResults entry: {check:"A1".."A7", status:"pass"|"fail"|"skipped", evidence:"<real HTTP code + JSON fragment>"}.
- "pass" REQUIRES a concrete HTTP status + response fragment as evidence. A claim without evidence is a "fail" of your own protocol.
- "fail" = the system behaved wrong (a real bug) OR a check could not be completed — explain which in evidence.
- "skipped" = legitimately N/A for this entity (say why, e.g. "no positions array on a header-only money doc").
suspectedBugs: ONLY things with adversarial evidence (a status code or response that proves wrong behavior). Severity HIGH/MED/LOW.
  Include file:line if you located the cause in code. Do NOT pad with style nits — this is correctness QA.
browserChecklist: specific visual items the human operator must confirm in the real browser (money formatting, RU-locale labels,
  History tab rows, the page-specific note above). Be concrete ("the «Сумма» cell shows '1 500,00 сум' not '150000'").
deferred: items legitimately out of scope (capture-gated, feature-gap, list-axis) with one-line reason.
`

const BATTERY = `
THE A-BATTERY (API-adversarial half) — run each against the LIVE API with real evidence:
A1. Login; from the FE detail page file + the controller/Zod schema, derive the **FE-shaped save payload** (read the actual
    save/submit handler — do NOT guess the shape). Note the apiPath and the audit-log entity slug (grep the page for
    auditEntity / entity= prop). Fetch any reference data you need (organization, counterparty, store, cashDesk, currency)
    from their list endpoints to build a VALID create payload.
A2. Create a "ZZ-QA-S2" record via POST → expect 201/200. Record its id.
A3. GET the detail of your new record AND of one existing seed record → confirm EVERY field the FE detail page renders is
    present in the response (relations/includes in place — this catches the POS-crash class where the FE type claims an
    include the API dropped). Name the includes you checked.
A4. Edit-save round-trip with the FE-shaped payload, setting empty OPTIONAL fields to null (the shape the edit form sends to
    clear a field) → expect 200, NOT 400. (This is the 08e null-rejection bug-class — .optional() that should be .nullish().)
A5. If the entity has a posting/state transition: post your record → 200 + new state; then
    GET /audit-logs?entity=<slug>&entityId=<id> → confirm rows exist AND every row's action is a key that the web
    audit dictionary resolves (08l/08m leak class — raw "transition:posted"/"mass-edit"/"clone" leaking). Then unpost → state restored.
A6. Money: confirm sumMinor (and per-position minor amounts) are STRINGS (BigInt-safe). For positions docs, confirm the
    document total equals the sum of positions incl. VAT (F20 class). For header money docs, confirm the minor scale is right
    (e.g. 1500.50 major → "150050" for a 2-decimal currency).
A7. CLEANUP: reverse + delete ALL your ZZ-QA-S2 records (balance-affecting → unpost first). Final GET by name prefix → empty.
    Return one good EXISTING seededRecordId (+ its detail URL http://localhost:3100/<route>/<id>) for the operator's browser pass.
`

function buildPrompt(p) {
  return `You are an API-adversarial QA agent for ONE page of a moysklad parity-clone. Your job is correctness QA against the
LIVE local API, returning structured evidence. You are NOT to fix anything — only probe and report.

PAGE: ${p.page}   (API route prefix: /api/v1/${p.route};  api module: apps/api/src/modules/${p.module}/)
FE detail page: ${p.fe}
API controller: ${p.ctrl}
ENTITY KIND: ${p.kind === 'positions' ? 'positions document (has a line-items array)' : 'header-only money document (no line-items array)'}

PAGE-SPECIFIC NOTES (obey these — they encode prior verified work so you do not waste effort or re-test):
${p.notes}
${AUTH_RECIPE}
${PROHIBITIONS}
${BATTERY}
${OUTPUT_CONTRACT}

Work methodically: read the FE page + controller + Zod schema first (Read/Grep), then run the battery with curl, then clean up.
Return the StructuredOutput object. Every "pass" must carry a real HTTP code + response fragment. Be a skeptic: try the null-clear
edit (A4) and the audit-slug resolution (A5) hard — those are where real bugs hide.`
}

phase('A-battery')
log(`A-battery: ${PAGES.length} agents (Opus), one per seed-bor Hujjat-detail page`)

const PAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['page', 'apiPath', 'entitySlug', 'apiResults', 'browserChecklist', 'suspectedBugs', 'deferred'],
  properties: {
    page: { type: 'string' },
    apiPath: { type: 'string' },
    entitySlug: { type: 'string', description: 'audit-log entity slug (PascalCase) the FE detail uses' },
    seededRecordId: { type: 'string', description: 'an existing seed record id, good for the operator browser pass' },
    seededRecordUrl: { type: 'string' },
    fsm: { type: 'string', description: 'how posting/state works for this entity, or "none"' },
    apiResults: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['check', 'status', 'evidence'],
        properties: {
          check: { type: 'string' },
          status: { type: 'string', enum: ['pass', 'fail', 'skipped'] },
          evidence: { type: 'string' },
        },
      },
    },
    browserChecklist: { type: 'array', items: { type: 'string' } },
    suspectedBugs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'desc', 'evidence'],
        properties: {
          severity: { type: 'string', enum: ['HIGH', 'MED', 'LOW'] },
          desc: { type: 'string' },
          file: { type: 'string' },
          evidence: { type: 'string' },
        },
      },
    },
    deferred: { type: 'array', items: { type: 'string' } },
    cleanupConfirmed: { type: 'string', description: 'evidence that all ZZ-QA-S2 records were removed and balances restored' },
  },
}

const results = await parallel(
  PAGES.map((p) => () =>
    agent(buildPrompt(p), { label: `A:${p.page}`, phase: 'A-battery', schema: PAGE_SCHEMA }),
  ),
)

return { session: 'phase2-cohortA-session2', pages: results.filter(Boolean) }

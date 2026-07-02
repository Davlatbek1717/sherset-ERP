export const meta = {
  name: 'clearfield-class-verify',
  description: 'Classify each remaining `|| undefined` clear-field candidate as BUG / NOT_A_BUG / RISKY with live-API evidence',
  phases: [{ title: 'classify', detail: 'one agent per candidate page, live probe create→PATCH null→GET' }],
}

// Candidate sites (header-level + position-level) found by grep, EXCLUDING the
// money-doc family already fixed (cash-in/cash-out/payments-in/payments-out) and
// retail/sessions (drawer create — undefined correct) and channels (already fixed).
const CANDIDATES = [
  { page: 'counterparties', fe: 'apps/web/src/app/(app)/counterparties/[id]/page.tsx', lines: '218-220',
    fields: 'mfo, okoned, account', route: '/counterparties',
    note: 'These are in a nested object (v.…) — determine if it is a bank-account sub-array that is REWRITTEN wholesale on save (then NOT a clear-bug) or a header field. counterparties was Phase-2 verified clean on 2026-06-10b — be extra careful before calling it a bug.' },
  { page: 'settings/bank-accounts', fe: 'apps/web/src/app/(app)/settings/bank-accounts/[id]/page.tsx', lines: '113-115',
    fields: 'bankName, accountNumber, bic', route: '/bank-accounts',
    note: 'Header fields on a settings entity.' },
  { page: 'settings/price-types', fe: 'apps/web/src/app/(app)/settings/price-types/[id]/page.tsx', lines: '74',
    fields: 'externalCode', route: '/price-types', note: 'Single header field.' },
  { page: 'settings/organizations', fe: 'apps/web/src/app/(app)/settings/organizations/[id]/page.tsx', lines: '108-121',
    fields: 'legalTitle, legalAddress, email, phone, director, directorPosition, chiefAccountant, externalCode, (nested inn/okoned/mfo)', route: '/organizations',
    note: 'Many header fields + a nested company-details object at line 121 (inn/okoned/mfo under a companyType condition).' },
  { page: 'production/stages', fe: 'apps/web/src/app/(app)/production/stages/[id]/page.tsx', lines: '136-138',
    fields: 'code, externalCode, description', route: '/processing-stages', note: 'Header fields. Confirm the API route prefix from the controller.' },
  { page: 'production/boms', fe: 'apps/web/src/app/(app)/production/boms/[id]/page.tsx', lines: '164-165',
    fields: 'description, externalCode', route: '/boms', note: 'Header fields. Confirm route prefix from controller.' },
  { page: 'production/processes', fe: 'apps/web/src/app/(app)/production/processes/[id]/page.tsx', lines: '225-227',
    fields: 'code, externalCode, description', route: '/processing-processes', note: 'Header fields. Confirm route prefix from controller.' },
  { page: 'supplies (positions)', fe: 'apps/web/src/app/(app)/supplies/[id]/page.tsx', lines: '344-346',
    fields: 'gtdNumber, gtdSumMinor, countryId (PER-POSITION, inside positions.map)', route: '/supplies',
    note: 'These are PER-POSITION fields inside the positions array map. Key question: on update, is the WHOLE positions array replaced (delete-all + recreate)? If yes, undefined just means the recreated position omits the field = effectively cleared = NOT a clear-bug. Verify by reading the update service positions handling AND by a live probe: create a supply with a position that has gtdNumber, then PATCH replacing positions with one that omits gtdNumber, GET → is gtdNumber gone? supplies is BALANCE-AFFECTING only on post — keep your record a DRAFT, never post; delete it after.' },
  { page: 'sales-returns (positions)', fe: 'apps/web/src/app/(app)/sales-returns/[id]/page.tsx', lines: '315-317',
    fields: 'gtdNumber, gtdSumMinor, countryId (PER-POSITION)', route: '/sales-returns',
    note: 'Same per-position wholesale-rewrite question as supplies. Draft only, never post, delete after.' },
  { page: 'internal-orders (positions)', fe: 'apps/web/src/app/(app)/internal-orders/[id]/page.tsx', lines: '295',
    fields: 'priceMinor (PER-POSITION)', route: '/internal-orders',
    note: 'Per-position priceMinor. priceMinor||undefined: an empty price defaults — confirm whether this is even clearable/meaningful. Same wholesale-rewrite question. Draft only.' },
]

const AUTH = `
AUTH + HTTP RECIPE (tested):
- BASE=http://localhost:4000/api/v1; POST /auth/login {"email":"admin@demo.local","password":"admin123"} → body.accessToken (JWT).
- Auth = Authorization: Bearer <accessToken> header (NOT cookie — cookie-only = 401).
- Windows path pitfall: write curl output to RELATIVE ./zz-*.json (Git-Bash /tmp ≠ node path); delete them at the end.
`

const PROHIBIT = `
HARD PROHIBITIONS: NO git commands. NO source file edits. Do NOT mutate existing seed records' state.
Prefix every record you create with "ZZ-QA-CF ". Keep records DRAFT (never post balance-affecting docs). Delete ALL your records + scratch files at the end.
`

function prompt(c) {
  return `You classify ONE clear-field candidate site in a moysklad parity-clone. The bug-class: a detail-page save handler that
sends \`field || undefined\` for an OPTIONAL field. If the user empties that field, the FE sends undefined → the backend update()
SKIPS undefined keys → the old value silently survives (a "can't clear the field" UX bug). The fix is \`|| null\` IF AND ONLY IF the
Zod schema accepts null (.nullish()/.nullable()) AND the field is header-level partial-update. If the schema is .optional() only
(rejects null) → changing to null would 400 (RISKY, do NOT recommend null). If the field is per-position and the positions array is
REWRITTEN WHOLESALE on save → undefined already clears it → NOT_A_BUG.

PAGE: ${c.page}
FE save handler: ${c.fe} (around line(s) ${c.lines})
Fields with \`|| undefined\`: ${c.fields}
Likely API route: ${c.route} (CONFIRM the real prefix from the controller @Controller decorator)
NOTE: ${c.note}
${AUTH}
${PROHIBIT}

DO THIS for EACH field:
1. Read the FE save handler to confirm the field is sent as \`X || undefined\` and whether it is header-level or inside positions.map.
2. Find the Zod create/update schema for this entity; record the field's validator (.nullish() / .nullable() / .optional()-only / required).
3. Read the update() service to see if it writes the field on null vs skips on undefined (partial update), and for positions whether the
   array is replaced wholesale (deleteMany + createMany) or diffed.
4. LIVE PROBE (definitive): login; create a ZZ-QA-CF DRAFT with the field populated; then PATCH sending the field as null
   (header) or replacing positions omitting the field (position); GET → did the value clear? Then PATCH the OLD way (undefined/omit on a
   header field) → GET → did the old value survive? Capture real HTTP codes + JSON fragments. Clean up (delete record + scratch files).
   If you cannot create the entity (missing required refs), say so and fall back to a schema+service static verdict.

Return the StructuredOutput: for each field a verdict object. verdict ∈ {BUG_CONFIRMED, NOT_A_BUG, RISKY, UNVERIFIED}.
- BUG_CONFIRMED: header field, schema accepts null, live probe shows null clears + undefined does NOT → safe to change to \`|| null\`.
- NOT_A_BUG: position wholesale-rewrite already clears, OR field is create-only / not user-clearable. Explain.
- RISKY: schema rejects null (.optional() only) → null would 400. Recommend leaving as-is or a different fix. Give evidence.
- UNVERIFIED: could not probe; give the best static read + what blocked you.
Every verdict MUST carry evidence (schema line, service behavior, and/or live HTTP codes). No evidence = UNVERIFIED.`
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['page', 'apiPath', 'fieldVerdicts', 'cleanup'],
  properties: {
    page: { type: 'string' },
    apiPath: { type: 'string' },
    positionsRewrittenWholesale: { type: 'string', description: 'for position-level pages: yes/no/na + evidence' },
    fieldVerdicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'level', 'schemaValidator', 'verdict', 'evidence'],
        properties: {
          field: { type: 'string' },
          level: { type: 'string', enum: ['header', 'position'] },
          schemaValidator: { type: 'string' },
          verdict: { type: 'string', enum: ['BUG_CONFIRMED', 'NOT_A_BUG', 'RISKY', 'UNVERIFIED'] },
          evidence: { type: 'string' },
          recommendedFix: { type: 'string' },
        },
      },
    },
    cleanup: { type: 'string' },
  },
}

phase('classify')
log(`Classifying ${CANDIDATES.length} clear-field candidate pages (Opus, live-probe)`)
const results = await parallel(
  CANDIDATES.map((c) => () => agent(prompt(c), { label: `cf:${c.page}`, phase: 'classify', schema: SCHEMA })),
)
return { candidates: results.filter(Boolean) }

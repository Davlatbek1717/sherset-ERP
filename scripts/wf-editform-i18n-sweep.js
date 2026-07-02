export const meta = {
  name: 'editform-i18n-sweep',
  description:
    'Systemic i18n sweep: the shared <EditForm/> pattern defaults to Uzbek labels (Saqlash/Bekor qilish/Xato), so the 33 pages that render it WITHOUT passing labels leak Uzbek into the RU UI. Wire useEditFormLabels() into each (import + hook call + {...spread} on EditForm). One editor agent + one verify agent per page (pipeline). The operator (Opus) then runs central typecheck/biome/tests. Mirror of the PositionEditor i18n sweep.',
  phases: [
    { title: 'Sweep', detail: 'editor agent adds the hook to each EditForm page' },
    { title: 'Verify', detail: 'verify agent re-reads each page and confirms the 3 edits' },
  ],
}

const ROOT = 'D:/projects/moysklad'
const HOOK_IMPORT = `import { useEditFormLabels } from '@/hooks/use-edit-form-labels';`
const EXAMPLE = `${ROOT}/apps/web/src/app/(app)/settings/projects/[id]/page.tsx`

// The 33 EditForm pages that do NOT pass saveLabel/cancelLabel (grepped 2026-06-01;
// projects/[id] + projects/new already done in commit c1424f4f as the canonical example).
const PAGES = [
  'discounts/new/page.tsx',
  'discounts/[id]/page.tsx',
  'ecommerce/channels/new/page.tsx',
  'ecommerce/channels/[id]/page.tsx',
  'production/boms/new/page.tsx',
  'production/boms/[id]/page.tsx',
  'production/processes/new/page.tsx',
  'production/processes/[id]/page.tsx',
  'production/stages/new/page.tsx',
  'production/stages/[id]/page.tsx',
  'settings/bank-accounts/new/page.tsx',
  'settings/bank-accounts/[id]/page.tsx',
  'settings/cash-desks/new/page.tsx',
  'settings/cash-desks/[id]/page.tsx',
  'settings/custom-entities/new/page.tsx',
  'settings/custom-entities/[id]/page.tsx',
  'settings/email/page.tsx',
  'settings/expense-items/new/page.tsx',
  'settings/expense-items/[id]/page.tsx',
  'settings/organizations/new/page.tsx',
  'settings/organizations/[id]/page.tsx',
  'settings/price-types/new/page.tsx',
  'settings/price-types/[id]/page.tsx',
  'settings/regions/new/page.tsx',
  'settings/regions/[id]/page.tsx',
  'settings/stores/new/page.tsx',
  'settings/stores/[id]/page.tsx',
  'settings/tax-rates/new/page.tsx',
  'settings/tax-rates/[id]/page.tsx',
  'settings/uoms/new/page.tsx',
  'settings/uoms/[id]/page.tsx',
  'tracking-codes/new/page.tsx',
  'tracking-codes/[id]/page.tsx',
]

const abs = (p) => `${ROOT}/apps/web/src/app/(app)/${p}`

const EDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['file', 'changed', 'importAdded', 'hookCallAdded', 'spreadAdded', 'notes'],
  properties: {
    file: { type: 'string' },
    changed: { type: 'boolean', description: 'true if you actually edited the file' },
    importAdded: { type: 'boolean' },
    hookCallAdded: { type: 'boolean' },
    spreadAdded: { type: 'boolean' },
    notes: { type: 'string', description: 'What you changed + anything unexpected (multiple EditForms, already had the hook, conditional render, etc.)' },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['file', 'ok', 'importOk', 'hookBeforeEarlyReturn', 'spreadOnEditForm', 'issue'],
  properties: {
    file: { type: 'string' },
    ok: { type: 'boolean', description: 'true only if ALL three edits are correct AND rules-of-hooks safe' },
    importOk: { type: 'boolean' },
    hookBeforeEarlyReturn: { type: 'boolean', description: 'the useEditFormLabels() call is at the top of the component, BEFORE any early return / conditional' },
    spreadOnEditForm: { type: 'boolean', description: '{...editFormLabels} (or equivalent) appears as a prop on the <EditForm element' },
    issue: { type: 'string', description: 'precise problem if ok=false, else "—"' },
  },
}

const editPrompt = (p) => `
You are applying ONE mechanical i18n fix to a single Next.js page of a moysklad.uz clone.

TARGET FILE: ${abs(p)}

WHY: this page renders the shared <EditForm/> (from @moysklad/ui) WITHOUT passing
saveLabel/cancelLabel, so the Save/Close buttons + error Alert render the component's
HARDCODED Uzbek defaults ('Saqlash'/'Bekor qilish'/'Xato') even in the Russian UI. We fix
it by spreading a localized labels hook.

CANONICAL EXAMPLE (already done — read it to copy the exact pattern):
  ${EXAMPLE}
It does exactly three things:
  1. adds the import:  ${HOOK_IMPORT}
  2. inside the component, near the other useTranslations(...)/hooks (and BEFORE any early
     return like \`if (isLoading) return …\`), adds:  const editFormLabels = useEditFormLabels();
  3. spreads it as the FIRST prop on the EditForm element:  <EditForm {...editFormLabels} …>

DO EXACTLY THIS for the target file, using the Edit tool:
  (a) Read the file first.
  (b) Add the import line ${HOOK_IMPORT} alongside the other '@/...' imports (exact placement
      doesn't matter — biome will re-sort on commit). If the file already imports it, skip.
  (c) Add \`const editFormLabels = useEditFormLabels();\` at the TOP of the component function
      body, immediately after the existing useTranslations()/useState()/useRouter() hook calls
      and BEFORE any conditional/early return. RULES OF HOOKS: it must run unconditionally on
      every render. If the component already has the const, skip.
  (d) Add \`{...editFormLabels}\` as a prop on the <EditForm element (put it right after the
      opening \`<EditForm\`). If the page passes its OWN saveLabel/cancelLabel already, DO NOT
      clobber them — put the spread BEFORE the explicit props so the explicit ones win, and
      note it. If the file has MULTIPLE <EditForm usages, spread into EACH.

CRITICAL CONSTRAINTS:
  - Do NOT change any other behavior, labels, fields, or logic. ONLY these 3 additions.
  - Do NOT touch saveLabel/cancelLabel values, form fields, mutations, or imports beyond the hook.
  - Preserve indentation/style. Make minimal, surgical edits.
  - If the file does NOT actually contain <EditForm (unexpected), make NO edits and report
    changed=false with a note.

Return the structured result (the schema). Your final message IS the result — no prose.
`

const verifyPrompt = (p) => `
Adversarially VERIFY one mechanical edit on a single file (do NOT edit — read only).

FILE: ${abs(p)}

Confirm ALL of the following by reading the file:
  1. importOk: the file imports useEditFormLabels from '@/hooks/use-edit-form-labels'.
  2. hookBeforeEarlyReturn: \`const editFormLabels = useEditFormLabels();\` is called at the top
     of the component, UNCONDITIONALLY, BEFORE any early return (if isLoading/!data return …).
     If it sits after an early return or inside a conditional/callback → hookBeforeEarlyReturn=false.
  3. spreadOnEditForm: \`{...editFormLabels}\` appears as a prop on EVERY <EditForm element in the
     file (if the file has its own saveLabel/cancelLabel, the spread must come BEFORE them so it
     does not override an intentional custom label).
ok = true ONLY if all three hold and nothing else in the file was damaged (no syntax breakage,
no removed fields/logic). If anything is off, ok=false and describe the exact issue + file:line.

Return the structured result (the schema). Your final message IS the result — no prose.
`

phase('Sweep')
log(`Wiring useEditFormLabels() into ${PAGES.length} EditForm pages (edit → verify pipeline)…`)

const results = await pipeline(
  PAGES,
  (p) => agent(editPrompt(p), { label: `edit:${p}`, phase: 'Sweep', schema: EDIT_SCHEMA }).then((r) => ({ p, edit: r })),
  (prev, p) =>
    agent(verifyPrompt(p), { label: `verify:${p}`, phase: 'Verify', schema: VERIFY_SCHEMA }).then((v) => ({
      file: p,
      edit: prev?.edit ?? null,
      verify: v,
    })),
)

const ok = results.filter(Boolean)
const bad = ok.filter((r) => !r.verify?.ok)
log(`Swept ${ok.length}/${PAGES.length}. Verify failures: ${bad.length}.`)
return { results: ok, failures: bad }

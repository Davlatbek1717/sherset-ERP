export const meta = {
  name: 'glavnaya-firsttab-sweep',
  description: 'Bug-class sweep: set the first DetailContentTabs tab label to «Главная» (tDetailTabs(\'main\')) on 8 goods-document detail pages that currently default to «Позиции»',
  phases: [{ title: 'Sweep', detail: 'one agent per page — add tDetailTabs hook + positionsLabel prop' }],
}

// productions DELIBERATELY EXCLUDED — its first tab renders a child
// processing-orders LIST (linked sub-docs), not a goods table, so «Главная»
// is not justified (bug-class agent flagged it uncertain → defer pending capture).
const PAGES = [
  { page: 'invoices-in', entity: 'InvoiceIn', anchor: `const tStates = useTranslations('states.invoice_in');` },
  { page: 'enters', entity: 'Enter', anchor: `const tReasons = useTranslations('reasons.enter');` },
  { page: 'losses', entity: 'Loss', anchor: `const tReasons = useTranslations('reasons.loss');` },
  { page: 'purchase-orders', entity: 'PurchaseOrder', anchor: `const tStates = useTranslations('states.purchase_order');` },
  { page: 'internal-orders', entity: 'InternalOrder', anchor: `const tStates = useTranslations('states.internal_order');` },
  { page: 'inventories', entity: 'Inventory', anchor: `const tStates = useTranslations('states.inventory');` },
  { page: 'processing-orders', entity: 'ProcessingOrder', anchor: `const tStates = useTranslations('states.processing_order');` },
  { page: 'processings', entity: 'Processing', anchor: `const tStates = useTranslations('states.processing');` },
]

const RESULT_SCHEMA = {
  type: 'object',
  required: ['page', 'status', 'hook_added', 'prop_added', 'diff', 'notes'],
  properties: {
    page: { type: 'string' },
    status: { type: 'string', enum: ['done', 'already_present', 'failed'] },
    hook_added: { type: 'boolean' },
    prop_added: { type: 'boolean' },
    diff: { type: 'string', description: 'the exact before→after of both edits' },
    notes: { type: 'string', description: 'anything unexpected (e.g. anchor not unique, hook already existed)' },
  },
}

phase('Sweep')

const results = await parallel(PAGES.map((p) => () =>
  agent(
    `Apply a precise 2-line i18n parity edit to ONE file. Working dir = d:/projects/moysklad.
TARGET FILE: apps/web/src/app/(app)/${p.page}/[id]/page.tsx

GOAL: this page's <DetailContentTabs> first tab currently defaults to «Позиции»; moysklad shows «Главная» for goods
documents (proven by demands/supplies edit-tab-main.html captures + the customer-orders/returns siblings which all
pass positionsLabel={tDetailTabs('main')}). Make this page do the same.

EDIT 1 — add the hook. Find the MAIN page component's useTranslations() block. Immediately AFTER this exact line:
    ${p.anchor}
insert a new line with the SAME indentation:
    const tDetailTabs = useTranslations('detail_tabs');
(If a "const tDetailTabs = useTranslations('detail_tabs');" already exists in the main component, do NOT add a
duplicate — set hook_added=false and status=already_present for that part.)

EDIT 2 — add the prop. Find the <DetailContentTabs ...> call. It contains this exact pair of consecutive lines:
    relatedGroups={[]}
    filesSlot={<AttachmentsSection entity="${p.entity}" entityId={data.id} />}
Insert a new line BETWEEN them (same indentation):
    positionsLabel={tDetailTabs('main')}
So the result is:
    relatedGroups={[]}
    positionsLabel={tDetailTabs('main')}
    filesSlot={<AttachmentsSection entity="${p.entity}" entityId={data.id} />}
(If positionsLabel is already present on this DetailContentTabs, do NOT add it again.)

CONSTRAINTS: do NOT touch any other file, import, or line. Use the Read tool then the Edit tool. The anchor strings
above are unique in this file — if Edit reports a non-unique match, widen the old_string with one neighbouring line
and report it in notes. After editing, grep the file to confirm exactly ONE "useTranslations('detail_tabs')" and
exactly ONE "positionsLabel={tDetailTabs('main')}". Do NOT run typecheck (the orchestrator runs gates centrally).

Return the structured result with the exact diff of both edits.`,
    { label: `главная:${p.page}`, phase: 'Sweep', schema: RESULT_SCHEMA },
  ).then((r) => r ?? { page: p.page, status: 'failed', hook_added: false, prop_added: false, diff: '', notes: 'agent returned null (skipped)' }),
))

return { results: results.filter(Boolean) }

export const meta = {
  name: 'buyprice-bugclass-fix',
  description: 'Fix the buyPrice cost-prefill bug-class: /products returns buyPrice as a plain string (BigInt→string serializer), but 5 detail pages type it as {value:string} and read raw?.buyPrice?.value → always undefined → cost defaults to 0. Fix type + read sites on all 5 pages.',
  phases: [{ title: 'Fix', detail: 'one Sonnet agent per page — fix type decl + read sites' }],
}

// 5 pages, identical bug shape. Type decl: `buyPrice: { value: string } | null;`
// Read sites: `raw?.buyPrice?.value ?? '0'` → `raw?.buyPrice ?? '0'`.
const PAGES = ['enters', 'invoices-in', 'purchase-orders', 'purchase-returns', 'supplies']

const SCHEMA = {
  type: 'object',
  required: ['page', 'type_fixed', 'reads_fixed', 'residual', 'status'],
  properties: {
    page: { type: 'string' },
    type_fixed: { type: 'boolean', description: 'the ProductItem.buyPrice type decl changed to `string | null`' },
    reads_fixed: { type: 'number', description: 'count of raw?.buyPrice?.value read sites changed to raw?.buyPrice' },
    residual: { type: 'number', description: 'remaining `buyPrice?.value` occurrences after the edit (MUST be 0)' },
    status: { type: 'string', enum: ['done', 'failed'] },
  },
}

phase('Fix')
const results = await parallel(PAGES.map((page) => () =>
  agent(
    `Apply a precise bug-class fix to ONE file. Working dir = d:/projects/moysklad.
TARGET: apps/web/src/app/(app)/${page}/[id]/page.tsx

BUG: the /products endpoint returns buyPrice as a PLAIN STRING (a global BigInt→string JSON serializer at
apps/api/src/main.ts converts the bigint column). But this page wrongly types it as an object and reads .value off
it, so the value is always undefined and the cost column defaults to '0' when a product is picked. The sibling
create pages (e.g. ${page}/new) correctly read the plain string. Fix both the TYPE and the READ(s):

EDIT 1 (type, exactly ONE occurrence in the ProductItem interface):
  FROM:  buyPrice: { value: string } | null;
  TO:    buyPrice: string | null;

EDIT 2 (read sites — there may be 1 or 2; fix ALL of them, use replace_all):
  FROM:  raw?.buyPrice?.value ?? '0'
  TO:    raw?.buyPrice ?? '0'

Do NOT touch salePrices (it is genuinely an array of {priceTypeId, value} — its .value reads are CORRECT). Do NOT
touch any other line, import, or file. Use the Edit tool with replace_all:true for EDIT 2. After editing, grep the
file to confirm ZERO remaining occurrences of "buyPrice?.value" and that the type line now reads
"buyPrice: string | null;". Return the structured result (residual MUST be 0).`,
    { label: `buyprice:${page}`, phase: 'Fix', model: 'sonnet', schema: SCHEMA },
  ).then((r) => r ?? { page, type_fixed: false, reads_fixed: 0, residual: -1, status: 'failed' }),
))

return { results: results.filter(Boolean) }

export const meta = {
  name: 'moneyinput-rollout',
  description: 'Convert raw-minor money inputs to <MoneyInput> across money-doc / prepayment / adjustment / payroll pages',
  phases: [{ title: 'convert', detail: 'one agent per page-family, edit only named files' }],
}

// Each family = the detail [id] page + its /new page (same money fields, same pattern).
const FAMILIES = [
  { family: 'cash-in', files: ['apps/web/src/app/(app)/cash-in/[id]/page.tsx', 'apps/web/src/app/(app)/cash-in/new/page.tsx'],
    money: 'the document Сумма (sumMinor) + each allocation/operation amount (amountMinor)' },
  { family: 'cash-out', files: ['apps/web/src/app/(app)/cash-out/[id]/page.tsx', 'apps/web/src/app/(app)/cash-out/new/page.tsx'],
    money: 'the document Сумма (sumMinor) + each allocation/operation amount (amountMinor)' },
  { family: 'payments-in', files: ['apps/web/src/app/(app)/payments-in/[id]/page.tsx', 'apps/web/src/app/(app)/payments-in/new/page.tsx'],
    money: 'the document Сумма (sumMinor) + each allocation/operation amount (amountMinor)' },
  { family: 'payments-out', files: ['apps/web/src/app/(app)/payments-out/[id]/page.tsx', 'apps/web/src/app/(app)/payments-out/new/page.tsx'],
    money: 'the document Сумма (sumMinor) + each allocation/operation amount (amountMinor)' },
  { family: 'counterparty-adjustments', files: ['apps/web/src/app/(app)/counterparty-adjustments/[id]/page.tsx', 'apps/web/src/app/(app)/counterparty-adjustments/new/page.tsx'],
    money: 'the adjustment Сумма (sumMinor)' },
  { family: 'prepayments', files: ['apps/web/src/app/(app)/prepayments/[id]/page.tsx', 'apps/web/src/app/(app)/prepayments/new/page.tsx'],
    money: 'the document Сумма (sumMinor) AND the three payment-split inputs cashSumMinor, noCashSumMinor, qrSumMinor' },
  { family: 'prepayment-returns', files: ['apps/web/src/app/(app)/prepayment-returns/[id]/page.tsx', 'apps/web/src/app/(app)/prepayment-returns/new/page.tsx'],
    money: 'the document Сумма (sumMinor) AND the three split inputs cashSumMinor, noCashSumMinor, qrSumMinor' },
  { family: 'hr-payroll', files: ['apps/web/src/app/(app)/hr/payroll/page.tsx'],
    money: 'the two config money inputs monthlySalesTargetMinor and monthlyKpiBudgetMinor' },
]

function prompt(f) {
  return `You convert raw-minor money <Input>s to the shared <MoneyInput> on ONE page-family of a moysklad clone, so the
fields display/accept the major amount (som) instead of raw minor units (tiyin). This is money-critical — be precise.

FAMILY: ${f.family}
FILES (edit ONLY these): ${f.files.join('  ·  ')}
MONEY FIELDS TO CONVERT: ${f.money}

THE CONVERSION (mechanical, exact):
The buggy pattern is a numeric <Input> bound to a *minor* string, e.g.
    <Input
      type="text"
      inputMode="numeric"            (or "decimal")
      value={form.sumMinor}          (or {sumMinor} / {op.amountMinor} / {a.amountMinor} / {form.cashSumMinor} …)
      onChange={(e) => setForm({ ...form, sumMinor: e.target.value })}   (or setSumMinor(e.target.value) / updateOp(... amountMinor: e.target.value) …)
      className="…"
      disabled={…}
      data-test-id="…"
    />
Replace it with <MoneyInput>, keeping the SAME state target — only the input element changes:
    <MoneyInput
      valueMinor={form.sumMinor}
      onChangeMinor={(v) => setForm({ ...form, sumMinor: v })}
      className="…"          ← keep verbatim
      disabled={…}           ← keep verbatim
      data-test-id="…"       ← keep verbatim if present
    />
Rules:
- DROP \`type\` and \`inputMode\`; KEEP className / disabled / data-test-id / placeholder / aria-* verbatim.
- \`value={X}\` → \`valueMinor={X}\` (X unchanged). If X can be null/undefined (e.g. \`{op.amountMinor ?? ''}\`), keep that → \`valueMinor={op.amountMinor ?? ''}\`.
- \`onChange={(e) => HANDLER(e.target.value)}\` → \`onChangeMinor={(v) => HANDLER(v)}\` — the handler/setter is IDENTICAL, just receives \`v\` (the minor string) instead of \`e.target.value\`.
- Add the import: \`MoneyInput\` from \`@moysklad/ui\` (the package that already exports Input/Button/etc. on this page — add MoneyInput to that existing import list; do NOT add a new import line if @moysklad/ui is already imported).
- The form/local state stays MINOR. Do NOT change state types, the save payload, validation (\`BigInt(form.sumMinor)\`), or any totals math — only the input ELEMENT changes.

DO NOT TOUCH (these are NOT money amounts):
- quantity / qty inputs · discount (%) · vat (%) · counts · dates · text fields · pickers · rate/currency.
- Anything already disabled/read-only that just DISPLAYS money via formatMoney (leave display alone).
- Do NOT edit any file outside the listed ones. Do NOT edit i18n/message files. Do NOT run any git command.

VERIFY before returning: re-read your edited regions; every converted input is a money amount (som), no qty/% input was
touched, and the import is present. Mentally typecheck: <MoneyInput> takes valueMinor:string + onChangeMinor:(v:string)=>void.

Return the StructuredOutput: per file, the list of conversions (field + the setter used) and anything you deliberately left.`
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['family', 'files', 'importAdded'],
  properties: {
    family: { type: 'string' },
    importAdded: { type: 'string', description: 'how MoneyInput was imported (which existing import line)' },
    files: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'conversions'],
        properties: {
          path: { type: 'string' },
          conversions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['field', 'setter'],
              properties: {
                field: { type: 'string' },
                setter: { type: 'string', description: 'the state setter / handler used in onChangeMinor' },
              },
            },
          },
          leftUntouched: { type: 'array', items: { type: 'string' }, description: 'qty/%/text inputs deliberately NOT converted' },
        },
      },
    },
    notes: { type: 'string' },
  },
}

phase('convert')
log(`Converting ${FAMILIES.length} page-families to <MoneyInput>`)
const results = await parallel(
  FAMILIES.map((f) => () => agent(prompt(f), { label: `mi:${f.family}`, phase: 'convert', schema: SCHEMA })),
)
return { families: results.filter(Boolean) }

// biome-ignore-all lint: workflow script (Workflow tool return-contract); durable so committed.
/**
 * .claude/workflows/i18n-group-verify.js — reusable 3-lens adversarial verify of
 * a document-form i18n group. Replaces the per-group `wf-<group>-verify.js`
 * scripts (which were rewritten each time) with one stable artifact, so the
 * adversarial rigor never drifts.
 *
 *   Workflow({ name: 'i18n-group-verify', args: { group: 'production' } })
 *   Workflow({ name: 'i18n-group-verify', args: { forms: ['moves','losses'] } })
 *
 * Each form gets 3 independent lenses run against its just-wired `/new` form and
 * its audited `[id]` twin:
 *   1. mislabel  — a t() key that resolves but to the WRONG value vs the [id] twin
 *                  (the class that mechanical grep + key-existence CANNOT catch).
 *   2. leftover  — any hardcoded RU/UZ literal the wiring missed.
 *   3. keyexist  — every key resolves in BOTH ru.json + uz.json; uz is natural.
 */
export const meta = {
  name: 'i18n-group-verify',
  description: '3-lens adversarial verify of a document-form i18n group',
  phases: [{ title: 'Verify', detail: 'mislabel-vs-[id] / leftover-hardcoded / key-existence per form' }],
};

const APP = 'd:/projects/moysklad/apps/web/src/app/(app)';

const GROUPS = {
  money: ['cash-in', 'cash-out', 'payments-in', 'payments-out', 'prepayments', 'prepayment-returns', 'counterparty-adjustments'],
  sales: ['demands', 'invoices-out', 'sales-returns'],
  purchase: ['supplies', 'purchase-orders', 'invoices-in', 'purchase-returns'],
  inventory: ['moves', 'losses', 'enters', 'inventories', 'internal-orders'],
  production: ['processings', 'processing-orders', 'productions'],
};

const forms = args?.forms ?? GROUPS[args?.group] ?? [];
if (!forms.length) {
  log(`No forms — pass args:{group:'<name>'} (one of ${Object.keys(GROUPS).join('/')}) or args:{forms:[...]}.`);
  return { error: 'no forms', groups: Object.keys(GROUPS) };
}

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lens', 'findings'],
  properties: {
    lens: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'location', 'issue', 'suggestedFix'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'minor'] },
          location: { type: 'string' },
          issue: { type: 'string' },
          suggestedFix: { type: 'string' },
        },
      },
    },
  },
};

const LENSES = [
  {
    key: 'mislabel',
    prompt: (f) => `ADVERSARIAL LENS 1 — wrong-key / mislabel vs the audited [id] twin.
Read ${APP}/${f}/new/page.tsx AND ${APP}/${f}/[id]/page.tsx. For EVERY field/label/title/picker in /new,
check the t() key resolves to the SAME concept the [id] twin shows (consult apps/web/src/messages/ru.json
for resolved RU values). Hunt for: a key that resolves but to the WRONG value (plural list-title used as a
singular documentTypeLabel; a 'confirmed' state where [id] uses 'posted'; a field labelled with the wrong
fields.* key; the document comment field NOT on tFields('description')=«Комментарий» as the audited
moves/[id]+demands/[id] use); STATUS_OPTIONS states not matching the [id] dropdown; documentTypeLabel not
equal to the [id] twin's tDetailTitles key. A mechanical grep cannot catch these. Report each with the exact
line + corrected key. Empty findings = clean.`,
  },
  {
    key: 'leftover',
    prompt: (f) => `ADVERSARIAL LENS 2 — leftover hardcoded strings in ${APP}/${f}/new/page.tsx.
Find EVERY hardcoded Russian or Uzbek-latin user-facing string that survived: in label=/placeholder=/title=/
documentTypeLabel=/applicableHelp=/aria-label=, in JSX text, in throw new Error(...) / setError(...), in
<option>/<th> children. Ignore: '—', currency CODES, code comments, data-test-id, CSS var(), document
number/date inputs, and the dev-invariant guard 'Form not ready'. For each real leftover give line + snippet
+ the t() key it should use. Empty = clean.`,
  },
  {
    key: 'keyexist',
    prompt: (f) => `ADVERSARIAL LENS 3 — key existence + ru/uz parity + Uzbek quality for ${APP}/${f}/new/page.tsx.
Extract every t-call with its hook namespace. For EACH key verify it exists in BOTH apps/web/src/messages/
ru.json AND uz.json (a missing key silently renders the key path). Sanity-check: RU is a real moysklad term,
UZ is natural Uzbek (not a copy of RU). Flag any key in ru but missing in uz (or vice-versa) and any
obviously wrong/placeholder translation. (Note: the repo has Vitest gates for key-existence — your job is the
SEMANTIC layer those can't see.) Report with the key path. Empty = clean.`,
  },
];

phase('Verify');
log(`3-lens adversarial verify: ${forms.length} form(s) [${forms.join(', ')}]`);

const results = await parallel(
  forms.map((f) => () =>
    parallel(
      LENSES.map((L) => () =>
        agent(L.prompt(f), { schema: FINDINGS_SCHEMA, phase: 'Verify', label: `verify:${f}:${L.key}` }),
      ),
    ).then((lenses) => ({ form: f, lenses: lenses.filter(Boolean) })),
  ),
);

return { results: results.filter(Boolean) };

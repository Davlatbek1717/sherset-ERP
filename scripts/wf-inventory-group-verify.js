// biome-ignore-all lint: workflow script (Workflow tool return-contract); durable so committed.
export const meta = {
  name: 'inventory-group-verify',
  description: '3-lens adversarial verify of inventory-group document-form i18n (moves/losses/enters/inventories/internal-orders)',
  phases: [{ title: 'Verify', detail: 'mislabel-vs-[id] / leftover-hardcoded / key-existence+parity per doc' }],
};

const APP = 'd:/projects/moysklad/apps/web/src/app/(app)';

const FORMS = [
  { slug: 'moves', titleKey: 'move', statesNs: 'move' },
  { slug: 'losses', titleKey: 'loss', statesNs: 'loss' },
  { slug: 'enters', titleKey: 'enter', statesNs: 'enter' },
  { slug: 'inventories', titleKey: 'inventory', statesNs: 'inventory' },
  { slug: 'internal-orders', titleKey: 'internal_order', statesNs: 'internal_order' },
];

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
Read ${APP}/${f.slug}/new/page.tsx AND ${APP}/${f.slug}/[id]/page.tsx.
For EVERY field/label/title/picker in /new, check the t() key resolves to the SAME concept the [id] twin
shows (consult apps/web/src/messages/ru.json for resolved RU values). Hunt for: (a) a t() key that resolves
but to the WRONG value (e.g. a plural list-title used as a singular documentTypeLabel, a 'confirmed' state
where [id] uses 'posted', a store/reason/project labelled with the wrong fields.* key); (b) STATUS_OPTIONS
states not matching the [id] state dropdown; (c) documentTypeLabel not equal to tDetailTitles('${f.titleKey}');
(d) for moves: the two stores must be tFields('store_from')/('store_to') not a generic 'store'; for
internal-orders: the destination store must be t('destination_store') and the date t('delivery_planned')
(pages.internal_order, singular ns). A mechanical grep cannot catch these. Report each with the exact line
and corrected key. Empty findings = clean.`,
  },
  {
    key: 'leftover',
    prompt: (f) => `ADVERSARIAL LENS 2 — leftover hardcoded strings.
Read ${APP}/${f.slug}/new/page.tsx. Find EVERY hardcoded Russian or Uzbek-latin user-facing string that
survived: in label=/placeholder=/title=/documentTypeLabel=/applicableHelp=/aria-label=, in JSX text nodes,
in throw new Error(...) / setError(...), in <option>/<th> children. Ignore: '—', currency CODES, code
comments, data-test-id, CSS var(), the document number/date inputs. For each real leftover give line +
snippet + the t() key it should use (consult ${APP}/moves/new/page.tsx for the convention). Empty = clean.`,
  },
  {
    key: 'keyexist',
    prompt: (f) => `ADVERSARIAL LENS 3 — key existence + ru/uz parity + Uzbek quality.
Read ${APP}/${f.slug}/new/page.tsx and extract every t-call with its hook namespace. For EACH key verify it
exists in BOTH apps/web/src/messages/ru.json AND uz.json (a missing key silently renders the key path).
Then sanity-check: RU value is a real moysklad term, UZ is natural Uzbek (not a copy of RU). Flag any key
present in ru but missing in uz (or vice-versa), and any obviously wrong/placeholder translation. Report
findings with the key path. Empty = clean.`,
  },
];

phase('Verify');
log('3-lens adversarial verify of the 5 inventory /new forms (mislabel / leftover / key-existence).');

const results = await parallel(
  FORMS.map((f) => () =>
    parallel(
      LENSES.map((L) => () =>
        agent(L.prompt(f), { schema: FINDINGS_SCHEMA, phase: 'Verify', label: `verify:${f.slug}:${L.key}` }),
      ),
    ).then((lenses) => ({ slug: f.slug, lenses: lenses.filter(Boolean) })),
  ),
);

return { results: results.filter(Boolean) };

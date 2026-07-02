// biome-ignore-all lint: workflow script (Workflow tool return-contract); durable so committed.
export const meta = {
  name: 'sales-group-i18n-verify',
  description: '3-lens adversarial verify of sales-group document-form i18n (demands/invoices-out/sales-returns)',
  phases: [{ title: 'Verify', detail: 'wrong-key / leftover-leak / sibling-consistency per doc' }],
};

const ROOT = 'd:/projects/moysklad/apps/web/src';
const DOCS = [
  {
    key: 'demands',
    newPage: `${ROOT}/app/(app)/demands/new/page.tsx`,
    idPage: `${ROOT}/app/(app)/demands/[id]/page.tsx`,
    pagesNs: 'pages.demands',
    statesNs: 'states.demand',
    ref: 'd:/projects/moysklad/docs/moysklad-reference/demands/detail/edit-tab-main.png',
    title: 'Отгрузка',
  },
  {
    key: 'invoices-out',
    newPage: `${ROOT}/app/(app)/invoices-out/new/page.tsx`,
    idPage: `${ROOT}/app/(app)/invoices-out/[id]/page.tsx`,
    pagesNs: 'pages.invoices_out',
    statesNs: 'states.invoice_out',
    ref: '(no live capture — demo account empty)',
    title: 'Счёт покупателю',
  },
  {
    key: 'sales-returns',
    newPage: `${ROOT}/app/(app)/sales-returns/new/page.tsx`,
    idPage: `${ROOT}/app/(app)/sales-returns/[id]/page.tsx`,
    pagesNs: 'pages.sales_returns',
    statesNs: 'states.sales_return',
    ref: '(no live capture — demo account empty)',
    title: 'Возврат покупателя',
  },
];

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['lens', 'severity', 'location', 'issue', 'suggested_fix'],
        properties: {
          lens: { type: 'string', enum: ['wrong-key', 'leftover-leak', 'sibling-consistency'] },
          severity: { type: 'string', enum: ['blocker', 'warning', 'info'] },
          location: { type: 'string', description: 'file:line or field name' },
          issue: { type: 'string' },
          suggested_fix: { type: 'string' },
        },
      },
    },
  },
};

const MSG = `${ROOT}/messages`;

function lensPrompt(doc, lens) {
  const common = `You are adversarially auditing the i18n wiring of the moysklad-clone "${doc.key}" document FORM (a "${doc.title}").
Files:
- /new form: ${doc.newPage}
- /[id] edit form: ${doc.idPage}
- RU messages: ${MSG}/ru.json   UZ messages: ${MSG}/uz.json
- moysklad reference screenshot: ${doc.ref}
Doc-specific namespace: ${doc.pagesNs} ; states namespace: ${doc.statesNs}.
Shared namespaces: fields.*, form.*, detail_form.*, detail_tabs.*, detail_titles.*, detail_header.*.
Read the actual files. Be concrete — cite file:line. Only report REAL defects; an empty findings array is a valid (good) result.
Intentionally OUT OF SCOPE (do NOT report): ✎/↺ glyph chars, currency CODE literals like "UZS"/"1 {currency} =", em-dash "—" placeholders, the SendEmailDialog defaultSubject/defaultBodyHtml (a separately-tracked deferred bug-class), and structural/layout differences vs moysklad (field order, missing/extra fields) — this pass is i18n only.`;

  if (lens === 'wrong-key') {
    return `${common}

LENS = WRONG-KEY (highest value). For every t()/tX() call in BOTH pages, mentally resolve the key to its RU and UZ value and check it MATCHES the visible UI context. Mechanical key-existence already passed — your job is to find keys that RESOLVE but to the WRONG value. Examples of the bug-class:
- a DetailHeader/title using a PLURAL list title where a SINGULAR doc title is expected
- a field labelled with the wrong entity (e.g. a validation throw saying «Выберите получателя» when the field is «Покупатель»)
- a placeholder/label whose resolved value contradicts the moysklad reference label
- status options mapped to a state key that doesn't match the document's real FSM
Report each as lens="wrong-key". Verify the RU value against the moysklad reference screenshot where one exists.`;
  }
  if (lens === 'leftover-leak') {
    return `${common}

LENS = LEFTOVER-LEAK. Grep both pages for any remaining hardcoded Russian (Cyrillic) or Uzbek (Latin with apostrophes / "tanlang"/"Yangi"/"Hujjat") string that is rendered to the user (label, placeholder, title, aria-label, option text, validation throw, helper, empty-state) and is NOT one of the out-of-scope items above. For each, report lens="leftover-leak" with the exact string and the i18n key that should replace it (reuse an existing fields./form./detail_form. key if one fits; otherwise propose a new ${doc.pagesNs}.* key).`;
  }
  return `${common}

LENS = SIBLING-CONSISTENCY. Compare the /new form against its /[id] sibling field by field. For every field present in BOTH, confirm they use the SAME i18n key (or semantically identical keys) for the label, placeholder, and picker title. Flag any divergence where /new and /[id] would render DIFFERENT text for the same concept (e.g. /new uses fields.agent but /[id] uses fields.customer). Also confirm the document-type label and status options are consistent between the two. Report each divergence as lens="sibling-consistency".`;
}

phase('Verify');

const results = await pipeline(
  DOCS,
  (doc) =>
    parallel(
      ['wrong-key', 'leftover-leak', 'sibling-consistency'].map((lens) => () =>
        agent(lensPrompt(doc, lens), {
          label: `${doc.key}:${lens}`,
          phase: 'Verify',
          schema: SCHEMA,
          agentType: 'Explore',
        }).then((r) => ({ doc: doc.key, lens, findings: r?.findings ?? [] })),
      ),
    ),
);

const flat = results.flat().filter(Boolean);
const all = flat.flatMap((r) => (r.findings || []).map((f) => ({ doc: r.doc, ...f })));
const blockers = all.filter((f) => f.severity === 'blocker');
const warnings = all.filter((f) => f.severity === 'warning');
log(`sales-group i18n verify: ${all.length} findings (${blockers.length} blocker, ${warnings.length} warning)`);

return { total: all.length, blockers, warnings, info: all.filter((f) => f.severity === 'info') };

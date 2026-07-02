// biome-ignore-all lint: workflow script (Workflow tool return-contract); durable so committed.
export const meta = {
  name: 'purchase-group-i18n',
  description: 'Wire 3 purchase /new forms to i18n (mirror supplies/new) + 3-lens adversarial verify all 4',
  phases: [
    { title: 'Wire', detail: 'parallel: purchase-orders + invoices-in + purchase-returns /new forms' },
    { title: 'Verify', detail: '3 adversarial lenses x 4 forms (incl supplies)' },
  ],
};

const ROOT = 'd:/projects/moysklad';
const APP = `${ROOT}/apps/web/src/app/(app)`;

// ---- Shared mapping (the contract every wire agent must follow) ----
const MAPPING = `
HOOKS to declare at the top of the component (after \`const { user } = useAuth();\`),
exactly like the verified reference apps/web/src/app/(app)/supplies/new/page.tsx:
  const t = useTranslations('pages.<DOC_NS>');     // DOC_NS per form below
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.<STATES_NS>');  // per form below
Add \`import { useTranslations } from 'next-intl';\` if missing.

STATUS_OPTIONS: move it INSIDE the component (it needs tStates) and align values to the
REAL FSM that the [id] twin's state dropdown surfaces (status is decorative on /new — not
sent on create). Use { value, label: tStates(value), color } shape — keep existing colors.

FIELD LABELS  (DocumentMetaField label="X"  ->  label={...}):
  "Организация"               -> tFields('organization')
  "Склад"                     -> tFields('store')
  "Контрагент"                -> tFields('supplier')          <-- CRITICAL: every purchase [id]
                                                                  twin labels the counterparty
                                                                  «Поставщик»=tFields('supplier').
                                                                  /new currently says «Контрагент» — WRONG. Mirror [id].
  "Договор"                   -> tFields('contract')
  "Проект"                    -> tFields('project')
  "Внешний код"               -> tDetailForm('external_code')
  "Валюта документа"          -> tDetailForm('currency')
  "Счёт контрагента"          -> tFields('agent_account')
  "Входящий номер"/"Входящий №" -> tFields('incoming_number')
  "Входящая дата"             -> tFields('incoming_date')
  "План. дата приемки"        -> tFields('delivery_planned')
  "Планируемая дата оплаты"   -> tFields('payment_planned')
  "Заказ поставщику"          -> tFields('linked_purchase_order')
  "Приёмка"                   -> tFields('linked_supply')
  "Причина"                   -> tFields('reason')
  "Накладные расходы"         -> tDetailForm('overhead_sum')         (only if present)
  "Распределять по"           -> tDetailForm('overhead_distribution') (only if present)

PICKER PLACEHOLDERS (placeholder="... tanlang"):
  "Tovar tanlang"             -> tForm('select_product')
  "Tashkilot tanlang"         -> tForm('select_organization')
  "Ombor tanlang"             -> tForm('select_store')
  "Ta'minlovchi tanlang"      -> tForm('select_supplier')
  "Shartnoma tanlang"         -> tForm('select_contract')
  "Loyiha tanlang"            -> tForm('select_project')
  "Bog'liq zakaz tanlang"     -> tForm('select_purchase_order')
  "Страна"                    -> tFields('country')
  bank account  \`Bank hisob (\${currency})\`  -> tForm('select_bank_account', { currency })
  agent account  \`agentId ? 'Hisob raqami tanlang' : 'Avval kontragent(ni) tanlang'\`
                              -> agentId ? tForm('select_agent_account') : tForm('select_supplier_first')
  linked-supply  \`agentId ? 'Priomkani tanlang' : 'Avval kontragent tanlang'\`
                              -> agentId ? tForm('select_supply') : tForm('select_supplier_first')
  "Qaytarish sababi"          -> t('reason_placeholder')   (pages.purchase_returns.reason_placeholder)
  incoming-number hint placeholders ("Faktura №", "Ta'minlovchi №")
                              -> REMOVE the placeholder entirely (the audited [id] twin has none)

CREATE LABELS:
  createLabel="Yangi kontragent" -> createLabel={tForm('create_new_counterparty')}
  createLabel="Yangi loyiha"     -> createLabel={tForm('create_new_project')}

CURRENCY block:
  <option> сум (UZS)/доллар (USD)/евро (EUR)/руб (RUB)
                              -> {tForm('currency_uzs')}/{tForm('currency_usd')}/{tForm('currency_eur')}/{tForm('currency_rub')}
  aria-label="Kursni o'zgartirish"    -> aria-label={tForm('rate_edit')}
  title="Avtomat kursga qaytarish"    -> title={tForm('rate_auto_reset')}

CHROME / DocumentEditor props:
  tab  label: 'Asosiy'              -> label: tDetailTabs('main')
  tab  label: "Bog'liq hujjatlar"   -> label: tDetailTabs('related')
  related-tab body text (any "Bog'liq hujjatlar yo'q...")  -> {t('related_empty')}
  DocumentDisclosurePanel title="Задачи" -> title={tForm('tasks_section')}
     button text "Задача"  -> {tForm('add_task')}
     hint "Vazifalarni hujjat saqlanganidan keyin..." -> {tForm('tasks_after_save_hint')}
  DocumentDisclosurePanel title="Файлы" -> title={tForm('files_section')}
     button text "Файл"   -> {tForm('add_file')}
     hint "Fayllarni hujjat saqlanganidan keyin..." -> {tForm('files_after_save_hint')}
  textarea placeholder="Комментарий"  -> placeholder={tFields('description')}
  documentTypeLabel="..."  -> documentTypeLabel={tDetailTitles('<TITLE_KEY>')}  (per form below)
  applicableHelp="..."     -> applicableHelp={t('applicable_help')}
  waitingHelp="..."        -> waitingHelp={t('waiting_help')}    (only if waiting present)
  rightSlot  {user.position ?? 'Asosiy'}  -> {user.position ?? tDetailHeader('role_primary')}

VALIDATION THROWS in createMut (use tForm — matches supplies/new + demands/new convention.
If the form currently uses a different namespace like tErrors(...), REPLACE those calls with
tForm(...) below and delete the now-unused hook):
  select supplier               -> throw new Error(tForm('select_supplier'))
  select organization           -> throw new Error(tForm('select_organization'))
  select store                  -> throw new Error(tForm('select_store'))
  at least one position         -> throw new Error(tForm('add_at_least_one_position'))
  position N select product     -> throw new Error(tForm('position_select_product', { n: i + 1 }))
  position N qty must be > 0     -> throw new Error(tForm('position_quantity_positive', { n: i + 1 }))

onCheckCompleteness setError:
  'Avval omborni tanlang'       -> setError(t('select_store_first'))
  "Avval pozitsiya qo'shing"    -> setError(t('add_position_first'))

CatalogPicker titles (title="..."):
  "Ta'minlovchini tanlash"      -> title={tForm('supplier_picker_title')}
  "Tashkilotni tanlash"         -> title={tForm('organization_picker_title')}
  "Omborni tanlash"             -> title={tForm('store_picker_title')}
  "Shartnoma(ni) tanlash" / "Договор tanlash" -> title={tForm('contract_picker_title')}
  "Loyihani tanlash"            -> title={tForm('project_picker_title')}
  "Bank hisobini tanlash"       -> title={tForm('bank_account_picker_title')}
  "Kontragent hisobini tanlash" -> title={tForm('agent_account_picker_title')}
  "Tovarni tanlash"             -> title={tForm('product_picker_title')}
  "Zakazni tanlash"             -> title={tForm('purchase_order_picker_title')}
  "Priomkani tanlash"           -> title={tForm('supply_picker_title')}
  "Страна"                      -> title={tFields('country')}

HARD RULES:
- Do NOT edit any JSON message catalog — every key above already exists in BOTH ru.json + uz.json.
  If you believe a key is missing, DO NOT invent one: report it in openQuestions and leave that
  string for now.
- Mirror the counterparty label to tFields('supplier') (NOT 'agent', NOT 'counterparty').
- Preserve ALL behavior, test ids, colors, and logic. ONLY swap the user-facing strings.
- Keep the existing comments; add a one-line FSM comment over STATUS_OPTIONS like supplies/new has.
`;

const FORMS = [
  {
    slug: 'purchase-orders',
    docNs: 'purchase_orders',
    statesNs: 'purchase_order',
    titleKey: 'purchase_order',
    needsWire: true,
    specifics: `pages.<DOC_NS> = pages.purchase_orders. states.<STATES_NS> = states.purchase_order.
documentTypeLabel «Заказ поставщику» -> tDetailTitles('purchase_order').
STATUS_OPTIONS: mirror purchase-orders/[id] which surfaces draft/confirmed/cancelled (3 states) —
so use [{draft},{confirmed},{cancelled}] with tStates('purchase_order'). Keep existing colors.
Fields present: Организация, Склад, Контрагент(->supplier), Договор, «План. дата приемки»(->delivery_planned),
Проект, «Валюта документа», «Счёт контрагента». NO incoming-number, NO overhead block.
Project picker has createLabel="Yangi loyiha" -> tForm('create_new_project').
Agent picker has createLabel="Yangi kontragent" -> tForm('create_new_counterparty').
Note one picker title is the typo'd «Договор tanlash» -> tForm('contract_picker_title').`,
  },
  {
    slug: 'invoices-in',
    docNs: 'invoices_in',
    statesNs: 'invoice_in',
    titleKey: 'invoice_in',
    needsWire: true,
    specifics: `pages.<DOC_NS> = pages.invoices_in. states.<STATES_NS> = states.invoice_in.
documentTypeLabel «Счёт от поставщика» -> tDetailTitles('invoice_in') (resolves to «Счёт поставщика»,
matching the audited [id] twin — this is the intended mirror, do not keep «от»).
STATUS_OPTIONS: mirror invoices-in/[id] = draft/posted/cancelled with tStates('invoice_in')
(the current /new uses a decorative draft/confirmed/cancelled — switch 'confirmed' to 'posted').
Fields present: Организация, Контрагент(->supplier), «Заказ поставщику»(->linked_purchase_order;
its picker placeholder "Bog'liq zakaz tanlang"->select_purchase_order; picker title "Zakazni tanlash"
->purchase_order_picker_title), «Входящий №»(->incoming_number; its hint placeholder "Ta'minlovchi №"
-> REMOVE), «Входящая дата»(->incoming_date), «Планируемая дата оплаты»(->payment_planned), Договор,
Проект, Склад, «Счёт контрагента», «Внешний код», «Валюта документа».`,
  },
  {
    slug: 'purchase-returns',
    docNs: 'purchase_returns',
    statesNs: 'purchase_return',
    titleKey: 'purchase_return',
    needsWire: true,
    specifics: `pages.<DOC_NS> = pages.purchase_returns. states.<STATES_NS> = states.purchase_return.
documentTypeLabel «Возврат поставщику» -> tDetailTitles('purchase_return').
STATUS_OPTIONS: mirror purchase-returns/[id] = draft/posted/cancelled with tStates('purchase_return').
RECONCILE EXISTING PARTIAL i18n: the file already declares \`const _t = useTranslations('pages.purchase_returns')\`
(rename to \`t\`, it is currently unused) and \`const tErrors = useTranslations('errors')\` used for the
createMut validation throws. REPLACE every tErrors(...) throw with the tForm(...) equivalent from the
mapping (tErrors('select_supplier')->tForm('select_supplier'); 'at_least_one_position'->'add_at_least_one_position';
'select_organization'->tForm('select_organization'); 'select_store'->tForm('select_store');
'position_select_product'/'position_quantity_positive' keep same key name but via tForm) and DELETE the
now-unused tErrors hook. Net hooks must equal the standard 8 from supplies/new.
Fields present: Организация, Склад, Контрагент(->supplier), «Приёмка»(->linked_supply; placeholder
\`agentId ? 'Priomkani tanlang' : 'Avval kontragent tanlang'\` -> \`agentId ? tForm('select_supply') : tForm('select_supplier_first')\`;
picker title "Priomkani tanlash"->supply_picker_title), Договор, Проект, «Причина»(->reason; placeholder
"Qaytarish sababi"->t('reason_placeholder')), «Счёт контрагента», «Внешний код», «Валюта документа».`,
  },
  {
    slug: 'supplies',
    docNs: 'supplies',
    statesNs: 'supply',
    titleKey: 'supply',
    needsWire: false, // already wired by main loop — verify only (the gold reference)
    specifics: 'Already wired and verified by the main loop. Treat as the gold reference for the others.',
  },
];

const WIRE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['file', 'useTranslationsCount', 'residualHardcoded', 'changesSummary', 'openQuestions'],
  properties: {
    file: { type: 'string' },
    useTranslationsCount: { type: 'number' },
    residualHardcoded: {
      type: 'array',
      description: 'Every hardcoded RU/UZ user-facing string STILL present after your edits (must be empty). Each as "line: snippet".',
      items: { type: 'string' },
    },
    changesSummary: { type: 'string' },
    openQuestions: {
      type: 'array',
      description: 'Anything you could not map to an existing key, or any ambiguity. Empty if none.',
      items: { type: 'string' },
    },
  },
};

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

function wirePrompt(f) {
  return `You are internationalizing a moysklad-clone document /new form. Work on the SINGLE file:
  ${APP}/${f.slug}/new/page.tsx

GOAL: replace every hardcoded Russian/Uzbek user-facing string with a next-intl t() call, mirroring the
already-completed, verified gold reference:
  ${APP}/supplies/new/page.tsx
Read that gold reference IN FULL first — it shows the exact end-state shape (hooks block, STATUS_OPTIONS
inside the component, every label/placeholder/title/throw/chrome wired). Also read the audited twin
  ${APP}/${f.slug}/[id]/page.tsx
to confirm the correct RU label for each field (especially the counterparty = «Поставщик» = tFields('supplier')).

Follow this mapping contract EXACTLY:
${MAPPING}

FORM-SPECIFIC NOTES for ${f.slug}/new:
${f.specifics}

PROCEDURE:
1. Read gold reference (supplies/new), this form (${f.slug}/new), and its twin (${f.slug}/[id]).
2. Apply the edits with the Edit tool. Be surgical — change ONLY user-facing strings, preserve all logic,
   colors, test ids, comments. Add the FSM comment over STATUS_OPTIONS.
3. Do NOT touch any JSON catalog. Every key in the mapping already exists in ru.json AND uz.json.
4. Self-check before returning: grep your file for any remaining Cyrillic or Uzbek-latin literal inside
   label=/placeholder=/title=/createLabel=/documentTypeLabel=/applicableHelp=/waitingHelp=/JSX text/throw/
   setError. The reference end-state has ZERO. (Allowed to remain: '—' em-dashes, currency CODES like
   'UZS'/'USD', code comments, data-test-id values, CSS var() strings.)

Return the structured result. residualHardcoded MUST be empty; if you cannot map something, leave it and
list it in openQuestions (do not invent keys).`;
}

const LENSES = [
  {
    key: 'mislabel',
    prompt: (f) => `ADVERSARIAL LENS 1 — wrong-key / mislabel vs the audited [id] twin.
Read ${APP}/${f.slug}/new/page.tsx AND ${APP}/${f.slug}/[id]/page.tsx.
For EVERY field/label/title in /new, check the t() key resolves to the SAME concept the [id] twin shows.
Hunt specifically for: (a) counterparty labelled anything other than tFields('supplier') (must be «Поставщик»);
(b) a t() key that resolves but to the WRONG value (e.g. a plural list-title used as a singular doc title,
a 'confirmed' state where [id] uses 'posted', documentTypeLabel not matching tDetailTitles('${f.titleKey}'));
(c) STATUS_OPTIONS states not matching the [id] state dropdown.
A mechanical grep cannot catch these — you must compare resolved RU values in apps/web/src/messages/ru.json.
Report each as a finding with the exact line and the corrected key. Empty findings = clean.`,
  },
  {
    key: 'leftover',
    prompt: (f) => `ADVERSARIAL LENS 2 — leftover hardcoded strings.
Read ${APP}/${f.slug}/new/page.tsx. Find EVERY hardcoded Russian or Uzbek-latin user-facing string that
survived: in label=/placeholder=/title=/createLabel=/documentTypeLabel=/applicableHelp=/waitingHelp=,
in JSX text nodes, in throw new Error(...) / setError(...), in <option> children, in aria-label/title attrs.
Ignore: '—', currency CODES (UZS/USD/EUR/RUB), code comments, data-test-id, CSS var() strings, the document
number/date placeholders that are non-textual. For each real leftover give line + snippet + the t() key it
should use (consult the gold reference ${APP}/supplies/new/page.tsx for the convention). Empty = clean.`,
  },
  {
    key: 'keyexist',
    prompt: (f) => `ADVERSARIAL LENS 3 — key existence + ru/uz parity + Uzbek quality.
Read ${APP}/${f.slug}/new/page.tsx and extract every t-call with its hook namespace. For EACH key, verify it
exists in BOTH apps/web/src/messages/ru.json AND apps/web/src/messages/uz.json (a missing key silently renders
the key path — next-intl does NOT typecheck this). Then sanity-check: RU value is a real moysklad term, UZ
value is natural Uzbek (not a copy of the RU). Flag any key present in ru but missing in uz (or vice-versa),
and any obviously wrong/placeholder translation. Report findings with the key path. Empty = clean.`,
  },
];

function verifyPrompt(f, lens) {
  return lens.prompt(f);
}

// ---------------- run ----------------
phase('Wire');
log(`Wiring 3 purchase /new forms (supplies/new is the verified reference); then 3-lens verify all 4.`);

const results = await pipeline(
  FORMS,
  async (f) => {
    if (!f.needsWire) return { skipped: true, slug: f.slug };
    const r = await agent(wirePrompt(f), {
      schema: WIRE_SCHEMA,
      phase: 'Wire',
      label: `wire:${f.slug}`,
    });
    return { ...r, slug: f.slug };
  },
  async (wire, f) => {
    const lensResults = await parallel(
      LENSES.map((L) => () =>
        agent(verifyPrompt(f, L), {
          schema: FINDINGS_SCHEMA,
          phase: 'Verify',
          label: `verify:${f.slug}:${L.key}`,
        }),
      ),
    );
    return { slug: f.slug, wire, lenses: lensResults.filter(Boolean) };
  },
);

return { results: results.filter(Boolean) };

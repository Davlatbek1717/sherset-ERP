// biome-ignore-all lint: workflow script (Workflow tool return-contract); durable so committed.
export const meta = {
  name: 'inventory-losses-enters-i18n',
  description: 'Wire losses/new + enters/new to i18n (mirror moves/new gold reference + their [id] twins)',
  phases: [{ title: 'Wire', detail: 'parallel: losses + enters /new forms' }],
};

const APP = 'd:/projects/moysklad/apps/web/src/app/(app)';

const MAPPING = `
Mirror the just-completed gold reference apps/web/src/app/(app)/moves/new/page.tsx (same DocumentEditor
framework, same chrome) and each form's audited [id] twin. Declare the standard hooks after
\`const { user } = useAuth();\` — KEEP the existing \`t = useTranslations('pages.<doc>')\`, \`tErrors\`, and
\`tReasons\` hooks (the validation throws already use tErrors and the reason <option>s already use tReasons —
DO NOT change those), and ADD whichever of these are missing:
  tFields=useTranslations('fields'), tForm=useTranslations('form'), tDetailForm=useTranslations('detail_form'),
  tDetailTabs=useTranslations('detail_tabs'), tDetailTitles=useTranslations('detail_titles'),
  tDetailHeader=useTranslations('detail_header'), tStates=useTranslations('states.<doc>').

STATUS_OPTIONS: move module-level -> INSIDE component (needs tStates); align to the [id] FSM =
draft/posted/cancelled (current decorative draft/CONFIRMED/cancelled -> switch 'confirmed' to 'posted');
shape { value, label: tStates(value), color } keeping existing colors; add a one-line FSM comment.

FIELD LABELS (mirror the [id] twin):
  "Организация"      -> tFields('organization')
  "Склад"            -> tFields('store')
  "Причина"          -> tFields('reason')        (the reason <select>; its <option>s already use tReasons)
  "Проект"           -> tFields('project')
  "Себестоимость"    -> tFields('cost')          (enters only)
  "Внешний код"      -> tDetailForm('external_code')
  "Накладные расходы"      -> tDetailForm('overhead_sum')         (enters only)
  "Распределять по"        -> tDetailForm('overhead_distribution') (enters only)

PLACEHOLDERS:
  "Tovar tanlang"     -> tForm('select_product')
  "Tashkilot tanlang" -> tForm('select_organization')
  "Ombor tanlang"     -> tForm('select_store')
  "Loyiha tanlang"    -> tForm('select_project')

OVERHEAD <option>s (enters): по весу/по цене/по объёму/по количеству ->
  tDetailForm('overhead_by_weight'/'overhead_by_price'/'overhead_by_volume'/'overhead_by_quantity')

CHROME:
  tab 'Asosiy'              -> tDetailTabs('main')
  tab "Bog'liq hujjatlar"   -> tDetailTabs('related')
  related-tab body text     -> {t('related_empty')}
  DocumentDisclosurePanel "Задачи"/"Задача"/hint -> tForm('tasks_section')/tForm('add_task')/tForm('tasks_after_save_hint')
  DocumentDisclosurePanel "Файлы"/"Файл"/hint    -> tForm('files_section')/tForm('add_file')/tForm('files_after_save_hint')
  textarea placeholder "Комментарий" -> tFields('description')
  documentTypeLabel -> tDetailTitles('<title_key>')   (losses='loss', enters='enter')
  applicableHelp="Hujjatni provedeno qiling — qoldiqlar yangilanadi" -> t('applicable_help')
  rightSlot {user.position ?? 'Asosiy'} -> {user.position ?? tDetailHeader('role_primary')}

CatalogPicker titles:
  "Tashkilotni tanlash" -> tForm('organization_picker_title')
  "Omborni tanlash"     -> tForm('store_picker_title')
  "Loyihani tanlash"    -> tForm('project_picker_title')
  "Tovarni tanlash"     -> tForm('product_picker_title')

HARD RULES:
- Do NOT edit any JSON catalog — every key above already exists in BOTH ru.json + uz.json.
- Do NOT touch the existing tErrors(...) validation throws or tReasons(...) reason options.
- Preserve all logic, test ids, colors, comments. Only swap user-facing strings. If a string maps to no
  existing key, leave it and report in openQuestions (do not invent keys).
`;

const FORMS = [
  {
    slug: 'losses',
    titleKey: 'loss',
    specifics: `pages.<doc>=pages.losses, states.<doc>=states.loss, documentTypeLabel «Списание»->tDetailTitles('loss').
Fields: Организация, Склад, Причина(reason select, options already tReasons('reasons.loss')), Проект,
Внешний код. NO cost, NO overhead block. Existing hooks: t(pages.losses), tFields?, tReasons(reasons.loss),
plus throws via tErrors. Single store (not store_from/to).`,
  },
  {
    slug: 'enters',
    titleKey: 'enter',
    specifics: `pages.<doc>=pages.enters, states.<doc>=states.enter, documentTypeLabel «Оприходование»->tDetailTitles('enter').
Fields: Организация, Склад, Причина(reason select, options already tReasons('reasons.enter')), Проект,
Себестоимость(->tFields('cost')), Внешний код, Накладные расходы(overhead block like moves). Existing hooks:
t(pages.enters), tReasons(reasons.enter), throws via tErrors. NOTE enters has a per-position cost_required
throw using t('cost_required') (pages.enters) — leave it. Single store.`,
  },
];

const WIRE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['file', 'useTranslationsCount', 'residualHardcoded', 'changesSummary', 'openQuestions'],
  properties: {
    file: { type: 'string' },
    useTranslationsCount: { type: 'number' },
    residualHardcoded: { type: 'array', items: { type: 'string' } },
    changesSummary: { type: 'string' },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
};

function wirePrompt(f) {
  return `Internationalize the SINGLE file ${APP}/${f.slug}/new/page.tsx.
Read the gold reference ${APP}/moves/new/page.tsx IN FULL first (it shows the exact end-state), then read
the audited twin ${APP}/${f.slug}/[id]/page.tsx to confirm each field's correct RU label.
Apply edits with the Edit tool following this mapping EXACTLY:
${MAPPING}
FORM-SPECIFIC NOTES for ${f.slug}/new:
${f.specifics}
Self-check before returning: grep your file for any remaining Cyrillic/Uzbek-latin literal in
label=/placeholder=/title=/documentTypeLabel=/applicableHelp=/JSX text/<option>. The end-state has ZERO
(allowed: '—', code comments, data-test-id, CSS var(), the existing tErrors/tReasons calls).
Return the structured result; residualHardcoded MUST be empty.`;
}

phase('Wire');
log('Wiring losses/new + enters/new against the moves/new gold reference (parallel).');

const results = await parallel(
  FORMS.map((f) => () =>
    agent(wirePrompt(f), { schema: WIRE_SCHEMA, phase: 'Wire', label: `wire:${f.slug}` }).then((r) => ({
      ...r,
      slug: f.slug,
    })),
  ),
);

return { results: results.filter(Boolean) };

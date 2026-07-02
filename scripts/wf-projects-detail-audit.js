export const meta = {
  name: 'projects-detail-audit',
  description:
    'Parity fact-gathering: moysklad PROJECT card (catalog detail, Проект) live --detail capture (edit-default.html + edit-dropdown-izmenit menu dump) vs our settings/projects/[id] page (mirror: settings/projects/new). A SIMPLE single-section catalog card (Наименование/Код/Описание) — NOT a document, NO positions. 3 parallel agents gather facts; the operator (Opus) judges deltas.',
  phases: [{ title: 'Gather', detail: '3 parallel agents extract moysklad-vs-ours facts per dimension' }],
}

const ROOT = 'D:/projects/moysklad'
const REF = `${ROOT}/docs/moysklad-reference/projects/detail`
const OUR_PAGE = `${ROOT}/apps/web/src/app/(app)/settings/projects/[id]/page.tsx`
const OUR_NEW = `${ROOT}/apps/web/src/app/(app)/settings/projects/new/page.tsx`
const I18N_RU = `${ROOT}/apps/web/src/messages/ru.json`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dimension', 'rows', 'summary', 'referenceFilesRead'],
  properties: {
    dimension: { type: 'string' },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['item', 'moysklad', 'ours', 'status', 'severity', 'note'],
        properties: {
          item: { type: 'string', description: 'The element being compared (label/button/field/section/tab)' },
          moysklad: { type: 'string', description: 'Exact moysklad value/label (RU), or "—" if absent' },
          ours: { type: 'string', description: 'Our RESOLVED value/label (RU from ru.json, or the hardcoded literal), or "—" if absent' },
          status: { type: 'string', enum: ['match', 'delta', 'missing_in_ours', 'extra_in_ours', 'uncertain'] },
          severity: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
          note: { type: 'string', description: 'Evidence: ref file/region + our file:line. If hardcoded (non-t()) say so. If uncertain, why.' },
        },
      },
    },
    summary: { type: 'string', description: '2-4 sentence parity overview for this dimension' },
    referenceFilesRead: { type: 'array', items: { type: 'string' } },
  },
}

const COMMON = `
You are gathering PARITY FACTS for the detail-page audit of a 1:1 moysklad.uz clone.
The entity is a PROJECT card (Проект) — a SIMPLE CATALOG detail page (Настройки → Справочники → Проекты).
It is NOT a document: NO positions table, NO allocation, NO right CRM widget. It is a single-column
form with ONE section and a few fields. Compare STRUCTURE and LABELS only — IGNORE the specific data
instance (the project's actual name/code). Reference locale = Russian; resolve OUR labels by reading the
i18n key in ${I18N_RU} (most live under pages.projects.*, plus common.*, form.*).

REFERENCE GROUND TRUTH (live --detail capture 2026-06-01, authoritative):
  - ${REF}/edit-default.html        — the FULL project card DOM (UTF-8, ~76KB). grep it for exact RU labels.
  - ${REF}/edit-default.png         — full-page screenshot of the card (READ THE IMAGE for layout/field order).
  - ${REF}/edit-dropdown-izmenit.png + detail-metadata.json — the «Изменить» dropdown was captured and dumped:
    its items = { «Удалить» (enabled), «Копировать» (enabled) }. NO «Массовое редактирование», NO archive item
    inside «Изменить».
  - VERIFIED facts from the DOM (already grepped by the operator — confirm against the files):
      • The editable form fields are EXACTLY THREE: «Наименование» (required), «Код», «Описание». There is
        NO «Внешний код» (external code) field — a grep for "Внешн" in edit-default.html returns NOTHING.
      • Toolbar/actions present in the DOM: «Сохранить», «Закрыть», «Изменить» ▾, «Поместить в архив»,
        and the row-tabs/buttons «Изменения», «Задачи», «Показатели». An archived project shows the banner
        «Проект находится в архиве».
  - detail-metadata.json also records that «Создать документ» / «Печать» / «Отправить» dropdowns and the
    Главная/Связанные/Файлы/Задачи/События TABS were NOT found — correct: a simple catalog card has none of
    those document toolbars. Do NOT report their absence in OUR page as a delta.

OUR CODE: ${OUR_PAGE} (the detail/[id] inline-edit page) — it MIRRORS ${OUR_NEW} (the create page; fix both
together). It uses <EditForm/> (title/breadcrumbs/onSubmit/cancelHref) + a status <Badge/> +
Archive/Restore <Button/> + Delete <Button/> + ONE <FormSection title={tForm('section_main')}> containing
FormFields: name (col_name), code (col_code), externalCode (external_code), description (col_description).

RULES:
- Read the moysklad reference (DOM + screenshot + metadata) AND our code region.
- Resolve EVERY t()/tCommon/tForm i18n key to its RU string via ${I18N_RU}. Put the resolved RU string in
  "ours". If our code uses a HARDCODED literal (Uzbek or RU, NOT a t() call), put that literal in "ours" and
  flag it as an i18n-leak delta (high value).
- status: match = same label+presence; delta = present in both but label/order/required differs;
  missing_in_ours = moysklad has it, we don't; extra_in_ours = we have it, moysklad doesn't; uncertain.
- Be precise about Unicode/byte-level (e.g. «Наименование» not «Название», «Поместить в архив» not «В архив»).
- DO NOT invent deltas. If the reference doesn't show something, mark uncertain — don't guess.
- Your final message IS the structured result (the schema). No prose outside it.
`

const DIMENSIONS = [
  {
    key: 'fields',
    prompt: `${COMMON}
DIMENSION: FORM FIELDS + SECTION + the page title/breadcrumb. This is the highest-value dimension.
MOYSKLAD form fields (in order, from edit-default.html + the screenshot): «Наименование» (required, the
  big title-like input) · «Код» · «Описание». There is NO «Внешний код». moysklad does NOT wrap them in a
  visible "Основной"-titled section header on the project card (verify whether a section title is shown).
OUR CODE: ${OUR_PAGE} FormSection (~lines 151-178) + EditForm title/breadcrumbs (~lines 94-97). Resolve via
  ${I18N_RU}: pages.projects.col_name, .col_code, .external_code, .col_description, .edit_title, .title, and
  form.section_main, common.active/archived/archive/restore/delete.
COMPARE each as a row:
  (1) «Наименование» field — moysklad vs our col_name. Match label? Both required?
  (2) «Код» field — moysklad vs our col_code.
  (3) «Описание» field — moysklad vs our col_description. (NB moysklad uses «Описание» here, NOT «Комментарий».)
  (4) «Внешний код» (externalCode) — moysklad = ABSENT; ours = present (external_code «Внешний код», ${OUR_PAGE}
      ~line 163, AND ${OUR_NEW} ~line 67) → this is the KEY delta: extra_in_ours, severity high. Confirm moysklad
      truly lacks it (grep "Внешн" in edit-default.html = empty).
  (5) Section header: ours renders <FormSection title={tForm('section_main')}> → resolve that RU string; does
      moysklad show an equivalent section title above the 3 fields, or none? (delta/uncertain).
  (6) Page title: ours EditForm title = pages.projects.edit_title «Редактировать проект»; moysklad card title —
      is it «Редактировать проект» or just the project name as an editable title? Judge.`,
  },
  {
    key: 'actions',
    prompt: `${COMMON}
DIMENSION: TOOLBAR + «Изменить» menu + archive/delete/copy + the «Изменения»/«Задачи»/«Показатели» row.
MOYSKLAD (from edit-default.html + edit-dropdown-izmenit dump): primary buttons «Сохранить» + «Закрыть»;
  «Изменить» ▾ = { «Удалить» (enabled), «Копировать» (enabled) }; a separate «Поместить в архив» action;
  and a row of «Изменения» (change-history) / «Задачи» (tasks) / «Показатели» (metrics).
OUR CODE: ${OUR_PAGE} — the EditForm provides Save (onSubmit, label from EditForm internals) + Cancel
  (cancelHref → resolve its label) ; a header row (~lines 107-149) with a status Badge + Archive/Restore Button
  (resolve common.archive/common.restore) + Delete Button (common.delete, with a confirm via runDestructive →
  resolve common.delete_confirm). There is NO «Изменить» dropdown and NO «Копировать».
COMPARE each as a row:
  (1) «Сохранить» — moysklad vs our EditForm save button label (read @moysklad/ui EditForm if needed).
  (2) «Закрыть» — moysklad vs our cancel control. Ours uses cancelHref → what label? «Отмена» or «Закрыть»? DELTA?
  (3) «Изменить» ▾ structure — moysklad groups {Удалить, Копировать} in an «Изменить» dropdown; ours exposes
      Delete as a standalone button and has NO «Изменить» dropdown → structural delta (judge).
  (4) «Удалить» — moysklad (in «Изменить») vs our Delete Button (common.delete). Label match? Placement delta.
  (5) «Копировать» — moysklad (in «Изменить», enabled) vs OURS = ABSENT → missing_in_ours. NOTE: our backend has
      NO clone endpoint (see projects controller) and the projects LIST dropdown renders «Копировать» as a
      DISABLED placeholder (counterparty clone-404 lesson). Flag as missing_in_ours, medium, note the backend gap.
  (6) «Поместить в архив» — moysklad label vs our Archive Button label (resolve common.archive). Our common.archive
      = «В архив» (ru.json) → DELTA «В архив» vs «Поместить в архив» (this is shared backlog #9 — flag, severity
      medium, note it's the shared common.archive key affecting many pages).
  (7) Archived state: moysklad shows banner «Проект находится в архиве» + a restore action. Ours shows a
      Badge(archived) + Restore Button (common.restore) → compare (banner text missing_in_ours? judge low).
  (8) «Изменения» / «Задачи» / «Показатели» row — moysklad has them; ours has none → missing_in_ours each
      (severity low/medium — these are CRM/history widgets, likely DEFER; one row each).`,
  },
  {
    key: 'i18n-sweep',
    prompt: `${COMMON}
DIMENSION: HARDCODED-STRING SWEEP of BOTH ${OUR_PAGE} AND ${OUR_NEW}. moysklad is fully Russian; any hardcoded
  Uzbek (or hardcoded RU literal not via a t() call) is an i18n-leak delta.
METHOD: read both files top-to-bottom. For EACH user-visible string, decide if it is a t()-resolved key (good)
  or a hardcoded literal (delta). For hardcoded literals output a row: item = what it is, moysklad = the RU
  concept it should match, ours = the exact hardcoded literal, status=delta, severity (high if visible label,
  low if aria/placeholder), note = file:line + suggested i18n key.
ALSO verify these specific spots resolve via i18n (report status=match if they do, delta if hardcoded):
  • EditForm title/breadcrumbs, FormSection title, each FormField label, the placeholder on the name input
    (${OUR_NEW} may use name_placeholder), the error/name_required message, the Badge text, the button labels,
    the delete confirm text.
  • Any aria-label, title attribute, or empty-state string.
Both pages were built in Sessiya 7 with i18n; this dimension mostly CONFIRMS cleanliness, but report any leak.
If a page is fully i18n'd, return a single summary row with status=match noting "no hardcoded user-visible
strings found" plus the file:line evidence you checked.`,
  },
]

phase('Gather')
log(`Gathering parity facts across ${DIMENSIONS.length} dimensions for settings/projects/[id] (catalog card)…`)

const results = await parallel(
  DIMENSIONS.map((d) => () =>
    agent(d.prompt, { label: `gather:${d.key}`, phase: 'Gather', schema: SCHEMA }).then((r) => ({
      key: d.key,
      ...r,
    })),
  ),
)

const ok = results.filter(Boolean)
log(`Gathered ${ok.length}/${DIMENSIONS.length} dimensions.`)
return { dimensions: ok }

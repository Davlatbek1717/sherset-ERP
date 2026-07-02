export const meta = {
  name: 'customer-order-detail-audit',
  description:
    'Parity fact-gathering: moysklad customer-order detail reference (screenshots+DOM+meta) vs our customer-orders/[id] page, across 6 dimensions. Agents gather facts; the operator (Opus) judges deltas.',
  phases: [{ title: 'Gather', detail: '6 parallel agents extract moysklad-vs-ours facts per dimension' }],
}

// ---- Reference + our paths (absolute — Read requires absolute paths) ----
const ROOT = 'D:/projects/moysklad'
const REF = `${ROOT}/docs/moysklad-reference/visual-captures/03-module/customerorder`
const OUR_PAGE = `${ROOT}/apps/web/src/app/(app)/customer-orders/[id]/page.tsx`
const I18N_RU = `${ROOT}/apps/web/src/messages/ru.json`
const COMPONENTS = `${ROOT}/apps/web/src/components`

// Structured comparison output — one filled table per dimension.
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
          item: { type: 'string', description: 'The element being compared (label/button/field/tab/column)' },
          moysklad: { type: 'string', description: 'Exact moysklad value/label (RU), or "—" if absent' },
          ours: { type: 'string', description: 'Our resolved value/label (RU from ru.json), or "—" if absent' },
          status: {
            type: 'string',
            enum: ['match', 'delta', 'missing_in_ours', 'extra_in_ours', 'uncertain'],
          },
          severity: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
          note: { type: 'string', description: 'Evidence: which ref file/region + our file:line. If uncertain, say why.' },
        },
      },
    },
    summary: { type: 'string', description: '2-4 sentence overview of parity for this dimension' },
    referenceFilesRead: { type: 'array', items: { type: 'string' } },
  },
}

const COMMON = `
You are gathering PARITY FACTS for the FIRST detail-page audit of this 1:1 moysklad.uz clone.
Compare STRUCTURE and LABELS only — IGNORE the specific data instance (order № 04796, product
names, "Текширилмаган" Uzbek status, sums). Reference locale = Russian; resolve OUR labels by
reading the i18n key inside ${I18N_RU} (e.g. tFields('organization') → fields.organization).

RULES:
- Read the moysklad reference screenshot(s) AND grep the matching .dom.html for exact label text.
- Read our code region in ${OUR_PAGE} and the relevant component(s) under ${COMPONENTS}.
- Resolve EVERY tCommon/tFields/tDetailForm/tDetailHeader/tDetailTitles/tStates/tCreate i18n key to its
  RU string via ${I18N_RU}. Put the resolved RU string in the "ours" column (not the key).
- status: match = same label+presence; delta = present in both but label/order/required differs;
  missing_in_ours = moysklad has it, we don't; extra_in_ours = we have it, moysklad doesn't;
  uncertain = can't tell from the reference (say why in note).
- Be precise about Unicode: «…» (U+2026) vs «...», «№», nbsp, trailing «:» — byte-level matters.
- DO NOT invent deltas. When the reference doesn't show something, mark uncertain, don't guess.
- Your final message IS the structured result (the schema). No prose outside it.
`

const DIMENSIONS = [
  {
    key: 'toolbar',
    prompt: `${COMMON}
DIMENSION: Detail-page TOOLBAR (top action bar) + author block + «Проведено» toggle.
MOYSKLAD REFS to read:
  - ${REF}/screenshots/d-default.png   (top bar: Сохранить · Закрыть · «1 из N» prev/next · Изменить ▾ · Создать документ ▾ · Печать ▾ · Отправить ▾ · author "Сардор Х. / Основной / Изменено: …" · Проведено ☑)
  - ${REF}/screenshots/i-dropdown-izmenit.png  + ${REF}/screenshots/i-dropdown-izmenit.dom.html (grep items)
  - ${REF}/screenshots/i-dropdown-pechat.png   + ${REF}/screenshots/i-dropdown-pechat.dom.html
  - ${REF}/screenshots/i-dropdown-sozdat.png   + ${REF}/screenshots/i-dropdown-sozdat.dom.html
  - ${REF}/screenshots/i-dropdown-status.png   + ${REF}/screenshots/i-dropdown-status.dom.html
OUR CODE: ${OUR_PAGE} lines ~566-687 (createMenuItems + <DetailToolbar/> props) and the
  DetailToolbar + DetailHeader author block components under ${COMPONENTS}/document-detail/.
COMPARE: every toolbar button label, the prev/next pager, Изменить-dropdown items, Создать-документ
  items (Отгрузка/Счёт/Входящий платёж…), Печать items, Отправить items, the author block layout
  (avatar + name + role «Основной» + «Изменено: <name> <date>»), and the «Проведено» checkbox.`,
  },
  {
    key: 'header',
    prompt: `${COMMON}
DIMENSION: Detail HEADER (below toolbar): document title, status pill + inline status dropdown,
  payment/shipment status chips.
MOYSKLAD REFS:
  - ${REF}/screenshots/d-default.png  (title "Заказ покупателя № 04796 от 04.06.2025 09:39"; chips
    [Не оплачен] [Запросить оплату] [<status> ▾ in red]; «Проведено» on the right)
  - ${REF}/screenshots/i-dropdown-status.png + ${REF}/screenshots/i-dropdown-status.dom.html (status list + colors)
  - grep ${REF}/screenshots/d-default.dom.html and ${REF}/dom/81-detail-default.html for: "Не оплачен",
    "Запросить оплату", "Не отгружен", "оплач", "отгру".
OUR CODE: ${OUR_PAGE} lines ~233-267 (STATE_TONE/STATE_COLOR/ORDER_STATES) and ~534-687
  (pillsSlot, <DetailHeader/>). Resolve tDetailTitles('customer_order'), tDetailHeader('not_paid'),
  ('request_payment'), ('not_shipped'), ('role_primary'), ('changed'), and tStates.customer_order.* via ${I18N_RU}.
COMPARE: title prefix + "№ … от …" format, the 8 status labels + their colors, payment chip
  «Не оплачен», the «Запросить оплату» button, shipment chip «Не отгружен», and presence/order of chips.`,
  },
  {
    key: 'meta-fields',
    prompt: `${COMMON}
DIMENSION: Document META fields panel (the form above the tabs) — labels, order, required (*), +/pencil affordances.
MOYSKLAD REFS:
  - ${REF}/screenshots/d-default.png  (fields: Организация* · Контрагент* with "Баланс: 0.00 сум" sub-line ·
    Склад* · Договор · План. дата отгрузки · Канал продаж · Проект · Валюта документа* [сум (UZS)] ·
    Адрес доставки [textarea] · Комментарий [textarea]; note +/pencil icons next to some)
  - grep ${REF}/dom/68-edit-default.html and ${REF}/screenshots/d-default.dom.html for labels:
    "Организация","Контрагент","Склад","Договор","дата отгрузки","Канал продаж","Проект","Валюта",
    "Адрес доставки","Комментарий","Баланс","Внешний код".
OUR CODE: ${OUR_PAGE} lines ~704-885 (<DocumentMetaPanel> rows). Resolve tFields.* and tDetailForm.*
  (organization, store, agent, contract, delivery_planned, project, sales_channel, currency,
  organization_account, agent_account, description, delivery_address) via ${I18N_RU}.
COMPARE: each field label (RU), required-star, field ORDER + row pairing, the Контрагент balance
  sub-line (do we show it?), currency options, and whether we have extra fields moysklad lacks
  (organization_account / agent_account) or miss fields moysklad shows.`,
  },
  {
    key: 'tabs',
    prompt: `${COMMON}
DIMENSION: TAB STRUCTURE of the detail page. POTENTIAL STRUCTURAL DELTA — investigate carefully.
MOYSKLAD REFS:
  - ${REF}/screenshots/d-default.png  (detail view shows tabs: «Главная | Связанные документы» — only 2)
  - ${REF}/screenshots/d-tab-svyazannye-dokumenty.png + ${REF}/screenshots/d-tab-svyazannye-dokumenty.dom.html
  - grep ${REF}/dom/81-detail-default.html for tab labels: "Главная","Связанные","Файлы","Задачи","События".
  - For the EDIT form (separate from detail view) the tabs were captured as positions/linked/files/tasks/events
    (seq 73-77 in ${REF}/manifest.json) — note this difference if relevant.
OUR CODE: ${OUR_PAGE} lines ~887-1013 (<DetailContentTabs> with relatedSlot/filesSlot/auditEntity +
  inline DocumentTasksSection). Read ${COMPONENTS}/document-detail/ for DetailContentTabs to list our tab labels.
COMPARE: How many top-level tabs does moysklad's DETAIL view show and what are their labels/order?
  («Главная | Связанные документы»?) vs ours («Позиции | Связанные | Файлы | История»?). Are Файлы/Задачи
  inline collapsibles under «Главная» in moysklad rather than separate tabs? Is «История»/«События» a tab
  for us but not in moysklad's detail view (or vice-versa)? Report each tab as a row.`,
  },
  {
    key: 'positions-totals',
    prompt: `${COMMON}
DIMENSION: POSITION table columns + position action buttons + TOTALS sidebar + «Внешний код».
MOYSKLAD REFS:
  - ${REF}/screenshots/d-default.png  (position row + buttons "Добавить из справочника","Проверить
    комплектацию"; totals "Промежуточный итог: 64 000,00 / ☑ НДС: 0,00 / ☑ Цена включает НДС /
    Итого: 64 000,00 / Кол-во: 2")
  - ${REF}/manifest.json seq 73 meta.panelText (full position-table text): grep it or read
    ${REF}/meta/73-edit-tab-positions.json — it lists columns: Удалить·Наименование·Кол-во·Кол-во б. ед.·
    Принято·Доступно·Остаток·Резерв·Ожидание·Вес·Объем·Цена·НДС·Сумма НДС·Скидка·Сумма, plus buttons
    "Добавить из справочника","Проверить комплектацию","Импорт","Привязать документ", and totals
    "Промежуточный итог / НДС / Цена включает НДС / Итого / Прибыль / Вес / Объем / Кол-во / Внешний код".
OUR CODE: ${OUR_PAGE} lines ~926-996 (<PositionEditor/>, the two action buttons, external_code field,
  <DetailTotalsSidebar/>). Read ${COMPONENTS} (PositionEditor is from @moysklad/ui — Glob for
  position-editor) for our column set, and DetailTotalsSidebar for our totals labels.
COMPARE: position-table columns (moysklad has many: Принято/Доступно/Остаток/Резерв/Ожидание/Вес/Объем/
  Сумма НДС — which do we show?), the action buttons row (we have «Добавить из справочника» + «Проверить
  комплектацию»; moysklad also has «Импорт» and «Привязать документ» — do we?), the totals labels
  (Промежуточный итог/НДС/Цена включает НДС/Итого/Прибыль/Кол-во/Вес/Объем), and «Внешний код» placement.`,
  },
  {
    key: 'bottom-sections',
    prompt: `${COMMON}
DIMENSION: BOTTOM inline sections — «Задачи» collapsible, «Файлы» collapsible, custom attributes.
MOYSKLAD REFS:
  - ${REF}/screenshots/d-default.png  (bottom: "▼ Задачи [+ Задача] — Нет задач"; "▼ Файлы [+ Файл]"
    with a files table: Наименование · Размер, МБ · Дата добавления · Сотрудник)
  - grep ${REF}/dom/76-edit-tab-tasks.html and ${REF}/dom/75-edit-tab-files.html for: "Задача","Файл",
    "Размер","Дата добавления","Сотрудник","Нет задач".
OUR CODE: ${OUR_PAGE} lines ~998-1013 (<DocumentTasksSection/> + <AttributesEditor/>) and the
  filesSlot <AttachmentsSection/> at ~896. Read those components under ${COMPONENTS}.
COMPARE: the «Задачи» collapsible (header + «+ Задача» button + empty text «Нет задач»), the «Файлы»
  section (in moysklad detail it's an inline collapsible with columns Наименование/Размер, МБ/Дата
  добавления/Сотрудник — but WE put Файлы in a tab; note that structural difference), and whether
  moysklad shows a custom-attributes block here.`,
  },
]

phase('Gather')
log(`Gathering parity facts across ${DIMENSIONS.length} dimensions for customer-orders/[id]…`)

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

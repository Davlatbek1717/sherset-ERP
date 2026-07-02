export const meta = {
  name: 'moves-detail-audit',
  description:
    'Parity fact-gathering: moysklad move (Перемещение) edit/detail reference (clean --detail capture: DOM+PNG+metadata) vs our moves/[id] page, across 6 dimensions. Agents gather facts; the operator (Opus) judges deltas.',
  phases: [{ title: 'Gather', detail: '6 parallel agents extract moysklad-vs-ours facts per dimension' }],
}

// ---- Reference (new --detail capture layout) + our paths (absolute — Read requires absolute paths) ----
const ROOT = 'D:/projects/moysklad'
const REF = `${ROOT}/docs/moysklad-reference/moves/detail`
const OUR_PAGE = `${ROOT}/apps/web/src/app/(app)/moves/[id]/page.tsx`
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
You are gathering PARITY FACTS for the detail-page audit of a 1:1 moysklad.uz clone.
The document is a MOVE / Перемещение (internal warehouse transfer between two stores).
Compare STRUCTURE and LABELS only — IGNORE the specific data instance (move number, product
names, specific store names, sums). Reference locale = Russian; resolve OUR labels by reading the
i18n key inside ${I18N_RU} (e.g. tFields('organization') → fields.organization).

REFERENCE LAYOUT (new clean --detail capture in ${REF}):
- edit-default.html / edit-default.png — the move edit form (UTF-8 clean DOM + screenshot)
- edit-tab-main.html / .png, edit-tab-linked.html / .png — the two tabs
- detail-metadata.json — dropdown menu dumps (UTF-8 clean): edit-dropdown-izmenit / -pechat / -otpravit
- GROUND TRUTH already decoded from the capture (use these as authoritative; the dropdowns are clean):
  • Toolbar buttons present: Сохранить · Закрыть · Изменить ▾ · Печать ▾ · Отправить ▾ · ☑ Проведено
    — there is NO «Создать документ» button for a move (verified: 0 occurrences of «Создать» in the DOM).
  • «Изменить» ▾ = { Удалить, Копировать }  (2 items)
  • «Печать» ▾ = { ТОРГ-13, Ценник (70x49,5мм), Термоэтикетка (58х40мм), Комплект..., Настроить... }  (5 items)
  • «Отправить» ▾ = { ТОРГ-13, Комплект... }  (2 items)
  • Tabs in the detail/edit view = «Главная» + «Связанные документы» only (Файлы/Задачи are inline
    sections, NOT tabs; История/События do NOT exist as tabs — verified: those tab labels not found).

RULES:
- Read the moysklad reference screenshot(s) AND grep the matching .html for exact label text.
- Read our code region in ${OUR_PAGE} and the relevant component(s) under ${COMPONENTS}.
- Resolve EVERY tCommon/tFields/tDetailForm/tDetailHeader/tDetailTitles/tDetailTabs/tStates i18n key to its
  RU string via ${I18N_RU}. Put the resolved RU string in the "ours" column (not the key).
- status: match = same label+presence; delta = present in both but label/order/required differs;
  missing_in_ours = moysklad has it, we don't; extra_in_ours = we have it, moysklad doesn't;
  uncertain = can't tell from the reference (say why in note).
- DISTINGUISH visible vs DOM-only: moysklad GWT renders hidden/optional columns in the DOM even when
  not shown. When judging position columns, CHECK THE PNG to see what is actually visible, and say so.
- Be precise about Unicode: «…» (U+2026) vs «...», «№», nbsp, trailing «:» — byte-level matters.
- DO NOT invent deltas. When the reference doesn't show something, mark uncertain, don't guess.
- Your final message IS the structured result (the schema). No prose outside it.
`

const DIMENSIONS = [
  {
    key: 'toolbar',
    prompt: `${COMMON}
DIMENSION: Detail/edit-page TOOLBAR (top action bar) + author block + «Проведено» toggle.
MOYSKLAD REFS to read:
  - ${REF}/edit-default.png  (top bar)
  - ${REF}/edit-dropdown-izmenit.png   (Изменить items)
  - ${REF}/edit-dropdown-pechat.png    (Печать items)
  - ${REF}/edit-dropdown-otpravit.png  (Отправить items)
  - ${REF}/detail-metadata.json  (exact dropdown item labels + disabled flags)
  - grep ${REF}/edit-default.html for: "Сохранить","Закрыть","Изменить","Печать","Отправить","Проведено".
OUR CODE: ${OUR_PAGE} — the <DetailToolbar/> (lines ~301-322) and <DetailHeader/> authorSlot
  (lines ~338-365). Read ${COMPONENTS}/document-detail/detail-toolbar.tsx for what the toolbar renders
  (onSave/onClose/pager/onClone/onDelete/print menu/createMenuItems). Note our page passes NO
  createMenuItems and onPrintConfigure only.
COMPARE: every toolbar button label, the prev/next pager («N из M»), «Изменить» dropdown items
  (Удалить/Копировать — do we offer these? note «Открыть в API» if we add it), «Печать» items
  (5 named forms vs our print behaviour), «Отправить» items, the «Проведено» checkbox, the author
  block (avatar + owner name + «Основной» role + «Изменено: <name> <date>»). CRITICAL: confirm there
  is NO «Создать документ» button in moysklad for a move, and confirm our page correctly omits it
  (parity ✓) — flag as extra_in_ours ONLY if our page actually renders one.`,
  },
  {
    key: 'header',
    prompt: `${COMMON}
DIMENSION: Detail HEADER (below toolbar): document title, status pill + inline status dropdown,
  any chips. A move is an internal transfer — it likely has NO payment/shipment chips.
MOYSKLAD REFS:
  - ${REF}/edit-default.png  (title "Перемещение № … от …"; a colored status pill; «Проведено» on the right)
  - grep ${REF}/edit-default.html and ${REF}/edit-tab-main.html for: "Перемещение","Проведено", any
    "Не оплачен"/"оплач"/"отгру"/"провед" chip text (expect NONE of the payment/shipment chips).
OUR CODE: ${OUR_PAGE} lines ~75-79 (STATE_TONE) and ~323-366 (<DetailHeader/>). Resolve
  tDetailTitles('move'), tStates.move.{draft,posted,cancelled}, tDetailHeader('role_primary'),
  ('changed') via ${I18N_RU}.
COMPARE: title prefix «Перемещение» + "№ … от …" format; the status states + labels (we have
  draft/posted/cancelled — does moysklad show the same set for a move?); the «Проведено» toggle;
  confirm ABSENCE of payment/shipment chips on both sides (a move shouldn't have them). Flag any
  chip we render that moysklad doesn't (extra_in_ours) or vice-versa.`,
  },
  {
    key: 'meta-fields',
    prompt: `${COMMON}
DIMENSION: Document META fields panel (the form above the tabs) — labels, order, required (*).
MOYSKLAD REFS:
  - ${REF}/edit-default.png  (the form fields)
  - grep ${REF}/edit-default.html for labels: "Организация","Со склада","На склад","Склад","Проект",
    "Комментарий","Внешний код","Накладные расходы","Распределять","Валюта документа","Дата".
    KNOWN from DOM: present = Организация, Со склада, На склад, Проект, Комментарий, Внешний код,
    Накладные расходы, «Валюта документа». ("Распределять по" not found as a standalone label —
    check the screenshot whether the overhead-distribution control is labelled.)
OUR CODE: ${OUR_PAGE} lines ~385-525 (<DocumentMetaPanel> rows). Resolve tFields.* / tDetailForm.* /
  tCommon.* for: organization, posted_at, source_store, destination_store, project, description (Комментарий),
  external_code, plus the literal "Накладные расходы" / "Распределять по" strings (currently hardcoded
  RU in the page — flag if hardcoded).
COMPARE: each field label (RU), required-star, field ORDER + row pairing. Specifically:
  (1) «Со склада» / «На склад» — does our source_store/destination_store resolve to these exact RU labels?
  (2) «Дата проведения» (posted_at) — we show it disabled; does moysklad show it on the edit form?
  (3) «Валюта документа» — moysklad shows it; we have no currency field → likely missing_in_ours (judge severity:
      a move is cost-bearing via overhead, but our app is UZS-only).
  (4) «Накладные расходы» + distribution selector — present in both? Is our label hardcoded vs i18n?
  (5) Any field moysklad shows that we miss, or extra fields we render.`,
  },
  {
    key: 'tabs',
    prompt: `${COMMON}
DIMENSION: TAB STRUCTURE of the detail page. KNOWN STRUCTURAL DELTA — investigate precisely.
MOYSKLAD REFS:
  - ${REF}/edit-tab-main.png + ${REF}/edit-tab-main.html  (the «Главная» tab)
  - ${REF}/edit-tab-linked.png + ${REF}/edit-tab-linked.html  (the «Связанные документы» tab)
  - grep both .html for tab labels: "Главная","Связанные","Файлы","Задачи","События","История".
  - GROUND TRUTH: moysklad's move detail/edit view shows ONLY 2 tabs: «Главная» + «Связанные документы».
    Файлы + Задачи are inline sections under «Главная» (NOT tabs). There is NO «История»/«События» tab.
OUR CODE: ${OUR_PAGE} lines ~527-548 (<DetailContentTabs auditEntity="Move" relatedGroups={[]} filesSlot=…>).
  Read ${COMPONENTS}/document-detail/detail-content-tabs.tsx — note positionsLabel DEFAULTS to
  tDetailTabs('positions') = «Позиции» when NOT passed, and our moves page does NOT pass positionsLabel.
  Also our page renders a «Файлы» tab (filesSlot) and an audit/history tab (auditEntity="Move").
COMPARE each tab as a row:
  (1) Tab-1: moysklad «Главная» vs ours «Позиции» (default, positionsLabel not passed) → DELTA (high) —
      this is the systemic S1 fix (set positionsLabel={tDetailTabs('main')}).
  (2) «Связанные документы» — present in both?
  (3) «Файлы» — moysklad = inline section under Главная; ours = a separate TAB → delta (structural, shared).
  (4) «История»/«События»/audit tab — ours has one (auditEntity), moysklad detail view does NOT → extra_in_ours.`,
  },
  {
    key: 'positions-totals',
    prompt: `${COMMON}
DIMENSION: POSITION table columns + position action buttons + TOTALS. POTENTIAL DELTA — be precise
  about visible-vs-DOM-only columns (check the PNG).
MOYSKLAD REFS:
  - ${REF}/edit-default.png AND ${REF}/edit-tab-main.png  (the position table — judge what columns are VISIBLE)
  - grep ${REF}/edit-tab-main.html / ${REF}/edit-default.html for column labels: "Наименование","Код",
    "Кол-во","Цена","Себестоимость","Сумма","Скидка","НДС","Остаток","Доступно","Резерв","Вес","Объем".
    KNOWN present in DOM: Наименование, Кол-во, Цена, Себестоимость, Сумма, Вес, Объем (some may be
    optional/hidden columns — CONFIRM against the PNG which are actually shown).
  - Position action buttons in DOM: "Добавить из справочника","Проверить","Импорт","Привязать".
  - Totals in DOM: "Промежуточный итог","Итого","Прибыль","Цена включает НДС","Кол-во:","Вес:","Объем:".
OUR CODE: ${OUR_PAGE} lines ~534-547 (<PositionEditor mode="qty-only" labels={positionLabels}…>). Our
  moves page uses mode="qty-only" → only product + quantity columns, NO price/cost/sum/weight/volume,
  and NO totals sidebar. Read the PositionEditor (Glob ${COMPONENTS} or @moysklad/ui for position-editor)
  to confirm what qty-only renders.
COMPARE: (1) which position columns moysklad ACTUALLY shows (visible in PNG) vs our qty-only set →
  judge each column; cost/price columns are likely backend-deferred (we don't carry move cost in the UI).
  (2) the position action-button row (Добавить из справочника / Проверить / Импорт / Привязать) vs ours.
  (3) the totals block (Промежуточный итог / Итого / Кол-во / Вес / Объем — note «Прибыль» for an internal
  move is suspicious, likely a hidden/zero artifact; say so) vs ours (none). Mark backend-dependent
  columns/totals as delta+DEFER candidates, not as quick fixes.`,
  },
  {
    key: 'bottom-sections',
    prompt: `${COMMON}
DIMENSION: BOTTOM/inline sections — «Задачи» collapsible, «Файлы» collapsible, custom attributes.
MOYSKLAD REFS:
  - ${REF}/edit-tab-main.png + ${REF}/edit-tab-main.html  (bottom of the Главная tab)
  - grep ${REF}/edit-default.html / ${REF}/edit-tab-main.html for: "Задача","Задачи","Файл","Файлы",
    "Размер","Дата добавления","Сотрудник","Нет задач","Показатели".
  - GROUND TRUTH: in moysklad a move's «Задачи» + «Файлы» are inline collapsible sections under «Главная».
OUR CODE: ${OUR_PAGE} — note our page renders <AttributesEditor entity="Move" …> (lines ~550-558) but
  does NOT render a <DocumentTasksSection/> (verify by grepping the file for DocumentTasksSection — it is
  ABSENT). Files are inside a tab (filesSlot), not inline. Read ${COMPONENTS}/document-tasks-section.tsx
  and ${COMPONENTS}/attributes-editor.tsx.
COMPARE: (1) «Задачи» inline section — moysklad HAS it (header + «+ Задача» + «Нет задач» empty text);
  ours is ABSENT → missing_in_ours (high) — this is the systemic S2 fix (add inline
  <DocumentTasksSection entity="Move" entityId={data.id}/>; Move IS in the server TASK_ENTITY_WHITELIST).
  (2) «Файлы» — moysklad inline collapsible vs ours in a tab → structural delta (shared, defer).
  (3) custom-attributes block — present in both? Is our AttributesEditor title i18n'd?`,
  },
]

phase('Gather')
log(`Gathering parity facts across ${DIMENSIONS.length} dimensions for moves/[id]…`)

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

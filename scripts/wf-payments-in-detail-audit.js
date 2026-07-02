export const meta = {
  name: 'payments-in-detail-audit',
  description:
    'Parity fact-gathering: moysklad incoming-payment (Входящий платёж) edit/detail reference (clean --detail capture: DOM+PNG+metadata) vs our payments-in/[id] page, across 6 money-document dimensions. Agents gather facts; the operator (Opus) judges deltas.',
  phases: [{ title: 'Gather', detail: '6 parallel agents extract moysklad-vs-ours facts per dimension' }],
}

// ---- Reference (new --detail capture layout) + our paths (absolute — Read requires absolute paths) ----
const ROOT = 'D:/projects/moysklad'
const REF = `${ROOT}/docs/moysklad-reference/payments-in/detail`
const OUR_PAGE = `${ROOT}/apps/web/src/app/(app)/payments-in/[id]/page.tsx`
const CASH_IN_PAGE = `${ROOT}/apps/web/src/app/(app)/cash-in/[id]/page.tsx`
const CASH_IN_AUDIT = `${ROOT}/docs/audits/cash-in-detail.audit.md`
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
The document is an INCOMING PAYMENT / Входящий платёж (a bank payment received from a counterparty,
allocated against outgoing invoices). It is a MONEY document — NO position/goods table; instead it has
a single meta-field form + an «Оплаченные документы» (paid-documents / allocation) tab.
Compare STRUCTURE and LABELS only — IGNORE the specific data instance (payment number, counterparty
name, specific sums). Reference locale = Russian; resolve OUR labels by reading the i18n key inside
${I18N_RU} (e.g. tFields('organization') → fields.organization).

PRECEDENT — this document is the TWIN of cash-in (Приходный ордер), already audited. Read:
  - ${CASH_IN_AUDIT}  (the cash-in detail audit — same money-doc shape; its S1/S2/S3 fixes are the template)
  - ${CASH_IN_PAGE}  (cash-in/[id] page — already carries the fixes our payments-in page is MISSING)
Our payments-in page is the SAME structure but does NOT yet have the cash-in fixes (it still has hardcoded
Uzbek tab label + allocation strings + NO inline Tasks section). Confirm each of those.

REFERENCE LAYOUT (clean --detail capture in ${REF}):
- edit-default.html / edit-default.png — the incoming-payment edit form (UTF-8 clean DOM + screenshot)
- edit-tab-linked.html / .png — the «Связанные документы» tab
- detail-metadata.json — dropdown menu dumps (UTF-8 clean)
- GROUND TRUTH already decoded from the capture (authoritative; dropdowns are clean):
  • Toolbar buttons: Сохранить · Закрыть · Изменить ▾ · Создать документ ▾ · Печать ▾ · Отправить ▾ · ☑ Проведено
  • «Изменить» ▾ = { Удалить, Копировать }  (2 items)
  • «Создать документ» ▾ = { Счет-фактура выданный на аванс }  (1 item)
  • «Печать» ▾ = { Настроить... }  (1 item — NO named print form for an incoming payment)
  • «Отправить» ▾ = { }  (EMPTY — 0 items)
  • Tabs in the detail/edit view = «Оплаченные документы» (default/active) + «Связанные документы» only.
    Задачи + Файлы are INLINE collapsible sections (NOT tabs); История/События do NOT exist.
  • VISIBLE meta fields (from edit-default.png): LEFT col = «* Организация», «Договор», «Проект»,
    «Канал продаж», «Назначение платежа» (textarea), «* Валюта документа». RIGHT col = «* Контрагент»
    (+ «Баланс : 0,00 сум» under it), «Сумма», «Включая НДС», «Входящий номер» + «от <date>».
    A «Комментарий» textarea sits below the allocation table (full width).
  • Header: «Входящий платёж № <n> от <date>» + «Статус ▾» dropdown + «?» help icon + ☑ Проведено.

RULES:
- Read the moysklad reference screenshot(s) AND grep the matching .html for exact label text.
- Read our code region in ${OUR_PAGE} and the relevant component(s) under ${COMPONENTS}.
- Resolve EVERY tCommon/tFields/tDetailForm/tDetailHeader/tDetailTitles/tDetailTabs/tStates i18n key to its
  RU string via ${I18N_RU}. Put the resolved RU string in the "ours" column (not the key). If our code
  uses a HARDCODED string (Uzbek or RU literal, not a t() call), put that literal in "ours" and flag it.
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
DIMENSION: Detail/edit-page TOOLBAR (top action bar) + author block + «Проведено» toggle.
MOYSKLAD REFS to read:
  - ${REF}/edit-default.png  (top bar)
  - ${REF}/edit-dropdown-izmenit.png   (Изменить items)
  - ${REF}/edit-dropdown-sozdat.png    (Создать документ items)
  - ${REF}/edit-dropdown-pechat.png    (Печать items)
  - ${REF}/edit-dropdown-otpravit.png  (Отправить items)
  - ${REF}/detail-metadata.json  (exact dropdown item labels + disabled flags)
OUR CODE: ${OUR_PAGE} — the <DetailToolbar/> usage (around lines 419-446) and <DetailHeader/> authorSlot
  (around lines 447-485). Read ${COMPONENTS}/document-detail/detail-toolbar.tsx for what the toolbar renders
  (onSave/onClose/pager/onClone/onDelete/print menu/createMenuItems). Note our page passes onPrintList +
  onPrintConfigure and NO createMenuItems.
COMPARE: every toolbar button label, the prev/next pager («N из M»), «Изменить» dropdown items
  (Удалить/Копировать — note if we add «Открыть в API» extra), «Создать документ» (moysklad has 1 item
  «Счет-фактура выданный на аванс»; ours passes NO createMenuItems → no button → missing_in_ours),
  «Печать» items (moysklad = «Настроить...» only; ours = print-list + configure → judge), «Отправить»
  (moysklad EMPTY; ours = email composer disabled → judge), the «Проведено» checkbox, the author block
  (avatar + owner name + «Основной» role + «Изменения: <name> <date>»). NOTE the author line label in
  moysklad reads «Изменения:» (verify our tDetailHeader('changed') resolves to «Изменения»).`,
  },
  {
    key: 'header',
    prompt: `${COMMON}
DIMENSION: Detail HEADER (below toolbar): document title, «Статус ▾» dropdown, «?» help, «Проведено».
MOYSKLAD REFS:
  - ${REF}/edit-default.png  (title «Входящий платёж № 07044 от 07.05.2026 12:17» + «Статус ▾» + «?» + ☑ Проведено)
  - grep ${REF}/edit-default.html for: "Входящий платёж","Статус","Проведено".
OUR CODE: ${OUR_PAGE} lines ~114-118 (STATE_TONE) and ~447-485 (<DetailHeader/>). Resolve
  tDetailTitles('payment_in'), tStates.payment_in.{draft,posted,cancelled}, tDetailHeader('role_primary'),
  ('changed') via ${I18N_RU}. Read ${COMPONENTS}/document-detail to see if DetailHeader renders a status
  dropdown / «?» help.
COMPARE: title prefix «Входящий платёж» + "№ … от …" format; the inline «Статус ▾» status-edit dropdown
  (does ours render one? moysklad has it); the «?» help icon (ours? moysklad has it); the «Проведено»
  toggle; the «Баланс : 0,00 сум» counterparty-balance line under Контрагент (moysklad shows it — do we?).`,
  },
  {
    key: 'meta-fields',
    prompt: `${COMMON}
DIMENSION: Document META fields panel (the form above the tabs) — labels, order, required (*).
MOYSKLAD REFS:
  - ${REF}/edit-default.png  (the two-column form)
  - grep ${REF}/edit-default.html for labels: "Организация","Контрагент","Договор","Проект","Канал продаж",
    "Назначение платежа","Валюта документа","Сумма","Включая НДС","Входящий номер","Комментарий","Баланс".
  KNOWN present (from PNG): LEFT = Организация*, Договор, Проект, Канал продаж, Назначение платежа, Валюта документа*;
    RIGHT = Контрагент* (+ Баланс line), Сумма, Включая НДС, Входящий номер + «от <date>».
OUR CODE: ${OUR_PAGE} lines ~504-665 (<DocumentMetaPanel> rows). Resolve every label:
  organization=tFields('organization'); the counterparty field uses tFields('payer') → RESOLVE IT (note: it
  is «Плательщик», but moysklad shows «Контрагент» → DELTA); sum=tFields('sum'); incoming_number=
  tFields('incoming_number') → RESOLVE (note «Входящий №» vs moysklad «Входящий номер» → byte delta);
  payment_purpose=tFields('payment_purpose'); posted_at=tFields('posted_at') (we show «Дата проведения»
  disabled — moysklad shows «Входящий номер … от <date>» i.e. an INCOMING DATE, not Дата проведения → judge);
  contract=tFields('contract'); project=tFields('project'); organization_account=tFields('organization_account');
  agent_account=tFields('agent_account'); external_code=tDetailForm('external_code'); description=tFields('description').
COMPARE each field as a row. Specifically flag:
  (1) Counterparty label: ours «Плательщик» (tFields('payer')) vs moysklad «Контрагент» → DELTA (shared with
      cash-in; note blast radius).
  (2) «Канал продаж» (sales channel) — moysklad has it; do we? (likely missing_in_ours → backend SalesChannel).
  (3) «Включая НДС» — moysklad has it; ours? (likely missing_in_ours → VAT not modeled, UZS-only → defer).
  (4) «Валюта документа» — moysklad shows it (required); ours has no currency field → missing_in_ours (UZS-only → defer).
  (5) Bank account fields: we render «Счёт организации»/«Счёт контрагента» (organization_account/agent_account);
      moysklad's edit form (this capture) does NOT show them → possible extra_in_ours (mark uncertain — they may
      appear only when a bank account exists).
  (6) «Входящий номер» + incoming DATE vs our «Дата проведения» (posted_at, disabled) — structural field delta.
  (7) «Комментарий» — moysklad shows a big textarea BELOW the allocation table; ours is a small Input in the meta
      panel (tFields('description')) → layout delta (low).
  (8) Field ORDER + required-stars + any field moysklad shows we miss or extra we render.`,
  },
  {
    key: 'tabs',
    prompt: `${COMMON}
DIMENSION: TAB STRUCTURE of the detail page.
MOYSKLAD REFS:
  - ${REF}/edit-default.png  (the «Оплаченные документы» active tab + «Связанные документы»)
  - ${REF}/edit-tab-linked.png + ${REF}/edit-tab-linked.html  (the «Связанные документы» tab)
  - grep both .html for tab labels: "Оплаченные документы","Связанные","Файлы","Задачи","События","История".
  - GROUND TRUTH: moysklad's incoming-payment detail/edit view shows ONLY 2 tabs: «Оплаченные документы»
    (default) + «Связанные документы». Файлы + Задачи are inline sections (NOT tabs). NO История/События.
OUR CODE: ${OUR_PAGE} lines ~678-685 (<DetailContentTabs auditEntity="PaymentIn" relatedGroups={[]}
  filesSlot=… positionsLabel="Taqsimlanish">). Read ${COMPONENTS}/document-detail/detail-content-tabs.tsx.
  Note our page passes positionsLabel="Taqsimlanish" — a HARDCODED UZBEK string (the tab-1 label).
COMPARE each tab as a row:
  (1) Tab-1: moysklad «Оплаченные документы» vs ours **hardcoded Uzbek «Taqsimlanish»** → DELTA (high) —
      this is the systemic S1 fix (set positionsLabel={tDetailTabs('paid_documents')} = «Оплаченные документы»,
      mirroring cash-in which already does this).
  (2) «Связанные документы» — present in both? (ours = the DetailContentTabs related tab).
  (3) «Файлы» — moysklad = inline section; ours = a separate TAB (filesSlot) → structural delta (shared, defer).
  (4) «История»/«События»/audit tab — ours has one (auditEntity="PaymentIn"); moysklad detail view does NOT
      → extra_in_ours (shared DetailContentTabs, defer).`,
  },
  {
    key: 'allocation-tab',
    prompt: `${COMMON}
DIMENSION: The «Оплаченные документы» (paid-documents / allocation) tab body — buttons, table columns, totals,
  and ALL hardcoded-Uzbek strings inside it.
MOYSKLAD REFS:
  - ${REF}/edit-default.png  (the «Оплаченные документы» tab is the DEFAULT view — read it carefully)
  - grep ${REF}/edit-default.html for: "Привязать платёж","Перераспределить сумму платежа","Тип документа",
    "Дата","Организация","Контрагент","Статус","К оплате","Не оплачено","Оплачено из этого платежа",
    "Привязано","Не привязано".
  - GROUND TRUTH: moysklad allocation tab = buttons «Привязать платёж» + «Перераспределить сумму платежа»,
    a table (Тип документа · № · Пров. · Дата · Организация · Контрагент · Статус · К оплате · Не оплачено ·
    Оплачено из этого платежа), and a right-side summary «Привязано: 0,00» / «Не привязано: 0,00».
OUR CODE: ${OUR_PAGE} lines ~667-772 — the allocation editor. CATALOGUE every hardcoded string:
  • the summary box (lines ~667-676): «Taqsimlangan:» , «Qoldiq:» (both HARDCODED Uzbek)
  • the section header (line ~688-691): «Taqsimlanish — {n} ta (...)» (HARDCODED Uzbek)
  • the empty state (line ~695-697): «Hech bir schyotga taqsimlanmagan» (HARDCODED Uzbek)
  • the column headers (lines ~700-703): «Schyot-faktura» , «Summa (tiyin)» (HARDCODED Uzbek)
  • the picker placeholders (lines ~713-715): «Avval to'lovchini tanlang» / «Schyot-fakturani tanlash» (HARDCODED)
  • the add button (lines ~757-767): «Schyot qo'shish» (HARDCODED)
  • row-remove aria (line ~744): «Qatorni o'chirish» (HARDCODED)
COMPARE: cash-in (${CASH_IN_PAGE}, lines ~611-704) already wired the header/empty to t('allocation_title')/
  t('allocation_empty') in pages.cash_in. payments-in has NO pages.payment_in block yet → ALL these strings are
  raw Uzbek literals. Output one row PER hardcoded string (status=delta, ours=the literal, moysklad=the RU concept),
  PLUS rows for the moysklad-only buttons «Привязать платёж»/«Перераспределить сумму платежа» (missing_in_ours,
  structural) and the full table-column layout vs our simpler 2-column editor (delta, defer — same as cash-in S4).`,
  },
  {
    key: 'bottom-sections',
    prompt: `${COMMON}
DIMENSION: BOTTOM/inline sections — «Задачи» collapsible, «Файлы» collapsible, «Комментарий» textarea, attributes.
MOYSKLAD REFS:
  - ${REF}/edit-default.png  (bottom of the form: «Комментарий» textarea, then ▼ Задачи [+ Задача] «Нет задач»,
    then ▼ Файлы [+ Файл] with table Наименование / Размер, МБ / Дата добавления / Сотрудник)
  - grep ${REF}/edit-default.html for: "Задача","Задачи","Файл","Файлы","Нет задач","Комментарий","Сотрудник".
OUR CODE: ${OUR_PAGE} — note our page renders <AttributesEditor entity="PaymentIn" …> (lines ~774-782) but
  does NOT render a <DocumentTasksSection/> (grep the file — it is ABSENT, unlike cash-in which has it at
  ${CASH_IN_PAGE} line ~709). Files are inside a TAB (filesSlot), not inline. Read
  ${COMPONENTS}/document-tasks-section.tsx and ${COMPONENTS}/attributes-editor.tsx.
COMPARE: (1) «Задачи» inline section — moysklad HAS it (header + «+ Задача» + «Нет задач»); ours is ABSENT
  → missing_in_ours (high) — the S2 fix (add inline <DocumentTasksSection entity="PaymentIn" entityId={data.id}/>;
  PaymentIn IS in the server TASK_ENTITY_WHITELIST → safe). Mirror cash-in's placement (line ~706-710).
  (2) «Файлы» — moysklad inline collapsible vs ours in a tab → structural delta (shared, defer).
  (3) «Комментарий» — moysklad has a dedicated bottom textarea; ours has the description as a meta Input → delta.
  (4) custom-attributes block — present in both? Is our AttributesEditor title i18n'd?`,
  },
]

phase('Gather')
log(`Gathering parity facts across ${DIMENSIONS.length} dimensions for payments-in/[id]…`)

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

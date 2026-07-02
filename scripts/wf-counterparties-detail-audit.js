export const meta = {
  name: 'counterparties-detail-audit',
  description:
    'Parity fact-gathering: moysklad counterparty CARD (catalog detail, Контрагент) edit reference (live --detail capture: full card DOM + screenshot + extra-menus.json) vs our counterparties/[id] page, across 6 CATALOG-card dimensions (NOT a document — no positions/allocation; a two-column form-card + right CRM widget). Agents gather facts; the operator (Opus) judges deltas.',
  phases: [{ title: 'Gather', detail: '6 parallel agents extract moysklad-vs-ours facts per dimension' }],
}

const ROOT = 'D:/projects/moysklad'
const REF = `${ROOT}/docs/moysklad-reference/counterparties/detail`
const OUR_PAGE = `${ROOT}/apps/web/src/app/(app)/counterparties/[id]/page.tsx`
const OUR_NEW = `${ROOT}/apps/web/src/app/(app)/counterparties/new/page.tsx`
const I18N_RU = `${ROOT}/apps/web/src/messages/ru.json`
const COMPONENTS = `${ROOT}/apps/web/src/components`

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
The entity is a COUNTERPARTY CARD (Контрагент) — a CATALOG detail page, NOT a document.
It has NO positions table, NO allocation tab. It is a TWO-COLUMN layout:
  • LEFT  = the editable counterparty form, grouped into collapsible sections.
  • RIGHT = a CRM activity widget (tabs: События / Задачи / Документы / Файлы / Показатели).
Compare STRUCTURE and LABELS only — IGNORE the specific data instance (the counterparty name
«Зокир ака мухтор ашрафи», its phone, etc.). Reference locale = Russian; resolve OUR labels by
reading the i18n key in ${I18N_RU} (most live under pages.counterparty_new.*, plus fields.*,
common.*, detail_header.*, create_related.*).

REFERENCE GROUND TRUTH (live --detail capture, authoritative):
  - ${REF}/edit-default.html   — the FULL counterparty card DOM (UTF-8 clean, 168KB). grep it for exact RU labels.
  - ${REF}/edit-default.png    — full-page screenshot of the card (READ THE IMAGE for layout/sections/order).
  - ${REF}/extra-menus.json    — live-only facts: toolbar buttons, «...» overflow items, right-widget tabs,
                                 left_form_sections (the canonical section→fields grouping), localization_note.
  - The «...» overflow menu = { Копировать, Поместить в архив, Удалить }. NO «Печать», NO «Создать документ» on
    the card toolbar (the card creates related docs from the RIGHT widget «Документы» tab, not a toolbar dropdown).
  - moysklad LEFT sections (in order): «О контрагенте» → «Контактные лица» → «Реквизиты» → «Скидки и цены» → «Доступ».
  - LOCALIZATION (critical): the demo account is RU-configured (Тип контрагента «Юридическое лицо. Россия»,
    requisites КПП/ОГРН/ОКПО). Our clone is moysklad.uz for UZBEKISTAN → legalUZ/entrepreneurUZ/individualUZ +
    ИНН/МФО/ОКЭД/р.с. КПП/ОГРН/ОКПО are RU-only; our МФО/ОКЭД/р.с ARE the correct UZ equivalents. Do NOT flag
    КПП/ОГРН/ОКПО as "missing_in_ours" — mark them status=match with note "intentional UZ localization".

OUR CODE: ${OUR_PAGE} (the detail/[id] inline-edit page) — it mirrors ${OUR_NEW}. It uses <DetailToolbar/> +
<DetailHeader/> (from ${COMPONENTS}/document-detail) + <FormSection/> blocks + <ContactPersonsSection/> +
<CallsSection/> + <AttachmentsSection/> + <DocumentTabs/> + two read-only tables (bank accounts, balances).

RULES:
- Read the moysklad reference (DOM + screenshot + extra-menus.json) AND our code region.
- Resolve EVERY t()/tFields/tCommon/tDetailHeader/tCreate i18n key to its RU string via ${I18N_RU}. Put the
  resolved RU string in "ours". If our code uses a HARDCODED literal (Uzbek or RU, NOT a t() call), put that
  literal in "ours" and flag it (these are i18n-leak deltas — high value).
- status: match = same label+presence; delta = present in both but label/order/grouping/required differs;
  missing_in_ours = moysklad has it, we don't; extra_in_ours = we have it, moysklad doesn't; uncertain = can't tell.
- Be precise about Unicode/byte-level: «Наименование» vs «Название», «диск.» abbreviation, trailing «:», nbsp.
- DO NOT invent deltas. When the reference doesn't show something, mark uncertain — don't guess.
- Your final message IS the structured result (the schema). No prose outside it.
`

const DIMENSIONS = [
  {
    key: 'toolbar',
    prompt: `${COMMON}
DIMENSION: Card TOOLBAR (top action bar) + the «...» overflow + ⚙ gear + author/«Изменения» block.
MOYSKLAD (from extra-menus.json + edit-default.png top region):
  toolbar = Сохранить · Закрыть · pager «N из M» ‹ › · «Заполнить по ИНН» · «Контактное лицо» (+quick-add) ·
  «Расчетный счет» (+quick-add) · ⚙ gear · «...» overflow. Overflow items = { Копировать, Поместить в архив, Удалить }.
  Top-right shows «Изменения: <employee> <date>».
OUR CODE: ${OUR_PAGE} — the <DetailToolbar/> usage (~lines 281-303) and the header archive/restore buttons
  (pillsSlot, ~lines 323-351). Read ${COMPONENTS}/document-detail/detail-toolbar.tsx for what DetailToolbar
  renders (onSave/onClose/pager/onClone/onDelete/createMenuItems/print menu). Note our page passes
  createMenuItems (a «Создать документ» dropdown), onClone=undefined, onDelete, onPrintConfigure, and renders
  archive/restore as header pills.
COMPARE each as a row:
  (1) «Заполнить по ИНН» — moysklad has it; ours? (likely missing_in_ours; UZ INN-lookup equivalent).
  (2) «Контактное лицо» / «Расчетный счет» quick-add toolbar buttons — moysklad has them; ours adds these via
      inline sections instead → judge (missing as TOOLBAR buttons / present as sections).
  (3) «...» overflow { Копировать, Поместить в архив, Удалить }: ours = onClone (undefined → no Копировать?),
      delete (onDelete), archive/restore (header pills, label «В архив»/«Архив» vs moysklad «Поместить в архив»).
      Flag the archive LABEL delta (resolve tCommon('archive')/('restore') via ${I18N_RU}).
  (4) «Создать документ» dropdown: OURS passes createMenuItems → renders a toolbar «Создать документ» dropdown,
      but moysklad's card has NO such toolbar dropdown → extra_in_ours (structural). ALSO inspect our
      createMenuItems (~lines 255-271): the item id 'customer-order' uses label tCreate('demand') and item id
      'demand' ALSO uses tCreate('demand') → MISLABEL bug (two items, same label). Resolve tCreate('demand')/
      ('invoice_out')/('customer_order') and report the exact mislabel.
  (5) «Изменения: <name> <date>» — ours authorSlot uses tDetailHeader('changed') → resolve (should be «Изменения»).`,
  },
  {
    key: 'header-title',
    prompt: `${COMMON}
DIMENSION: Card HEADER / TITLE row + the name field + type indication.
MOYSKLAD: the card title IS the editable «* Наименование» field at the very top (a big text input with the
  counterparty name), with a red required asterisk. The counterparty TYPE (Юр.лицо/ИП/Физлицо) is shown inside
  the «Реквизиты» section as the «Тип контрагента» dropdown — there is NO type BADGE in the header.
OUR CODE: ${OUR_PAGE} <DetailHeader/> (~lines 304-380): customTitle = name + «· Код: <code>», a type Badge
  (pillsSlot, typeLabel map), archive/restore pill, author block. The name is ALSO an editable field lower in
  section_main (FormField name, ~lines 391-403).
COMPARE:
  (1) Name field placement: moysklad = the name IS the page title (top, big input, required *). Ours = name is a
      FormField inside section_main + the DetailHeader shows it as static text → layout delta.
  (2) Type badge in header: ours renders <Badge>{typeLabel[companyType]}</Badge>; moysklad shows NO header type
      badge → extra_in_ours. ALSO typeLabel is a HARDCODED Uzbek map ('Yuridik shaxs (UZ)'/'Yakka tadbirkor'/
      'Jismoniy shaxs') → i18n-leak (high). Flag both.
  (3) «· Код: <code>» suffix in title — moysklad shows Код as a field, not in the title → judge (low).
  (4) author block (avatar + owner + role «Основной» + «Изменения: <name> <date>») — resolve
      tDetailHeader('role_primary')/('changed'); moysklad shows just «Изменения: <name> <date>» (top-right).`,
  },
  {
    key: 'main-fields',
    prompt: `${COMMON}
DIMENSION: «О контрагенте» section fields (the primary identity/contact fields) — LABEL parity, presence, order.
MOYSKLAD «О контрагенте» (in order): Статус · Группы(+?) · Телефон · Факс · Электронный адрес · Фактический адрес ·
  Комментарий к адресу · Комментарий · Код · Внешний код.
OUR CODE: ${OUR_PAGE} — these fields are SCATTERED across section_main / section_contacts / section_identifiers.
  Resolve EACH our label via ${I18N_RU} pages.counterparty_new.*:
  name_label, company_type_label, email_label, phone_label, fax_label, code_label, external_code_label,
  description_label, discount_card_label, price_type_label, actual_address_label, legal_address_label, tags_label.
COMPARE each moysklad field to ours (one row each). Specifically flag these LABEL deltas (verify by resolving):
  • Наименование (moysklad) vs name_label → ours is «Название» → DELTA (moysklad uses «Наименование» universally).
  • Электронный адрес (moysklad) vs email_label → ours «Email» → DELTA.
  • Комментарий (moysklad) vs description_label → ours «Описание» → DELTA (moysklad calls the free comment «Комментарий»).
  • Тип контрагента (moysklad) vs company_type_label → ours «Тип организации» → DELTA.
  And these PRESENCE deltas:
  • «Статус» (counterparty state dropdown, e.g. «Новый») — moysklad has it; ours? (data has state{}; the form may
    not edit it → missing_in_ours, medium).
  • «Группы» (groups, with ? help) — moysklad has it; ours has «Метки»/tags instead → delta (Группы ≠ Метки concept).
  • «Комментарий к адресу» (address comment) — moysklad has it; ours? (likely missing_in_ours, low).
  • field ORDER + grouping: moysklad groups all of the above under one «О контрагенте» section; ours splits into
    section_main/section_contacts/section_identifiers → grouping delta (medium, structural).`,
  },
  {
    key: 'requisites',
    prompt: `${COMMON}
DIMENSION: «Реквизиты» (requisites) section + «Скидки и цены» + «Доступ» sections.
MOYSKLAD «Реквизиты»: Тип контрагента · ИНН(+?, +Заполнить по ИНН) · Полное наименование · Юридический адрес ·
  Комментарий к адресу · КПП · ОГРН · ОКПО · «+ Расчетный счет». (КПП/ОГРН/ОКПО are RU-only — see LOCALIZATION.)
MOYSKLAD «Скидки и цены»: Цены · Номер диск. карты.
MOYSKLAD «Доступ»: Сотрудник · Отдел · Общий доступ (checkbox).
OUR CODE: ${OUR_PAGE} — section_uz_requisites (inn/mfo/account/okoned), section_main has legalTitle/legalAddress,
  section_identifiers has discountCardNumber, section_main has priceTypeId. Resolve via ${I18N_RU}:
  inn_label, mfo_label, account_label, okoned_label, legal_title_label, legal_address_label, price_type_label,
  discount_card_label, section_uz_requisites.
COMPARE:
  (1) Тип контрагента — present in our Реквизиты-equivalent? (ours company_type is in section_main → grouping delta).
  (2) ИНН — moysklad «ИНН» vs ours inn_label «ИНН» → match. «Заполнить по ИНН» autofill button — missing_in_ours.
  (3) Полное наименование (moysklad) vs ours legal_title_label «Юридическое название» → DELTA (label) + it sits in
      our section_main not requisites → grouping delta.
  (4) КПП/ОГРН/ОКПО — RU-only; ours МФО/ОКЭД/р.с (mfo/okoned/account) are the UZ equivalents → status=match, note
      "intentional UZ localization" (do NOT mark missing).
  (5) «Скидки и цены»: Цены (moysklad) vs price_type_label «Тип цен» → DELTA (label «Цены» vs «Тип цен»). Номер
      диск. карты (moysklad) vs discount_card_label «Номер дисконтной карты» → DELTA (abbreviation «диск.»).
  (6) «Доступ» section (Сотрудник/Отдел/Общий доступ) — moysklad has it; ours has NO owner/department/shared-access
      editor on this page → missing_in_ours (medium; backend has owner/group). One row each.`,
  },
  {
    key: 'right-widget-and-sections',
    prompt: `${COMMON}
DIMENSION: RIGHT CRM widget + the inline «Контактные лица»/«Расчетный счет» sections + our bottom read-only tables.
MOYSKLAD RIGHT widget: tabs «События» (active) · «Задачи» · «Документы» · «Файлы» · «Показатели». Под «События»:
  «Все события / Заметки / Звонки» toggle + «Создать заметку: Что произошло?» composer. «Документы» tab offers
  «Создать корректировку» / «Создать акт сверки». «Контактные лица» + «Расчетный счет» are LEFT inline sections.
OUR CODE: ${OUR_PAGE} bottom region — <ContactPersonsSection/> (~684), <CallsSection/> (~686),
  <AttachmentsSection entity="Counterparty"/> (~688), <DocumentTabs auditEntity="Counterparty"/> (~690), plus a
  read-only «Bank hisoblari» table (~631-682) and «Balans» table (~693-742). Read the section components under
  ${COMPONENTS} (contact-persons-section, calls-section, attachments-section, document-tabs) for their headers.
COMPARE (structural — most are big-refactor DEFER, but catalog presence + i18n):
  (1) Right CRM widget (События/Задачи/Документы/Файлы/Показатели as a right-column tabbed widget) — ours has NO
      such widget; we stack ContactPersons/Calls/Attachments/audit-tabs BELOW the form → missing_in_ours (high,
      structural — judge defer). One row PER widget tab.
  (2) «Контактные лица» — moysklad inline section + «+ Контактное лицо»; ours <ContactPersonsSection> → match (judge).
  (3) «Звонки» — moysklad inside События widget; ours <CallsSection> → present (delta placement).
  (4) «Файлы» — moysklad right-widget tab; ours <AttachmentsSection> + <DocumentTabs> → delta.
  (5) Our «Bank hisoblari» (bank accounts) read-only table + «Balans» (balances) read-only table — moysklad shows
      bank accounts inline («+ Расчетный счет») and balance in «Показатели»; ours are extra read-only tables →
      extra_in_ours (judge). FLAG that both table headers are HARDCODED UZBEK (next dimension covers full sweep).`,
  },
  {
    key: 'i18n-sweep',
    prompt: `${COMMON}
DIMENSION: HARDCODED-STRING SWEEP of ${OUR_PAGE} — catalogue EVERY non-i18n (hardcoded) UI string. moysklad is
  fully Russian; any hardcoded Uzbek (or hardcoded RU literal not via t()) is an i18n-leak delta.
METHOD: read ${OUR_PAGE} top-to-bottom. For EACH hardcoded user-visible string, output one row:
  item = what it is, moysklad = the RU concept it should match, ours = the exact hardcoded literal, status=delta,
  severity (high if user-visible label/header, low if aria), note = file:line + suggested i18n key.
KNOWN hardcoded strings to confirm + find any others:
  • typeLabel map (~lines 116-120): 'Yuridik shaxs (UZ)' / 'Yakka tadbirkor' / 'Jismoniy shaxs' (rendered in the
    header Badge) — should reuse pages.counterparty_new.company_type_* (which already exist in RU).
  • «Bank hisoblari» FormSection title (~line 632) + description 'Bank hisoblari hali kiritilmagan' (~634).
  • bank table headers (~lines 642-656): «Hisob raqami» / «Bank» / «MFO» / «Valyuta» / «Asosiy».
  • «Balans» FormSection title (~line 694) + description "Kontragent bilan hisob-kitob harakatlari hali yo'q" (~697).
  • balance table headers (~lines 706-713): «Valyuta» / «Qoldiq (+ bizga qarzdor / − biz qarzdormiz)» / «Yangilangan».
  • tag-remove aria (~line 612): \`\${tg} o'chirish\`.
  • any other hardcoded literal (loading/not_found already use tCommon — verify; section descriptions; placeholders).
For each, propose the RU target string (e.g. «Bank hisoblari»→«Банковские счета», «Hisob raqami»→«Номер счёта»,
«Bank»→«Банк», «Valyuta»→«Валюта», «Asosiy»→«Основной», «Balans»→«Баланс», «Yangilangan»→«Обновлено», etc.) and a
proposed key namespace (e.g. pages.counterparty_new.bank_* / balance_*). This dimension is the highest-ROI fix set.`,
  },
]

phase('Gather')
log(`Gathering parity facts across ${DIMENSIONS.length} dimensions for counterparties/[id] (catalog card)…`)

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

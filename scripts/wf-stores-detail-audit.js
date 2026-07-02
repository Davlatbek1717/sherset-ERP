export const meta = {
  name: 'stores-detail-audit',
  description:
    'Parity fact-gathering: moysklad WAREHOUSE card (Склад, catalog detail, live --detail capture #warehouse) vs our settings/stores/[id] page (mirror: settings/stores/new). A RICH catalog card: identity fields + structured address block + address-storage (Адресное хранение) section + advanced checkboxes. Fully i18n (pages.stores.*) → the audit is LABEL-PARITY + field presence/order, NOT leak-hunting. 3 parallel agents gather facts; the operator (Opus) judges deltas.',
  phases: [{ title: 'Gather', detail: '3 parallel agents extract moysklad-vs-ours facts per dimension' }],
}

const ROOT = 'D:/projects/moysklad'
const REF = `${ROOT}/docs/moysklad-reference/stores/detail`
const OUR_PAGE = `${ROOT}/apps/web/src/app/(app)/settings/stores/[id]/page.tsx`
const OUR_NEW = `${ROOT}/apps/web/src/app/(app)/settings/stores/new/page.tsx`
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
          item: { type: 'string' },
          moysklad: { type: 'string', description: 'Exact moysklad RU label, or "—" if absent' },
          ours: { type: 'string', description: 'Our RESOLVED RU label (from ru.json pages.stores.*), or the hardcoded literal, or "—"' },
          status: { type: 'string', enum: ['match', 'delta', 'missing_in_ours', 'extra_in_ours', 'uncertain'] },
          severity: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
          note: { type: 'string', description: 'Evidence: ref region + our file:line + i18n key. If uncertain, why.' },
        },
      },
    },
    summary: { type: 'string' },
    referenceFilesRead: { type: 'array', items: { type: 'string' } },
  },
}

const COMMON = `
You are gathering PARITY FACTS for the detail-page audit of a 1:1 moysklad.uz clone.
The entity is a WAREHOUSE card (Склад) — a RICH CATALOG detail page (Настройки → Склады).
NOT a document (no positions/allocation). Compare STRUCTURE + LABELS only; IGNORE the specific
data instance (the store's actual name/address). Reference locale = Russian; resolve OUR labels
by reading the i18n key in ${I18N_RU} under pages.stores.* (plus common.*, form.*).

REFERENCE GROUND TRUTH (live --detail capture 2026-06-01, authoritative):
  - ${REF}/edit-default.html   — FULL warehouse card DOM (UTF-8). grep it for exact RU labels.
  - ${REF}/edit-default.png    — full-page screenshot (READ THE IMAGE for layout/section order).
  - ${REF}/detail-metadata.json — «Изменить» dropdown dump = { «Удалить», «Копировать» } (both enabled).
  - VERIFIED moysklad labels present in the DOM (confirm + find more): Наименование · Код · Внешний код ·
    Группа · Комментарий · Адрес · Комментарий к адресу · Индекс · Город · Дом · Квартира/Офис ·
    (address-storage section) Адресное хранение товаров · Проводить инвентаризацию по ячейкам · Зона ·
    Без зоны хранения · Относится к зоне · Всего ячеек · Занято · Свободно · Дополнительные поля ·
    (toolbar) Сохранить · Закрыть · Изменить ▾ · Поместить в архив · Изменения · (archived) «Склад находится в архиве».
  - moysklad uses «Комментарий» for the free-text note (NOT «Описание»).

OUR CODE: ${OUR_PAGE} (detail/[id]); it MIRRORS ${OUR_NEW}. Namespace = pages.stores.*. It uses <EditForm/>
(now wired with useEditFormLabels → Save «Сохранить» / Close «Закрыть» / error «Ошибка») + <FormSection/> blocks +
<FormField/> + <Checkbox/>. Fields present (from grep): name, code, externalCode, parent (Группа), description,
address, postalCode, country, region, district, city, street, house, apartment, zones, slots,
allowNegativeStock (checkbox), shared (checkbox).

RULES:
- Read the moysklad reference (DOM + screenshot + metadata) AND the our-code region.
- Resolve EVERY t()/tForm/tCommon key to its RU string via ${I18N_RU}. Put the resolved RU string in "ours".
  If our code uses a HARDCODED literal (not a t() call), put that literal in "ours" and flag it (i18n-leak).
- status: match = same label+presence; delta = present both but label/order/required differs;
  missing_in_ours = moysklad has, we don't; extra_in_ours = we have, moysklad doesn't; uncertain.
- Be precise about Unicode/byte-level («Наименование» not «Название», «Комментарий» vs «Описание», «Квартира/Офис»).
- Do NOT invent deltas; if the reference doesn't show it, mark uncertain.
- Your final message IS the structured result (schema). No prose outside it.
`

const DIMENSIONS = [
  {
    key: 'identity-fields',
    prompt: `${COMMON}
DIMENSION: IDENTITY fields + section structure + page title.
MOYSKLAD top fields (order from screenshot/DOM): Наименование · Код · Внешний код · Группа · Комментарий.
OUR CODE ${OUR_PAGE}: resolve pages.stores.name, .code, .external_code, .parent, .description, plus
.edit_title/.title/.new_title and the FormSection titles (form.section_main, pages.stores.section_*).
COMPARE one row each:
  (1) Наименование vs pages.stores.name (~line 241, required?) — match? Both required?
  (2) Код vs .code (~248).
  (3) Внешний код vs .external_code (~255) — moysklad HAS this field (confirm) → likely match.
  (4) Группа vs .parent (~262) — moysklad label is «Группа»; resolve ours, flag if «Родитель»/«Группа товаров»/other.
  (5) Комментарий vs .description (~279) — moysklad uses «Комментарий»; if ours resolves to «Описание» → DELTA (medium).
  (6) Page title: ours EditForm title = pages.stores.edit_title; moysklad card title model (titleless toolbar, name is inline) → judge.
  (7) Section grouping: list our FormSection titles vs moysklad's section order; flag grouping deltas.`,
  },
  {
    key: 'address-block',
    prompt: `${COMMON}
DIMENSION: structured ADDRESS block + «Комментарий к адресу».
MOYSKLAD address fields (DOM): Индекс · Страна(?) · Город · Дом · Квартира/Офис · (street/region?) + «Комментарий к адресу».
The moysklad card may render address as ONE «Адрес» field that expands into structured sub-fields (Индекс/Город/Дом/
Квартира-Офис/...) — read the screenshot to see whether it is one field or a structured block.
OUR CODE ${OUR_PAGE}: fields address (~291), postalCode (~301), country (~307), region (~313), district (~319),
city (~325), street (~331), house (~337), apartment (~343). Resolve each pages.stores.* label.
COMPARE one row per address sub-field:
  • Индекс vs .postal_code · Страна vs .country · Город vs .city · Дом vs .house · «Квартира/Офис» vs .apartment
    (moysklad «Квартира/Офис» — does ours say «Квартира» only? → DELTA) · street vs .street · region vs .region ·
    district vs .district (does moysklad have district/Район? if not → extra_in_ours).
  • «Комментарий к адресу» (moysklad) vs ours — do we have an address-comment field? (likely missing_in_ours).
  • The top-level «Адрес» (.address) — is it a free-text line in addition to the structured fields, or redundant? judge.
For EACH, one row: exact moysklad label vs resolved ours, status, severity, note (file:line + key).`,
  },
  {
    key: 'storage-actions-i18n',
    prompt: `${COMMON}
DIMENSION: address-STORAGE (Адресное хранение) section + advanced checkboxes + TOOLBAR/actions + i18n-sweep.
MOYSKLAD address-storage section: «Адресное хранение товаров» (toggle) · «Проводить инвентаризацию по ячейкам» ·
  Зона · «Без зоны хранения» · «Относится к зоне» · «Всего ячеек»/«Занято»/«Свободно» (cell counters) ·
  «Дополнительные поля» (custom fields).
MOYSKLAD toolbar: Сохранить · Закрыть · «Изменить» ▾ { Удалить, Копировать } · «Поместить в архив» · «Изменения» ·
  archived banner «Склад находится в архиве».
OUR CODE ${OUR_PAGE}: fields zones (~353, hint zones_hint), slots (~363, hint slots_hint), allowNegativeStock
  checkbox (~376, label t('allow_negative_stock')), shared checkbox (~390, label t('shared')); section_advanced title;
  the Delete button + archive/restore (resolve common.delete/archive/restore) + EditForm Save/Close (useEditFormLabels).
COMPARE one row each:
  (1) «Адресное хранение товаров» — moysklad has a structured bin-storage feature; ours has zones/slots free fields →
      judge (our zones/slots vs moysklad's Зона/ячейки model — likely a simplified delta, medium).
  (2) «Проводить инвентаризацию по ячейкам» — moysklad checkbox; ours? (likely missing_in_ours).
  (3) allowNegativeStock checkbox (t('allow_negative_stock')) — does moysklad have an equivalent «Разрешить
      отрицательные остатки»? Search the DOM; if absent → extra_in_ours or uncertain.
  (4) shared checkbox (t('shared')) — moysklad «Общий доступ»? resolve ours, compare.
  (5) «Дополнительные поля» (custom fields) — moysklad has it; ours? (likely missing_in_ours, low — DEFER).
  (6) Toolbar: «Изменить» ▾ {Удалить,Копировать} vs ours (standalone Delete button, no «Изменить» dropdown, no
      Копировать) → structural delta + Копировать missing (note clone-backend status).
  (7) archive label: moysklad «Поместить в архив» vs ours common.archive («Архивировать») → DELTA (backlog #9 shared).
  (8) i18n-sweep: scan ${OUR_PAGE} for ANY hardcoded user-visible string (non-t()). The grep showed all FormField
      labels use t(); confirm + flag any hardcoded literal (label/hint/placeholder/aria). Report match if clean.`,
  },
]

phase('Gather')
log(`Gathering parity facts across ${DIMENSIONS.length} dimensions for settings/stores/[id] (rich catalog card)…`)

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

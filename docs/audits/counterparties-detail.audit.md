# counterparties/[id] — detail page parity audit

- **Module:** `counterparties` (Контрагент) detail/edit card (`apps/web/src/app/(app)/counterparties/[id]/page.tsx`)
- **Date:** 2026-06-01
- **Protocol:** v2.2 detail-page audit — **first CATALOG-card detail** (7th detail page overall). A catalog card is
  structurally different from a document: NO positions/allocation table; instead a **two-column** layout — LEFT = the
  editable counterparty form in collapsible sections, RIGHT = a CRM activity widget.
- **Reference:** `docs/moysklad-reference/counterparties/detail/` — live `--detail` capture (this session). The generic
  `--detail` dropdown/tab loop does NOT fit a catalog card (no top-level Изменить/Печать buttons, no `[role=tab]`s), so
  the ground truth is `edit-default.html` (168KB full card DOM) + `edit-default.png` + a hand-captured `extra-menus.json`
  (toolbar buttons, «...» overflow items, right-widget tabs, section→field grouping). Capture required an `openFirstRow`
  patch (catalog cell-table rows have no edit-anchor) — committed in `f0ffa01f`.
- **Method:** 6-dimension fact-gathering workflow (`scripts/wf-counterparties-detail-audit.js`, 6 agents) → operator
  (Opus) judged. Locale = Russian (`ru.json`).

## Verdict

The counterparty card is the most-used catalog detail. Its **field-label and i18n-leak deltas** (the high-ROI,
verified-against-screenshot set) were fixed; the **structural deltas** (right CRM widget, section regrouping, missing
state/groups/access editors, inline bank-account add) are large refactors / backend work and are DEFERRED with notes.

**LOCALIZATION (not a delta):** the demo moysklad account is RU-configured (Тип контрагента «Юридическое лицо. Россия»,
requisites КПП/ОГРН/ОКПО). Our clone is moysklad.uz for Uzbekistan → legalUZ/entrepreneurUZ/individualUZ + ИНН/МФО/ОКЭД/р.с.
The UZ requisites ARE the correct localized equivalents — КПП/ОГРН/ОКПО are intentionally absent, NOT a parity gap.

## A. Structural

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| S1 | Name field label | «Наименование» | was «Название» (`name_label`) | delta | high | **FIXED** — `name_label`/`name_required` → «Наименование» (verified on the card-title screenshot). |
| S2 | Email field label | «Электронный адрес» | was «Email» (`email_label`) | delta | high | **FIXED** — `email_label` → «Электронный адрес». |
| S3 | Free-comment field label | «Комментарий» | was «Описание» (`description_label`) | delta | high | **FIXED** — `description_label` → «Комментарий». |
| S4 | Counterparty-type field label | «Тип контрагента» | was «Тип организации» (`company_type_label`) | delta | high | **FIXED** — `company_type_label` → «Тип контрагента». |
| S5 | Full legal name field label | «Полное наименование» | was «Юридическое название» (`legal_title_label`) | delta | medium | **FIXED** — `legal_title_label` → «Полное наименование». |
| S6 | Price-type field label | «Цены» | was «Тип цен» (`price_type_label`) | delta | medium | **FIXED** — `price_type_label` → «Цены». |
| S7 | Discount-card field label | «Номер диск. карты» | was «Номер дисконтной карты» (`discount_card_label`) | delta | low | **FIXED** — abbreviation byte-parity. |
| S8 | Header type-badge labels | (i18n) | **hardcoded Uzbek** `typeLabel` map | delta | high | **FIXED** — removed the map; badge resolves `t('company_type_<type>')` (RU keys already existed). |
| S9 | Read-only Bank-accounts table | «Расчетный счет» concept | **hardcoded Uzbek** title+empty+5 headers | delta | high | **FIXED** — `bank_section_title`/`bank_empty`/`bank_col_{account,bank,mfo,currency,main}` (ru+uz). |
| S10 | Read-only Balances table | «Показатели» concept | **hardcoded Uzbek** title+empty+3 headers | delta | high | **FIXED** — `balance_section_title`/`balance_empty`/`balance_col_{currency,amount,updated}` (ru+uz). |
| S11 | Section grouping + order | О контрагенте / Реквизиты / Скидки и цены / Доступ | section_main/section_contacts/section_identifiers/section_uz_requisites | delta | medium | DEFERRED — form re-layout. |
| S12 | Name-as-title placement | name IS the page title (big required input at top) | static DetailHeader title + editable FormField in section_main | delta | medium | DEFERRED — header/form restructure. |
| S13 | «Статус» (state) editor | editable dropdown («Новый») | read-only (`data.state` not edited) | missing_in_ours | medium | DEFERRED — needs a state-edit control. |
| S14 | «Группы» (groups) editor | hierarchical group dropdown (+?) | free-text «Метки» (tags) — different concept | delta | medium | DEFERRED — groups ≠ tags; needs a groups picker. |
| S15 | «Доступ» section (Сотрудник/Отдел/Общий доступ) | editable owner/department/shared-access | owner read-only in header; no editor | missing_in_ours | medium | DEFERRED — needs owner/group/shared-access editors (backend has owner/group). |
| S16 | «Комментарий к адресу» (address comment) | present (фактич. + юр. адрес) | absent | missing_in_ours | low | DEFERRED — low value. |
| S17 | RIGHT CRM widget (События/Задачи/Документы/Файлы/Показатели + «Создать заметку») | two-column card, right = tabbed widget | stacked ContactPersons/Calls/Attachments/audit-tabs below the form | missing_in_ours | high | DEFERRED — big structural refactor + Activity/Tasks/Показатели backend. |
| S18 | «Расчетный счет» inline add (editable) | inline «+ Расчетный счет» under Реквизиты | read-only «Банковские счета» table (now i18n'd, S9) | delta | medium | DEFERRED — needs editable bank-account CRUD on the card. |

## B. Interactive

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| I1 | «Создать документ» item mislabel | — | id `customer-order` (→/customer-orders/new) used `tCreate('demand')`=«Отгрузки» → **duplicate label** with the `demand` item | delta | high | **FIXED** — added `create_related.customer_order`=«Заказ покупателя» (ru+uz); the customer-order item now uses it. |
| I2 | Contact-person add button | «Контактное лицо» | was «Новый контакт» (`contact_persons.create_button`) | delta | medium | **FIXED** — `contact_persons.create_button` → «Контактное лицо» (component used only on this card). |
| I3 | Tag-remove aria-label | (aria «Удалить») | **hardcoded Uzbek** `${tg} o'chirish` | delta | low | **FIXED** — `tag_remove_aria` = «Удалить {tag}» (ru) / «{tag} o'chirish» (uz). |
| I4 | Toolbar shape: «...» overflow {Копировать, Поместить в архив, Удалить}; NO Создать документ/Печать/Отправить on a card | catalog-card toolbar | reuses generic document `<DetailToolbar/>` → Изменить/Создать документ/Печать/Отправить dropdowns + header archive pills; Копировать disabled (onClone undefined) | delta | medium | DEFERRED — a catalog-card toolbar variant. Kept the «Создать документ» dropdown (functional; moysklad relocates it to the right «Документы» widget which we lack). |
| I5 | Archive «Поместить в архив» / restore «Извлечь из архива» | overflow items | header pill `tCommon('archive')` / `('restore')` + list bulk now all resolve to «Поместить в архив» / «Извлечь из архива» | delta | medium | **FIXED** (backlog #9, `c2aa5722`) — shared-key sweep: RU `common.archive`/`common.restore` + `bulk.archive`/`bulk.restore` unified app-wide to «Поместить в архив»/«Извлечь из архива» (26 bulk dropdowns + 22 detail-card buttons); UZ kept natural «Arxivlash»/«Tiklash». |
| I6 | «Заполнить по ИНН» autofill | toolbar + inline button | absent | missing_in_ours | low | DEFERRED — needs a UZ INN/STIR registry-lookup service (RU-specific in moysklad). |
| I7 | Calls section i18n leak | (calls live in the События widget) | `calls-section.tsx` hardcodes « с» suffix + `ru-RU` locale | delta | low | DEFERRED — shared component (`calls-section.tsx`), not this page. |
| I8 | Extra header elements (type Badge, «· Код:» suffix, «Основной» role line, owner-name line, active/archived pill) | header shows only «Изменения: <name> <date>» | we render extras | extra_in_ours | low | DEFERRED — minor extra affordances; kept for usability. |

## Fixed this session

| Ref | Fix | File |
|---|---|---|
| S1–S7 | 7 field-label deltas (name/email/comment/type/legal/price/discount) → moysklad RU | `pages.counterparty_new.*` (ru+uz) |
| S8 | typeLabel header-badge hardcoded Uzbek map → `t('company_type_<type>')` | counterparties/[id] page |
| S9 | Bank-accounts read-only table: title+empty+5 headers → i18n | page + `bank_*` (ru+uz) |
| S10 | Balances read-only table: title+empty+3 headers → i18n | page + `balance_*` (ru+uz) |
| I1 | «Создать документ» customer-order mislabel → `create_related.customer_order` «Заказ покупателя» | page + create_related (ru+uz) |
| I2 | Contact-person add button «Новый контакт» → «Контактное лицо» | `contact_persons.create_button` (ru+uz) |
| I3 | Tag-remove aria hardcoded Uzbek → `tag_remove_aria` | page + key (ru+uz) |

**Gates:** web typecheck 0 · biome clean · web **1214 pass / 1 skip** (no regression). **HALOL:** not browser-smoked
(additive i18n/label/prop changes only — no logic/picker-wiring changes). The `balance_col_amount` sign-legend RU wording
(«Сальдо (+ нам должны / − мы должны)») is a reasonable translation of our existing Uzbek legend; the exact moysklad
«Показатели» wording was not capturable (the read-only balance table is extra_in_ours, no moysklad inline counterpart).

## Deferred (documented for follow-up)

- **S11–S12** section regrouping (О контрагенте/Реквизиты/Скидки и цены/Доступ) + name-as-title — form re-layout.
- **S13–S15** «Статус» / «Группы» / «Доступ» (Сотрудник/Отдел/Общий доступ) editors — form + (partly) backend.
- **S16** «Комментарий к адресу» address-comment fields (low value).
- **S17** the entire RIGHT CRM widget (События/Задачи/Документы/Файлы/Показатели) — large structural + backend.
- **S18** editable inline «+ Расчетный счет» (our bank table is read-only).
- **I4** catalog-card toolbar variant (vs the generic document DetailToolbar).
- ~~**I5** archive label «Поместить в архив»/«Извлечь из архива» — **shared `common.archive`/`restore`** sweep (backlog #9).~~ ✅ **FIXED** `c2aa5722` (see I5 table row above).
- **I6** «Заполнить по ИНН» autofill — UZ INN/STIR lookup service.
- **I7** `calls-section.tsx` hardcoded « с»/`ru-RU` — shared-component i18n leak.

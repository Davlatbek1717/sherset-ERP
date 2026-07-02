# CO 1:1 — audit gaps (2026-06-18, code↔live-spec, 8 dims, 104 gaps)

> ROOT-CAUSE: detail /[id] is a 2nd hand-built editor; /new uses DocumentEditor. Converge.
> Most high-value fixes are SHARED components (parallel-owned). Truly-safe in-domain = the 2 CO page files + CO-service.

## Critic
### Top in-domain priorities
1. CONVERGE the CO detail page onto the /new composition as ONE flagship: edit only apps/web/src/app/(app)/customer-orders/[id]/page.tsx and apps/web/src/app/(app)/customer-orders/new/page.tsx to mount the SAME shared components and the SAME prop wiring (DocumentEditor framework, DocumentHeader, DocumentMetaColumns, PositionTable + PositionInlineAdd + PositionColumnCustomizer + PositionPriceMenu). This single change resolves the high-severity batch: detail read-only header to editable form, 2-col DocumentMetaRow to 3-col DocumentMetaColumns, PositionEditor to PositionTable with Зарезерв/Остаток/Сумма НДС/⚙/Цена▾ columns, missing inline «Добавить позицию» search bar, Уста/Санаси inline in the meta grid, document «Комментарий» as bottom textarea, «Внешний код» collapsed-link pattern. Do NOT modify the shared components themselves; only change which ones the two CO pages compose.

2. Detail «Создать документ ▾» 3→11 items in the LIVE order (Перемещение · Счёт покупателю · Волна отбора · Отгрузка · Входящий платёж · Приходный ордер · Предоплата · Заказ поставщику · Заказ поставщику (с учётом «доступно») · Розничная продажа · Снабжение), all active on a saved order; wire «Входящий платёж» (currently a dead onSelect:undefined) and de-FSM-gate. Build the same 11-item list on /new too. createMenuItems is CO-page-local so this is safe in-domain.

3. Detail Контрагент «Баланс : <amount>» caption + Организация org-account «Сум» sub-row + currency-rate ✎ editor — all already exist on /new and are wired from CO-page state, so they are CO-page-local additions that bring detail to parity.

4. DETAIL «Связанные документы» surface linked payments-in: extend customer-order.service.ts findRelated to also return payments-in (it already returns demands+invoicesOut) and pass linkedPaymentsIn (RelatedDocsTab already supports it). Pure CO backend+page wiring, in-domain.

5. List page: «Статус» column/dropdown/filter use the account custom statusId not the FSM enum — list findMany already drops `status`; add it to the select and route the «Статус» column + StatusChangeDropdown + inline filter through statusId. CO-service + CO list page only (note: status-change-dropdown.tsx may be shared — verify it is CO-local before editing).

### Cross-domain / shared (coordinate, do NOT build alone)
- DataTable.tsx and packages/design-system/src/primitives/index.ts are CURRENTLY dirty in parallel sessions (confirmed via git diff) — the list-page 'layout-fill / table stretches 100%' fix touches DataTable.tsx and MUST NOT be built now; coordinate or defer.
- DetailToolbar (apps/web/src/components/document-detail/detail-toolbar.tsx) is consumed by 48 detail pages — fixing «Изменить» (should be only Удалить·Копировать, remove «Открыть в API»+separator), «Печать» (add account templates·Заказ·Комплект…·Настроить…·Запросить форму, drop «Список заказов»), «Отправить» (mirror print templates not single Email), adding printer/envelope icons, and the editable owner popover are all shared-component edits — coordinate, do not unilaterally rewrite a 48-consumer component for CO alone.
- DocumentToolbar/DocumentHeader/DocumentTotalsPanel (document-editor/*) drive 26 /new pages: the ❓ help-icon placement (left of Проведено, standalone), the hard-coded non-i18n literals (от, Авто, дд.мм.гггг, чч:мм, Проведено fallback), the connected-button-bar vs gap-1 styling, and weight/volume totals rows are shared edits — fix once centrally with all 26 consumers in mind.
- PositionTable.tsx (17 consumers) price cell binds raw tiyin (priceMinor) instead of MoneyInput — this is an app-wide money-display bug, not CO-only; fix in the shared component with a regression guard, coordinate.
- ProductSelectModal (product-select-modal.tsx) gaps — filter panel default-open, 4→15 filter fields, Найти/Очистить/🔖/⚙ button row, «Страна»+Вес/Объём/серийный/НДС columns, two default price-type cols, «Создать ▾» dropdown, in-modal create — is shared by every doc /new that adds positions; treat as its own shared flagship.
- customer-order.service.ts is shared with whatever session may touch sales modules; the list `status` select, findRelated payments-in, and any 11-item create wiring should be committed atomically and the file re-read fresh before editing (multi-agent wiring protocol).

### Needs-live-check
- WHICH DESIGN to clone: the live co-live-pechat/otpravit/izmenit captures show the saved-order detail in moysklad's OLD design (Старый дизайн radio checked, with a «Попробуйте новый дизайн» upsell at ref e7393). Confirm on live whether to mirror the OLD or the NEW design before rebuilding detail — building 1:1 against a design moysklad is deprecating would be wasted work.
- Whether any of the 11 «Создать документ» items are conditionally disabled by FSM/payment/shipment substate on a saved order (capture shows none greyed, but only one order state was sampled).
- List-toolbar (multi-select) «Создать» item set/order — never expanded in the live LIST capture; the detail 11-item menu does not necessarily equal the list bulk-create menu.
- Per-row hover affordances on the position table (kebab «⋮» Дублировать/Удалить vs bare ✕) and on the list grid (row-hover ×/actions) — not in captures.
- Pager real total «1 из N» across all pages and whether the pager renders on direct-URL landing (we cache-derive it; live shows «1 из 30583»).
- «Не отгружено» chip: live header shows «Не оплачено» but no shipment chip on the sampled paid order — need a not-yet-shipped order to confirm whether moysklad ever shows «Не отгружено».
- Price/qty cell exact formatting (grouped, 2-dp, unit suffix) and the canonical single-line delivery-address compose order (two compose functions currently disagree).
- «Восстановить» for a trashed order, «Привязать документ» picker, position-row «Импорт» button, «Проверить комплектацию» real result, and «Создать» in-modal-vs-navigation behaviour — all from-checklist/needs-live, confirm before building.
- Structured «Адрес доставки» form: whether moysklad's expanded form contains a «Комментарий» field inside it (delivery-address-group.tsx is CO-local so this one is safe to build once confirmed).

### Missed / root-cause notes
- ROOT-CAUSE not named: ~25 of the rows (every 'detail differs from /new' across header/meta/positions/footer/toolbar) are ONE architectural defect — detail is a second divergent hand-built editor while /new uses the DocumentEditor framework; moysklad renders ONE form for both. The audit enumerated symptoms field-by-field but never proposed the single convergence fix, risking 25 partial patches and re-divergence.
- Design-version mismatch the captures expose: the live saved-order detail is rendered in moysklad's OLD design (Старый дизайн checked, ref e7393). 'saved detail = same form as /new' is grounded against the OLD form; moysklad is mid-migration to a new design for this doc type.
- Shared-component blast radius mislabeled as 'in-domain': DetailToolbar=48, DocumentEditor=26, PositionEditor=16, PositionTable=17 consumers. Several 'in-domain' rows actually require editing app-wide shared components; the only truly-safe in-domain lever is changing the two CO PAGE files' composition, not the shared components.
- Live capture shows two header elements the audit treats lightly but are real: «Смотрит: Б» (concurrent-viewer presence, ref e6554) and the owner+«Изменения:» both ON the toolbar row (e6550-e6567) — our owner badge is split between toolbar(/new) and a separate header row(/[id]); converging them is part of the same form-convergence.
- Locale-leak class understated: DocumentHeader hard-codes RU/UZ literals (от/Авто/дд.мм.гггг/чч:мм/Проведено/Ожидание) that bypass i18n — RU happens to match so parity 'holds', but a UZ UI would leak RU. This is a shared-component class spanning all 26 /new pages, not a one-off.
- Audit did not flag that detail Адрес-доставки renders the collapsed read-only summary variant because the page omits text/onTextChange props — i.e. the bug is in CO page WIRING, not the DeliveryAddressGroup component (which is CO-local, components/customer-orders/) — making it a clean in-domain fix once design is confirmed.
- No dimension covered keyboard/Enter-to-add behaviour of the inline «Добавить позицию» bar, or the «Еще N»/badge-coloured stock dropdown depth that DEEP-LIVE-SPEC calls out — only its presence was audited.
- Concurrency/save-roundtrip (CLAUDE.md adversarial gate) untouched: none of the rows test what happens on save of a converged detail form (FSM state vs custom statusId reconciliation, posting locking lines, optimistic-version conflict) — Phase-2 QA territory the audit did not enter.

## In-domain gaps by dimension (high+med)

### toolbar
- **[med]** «Создать документ» item ORDER differs from live (/new and /[id])
  - ours: Both pages list demand→invoice→payment. Live order interleaves them: Счет покупателю (2), Отгрузка (4), Входящий платеж (5).
  - moysklad: Fixed live order: Перемещение, Счет покупателю, Волна отбора, Отгрузка, Входящий платеж, Приходный ордер, Предоплата, Заказ поставщику, Заказ поставщику (с учётом «доступно»), Розничная продажа, Снабжение (screenshot 03).
- **[med]** Owner badge on detail is non-interactive (no editable «Владелец» popover) — only /new has it
  - ours: /[id] renders the owner as a static avatar+name+role block in authorSlot ([id]/page.tsx:731-752) with no popover; OwnerAccessPopover is used only on /new (new/page.tsx:1362). Detail save payload never sends ownerId/groupId/shared.
  - moysklad: Live owner badge «Бекзод Н. / Основной ▾» has a ▾ chevron and is clickable (cursor=pointer, co-live-pechat.yml e6551) — the owner/department/shared can be edited on a saved order too.
- **[med]** Detail «Создать документ» items are FSM-gated (disabled) rather than always-enabled save-then-create
  - ours: [id]/page.tsx:559-564,614-621 demand disabled unless state∈{confirmed,awaiting_payment,paid,partially_shipped}; invoice disabled unless ∈{...,fully_shipped}; payment-in onSelect undefined → always disabled.
  - moysklad: Live menu shows all 11 «Создать документ» items active on a saved order regardless of payment/shipment FSM substate (screenshot 03 shows full enabled list on order 03834). NEEDS-LIVE-CHECK whether any are conditionally disabled, but the live capture shows none greyed.
- **[med]** Detail «Создать документ → Входящий платёж» is a dead menu entry
  - ours: [id]/page.tsx:623-630 payment-in item has onSelect: undefined (comment: wired via header «Запросить оплату» instead) → renders permanently disabled.
  - moysklad: Live «Входящий платеж» (position 5) is an active menu item that creates a linked payment-in from the order (screenshot 03).

### header-status
- **[high]** Detail page header is read-only static <h1>, not the editable form moysklad uses
  - ours: apps/web/src/app/(app)/customer-orders/[id]/page.tsx:712-758 renders DetailHeader (apps/web/src/components/document-detail/detail-header.tsx) whose title is a static <h1> «{titlePrefix} № {name} от {formatDate(moment)}» (detail-header.tsx:140-149). The № and date are NON-editable text; there is no № <input>, no «от» date+time field, and no calendar icon on the detail page.
  - moysklad: Real moysklad's saved-order detail is the SAME editable form as /new — screenshot 03-sozdat-menu.png shows «Заказ покупателя № 03834 от 📅 18.06.2026 11…» with the number, date+time and 📅 calendar all inline-editable. FINDINGS.md line 8: «saved order detail = same editable form as /new».
- **[med]** «Не оплачено» pill style differs between detail and /new (and vs moysklad)
  - ours: Detail renders it as a filled amber Badge tone="warning" (apps/web/src/app/(app)/customer-orders/[id]/page.tsx:583-587, pillsSlot), whereas /new renders moysklad's outline ring pill (border + hollow ◯ ring, DocumentHeader.tsx:298-311). The two pages are visually inconsistent with each other.
  - moysklad: moysklad uses an outline pill with a hollow ring «◯ Не оплачено» (FINDINGS.md line 57; DEEP-LIVE-SPEC §2). The /new outline pill matches; the detail Badge does not.
- **[med]** Detail header «Запросить оплато» rendered as a small bordered <button> not the standard header outline button
  - ours: Detail builds a bespoke inline button in pillsSlot (apps/web/src/app/(app)/customer-orders/[id]/page.tsx:588-597, px-2 py-0.5 text-xs) rather than the shared DocumentHeader request-payment button (DocumentHeader.tsx:312-325, h-[26px] px-2.5 text-sm). Smaller/different from /new and from moysklad's ~26px outline button.
  - moysklad: moysklad shows «Запросить оплату» as a normal outline button (~26px, padding ~10px, dark text) to the right of «Не оплачено», identical on /new and detail (it is the same form). DEEP-LIVE-SPEC §2.

### meta-fields (3-column meta block: Организация/Контрагент/dates/channel/currency/custom-fields/Склад/Договор/Проект/accounts/Адрес доставки/Комментарий)
- **[high]** DETAIL/[id] meta uses 2-column paired DocumentMetaRow, not the 3-column DocumentMetaColumns fill that /new uses
  - ours: apps/web/src/app/(app)/customer-orders/[id]/page.tsx:775-959 wraps fields in <DocumentMetaPanel>+<DocumentMetaRow> (label/widget/label/widget pairs); /new uses <DocumentMetaColumns>/<DocumentMetaColumn> (3 independent columns) at new/page.tsx:796-1070. The two pages have visibly different meta layouts.
  - moysklad: FINDINGS.md line 8: «saved order detail = same editable form as /new». The detail edit form must be the identical 3-column meta block (Орг/Контр/План.дата/Канал/Валюта | Склад/Договор/Проект/Счёт контр. | Адрес/Комментарий).
- **[high]** DETAIL Организация / Контрагент / Склад pickers have NO inline type-to-filter (modal-only)
  - ours: [id]/page.tsx:778-815 (org), 818-828 (agent), 804-815 (store) use <CatalogPickerField> with only onPick→setOpenPicker (legacy button→modal); they pass NO inlineFetcher/onInlineSelect. /new passes inlineFetcher+onInlineSelect on every one (new/page.tsx:820-841 org, 854-877 agent, 973-990 store), giving type-to-autocomplete.
  - moysklad: Every reference field is an editable input: typing opens an inline autocomplete dropdown (name + phone/code), modal is secondary. DEEP-LIVE-SPEC §0-A, §4 (from-checklist; primary interaction model).
- **[med]** DETAIL Контрагент has no «Баланс : <amount>» caption
  - ours: [id]/page.tsx:817-829 agent field renders no helper. /new shows it via helper at new/page.tsx:846-852 (tDetailHeader('balance') + formatMoney(agentBalanceMinor)). No counterparty-balance query exists on the detail page.
  - moysklad: «Баланс : 0,00 сум» caption under Контрагент. DEEP-LIVE-SPEC §3 left-column; detail audit S6 lists it as missing.
- **[med]** DETAIL Организация has no org-account «Сум» sub-row under the field
  - ours: [id]/page.tsx:777-803 organization field has no sub-row/helper; the organizationAccount picker lives in a SEPARATE later row (902-920) labelled «Счёт организации». /new nests it as the org field's helper (new/page.tsx:801-818) directly under Организация with currency placeholder «Банк. счёт (сум (UZS))».
  - moysklad: Org-account dropdown («Сум») sits immediately UNDER the Организация picker as a sub-row. DEEP-LIVE-SPEC §3 left-column; checklist #19.
- **[med]** DETAIL has no ✎ edit-pencil on Организация / Контрагент / Склад
  - ours: [id]/page.tsx org(778-802)/agent(819-828)/store(805-814) CatalogPickerField calls pass no onEdit/editLabel. /new passes onEdit (open entity in new tab) on org (829-834), agent (863-868), store (982-985).
  - moysklad: Each of Орг/Контр/Склад shows a ✎ edit-pencil that opens the linked entity for editing. DEEP-LIVE-SPEC §3 «[✕] [✎]» pattern; checklist #18/#22/#37.
- **[med]** DETAIL Контрагент / Договор / Проект / Канал продаж have no «+ new» quick-create
  - ours: [id]/page.tsx agent(819-828), contract(830-842), project(856-867), salesChannel(870-886) pass no onCreate/createLabel. /new passes onCreate on agent (875-876) and project (1022-1023).
  - moysklad: Контрагент/Договор/Проект/Канал продаж each carry a «+» create affordance. DEEP-LIVE-SPEC §3 «[+ create]» pattern; checklist #23/#39/#41/#28.
- **[high]** DETAIL «Уста» (reference custom field) and «Санаси» (date custom field) are NOT inline in the 3-col meta grid
  - ours: [id]/page.tsx renders all custom fields via <AttributesEditor> in a separate FormSection at the BOTTOM of the page (1082-1090). /new renders them inline in their own aligned 3-col row inside the meta block (new/page.tsx:760-781, 1076-1082), positioned like the live account (Уста left, Санаси middle).
  - moysklad: Уста (type=Контрагент, inline counterparty picker) and Санаси (date) sit INSIDE the meta block: «Уста [+] · Санаси [📅]» on one row in the left column. DEEP-LIVE-SPEC §3, §0-B; FINDINGS «Уста(custom) · Санаси(custom)» in the meta line.
- **[med]** DETAIL «Адрес доставки» renders the collapsed summary-button variant, not the editable textarea + ▾ that /new uses
  - ours: [id]/page.tsx:951-956 passes <DeliveryAddressGroup> WITHOUT text/onTextChange, so delivery-address-group.tsx:105-119 falls back to the read-only summary <button> collapsed view. /new passes text+onTextChange (new/page.tsx:1047-1052) → the editable multi-line textarea + ▼ (delivery-address-group.tsx:81-104).
  - moysklad: Адрес доставки is an editable textarea you type into directly, with a ▼ that expands the structured helper. DEEP-LIVE-SPEC §3 right-column, §0; FINDINGS «Адрес доставки».
- **[med]** DETAIL document «Комментарий» is a single-line <Input> in the meta block, not the big bottom textarea /new uses
  - ours: [id]/page.tsx:940-947 renders description as a full-width single-line <Input> inside DocumentMetaPanel. /new puts the document Комментарий as a large 3-row <Textarea> in the bottom band under the position table (new/page.tsx:1181-1188) plus a small address-widget comment textarea in col3 (1058-1067).
  - moysklad: The document Комментарий is a LARGE textarea below the positions table (x40,w823); col3 only holds the address-widget comment. DEEP-LIVE-SPEC §0-C, §8 (the bottom comment); FINDINGS «Комментарий» bottom.
- **[med]** DETAIL currency rate ✎ edit is missing (no «1 USD = … UZS [✎]» helper)
  - ours: [id]/page.tsx:887-899 currency is a bare <NativeSelect> with no rate helper/editor. /new shows the editable rate line for non-UZS currency (new/page.tsx:903-953: «1 {cur} = <rate> UZS» + ✎ + ↺ reset).
  - moysklad: Валюта документа shows a ✎ to edit the exchange rate when a non-base currency is chosen. DEEP-LIVE-SPEC §3 «Валюта документа [✎ kurs]»; checklist #30.

### positions-table
- **[high]** Detail/[id] positions use a completely different component (PositionEditor) than /new (PositionTable) — divergent layout, columns and behaviours between create and edit
  - ours: apps/web/src/app/(app)/customer-orders/[id]/page.tsx:1003 renders <PositionEditor> (packages/design-system/src/patterns/PositionEditor.tsx), a CSS-grid editor with columns №/Product/Кол-во/Цена/Скидка/НДС/Сумма (PositionEditor.tsx:241-253). /new instead uses <PositionTable> (PositionTable.tsx) with the full moysklad column set. The two screens are not the same table.
  - moysklad: moysklad shows the SAME positions grid on a new order and a saved/edited order (the saved-order detail IS the editable form). Columns this account: #, Наименование▾, Кол-во, Зарезерв., Остаток, Цена▾, НДС, Сумма НДС, Скидка, Сумма⚙.
- **[high]** Detail positions table is missing the Зарезерв., Остаток and Сумма НДС columns
  - ours: [id]/page.tsx:1003 PositionEditor mode defaults to 'full' which only renders Product/Кол-во/Цена/Скидка/НДС/Сумма (PositionEditor.tsx:247-254); there is no reserve/stock/vatAmount column and no way to add them.
  - moysklad: This account's saved-order positions grid shows Зарезерв. + Остаток + Сумма НДС columns by default (FINDINGS column list).
- **[high]** Detail positions table has no «Сумма ⚙» column-customizer
  - ours: [id]/page.tsx never renders PositionColumnCustomizer; PositionEditor has no customizer affordance. Only /new wires it (new/page.tsx:363-369).
  - moysklad: The «Сумма» header carries a ⚙ that toggles optional columns (Изображение/Ед.изм/Отгружено/Доступно/Остаток/Резерв/Ожидание/Вес/Объём/Сумма НДС) on every order view including saved/edit.
- **[high]** Detail positions table has no «Цена ▾» bulk menu (Расценить / Сохранить цены)
  - ours: [id]/page.tsx does not import or render PositionPriceMenu; PositionEditor's price column header is a plain label (PositionEditor.tsx:249). Only /new wires PositionPriceMenu (new/page.tsx:341-350).
  - moysklad: Цена column header has a ▾ opening a bulk menu: Расценить (re-price all rows by price-type) + Сохранить цены (push row prices back to products).
- **[med]** Detail positions table has no drag-to-reorder
  - ours: PositionEditor renders rows as a static grid with no drag handle / onReorder (PositionEditor.tsx:260-374). Only /new's PositionTable supports onReorder (new/page.tsx:1103-1110, PositionTable.tsx:279-312).
  - moysklad: Position rows can be drag-reordered (deep-spec checklist #66 «qator: drag»).
- **[med]** Detail row delete is a bare ✕ ghost button, not the per-row kebab «⋮» menu (Дублировать/Удалить) that /new shows
  - ours: PositionEditor row delete = ghost icon button with Icons.close (PositionEditor.tsx:361-371), no duplicate action, no kebab. /new's PositionTable row uses a DropdownMenu kebab with Дублировать + Удалить (PositionTable.tsx:707-738).
  - moysklad: moysklad row actions appear on hover at the row end; row removal + duplication available. (Exact affordance not in FINDINGS.)
- **[med]** «Наименование ▾» column-header menu is absent on both /new and detail
  - ours: name column header is a plain label: new/page.tsx:332 cols.push({ key:'name', label: tCols('name') }); PositionTable renders it as static text (PositionTable.tsx:374). No dropdown/caret. Detail header is plain too.
  - moysklad: deep-spec §6 + checklist #56 list «Наименование ▾» as a column menu; FINDINGS column list shows «Наименование ▾» with a caret. Exact menu contents NOT walked live (FINDINGS honest-status §90 lists position «Наименование▾» as un-walked).
- **[med]** Read-only stock-cluster cells (Остаток/Зарезерв.) are only ever populated at add-time, not refreshed and not shown on detail
  - ours: /new only sets row.stock/row.reserve when a product is added (new/page.tsx:1154-1155, 1469-1471) from the search payload; PositionTable renders them read-only (PositionTable.tsx:617-620). On detail, formFromData (page.tsx:187-197) never carries stock/reserve, and PositionEditor has no such columns, so even if shown they would be blank.
  - moysklad: Остаток/Зарезерв. reflect the live store stock per product row at view time, on both new and saved orders.
- **[med]** Bulk-selected rows delete via a generic «Удалить (N)» footer button; no select-checkbox column on detail
  - ours: PositionTable supports select column + bulk-delete footer (PositionTable.tsx:446-457) and /new wires selectedIds (new/page.tsx:1113-1114). The detail PositionEditor has NO selection column or bulk delete at all (PositionEditor.tsx — no select/checkbox).
  - moysklad: Saved-order positions grid has the leading ☐ select column (FINDINGS column list starts with #/select context; checklist #54 select-all).

### position-add-footer
- **[high]** DETAIL/[id] editor has NO inline «Добавить позицию — введите наименование, код, штрихкод или артикул» type-to-add search bar
  - ours: apps/web/src/app/(app)/customer-orders/[id]/page.tsx:1003-1045 renders PositionEditor + only two buttons («Добавить из справочника» line 1025-1034, «Проверить комплектацию» line 1035-1044). It never mounts PositionInlineAdd, so on a saved order you cannot type a name/code/barcode to append a row — you must open the modal. /new has it (new/page.tsx:1116 footerToolbar=<PositionInlineAdd …>).
  - moysklad: FINDINGS.md line 8: «saved order detail = same editable form as /new» — the editable detail form is identical to /new, including the inline «Добавить позицию» search bar with stock-badge dropdown, «Еще N», «Создать».
- **[med]** «Проверить комплектацию» does not actually check bundle completeness
  - ours: On /new (new/page.tsx:1161-1170) onCheckCompleteness only toasts an error when there is no store or no positions, then returns — it performs NO completeness computation/result. On detail (page.tsx:1035-1044) the button is permanently `disabled` with title=coming_soon.
  - moysklad: moysklad runs a stock-availability/комплектация check against the chosen store and shows a result (which positions are short). Button is functional on a real order.
- **[med]** Document «Комментарий» on DETAIL is a single-line Input in the meta panel, not the large textarea below the positions table
  - ours: detail [id]/page.tsx:940-947 renders description as <Input> inside DocumentMetaPanel (fullWidth meta row). /new correctly uses a 3-row <Textarea> below the position table (new/page.tsx:1181-1188) + a mirror in the meta column.
  - moysklad: DEEP-LIVE-SPEC §0-C/§8 + FINDINGS.md line 58-59: the document «Комментарий» is a LARGE textarea below the positions (x40 w823); the meta-column comment is the address-widget comment. Same on the saved-order editable form.

### list-page (customer-orders)
- **[high]** Статус column renders FSM-state Badge + derived «paid» pill, NOT the account's custom status name
  - ours: page.tsx:471-502 — the `state` column maps `o.state` through `tStates(...)` (draft/confirmed/…) and appends a green «paid» pill when payed>=sum. It does NOT show a custom status. Root cause: list API `findMany` (apps/api/src/modules/customer-order/customer-order.service.ts:68-79) selects agent/organization/store/owner/_count but NOT `status`, so the row never carries the custom status. The detail findById (service.ts:98) DOES select `status:{id,name,color}` — proving the FK exists and is wired on detail but dropped on the list.
  - moysklad: LIVE list Status column shows the account's coloured custom statuses verbatim: row e710 «Текширилмаган» (red), e767 «Туланди Накт», another row «Напечатан». These are per-account State DATA (provenance: admin-created in Настройки), not the FSM enum.
- **[high]** StatusChangeDropdown («Статус ▾») sends FSM state slug, not the account's custom statusId; its doc-comment is stale (claims «CustomerOrder has no statusId FK»)
  - ours: status-change-dropdown.tsx:25-34 comment asserts no statusId FK and renders a fixed FSM ORDER_STATES list (lines 44-53), bulk-applying `target:<state>` via /bulk-transition (lines 100-120). But the schema/service prove statusId exists (service.ts:98, 248, 345-346 connect/disconnect status). So the quick-set dropdown cannot set the real custom statuses the user sees on the list.
  - moysklad: LIVE toolbar «Статус» (e333) opens a colour-square popup of the account's custom CO statuses (same set shown in the column: Текширилмаган/Туланди Накт/Карз…), applying the chosen custom status to selected rows.
- **[med]** Inline-filter «Статус» field is an FSM-enum dropdown, not a custom-status picker
  - ours: page.tsx:1108-1134 — the «Статус» filter is a NativeSelect over the 8 FSM states (draft…cancelled) via tStates. Backend filters `state` (service.ts:946).
  - moysklad: LIVE inline filter «Статус» (e489-e492) is a «По умолчанию содержит»-mode field that filters on the account's custom statuses, not the FSM enum.
- **[med]** Default visible columns diverge from the live account: «Валюта» and «Не оплачено» are hidden by default but live shows them; «Зарезервировано» is shown by default but live account does not
  - ours: page.tsx:272-294 default-visible set = name,moment,agent,organization,sum,invoicedSum,payedSum,shippedSum,reservedSum,state,published,printed,description. Explicit comments exclude `currency` (page.tsx:380-393 col exists but not default) and `unpaidSum` (page.tsx:284-286 deliberately not default).
  - moysklad: LIVE list header row e590 = «№·Время·Контрагент·Организация·Сумма·Валюта·Выставлено счетов·Оплачено·Не оплачено·Отгружено·Статус·Отправлено·Напечатано·Комментарий». Валюта (e618) + Не оплачено (e633) ARE present; Зарезервировано is NOT. (Column set is account/customizer-dependent, but this is the user's real account.)
- **[med]** «Отгружено» filter missing the «Просрочено» (overdue) option; label forms differ
  - ours: page.tsx:726-747 shipped_status select offers only empty/unshipped/partial/shipped (ru.json:439-441 «Не отгружен / Частично отгружен / Полностью отгружен»). No overdue option.
  - moysklad: LIVE «Отгружено» combobox (e433) options = «Отгружено · Частично отгружено · Не отгружено · Просрочено» — 4 options incl. Просрочено (overdue), and verb-noun label forms.
- **[med]** «Создать» (create-related) list dropdown item set unverified against the live LIST toolbar
  - ours: create-related-dropdown.tsx:69-111 items = Заказ поставщикам, Заказ поставщикам (с учётом «доступно»), Волна отбора (disabled), Отгрузки, Приходные ордеры, Входящие платежи, Снабжение (disabled) — 7 items; several navigate to blank /new (no from-CO pre-fill, lines 16-18).
  - moysklad: FINDINGS §13 documents the DETAIL «Создать документ» as 11 items (Перемещение/Счёт покупателю/Волна отбора/Отгрузка/Входящий платёж/Приходный ордер/Предоплата/Заказ поставщику ×2/Розничная продажа/Снабжение). The list-toolbar «Создать» (multi-select) item set was NOT expanded in the live LIST capture — needs its own walkthrough to confirm exact items/order.

### detail-extras (customer-order /[id] detail page specifics)
- **[high]** «Создать документ ▾» offers only 3 downstream docs (Отгрузка · Счёт покупателю · Входящий платёж) of moysklad's 11
  - ours: createMenuItems builds only demand / invoice-out / payment-in — [id]/page.tsx:606-631; passed to DetailToolbar at :703
  - moysklad: 11 items: Перемещение, Счет покупателю, Волна отбора, Отгрузка, Входящий платеж, Приходный ордер, Предоплата, Заказ поставщику, Заказ поставщику (с учетом «доступно»), Розничная продажа, Снабжение (FINDINGS.md:13-25). 3 done, 8 missing.
- **[med]** «Создать документ → Входящий платёж» item is a dead no-op on detail
  - ours: payment-in createMenuItem has onSelect: undefined → rendered disabled — [id]/page.tsx:623-630 (comment says it is a placeholder; payment-in is reachable only via the header «Запросить оплату» button at :589-597)
  - moysklad: On a saved order «Входящий платеж» in «Создать документ» is active and creates a payment-in pre-linked to the order (FINDINGS.md:17).
- **[med]** No editable owner / «Основной ▾» popover in the detail toolbar (detail shows a read-only author block only)
  - ours: Detail renders a static authorSlot: Avatar + owner name + «Основной» tag + «Изменения: <name> <date>» caption, no dropdown/edit — [id]/page.tsx:724-756. The /new page DOES render an editable <OwnerAccessPopover> via rightSlot (new/page.tsx:1362), so detail is behind /new.
  - moysklad: Detail toolbar shows an editable owner control «Бекзод Н. / Основной ▾» (a popover with Владелец/Доступ), FINDINGS.md:10.
- **[med]** «Связанные документы» never surfaces linked payments-in
  - ours: RelatedDocsTab supports linkedPaymentsIn (related-docs-tab.tsx:49,64) but [id]/page.tsx passes only linkedDemands + linkedInvoicesOut (:982-997); the backend findRelated only returns demands + invoicesOut (customer-order.service.ts:181-209), never payments-in.
  - moysklad: moysklad's «Связанные документы» diagram includes incoming payments (Входящий платеж) linked to the order — FINDINGS.md «Создать документ» includes Входящий платеж as a downstream doc; the related diagram shows all created downstream docs.
- **[med]** No «Восстановить» action for a trashed (deleted) order
  - ours: Delete sets deletedAt and redirects to the list (customer-order.service.ts:479 `data:{deletedAt:new Date()}`; [id]/page.tsx:362-368). There is no restore endpoint (grep restore/Восстановить in customer-order.service.ts + controller = none) and the detail page has no «Восстановить» UI; every read filters deletedAt:null so a trashed order is unreachable.
  - moysklad: moysklad keeps deleted docs in «Корзина»; opening a trashed order shows «Восстановить» on the detail toolbar (task FOCUS lists «Восстановить» for trashed). Not in FINDINGS.md.
- **[med]** Position table action row missing «Импорт» (and «Привязать документ») buttons present in moysklad
  - ours: Under the position table we render only «Добавить из справочника» + «Проверить комплектацию» (disabled) — [id]/page.tsx:1024-1045
  - moysklad: moysklad's position action row = Добавить из справочника · Проверить комплектацию · Импорт · Привязать документ (customer-orders-detail.audit.md S8).
- **[med]** Detail layout uses a different toolbar component than /new (DetailToolbar vs DocumentEditor), causing toolbar-behaviour drift between the two screens
  - ours: Detail wraps the page in DetailToolbar+DetailHeader (document-detail/*) — [id]/page.tsx:684-758; /new uses the DocumentEditor framework with footerToolbar + modifyMenu/createDocMenu/printMenu/sendMenu + rightSlot OwnerAccessPopover — new/page.tsx:1115,1286-1362. The two render different menus (e.g. /new offers «Заказ» in print/send, has the owner popover; detail does not).
  - moysklad: moysklad uses the same editable form + identical toolbar for a saved order detail and /new (FINDINGS.md:8 «saved order detail = same editable form as /new»), differing only by gating (on /new menus say «save first»).

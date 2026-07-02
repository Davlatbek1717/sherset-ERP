# customer-orders/[id] — detail page parity audit

- **Module:** `customer-orders` detail/edit page (`apps/web/src/app/(app)/customer-orders/[id]/page.tsx`)
- **Date:** 2026-06-01
- **Protocol:** v2.2 detail-page audit (FIRST detail page audited — methodology template for the other 61)
- **Reference:** `docs/moysklad-reference/visual-captures/03-module/customerorder/`
  (screenshots `d-default.png`, `d-tab-svyazannye-dokumenty.png`, `i-dropdown-*`; DOM `dom/68-edit-default.html`,
  `dom/73-77-edit-tab-*`, `dom/81-detail-default.html`; `meta/*.json`, `manifest.json`)
- **Method:** 6-dimension parallel fact-gathering workflow (`scripts/wf-customer-order-detail-audit.js`,
  run `w8klq76na`, 6 agents) → operator (Opus) judged each delta. Locale compared = **Russian** (reference is RU;
  our labels resolved via `apps/web/src/messages/ru.json`).

## Verdict

Our customer-order detail page is **structurally strong** — toolbar, header, meta-field labels, and totals
labels are largely byte-parity with moysklad. The audit surfaced one **systemic bug-class** (the highest-value
finding) plus a set of label/structure deltas, several of which are shared-component issues affecting all
document detail pages — not just customer-order.

**🔴 Systemic bug-class (shared components, ~14 detail pages):**
1. **Position table renders in Uzbek even in RU locale.** The shared `<PositionEditor>` (`@moysklad/ui`) is
   locale-agnostic and falls back to hardcoded Uzbek `DEFAULT_LABELS` (Tovar/Miqdor/Narx/Skidka/NDS/Jami).
   13/14 document detail pages pass no `labels` prop (only `inventories` passes a partial one), so the column
   headers + add-button + footer leak Uzbek into the Russian UI.
2. **Duplicate totals.** In `full` mode `<PositionEditor>` renders its own grand-total footer; pages that also
   render `<DetailTotalsSidebar>` (12 pages) therefore show **two** totals blocks; moysklad shows one.
3. **`<AttributesEditor>` section title hardcoded Uzbek** («Qo'shimcha maydonlar» / «N ta maydon»), not i18n.

These three are fixed at the shared-component level this session (see "Fixed"), with customer-orders fully wired
as the proof; the other 12 pages need the same one-line wiring (see "Deferred — systemic sweep").

---

## A. Structural

Layout / structure / presence deltas (tabs, field set, columns, sections, toolbar layout).

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| S1 | **Tab 1 label** | «Главная» | «Позиции» | delta | high | **FIXED** — page now passes `positionsLabel={tDetailTabs('main')}` → «Главная» |
| S2 | Tab 2 | «Связанные документы» | «Связанные документы» | match | — | — |
| S3 | «Файлы» surface | inline collapsible at bottom of «Главная» (with files table) | a 4th top-level **tab** | extra_in_ours | med | DEFERRED — restructure to inline section (shared `DetailContentTabs`); affects all doc details |
| S4 | «История» surface | no tab; audit shows as a «События» hyperlink | a top-level **tab** «История» | extra_in_ours | med | DEFERRED — «События» link target not captured; keep История tab until verified (functional superset) |
| S5 | «Задачи» section | inline collapsible (bottom) | inline collapsible (bottom) | match | — | parity ✓ |
| S6 | Контрагент «Баланс: 0.00 сум» sub-line | shown under Контрагент picker | absent | missing_in_ours | med | DEFERRED — needs counterparty balance fetch (backend) |
| S7 | Position table columns | 16 (Наименование/Кол-во/Кол-во б. ед./Принято/Доступно/Остаток/Резерв/Ожидание/Вес/Объём/Цена/НДС/Сумма НДС/Скидка/Сумма + Удалить) | 7 (product/qty/price/discount/vat/lineTotal + remove) | missing_in_ours | med | DEFERRED — stock columns (Доступно/Остаток/Резерв/Ожидание/Принято) need live stock data per row (backend); Вес/Объём/Сумма НДС/Кол-во б.ед. are presentational |
| S8 | Position action buttons | Добавить из справочника · Проверить комплектацию · **Импорт** · **Привязать документ** | Добавить из справочника · Проверить комплектацию (disabled) | missing_in_ours | med | DEFERRED — Импорт + Привязать документ not wired |
| S9 | Totals rows | Промежуточный итог/НДС/Цена включает НДС/Итого + **Прибыль**/**Вес**/**Объём**/Кол-во | Промежуточный итог/НДС/Цена включает НДС/Итого/Кол-во | missing_in_ours | med/low | DEFERRED — Прибыль (profit) + Вес/Объём totals absent in `DetailTotalsSidebar` |
| S10 | Duplicate totals footer | one totals block (right column) | PositionEditor footer **+** DetailTotalsSidebar = two | extra_in_ours | med | **FIXED** — added `hideTotals` prop to PositionEditor; customer-orders passes it |
| S11 | Meta field set | (no org/agent bank-account pickers in default form) | adds «Счёт организации» + «Счёт контрагента» | extra_in_ours | med | DEFERRED — verify against a fuller moysklad capture before removing (may live under «показать ещё») |
| S12 | Meta field geometry | left/right column stacks + right-side textareas | sequential 2-up rows, textareas full-width bottom | delta | low | DEFERRED — same field set, different pairing; low parity impact |
| S13 | Files table columns | Наименование · Размер, МБ · Дата добавления · Сотрудник (4) | Файл · Размер · Загружено · Загрузил · **Действия** (5) | delta | med | DEFERRED — label + column-count deltas in shared `AttachmentsSection` (tied to S3) |

## B. Interactive

Behaviours, action labels, dropdown items, state controls.

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| I1 | Toolbar Save | «Сохранить» | «Сохранить» | match | — | — |
| I2 | **Toolbar Close** | «Закрыть» | «Назад» | delta | high | **FIXED** — `DetailToolbar` now uses `common.close` → «Закрыть» (shared, all detail pages) |
| I3 | Prev/next pager | «1 из 27295» | «1 / 27295» | delta | med | DEFERRED — needs «из» separator + uz word-order handling (uz convention not captured) |
| I4 | Изменить / Создать документ / Печать / Отправить triggers | all 4 present | all 4 present, exact labels | match | — | — |
| I5 | Изменить dropdown items | not captured (detail-page menu never expanded) | Копировать · Открыть в API · Удалить | uncertain | med | NEEDS-CAPTURE — i-dropdown-* refs are LIST-page bulk menus, not detail-page menus |
| I6 | Создать документ items | not captured | Отгрузки · Счёт покупателю · Входящие платежи (disabled) | uncertain | med | NEEDS-CAPTURE — also our «Отгрузки» is plural (list label); single downstream doc should read «Отгрузка» |
| I7 | Печать items | not captured for detail | Список заказов · Настроить... | uncertain | med | NEEDS-CAPTURE — moysklad detail print usually adds «Заказ» (order_form) + «Комплект…»; also «Настроить...» uses ASCII «...» not «…» (Unicode bug-class, backlog #9) |
| I8 | Отправить items | not captured | По электронной почте | uncertain | low | NEEDS-CAPTURE |
| I9 | «Проведено» checkbox | ☑ Проведено | ☑ Проведено | match | — | — |
| I10 | Author block | avatar + name + «Основной» (securityAttrEditor) — **corrected 2026-06-04: NO «Изменено: <name> <date>» caption exists in the gold capture** (0 «Изменено»; the «Изменения» present is the audit-log/«События» row [S4], a different element/role). Our app renders «Обновлено»/«Автор». | avatar+name layout matches; neither side has a modified-by caption | match (avatar+name+«Основной» only) | — | — |
| I11 | Title format | «Заказ покупателя № NNNN от DD.MM.YYYY HH:MM» | same (incl. U+2116 «№», «от», date shape) | match | — | byte-parity ✓ |
| I12 | Payment chip | «Не оплачено» + «Запросить оплату» | «Не оплачено» + «Запросить оплату» | match | — | — |
| I13 | Shipment chip | (no «Не отгружено» chip in this capture) | «Не отгружено» badge before status pill | extra_in_ours | med | DEFERRED — may be state-conditional in moysklad; verify before removing |
| I14 | Inline status pill + dropdown | colored status control (tenant custom statuses shown) | colored DropdownMenu, 8 FSM states + swatches | uncertain | low | NEEDS-CAPTURE — reference shows tenant CUSTOM statuses (Текширилмаган…); moysklad DEFAULT RU state labels/colors not observable |
| I15 | Position table labels (locale) | RU column headers | **Uzbek** (DEFAULT_LABELS) | delta | high | **FIXED** — `usePositionEditorLabels()` hook resolves RU/UZ from `position_editor` namespace; customer-orders wired |
| I16 | «Добавить из справочника» / «Проверить комплектацию» | both functional | labels match; «Проверить комплектацию» hard-disabled («скоро») | delta | med | DEFERRED — bundle backend not landed |
| I17 | «Задачи» add button | «+ Задача» (glyph + text) | «+ Задача» where «+» is in the i18n string AND a create icon → double «+» | delta | med | DEFERRED — drop the «+» from the string OR the icon |
| I18 | «Файлы» add affordance | «+ Файл» button | dropzone «Перетащите файл…» | delta | med | DEFERRED (tied to S3/S13) |
| I19 | Custom-attributes section title | not visible (demo order has none) | **was hardcoded Uzbek** «Qo'shimcha maydonlar» | delta | med | **FIXED** — `AttributesEditor` now uses `attributes.section_title` / `field_count` i18n (RU «Дополнительные поля») |
| I20 | Currency option format | «сум (UZS)» (name-then-code) | «UZS (сум)» (code-first), fixed 4-currency list | delta | low | DEFERRED — verify full option set vs a live capture |

---

## Fixed (commit c68dd11a)

| Ref | Fix | Files | Scope |
|---|---|---|---|
| I15 + B-systemic | RU position-table labels via locale-aware hook | new `apps/web/src/hooks/use-position-editor-labels.ts`; `position_editor` namespace in `ru.json`+`uz.json`; wired into customer-orders | shared hook (reusable by all 13 leaking pages) |
| S10 | `hideTotals` prop to suppress duplicate PositionEditor footer | `packages/design-system/src/patterns/PositionEditor.tsx` (+ customer-orders passes `hideTotals`) | shared |
| I2 | Close button «Назад» → «Закрыть» | `apps/web/src/components/document-detail/detail-toolbar.tsx` (`common.back`→`common.close`) | shared — **all** detail pages |
| S1 | Tab 1 «Позиции» → «Главная» | customer-orders page `positionsLabel={tDetailTabs('main')}` | scoped (used existing override; default unchanged pending per-doc verification) |
| I19 | AttributesEditor Uzbek title → i18n | `apps/web/src/components/attributes-editor.tsx`; `attributes` namespace ru+uz | shared |

**Gates:** typecheck 8/8 · biome clean (also cleared 2 pre-existing issues in attributes-editor.tsx) ·
web 1214 tests pass · @moysklad/ui 118 tests pass (incl. PositionEditor 16) · all referenced i18n keys verified
present in both ru.json + uz.json. **HALOL qoldiq:** not browser-smoked — these are pure i18n/label/prop changes
(no guard/DI/schema), well-covered by typecheck + unit tests + key-existence check; a live render of an order with
positions + custom attributes would be the final confirmation.

## Done — systemic sweep (2026-06-01, same session)

The shared fixes above were swept across the **other 13 document detail pages** that render `<PositionEditor>`,
via workflow `position-editor-i18n-sweep` (one edit + one adversarial structural verify per page), then gated
centrally: **web typecheck 0 · biome clean · web 1214 tests pass** (no regression). Every page received
`labels={usePositionEditorLabels()}`; the 8 full-mode pages (those with a `<DetailTotalsSidebar>`) also received
`hideTotals` to drop the duplicate footer.

| Pages | Mode | Change |
|---|---|---|
| demands · supplies · invoices-out · invoices-in · purchase-orders · purchase-returns · sales-returns · internal-orders | full | `labels` + `hideTotals` |
| moves · losses | qty-only | `labels` |
| enters | qty-cost | `labels` (incl. `costPerUnit`) |
| processings | qty-only (×2 editors) | `labels` on both |
| inventories | qty-only | `labels` merged → `{ ...positionLabels, quantity: t('actual_qty') }` |

**Correction:** `processing-orders/[id]` was named in the original target list but renders **no** `<PositionEditor>`
(custom read-only BOM card + `FulfilmentProgress` + `ProcessingOpsList`) — it is **out of scope** for this
shared-component fix, so the real sweep count is **13**, not 12. (It does carry its own hardcoded-Uzbek strings —
a separate per-page issue for its future detail audit, same as `processings`.) **HALOL:** not browser-smoked —
pure i18n/label/prop changes, covered by typecheck + 1214 unit tests + per-page adversarial structural verify;
a live render of each doc with positions would be the final confirmation.

## Deferred — per-page parity work (needs design/backend)

- **S7** position stock columns (Доступно/Остаток/Резерв/Ожидание/Принято) — need per-row live stock (backend).
- **S6** Контрагент balance sub-line — counterparty balance fetch.
- **S8** «Импорт» + «Привязать документ» position actions.
- **S9** Прибыль / Вес / Объём totals.
- **S3 + S13 + I18** «Файлы» → inline collapsible + RU column labels (Наименование/Размер, МБ/Дата добавления/Сотрудник), drop «Действия» column — shared `DetailContentTabs` + `AttachmentsSection` restructure.
- **I3** pager «из» separator (resolve uz word-order).
- **I7** print «…» Unicode + missing detail print items (order_form/Комплект…) — links to backlog #9.
- **I17** «+ Задача» double-plus.

## Needs live capture (cannot judge from current reference)

The detail-page action dropdowns (**Изменить / Создать документ / Печать / Отправить** — I5–I8) were never
captured expanded; the `i-dropdown-*` refs are LIST-page bulk menus. The inline **status dropdown** default RU
labels/colors (I14) are masked by this tenant's custom Uzbek statuses. A focused live capture of the
customer-order detail page (expand each toolbar dropdown + the status control on a default-workflow order) would
close I5–I8 and I14. The shipment chip (I13) and extra Счёт fields (S11) also need a fuller/again capture to
confirm whether they are state-conditional / behind «показать ещё».

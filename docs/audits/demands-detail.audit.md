# demands/[id] — detail page parity audit

- **Module:** `demands` detail/edit page (`apps/web/src/app/(app)/demands/[id]/page.tsx`)
- **Date:** 2026-06-01
- **Protocol:** v2.2 detail-page audit (2nd detail page audited; methodology template = `customer-orders-detail.audit.md`)
- **Reference:** `docs/moysklad-reference/visual-captures/03-module/demand/`
- **Method:** 6-dimension parallel fact-gathering workflow (`demands-detail-audit`, run `w8xz8ty43`, 6 agents) →
  operator (Opus) judged each delta. Locale compared = **Russian** (reference is RU; our labels resolved via `ru.json`).

## ⚠️ Reference-capture defect (read first — affects all 03-module detail audits)

**The demand reference screenshots are unusable for visual parity.** Every demand edit/detail PNG (`45-edit-default`,
`50-edit-tab-positions`, `58-detail-default`, and the `i-*` interactive set) renders the **«Корзина» (trash) list
page with a stuck «Сохранение изменений» (unsaved-changes) modal** — the edit form was never reached. The dropdown
meta JSONs are also corrupt (each lists a single stray item «Показатели»). The sibling `customerorder` edit-default
meta is corrupted the same way (`h1:"Корзина…"`). **This is a systemic 03-module *edit*-capture bug** (the capture
script never dismissed the save-modal before snapshotting the edit form), not demand-specific.

**Consequence:** confident findings come from **(1) the 630 KB DOM text** (which does hold the real demand edit-form
strings), **(2) our own code** (self-evident config bugs), and **(3) the one clean sibling capture**
`customerorder/screenshots/59-detail-default.png`. Pixel layout, exact dropdown contents, and field order/geometry are
**NEEDS-LIVE-CAPTURE** (status `uncertain` below). A fresh capture (dismiss save-modal, expand each dropdown) is
required before the deferred visual items can be closed. Tracked in `NEXT.md` backlog.

**✅ RESOLVED (commit `cfde6b49`):** the `pnpm capture-moysklad <module> --detail` mode was built and re-run live
against this demand. Clean references now exist at `docs/moysklad-reference/demands/detail/` — `edit-default`
(DOM + screenshot), all four toolbar dropdowns with their real menu items, and the two real tabs. The `uncertain`
rows below were re-judged from that capture (now confirmed). The capture also surfaced two structural facts: moysklad
demand has **only two tabs** («Главная» + «Связанные документы»; «Файлы»/«Задачи» are inline, there is no
«История»/«События» tab), and the «Печать»/«Настроить...» labels use **ASCII «...»**, not the U+2026 ellipsis.

## Verdict

Structurally close to moysklad and already carrying the shared fixes from the customer-orders audit + systemic sweep
(RU position labels, Close=«Закрыть», AttributesEditor i18n). This audit fixed **6 code-self-evident demand deltas**
(5 in the first pass + «Создать документ» structure after the clean re-capture). The broken reference was repaired
(`--detail` capture mode, commit `cfde6b49`) and the audit re-judged from clean refs; the remaining deltas are
*backend/design* — the same items deferred for customer-orders.

## A. Structural

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| S1 | Tab-1 label | «Главная» | was «Позиции» | delta | high | **FIXED** — passes `positionsLabel={tDetailTabs('main')}` |
| S2 | «Задачи» surface | present (inline section / tab w/ count) | **entirely absent** (no DocumentTasksSection) | missing_in_ours | high | **FIXED** — added inline `<DocumentTasksSection entity="Demand">` |
| S3 | Tab strip set | **only 2 tabs**: «Главная» + «Связанные документы» (Файлы/Задачи **inline**, no История/События tab) — confirmed by clean capture | Главная(fixed) · Связанные · **Файлы** · **История** (4 tabs) | delta | med | DEFERRED — ours has 2 extra tabs («Файлы» should be inline, «История» has no moysklad equivalent here); shared `DetailContentTabs` restructure = customer-orders S3 |
| S4 | Position table columns | ~16 (Кол-во б.ед./Принято/Доступно/Остаток/Резерв/Ожидание/Вес/Объём/Сумма НДС + Удалить select) | 7 (product/qty/price/discount/vat/lineTotal + remove) | missing_in_ours | med | DEFERRED — stock columns need per-row live stock (backend); = customer-orders S7. Shared `PositionEditor`. |
| S5 | Totals sidebar rows | + «Прибыль» / «Вес» / «Объём» | Промежуточный итог/НДС/Цена включает НДС/Итого/Кол-во | missing_in_ours | med/low | DEFERRED — = customer-orders S9 |
| S6 | «Другие поля» grouping | secondary (transport/overhead) fields behind a collapsible | all fields flat/always-visible | delta | med | DEFERRED — design; confirm field order vs a clean capture first |
| S7 | Payment chip «Не оплачено» | shown in header pill row (per sibling 59 + DOM) | absent (no `pillsSlot`) | missing_in_ours | high | DEFERRED — `DemandDetail` has **no `payedSumMinor`** → backend needed (customer-orders has the field) |
| S8 | Currency / rate widget | DOM shows a `1 UZS =` rate widget | demand has no currency field (customer-orders does) | uncertain | med | NEEDS-CAPTURE — confirm demand currency surface before adding |
| S9 | «Входящий номер» field | string in shared DOM bundle (unreliable) | absent | uncertain | med | NEEDS-CAPTURE — bundle holds all doc types; odd on an outbound demand |
| S10 | Author «Изменено: …» line | not found in demand DOM | rendered | uncertain | low | NEEDS-CAPTURE — accepted on customer-orders; keep pending clean capture |
| S11 | Posted info banner | plain field-disable | extra info `Alert` | extra_in_ours | low | KEEP — helpful superset |

## B. Interactive

| # | Element | moysklad | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| I1 | Toolbar Save/Close | «Сохранить» / «Закрыть» | same | match | — | (Close fixed shared in c68dd11a) |
| I2 | Prev/next pager | «N из M» | was «N / M» | delta | med | **FIXED** — `detail_toolbar.pager` ICU (ru «из»); shared, closes customer-orders I3 |
| I3 | «Создать документ» item label | (describes the created doc) | was «Отгрузки» but action creates a sales-return | delta | high | **FIXED** — relabeled `create_related.sales_return`=«Возврат покупателя» |
| I4 | linked-order field label | «Заказ покупателя» | was «Заказ» | delta | med | **FIXED** — `tDetailTitles('customer_order')` |
| I5 | «Изменить» dropdown items | **{Удалить, Копировать}** (2, confirmed) | Копировать · **Открыть в API** · Удалить (3) | delta | low | DEFERRED — «Открыть в API» is an intentional dev superset (JsonViewer); order differs. Shared `DetailToolbar` — flag for a parity-vs-superset decision, not a unilateral fix. No «Восстановить» (that's a trashed-doc variant). |
| I6 | «Создать документ» item set | **6 items**: Перемещение · Счёт покупателю · Счёт-фактура выданный · Входящий платёж · Приходный ордер · Возврат покупателя (confirmed) | was only «Возврат покупателя» | missing_in_ours | high | **FIXED (structure)** — now renders all 6 in moysklad order; the 5 without a from-demand backend are disabled label-parity placeholders, «Возврат покупателя» stays functional. Wiring the other 5 = DEFERRED (backend). |
| I7 | «Печать» items | **13 print forms** (ТТН ×4 / Акт / Товарный чек / Расходная накладная / Коды маркировки / Сборочный лист / Ценник / Термоэтикетка / Комплект... / Настроить...) | «Список заказов» + «Настроить...» (shared) | delta | med | DEFERRED — needs the per-doc print-template system (backend); «Список заказов» is a mis-scoped shared label (= customer-orders I7). «Настроить...» byte-matches (ASCII «...»). |
| I8 | «Отправить» items | 10 print forms (same templates as Печать, минус Ценник/Термоэтикетка/Настроить, for email) | По электронной почте | delta | low | DEFERRED — moysklad «Отправить» offers the print forms by email; ours offers a generic email composer (functional superset). |
| I9 | Status pill + FSM dropdown | tenant custom statuses mask defaults | draft/posted/cancelled + colors | uncertain | low | NEEDS-CAPTURE — default RU labels still not observable (tenant custom statuses) |
| I10 | «Проведено» toggle | ☑ Проведено **+ «?» help icon** (confirmed) | ☑ Проведено (no help icon) | delta | low | DEFERRED — help tooltip on shared DetailHeader |
| I11 | Position action buttons | Добавить из справочника · Проверить комплектацию · Импорт · Привязать документ | only «Добавить из справочника» | missing_in_ours | med | DEFERRED — = customer-orders S8 |
| I12 | «Запросить оплату» action | present in pill row | absent | missing_in_ours | high | DEFERRED — tied to S7 (no `payedSumMinor`; backend) |

## Fixed this session (commit pending)

| Ref | Fix | File | Scope |
|---|---|---|---|
| S1 | Tab-1 «Позиции» → «Главная» (`positionsLabel={tDetailTabs('main')}`) | demands page | scoped (mirrors customer-orders S1) |
| S2 | Added inline `<DocumentTasksSection entity="Demand">` (`Demand` ∈ `TASK_ENTITY_WHITELIST`) | demands page | scoped |
| I3 | «Создать документ» «Отгрузки» → `create_related.sales_return`=«Возврат покупателя» | demands page + `create_related.sales_return` (ru+uz) | scoped |
| I2 | Pager «N / M» → «N из M» (RU). New `detail_toolbar.pager` ICU (uz keeps «/» — word-order uncaptured) | `detail-toolbar.tsx` + `detail_toolbar` ns (ru+uz) | **shared — all detail pages** |
| I4 | linked-order field «Заказ» → «Заказ покупателя» (`tDetailTitles('customer_order')`) | demands page | scoped |
| I6 | «Создать документ» 1 → 6 items in moysklad order (5 disabled label-parity placeholders + functional «Возврат покупателя») — from the clean re-capture | demands page (existing `detail_titles.*` + `create_related.*` keys) | scoped |

**Gates:** web typecheck 0 · biome clean · web tests pass — no regression (see commit).
**HALOL:** not browser-smoked — label/prop/i18n + proven shared components; all referenced i18n keys verified present
in both ru.json + uz.json. The 5 new «Создать документ» entries are **disabled placeholders** (label/structure
parity only) until their from-demand backend endpoints land.

## Deferred — backend / design (same dispositions as customer-orders)

- **S4** position stock columns (Принято/Доступно/Остаток/Резерв/Ожидание/Кол-во б.ед./Вес/Объём/Сумма НДС) — per-row live stock (backend). Shared `PositionEditor`.
- **I11** position action buttons «Проверить комплектацию» / «Импорт» / «Привязать документ».
- **S5** «Прибыль» / «Вес» / «Объём» totals rows in `DetailTotalsSidebar`.
- **S7 + I12** payment chip «Не оплачено» + «Запросить оплату» — `DemandDetail` lacks `payedSumMinor` (backend).
- **S3** moysklad demand has only «Главная» + «Связанные документы» tabs (Файлы/Задачи inline, no История/События); ours adds a «Файлы» tab + «История» tab — shared `DetailContentTabs` restructure = customer-orders S3.
- **I6 (remaining)** wire the 5 disabled «Создать документ» placeholders (Перемещение / Счёт покупателю / Счёт-фактура / Входящий платёж / Приходный ордер) to real from-demand backend endpoints.
- **I7** «Печать» — 13 named print forms need the per-doc print-template system; «Список заказов» is the mis-scoped shared label (= customer-orders I7).
- **S8** currency field «сум (UZS)» (name-then-code) present on the moysklad demand; ours has none — needs `currency` on `DemandDetail` (backend).
- **S6/customer-balance** «Баланс: 0,00 сум» sub-line under Контрагент — counterparty balance fetch (backend).
- **«Другие поля»** collapsible grouping of secondary fields — shared meta-panel design.

## Resolved by the clean re-capture (commit `cfde6b49`)

The earlier `uncertain` / NEEDS-LIVE-CAPTURE rows are now judged from `docs/moysklad-reference/demands/detail/`:
**I5** Изменить = {Удалить, Копировать}; **I6** Создать = 6 items (fixed); **I7** Печать = 13 forms; **I8** Отправить
= 10 forms; **S3** tabs = 2 only; «Печать»/«Настроить...» use ASCII «...». Still genuinely unobservable: **I9**
(default status labels — masked by tenant custom statuses) and **S10** (whether moysklad shows an «Изменено» line —
not in this capture; ours keeps it, matching customer-orders).

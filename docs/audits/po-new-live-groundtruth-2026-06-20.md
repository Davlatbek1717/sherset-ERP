# purchase-orders/new — LIVE ground-truth (moysklad.uz, climart akkaunt, OLD design)

> **Captured:** 2026-06-20, Playwright MCP, `online.moysklad.uz` → `#purchaseorder/edit?new`
> (account `farrux@climart_santex_group`). **Design = OLD** (climart default; «Новый дизайн»
> promo declined to keep parity with all sibling document pages). This is AUTHORITATIVE for
> the climart parity target. The repo `docs/moysklad-reference/.../create-form.md` was captured
> on a DIFFERENT account/design and DIFFERS (5 tabs, toolbar VAT toggles, «Общая стоимость») —
> trust THIS live capture for layout/labels, the reference only for semantics.

## Toolbar (8 controls) — matches our clone
`Сохранить` (green) · `Закрыть` · `Изменить ▾` · `Создать документ ▾` · `🖨 Печать ▾` ·
`✉ Отправить ▾` · right: `Файзуллоев Ф. / Основной` (user/role) · floating 💎 (promo, ignore).
On /new the 4 dropdowns are mostly inert (Изменить = Удалить[disabled]+Копировать). Our clone
already renders them disabled/empty — OK.

## Document header
`Заказ поставщику № [input]  от 📅 20.06.2026 15:14   Статус ▾   (?) ☑ Проведено   (?) ☐ Ожидание`

| Element | LIVE default | Our clone | Verdict |
|---|---|---|---|
| № input | empty (auto on save) | empty | ✓ |
| date-time | now | now | ✓ |
| Статус ▾ | custom State dropdown | hardcoded draft/confirmed/cancelled | minor (decorative on /new) |
| **Проведено** (applicable) | **☑ CHECKED** (DOM-verified) | `false` | ❌ **FIX → default true** |
| Ожидание (waiting) | ☐ unchecked | `false` | ✓ |

## Metadata grid (2 columns) — DOM-verified positions
```
LEFT (x40)                          RIGHT (x461)
* Организация  [+ «Сум» account subrow]   Склад
* Контрагент                              Договор (disabled until agent)
  План. дата приемки                      Проект
* Валюта документа                        (EMPTY)
```
- 7 fields total. **No «Счёт контрагента» (agentAccount)** anywhere (live + reference agree).
  → ❌ **FIX: REMOVE agent_account field from our clone /new** (right col row-4). Backend still
  supports agentAccountId; moysklad just doesn't collect it on the PO form (payment docs do).
- `Организация` has a **bank-account subrow** showing the org's settlement account («Сум» =
  pre-selected UZS account) as an inline **dropdown**. Our clone shows an empty
  "select bank account" CatalogPicker → minor refinement (pre-select + inline dropdown).
- `Валюта документа` has ✎ pencil (rate editor) next to it — our clone has the rate ✎ as a
  helper line. OK (close).

## Child tabs + sections — matches our clone
Tabs: **Главная** (active) · **Связанные документы**. Below totals: collapsible
**▼ Задачи [➕ Задача]** · **▼ Файлы [➕ Файл]**. Our clone matches (DocumentTabs main/related +
DocumentDisclosurePanel tasks/files). ✓

## Positions table — DEFAULT columns (DOM header + ⚙ customizer, AUTHORITATIVE)
Header (left→right): `☐ · Наименование ▾ · Кол-во · Принято · Доступно · Цена ▾ · НДС · Скидка · Сумма ⚙▾`
(+ Изображение & Единица измерения columns, default-ON per customizer, between select↔name and qty↔Принято)

**⚙ «Сумма» column customizer (default state, DOM-verified):**
| Column | moysklad default | our PositionTable key |
|---|---|---|
| Изображение | ☑ ON | `image` |
| Единица измерения | ☑ ON | **MISSING → add `unit` key** |
| Принято | ☑ ON | `shipped` (DEFAULT_LABEL already = «Принято»!) |
| Доступно | ☑ ON | `available` (label «Доступно» ✓) |
| Остаток | ☐ OFF | `stock` |
| Резерв | ☐ OFF | `reserve` |
| Ожидание | ☐ OFF | `waiting` |
| Вес | ☐ OFF | `weight` |
| Объем | ☐ OFF | `volume` |
| Сумма НДС | ☐ OFF | `vatAmount` |

**Always-on (not in customizer):** select, Наименование, Кол-во, Цена(▾ price-type menu),
НДС, Скидка, Сумма.

### Our clone PO/new positions = OUTDATED (static, no stock, no customizer)
Current `POSITION_COLUMNS` = dragarea, select, index, image, name, quantity, **goodPack**,
price, vat, **vatAmount**, discount, amount, menu. Problems:
- ❌ Missing «Принято» (`shipped`), «Доступно» (`available`), «Единица измерения» (`unit`)
- ❌ `vatAmount` shown by default (moysklad = OFF)
- ❌ `goodPack` shown (not a moysklad PO default column)
- ❌ No column customizer (⚙), no «Цена ▾» price-type menu, no per-row stock data

**CO/new (sibling) already solved this** — it has `colVisible` dynamic columns +
`PositionColumnCustomizer` + `PositionPriceMenu` + per-row `stock {onHand,reserved,available}`
from `/products?search=`. PO/new must mirror that architecture with PO defaults.

## Add-line row + totals — matches
`[Добавить позицию — введите наименование, код, штрихкод или артикул] [Добавить из справочника]
[Проверить комплектацию]`. Totals (right): **Промежуточный итог** · ☑ **НДС:** ·
☑ **Цена включает НДС** · **Итого** — labels already correct in `DocumentTotalsPanel`. ✓
- **Цена включает НДС** (vatIncluded) = **☑ CHECKED** (DOM-verified) → ❌ **FIX → default true**
  (our clone defaults `false`).

---

## Falsifiable execution queue (this flagship)
1. **[shared, additive]** PositionTable: add `unit` column key → label «Единица измерения»,
   read-only renders `row.productUom`, width ~90px, left-aligned. (Safe: existing callers unaffected.)
2. **[PO/new header]** `applicable` default `false→true`; `vatIncluded` default `false→true`.
3. **[PO/new meta]** REMOVE «Счёт контрагента» field + its picker + state + payload key.
4. **[PO/new positions]** mirror CO/new: ProductItem gains `stock` cluster + carry onto rows;
   `colVisible` + dynamic `positionColumns` useMemo; defaults ON = image, unit, shipped(«Принято»),
   available(«Доступно»); OFF = stock, reserve, waiting, weight, volume, vatAmount; add
   `PositionColumnCustomizer` (⚙ on Сумма) + `PositionPriceMenu` («Цена ▾», priceTypes query).
   `shipped` value on /new = empty/0 (read-only); `available` = stock.available.
5. **[i18n]** add `position_cols.received` («Принято»/«Qabul qilingan») + `position_cols.unit`
   («Единица измерения»/«Oʻlchov birligi») ru+uz.
6. **[gate + live cert]** tsc 0 · biome 0 · web vitest green · Playwright :3100 render + add-product
   row shows unit/Принято/Доступно + customizer toggles + 0 console-error.

## Deferred / lower-value (honest)
- «Статус ▾» custom State dropdown (decorative on /new — not sent on create).
- Bank-account subrow: pre-select org default + inline dropdown (vs our modal picker).
- Exact insert-order of optional stock columns when toggled (default order is grounded; toggled
  order not live-verified — used sensible cluster order).

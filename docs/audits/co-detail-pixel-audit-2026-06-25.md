# CO detail `/customer-orders/[id]` — full side-by-side pixel audit (2026-06-25)

Measured (not guessed): real moysklad CO editor vs our `:3100`, same viewport 1680×1000,
both on an order WITH positions. Capture: `tools/capture/co-detail-pixel-audit-2026-06-25.mjs`
(+ `co-comment-dom-probe-2026-06-25.mjs` for the comment/Уста DOM truth). Screenshots in
`docs/audits/co-detail-pixel-audit-2026-06-25/`.

## ✅ 1:1 (confirmed)
Toolbar (Сохранить·Закрыть·**«N из M ‹ ›»**·Изменить·Создать документ·Печать·Отправить) ·
owner/«Изменения»/avatar cluster · title row (№·date·payment-pill·status·Проведено) ·
payment-pill logic · admin custom status · meta fields (Организация+account·Контрагент+Баланс·
План.дата·Канал продаж·Валюта✎·Склад·Договор·Проект·Адрес доставки) · positions columns
(Наименование·Кол-во·Зарезерв·Остаток·Цена·НДС·Сумма НДС·Скидка·Сумма, img+code+name) ·
bottom band (Комментарий+Внешний код | Промежуточный итог·НДС·Цена включает НДС·Итого·Кол-во) ·
Задачи · Файлы · Добавить из справочника · Проверить комплектацию.

## ⚠️ Differences found → resolution
| # | Difference | Resolution |
|---|---|---|
| 1 | moysklad shows **«Комментарий» in the top-right meta** (under «Адрес доставки», DOM-confirmed at 927,188) — ours had it only in the bottom band | **FIXED** — added top-right «Комментарий» bound to the same `form.description` (synced with the bottom one), mirroring moysklad which renders it in both spots |
| 2 | **«Уста» has a «+» create button** in moysklad (it's a `reference`→Counterparty custom field) — ours lacks it | **FIXED** — `ReferenceAttributeInput` now passes `onCreate` to the CatalogPickerField (referenceEntity→/new route map; Counterparty→`/counterparties/new`), so every reference custom-field gets the moysklad «+» |
| 3 | help **«?» sits AFTER «Проведено»** in ours; moysklad has **«? ☑ Проведено»** (before) | **FIXED** — `DocumentHeader` renders `HelpIcon` before the checkbox (outside the `<label>` so it doesn't toggle); applies to all docs |
| 4 | position **НДС cell** is an always-visible `12% ▾` dropdown; moysklad shows text «без НДС»/«12%» and edits inline on click | **FIXED** — НДС cell is now click-to-edit: shows the rate as plain text (right-aligned, like moysklad), swapping to the `<select>` only while that row's cell is active (`editingVatId`) |
| 5 | **Организация sub-account** («Сум») shows in moysklad, empty in ours | **FIXED (data)** — field was correctly wired but the demo org «MCHJ Demo» had 0 accounts; seeded a default UZS account «Сум» (`seed.ts`, idempotent) + backfilled it onto the org's 85 customer orders, so the sub-dropdown now shows «Сум» like moysklad |
| 6 | position rows show a **persistent «⋮⋮» drag grip**; moysklad's resting grid is clean | **FIXED** — grip is now `opacity-0 group-hover:opacity-100` (fades in on row hover only) |

## Verdict
6 deltas found; **all 6 resolved**. The visible CO `/[id]` editor now matches moysklad
element-by-element (toolbar · header · meta + top-right Комментарий · «? Проведено» ·
«Уста +» · «Сум» account · positions with НДС-as-text + hover-only grip · bottom band ·
Задачи/Файлы). Gates: typecheck 9/9 · biome 0 · design-system vitest 142 · web header 61 ·
i18n 6 · no tests broken. Live-verified on `:3100` (screenshots `our-after-*.png`): all six
changes render as expected, 0 console errors on load.
Honest caveat: НДС click-to-edit covers the НДС column only — the other position cells use
always-visible borderless inputs (visually text-like); a full Slick-style click-to-edit grid
across every column remains a larger, separate refactor.

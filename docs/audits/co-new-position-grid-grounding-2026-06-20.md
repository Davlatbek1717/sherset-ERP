# CO /new + /[id] — position-grid + product-picker live grounding (2026-06-20)

§4 live capture against the **real climart account** (online.moysklad.uz, **OLD
design** — the design this account actually uses), customer-order edit form
`#customerorder/edit?id=7cb3fd04…`. Read-only (nothing saved). Screens:
`ms-co-edit-positions.jpeg`, `ms-co-naimenovanie-menu.jpeg`, `ms-co-product-picker.jpeg`.

## Item B — «Наименование ▾» position-column header menu  (GROUNDED, MINOR)

The «Наименование» header in the position grid DOES carry a ▾ (old design). Its
dropdown is a **position-sort menu**, contents (exact):

1. **Сортировать по наименованию**  — sort the document's lines by product name
2. **Сортировать по коду**          — sort the document's lines by product code
3. ☐ **С учётом групп**             — checkbox: group the sort by product folder

Also seen on the same header row: **«Зарезерв. ▾»** and **«Цена ▾»** carry the
SAME kind of sort ▾ (по убыванию/возрастанию typical), and the far-right
**«Сумма ⚙▾»** is the position-grid column customizer (separate from the list
«Столбцы», which in this account is new-design-gated → see COLUMN-PICKER-FINDING.md).

Verdict: real but LOW value — sorting a document's own line items is rarely used.
Buildable (sort positions array by name/code); the «С учётом групп» grouping is
heavier (needs product-folder grouping in the grid) and lower value still.

## Item C — «Выбор товара» product-picker «Фильтр» panel  (GROUNDED, MEDIUM-LARGE)

«Добавить из справочника» → «Выбор товара» modal → «Фильтр» expands a filter
panel. Full grounded field set (old design):

| Field (RU) | Control | Notes / account-use |
|---|---|---|
| Наименование | text | name contains |
| Остаток | dropdown (Любой/…) | stock on-hand filter |
| Доступно | dropdown (Любое/…) | available (on-hand − reserved) |
| Только с резервом | dropdown (Нет/…) | has reservation |
| Только с ожиданием | dropdown (Нет/…) | has incoming/in-transit |
| Описание | text | description contains |
| Артикул | text | article |
| Код | text | code |
| Внешний код | text | external code |
| Штрихкод | text | barcode |
| Код ЕГАИС | text | **alcohol — account does NOT use (skip per §4)** |
| Весовой товар | dropdown | weighted goods — likely unused |
| Тип | dropdown (Все/…) | assortment kind |
| Группа товаров (без подгрупп) | text/picker | product folder |
| Поставщик | dropdown | supplier |

Left sidebar = product GROUP tree («Товары и услуги» root + each folder, e.g.
«Азия Бест Строй», «Акфа», «Ватерпро», …). Grid cols: Наименование · Количество ·
Остаток · Резерв · Ожидание · Доступно · Код · Артикул · Ед. изм. · Страна.
Top row also has 🔖 (saved filter) + ⚙ (filter settings) + «Найти»/«Очистить».

Genuinely useful + account-used subset (build these): Наименование, Артикул, Код,
Остаток (in-stock), Доступно, Группа (the sidebar tree), Поставщик, Описание,
Только с резервом. SKIP per §4 (account doesn't use): Код ЕГАИС, Весовой товар.

Verdict: real + valuable, but MEDIUM-LARGE — needs a backend product-filter
extension (most of these fields aren't query params today) + a modal rebuild with
the group-tree sidebar. A focused follow-up, not a quick finish.

## Item D — 3 disabled «Создать» (Волна отбора / Розничная продажа / Снабжение)

Out of scope here: each is an entire new document MODULE (pick-wave / retail-sale /
procurement-planning). moysklad shows them enabled; our /new menu wires the
navigation, the targets don't exist. Multi-session per module — NOT /new finishing.

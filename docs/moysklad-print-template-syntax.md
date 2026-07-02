# moysklad print-template syntax — ground truth (captured 2026-06-20 from support.moysklad.ru)

Goal: make our uploaded Excel/Word print templates use **moysklad's real formula language** so
genuine moysklad template files work 1:1. This file is the build spec — captured live from the
official docs so we never re-fetch. Sources:
- `шаблоны/.../что_такое_шаблон_печатнои_формы`
- `шаблоны/.../загрузка_дополнительного_шаблона_excel`
- `шаблоны/формулы/основные_формулы_вывода_данных_из_документа`
- `шаблоны/.../применение_формул_excel_в_шаблонах_моегосклада`

## Two template constructs

### 1. Data expressions — `${ … }`
JavaScript-style expressions. `o` = the current document; `formatter` = a helper object.
Method calls, property chains and ternaries are all valid.

| Formula | Meaning |
|---|---|
| `${o.name}` | document number |
| `${formatter.getExcelDate(o.moment)}` | date (must sit in a Date-formatted cell) |
| `${formatter.printIf(o.applicable, "Да")}` | posted flag |
| `${o.state.name}` | status |
| `${o.description}` | comment |
| `${o.getOwnerName()}` / `${o.getGroupName()}` | owner-employee / owner-dept |
| `${formatter.printIfElse(o.getShared(), "Да", "Нет")}` | shared access |
| `${o.sourceStore.name}` (or `o.targetStore` for incoming) | warehouse |
| `${o.address.city}` `${o.address.street}` `${o.addressFull}` | delivery address parts |
| `${o.contract.name}` `${o.project.name}` `${o.salesChannel.name}` `${o.retailStore.name}` | refs |
| `${o.externalCode}` `${o.id}` `${o.incomingNumber}` | misc |
| `${formatter.qrCode(o)}` / `${formatter.qrCode(o, true)}` | QR (cell-sized / fixed) |
| `${formatter.getEmployeeForId(o.getOwnerId()).lastName}` | owner card fields |

Sums / quantities (helpers):
- `${formatter.calcTotalQuantity(o)}` — total qty across positions
- `${formatter.calcTotalGoodsQuantity(o)}` / `${formatter.countServices(o)}`
- `${o.getPositions().size()}` — number of position rows
- `${formatter.printNumber(n)}` — number → words
- `${formatter.printAmount(minor)}` — money formatting
- `${formatter.calcVat(formatter.getServices(o))}` etc.

Custom fields (доп. поля):
- `${formatter.findAttribute(o, "Имя поля").value}` (`.valueString` / `.valueText` / `.longValue` /
  `.doubleValue` / `.timeValue` / `.booleanValue`); ref fields → `.entityValue.name` / `.agentValue.name`
- file fields → `${formatter.imageAttribute(o, "Имя поля", true|false)}`

### 2. Excel formulas — `$[ … ]`
Excel functions written in **English**, comma separators, dot decimals. These become real Excel
formulas in the output (computed by Excel/LibreOffice):
- `=ЕСЛИ(A1>10; B2; 50)` → `$[IF(A1>10, B2, 50)]`
- `=ОКРУГЛ(B2; -1)` → `$[ROUND(B2, -1)]`
- `=G3-H3` → `$[G3-H3]`

## Positions / table part — ✅ CONFIRMED (from the real debug template `20109458269714.xls`)
moysklad's engine is **JXLS** (Java Excel templating). The table part repeats rows via a JXLS directive
placed in a cell, with a per-row `var`:
```
<jx:forEach items="${o.positions}" var="position" varStatus="status">   (open, in a cell above the data row)
  ${position.printName}                  name
  ${position.quantity}                   qty
  ${position.good.uom.name}              unit
  ${position.price.sumInCurrency / 100}  price (sumInCurrency = MINOR units → /100 for major)
  ${formatter.round(position.price.sumInCurrency * position.quantity) / 100.0}  line sum
  ${position.discount}  ${position.vat}  ${formatter.cost(position)}  ${position.reserve}
  ${position.good.type=="Kit" ? "Комплект" : …}    (JEXL ternary + ==)
</jx:forEach>                            (close marker, in a cell below the data row)
```
Variants: `items="${formatter.getGoods(o)}"` (goods only), `${formatter.getServices(o)}` (services only).
`varStatus="status"` → `status.index` / `.count` / `.first` / `.last`.
Expressions are **JEXL** (Java EL), near-identical to JS for our needs (`.`, `==`, `&&`, `?:`), plus a few
JEXL builtins like `empty(x)`. Our `new Function` JS-eval handles the common subset; add `empty()` as a helper.

## Upload flow (real moysklad)
1. Download the starter template for that document type.
2. Open a document list / report / document → **Печать → Настроить**.
3. A **right-side «Настройка шаблонов» panel** opens (NOT a separate settings page).
4. **«Добавить шаблон»** — separate blocks for *list* templates vs *document* templates.
5. Pick the file. New template appears in the Печать menu for everyone.
6. **«Видимость»** checkbox column hides a template; rows are **drag-to-reorder**.

## Gap vs our current implementation
- Syntax: ours = `{number}` / `{#positions}` (docxtemplater); moysklad = `${o.name}` + `$[…]`. **Different.**
- UI: ours = a `/settings/print-templates` page; moysklad = right-side panel + starter-template download +
  list/document blocks + visibility + drag-reorder.

## Build plan (incremental — user chose "build moysklad syntax")
1. ✅ **Step 1** — `${…}` expression evaluator (`o` + `formatter`, scalar fields) + tests.
2. ✅ **Step 2** — `<jx:forEach>` positions iteration (scope-based eval + loop var) + tests.
3. ✅ **Step 3** — `$[…]` → real Excel formula (cell.value = {formula}).
4. ✅ **Step 4** — wired into DocxRenderService (auto-detect `${`/`$[`/`<jx:` → ms-engine, else `{tag}`):
   xlsx = per-cell `${…}` + `$[…]` formula + forEach row-clone (styles kept); docx = scalar `${…}` on the
   document XML. Browser-certified: a `${o.name}`/`<jx:forEach>` xlsx printed CO 20475 →
   «ЗАКАЗ ПОКУПАТЕЛЯ № 20475», row «Барашка кран 2×500=1000», «Итого 1 120», words.
5. Step 5 (optional, NOT done) — UI flow parity (right-side panel, starter download, visibility, reorder).

### Known limitations (honest)
- **`$[…]` cell refs don't auto-adjust across a forEach.** moysklad's JXLS rewrites formula ranges when it
  expands the position area; we don't. So `$[SUM(E7:E7)]` over the line rows points at the wrong row after
  expansion. Workaround = compute totals with `${formatter.printAmount(o.sum.sum)}` (how real moysklad
  templates do it). Proper fix = shift/expand formula refs by the row delta (future).
- **docx forEach** (Word position tables) is not done — use xlsx for line tables (moysklad's primary format).
- **`${…}` must sit in a single run** (docx) / a single cell (xlsx) — split runs won't match (same constraint
  docxtemplater has).
- **`o.*` model is partial** — common fields mapped from our doc data; the long tail (`o.extension.*`,
  `o.sourceAgentRequisite.*`, custom-field `findAttribute`, `qrCode`, …) renders "" until added.
- **SECURITY**: `${…}` runs via `new Function` (admin-upload trust, like moysklad) — move to isolated-vm
  before production.

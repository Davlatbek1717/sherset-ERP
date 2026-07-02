# Products list — moysklad «Товары и услуги» Фильтр parity enrichment (2026-06-11j)

**Status: Phase-2 (runtime-verified).** Live-API battery 18/18 + browser RU render
+ end-to-end network request. §4 labels browser-confirmed against the capture.

Closes the recurring backlog **(A) filter-field parity enrichment** (NEXT.md
11g/11h/11i) for the **products** master-data list — the bigger of the two
flagged gaps (coverage map: products 8 → 19 moysklad fields).

Doc lives next to the change; the session line in `MEMORY.md` / `NEXT.md`
points here.

---

## Ground truth (§4 DOM-rendered)

`docs/moysklad-reference/products/states/02-filter-applied.png` — the real
moysklad products Фильтр panel, **all 19 fields legible** (this corrects the
old D3 note in the page that said the captured DOM was contaminated and fell
back to a "well-known set" — we now have a clean rendered capture):

```
Наименование · Описание · Артикул · Код · Внешний код
ИКПУ (MXIK) · Код упаковки ТАСНИФ · Штрихкод · Весовой товар · Тип · Показывать
Группа товаров (без подгрупп) · Группа товаров · Поставщик · Владелец-сотрудник · Владелец-отдел · Общий доступ
Когда изменен · Кто изменил
```

## What shipped — 8 → 15 discrete filter fields

7 new fields, each backed by an **existing** Product column (no migration), and
2 pre-existing labels re-grounded to the capture.

| # | moysklad label | our field | column / source | status |
|---|---|---|---|---|
| 1 | Описание | `description` contains (insensitive) | `Product.description` | **NEW** |
| 2 | ИКПУ (MXIK) | `mxikCode` contains | `Product.mxik_code` | **NEW** |
| 3 | Штрихкод | `barcode` → `barcodes has` (exact token) | `Product.barcodes[]` | **NEW** |
| 4 | Весовой товар | `weighed` tri-state | `Product.weighed` | **NEW** |
| 5 | **Тип** | `kind` (empty option = «Все») | `Product.kind` | re-grounded label |
| 6 | **Показывать** | `archived` **tri-state** (Только обычные / Только архивные / Все) | `Product.archived` | re-grounded + 3-state |
| 7 | Группа товаров | `productFolderId` (exact = «без подгрупп») | `Product.product_folder_id` | existing |
| 8 | Поставщик | `supplierId` | `Product.supplier_id` | existing |
| 9 | Владелец-сотрудник | `ownerId` | `Product.owner_id` | existing |
| 10 | Владелец-отдел | `groupId` → `/groups` Group picker | `Product.group_id` | **NEW (FE only — repo where pre-existed, unexposed)** |
| 11 | Общий доступ | `shared` tri-state | `Product.shared` | **NEW** |
| 12 | Когда изменен | `updatedFrom`/`updatedTo` over `updatedAt` (PeriodPicker + вч·сег·нед·мес) | `Product.updated_at` | **NEW** |

Plus three **useful extras** kept (not in moysklad's products Фильтр, backed by
real columns): **Тип учёта** (markirovka), **Страна** (ISO2), **Ниже минимума**
(live re-order view, built 11h).

The top search box still ORs `name/code/article/externalCode/barcode`, covering
the four discrete text columns (Наименование/Артикул/Код/Внешний код) moysklad
shows as separate inputs — see DEFERRED.

## §4 label fixes (found by adversarial verify — were pre-existing mislabels)

A 5-lens verification workflow (`wf_f5335d41-157`) flagged two captured labels
the page had wrong *before* this session; corrected here because we now hold the
clean capture:

- **field #6** read «Статус» (`tFields('state')`) — the capture renders
  **«Показывать»**, and `fields.state` is a *shared* key (44 surfaces) so its
  value can never be «Показывать». → new `filters.show` = «Показывать»; options
  re-grounded to the captured **«Только обычные»** + paired **«Только архивные»**
  + universal **«Все»**. While re-grounding, the binary was promoted to the true
  moysklad **tri-state** (the «Все» option lists archived + non-archived — the
  `archived` schema now maps `'all' → undefined` = no predicate, preserving the
  default-`false` "only regular" view when the param is absent).
- **field #5** read «Тип товара» (`filters.product_kind`) — the capture renders
  the bare **«Тип»** (value «Все»). → value retargeted to «Тип»; empty option now
  carries «Все».

Both browser-confirmed against the capture after the fix.

## Where (backend)

`product.schema.ts` `ProductFilterSchema` + `product.repository.ts` `list()`:

- `description` → `{ description: { contains, mode: 'insensitive' } }`
- `mxikCode` → `{ mxikCode: { contains } }` (loose partial-code lookup; the
  *create* schema enforces 17 digits, the *filter* is intentionally loose)
- `barcode` → `{ barcodes: { has } }` (scalar membership in the `String[]`)
- `weighed` / `shared` → `{ weighed/shared: bool }`, applied only when
  `!== undefined` (NOT a falsy guard — the `false` branch is preserved)
- `updatedFrom`/`updatedTo` → `updatedAt: { gte, lte }`, the `To` bound extended
  to `T23:59:59.999Z` (half-open day range — byte-identical to the cash-in /
  payment-in gold standard)
- `groupId` → `{ groupId }` (was already in the where; the FE Group picker just
  fills it now)
- `archived` → `'all'` sentinel maps to `undefined` ⇒ Prisma omits the predicate

## Verification

- **Gate:** api tc0 · web tc0 · biome0 (changed files) · **api Vitest 2868**
  (+11: 3 ProductFilterSchema + 7 parity + 1 archived-tristate, 0 regress) ·
  **web Vitest 2090** (+22: 19 wiring + 3 §4 label-lock, 0 regress).
- **Runtime (Phase-2):** `tools/scripts/verify-product-filter-smoke.mjs` —
  **18/18 PASS** (live API + self-reverting DB probe). Each filter proven in
  BOTH directions: case-insensitive contains; exact barcode (+ non-existent →
  none); weighed/shared tri-state both branches; groupId equality; updated-range
  future-excludes / past-excludes / spanning-includes; **«Показывать» tri-state**
  (false→9 non-archived, true→1 archived, all→10 both); AND-semantics
  (weighed&shared → none).
- **Browser (Playwright :3100, RU):** all 15 fields render with the exact RU
  labels; `Описание` typed → live `GET /products?…&description=… → 200`; only
  console noise is a favicon 404. §4 fixes re-verified: field #5 «Тип» (value
  «Все»), field #6 «Показывать» (value «Только обычные»).

## Guards

- `apps/api/.../product-filter-parity.test.ts` (7) — BE schema + each where-clause
  is wired (comment-stripped, non-vacuous; the updatedAt assertion anchors on
  `const updatedRange` + `...updatedRange`, not a bare token).
- `apps/api/.../product.schema.test.ts` (+4) — discrete fields parse, booleans
  coerce, undefined-when-absent, and the `archived` tri-state (`'all' → undefined`,
  default-false preserved, bogus value rejected).
- `apps/web/.../products-filter-fields.test.ts` (22) — every new control renders,
  every param is forwarded (the 4 object-shorthand fields anchored to the
  `...(x ? { x } : {})` SPREAD form so the JSX `value={x}` can't satisfy them —
  this was a HIGH vacuity the verify workflow caught), queryKey membership, the
  /groups picker, and a §4 label-lock (field #6 = `filters.show` not
  `fields.state`; field #5 = «Тип»; tri-state present).

## DEFERRED (documented — not blind-built)

- **Код упаковки ТАСНИФ** — `ProductPack` has no tasnif column (feature, new column).
- **Кто изменил** — `Product` has no `updatedById`; reconstructing the last
  editor from `AuditLog` is a latest-per-entity aggregate + unreliable for
  never-audited rows. Defer.
- **Discrete Наименование / Артикул / Код / Внешний код** — covered (ORed) by the
  top search box. A discrete split is trivially buildable on existing columns but
  is a deliberate parity-of-common-case simplification (documented), not an
  unbuildable gap.
- **«Группа товаров (с подгруппами)»** variant — we have the exact-folder
  («без подгрупп») filter + the left folder tree; the descendant-expansion
  variant is deferred.
- **`KIND_OPTIONS` `consignment` = «Модификация»** (pre-existing) — «Модификация»
  is this codebase's term for *Variant*, not consignment. Left as-is this session
  (no open-`Тип`-dropdown capture to ground moysklad's exact option set; changing
  it risks a §4 mis-ground). Backlog: re-ground the «Тип» option labels when an
  open-dropdown capture exists.
- **updatedAt UTC day-boundary** — the range uses UTC `T00:00:00Z`/`T23:59:59.999Z`
  day edges (≈5h skew for UTC+5). This is an **app-wide convention** copied
  byte-for-byte from the money-doc gold standard; fixing it here alone would
  diverge from the rest of the app. App-wide backlog, not a per-page regression.

## Honest status

Phase-2 (runtime-verified): live API + self-reverting DB probe + browser render +
live network request. §4 labels browser-confirmed against the capture. No browser
pixel-sweep of every applied-filter result (the live-API battery covers behavior;
the browser covers render + one end-to-end apply). Remaining products-filter
parity = the DEFERRED items above (incremental). Other entities' filter gaps
(counterparties 5→38, payments 14→25, …) remain the next increments of backlog (A).

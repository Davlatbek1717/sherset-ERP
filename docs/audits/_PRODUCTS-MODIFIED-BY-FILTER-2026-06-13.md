# Products «Кто изменил» (modifiedById) last-modifier filter — 2026-06-13 (11ae)

**Status: Phase-2 VERIFIED** (live api:4000 + DB smoke 6/6). Commit `bd23e08c`.

## Why this (grounded, not capture-gated)

11ad closed the recurring «Тип» open-dropdown candidate and left, among the
next candidates, a **products-filter field-parity re-check** grounded on the
live `docs/moysklad-reference/products/states/02-filter-applied.png` capture,
which shows the moysklad «Товары и услуги» Фильтр panel in full — **19 fields**:

> Наименование · Описание · Артикул · Код · Внешний код · ИКПУ (MXIK) · **Код
> упаковки ТАСНИФ** · Штрихкод · Весовой товар · Тип · Показывать · Группа
> товаров (без подгрупп) · Группа товаров · Поставщик · Владелец-сотрудник ·
> Владелец-отдел · Общий доступ · Когда изменен · **Кто изменил**

11j had brought our panel to 15 fields (12 parity + 3 extras) and **documented**
the omission of 4 captured fields. Grounding each omission against the actual
schema (§4 discipline — verify the column-gating claim, don't trust the note):

| Captured field | 11j claim | Ground truth | Verdict |
|---|---|---|---|
| Код упаковки ТАСНИФ | "ProductPack has no tasnif column" | `ProductPack` = id/name/uomCode/multiplier/barcode/position — **no tasnif** | omission **correct** (column-gated) |
| Внешний код | "search box ORs it" | `product.repository` search OR includes `externalCode` (+ schema comment) | omission **correct** (search-covered) |
| Группа (с подгруппами) | "folder filter + tree cover it" | one exact folder filter + left tree | acceptable divergence |
| **Кто изменил** | "Product has no updatedById column" | `Product` has `updatedAt` but **no last-modifier column** | claim true → but it's a **buildable** real gap |

So the only genuine, buildable parity gap was **«Кто изменил»** — a moysklad
filter we lacked *entirely* because the backing column didn't exist. The fix
adds the column + wiring rather than just confirming the omission.

## Convention reuse (not invented)

The project already has the last-modifier pattern: **`PurchaseOrder.modifiedById`**
(`modified_by_id`, relation `PurchaseOrderModifiedBy`, index `[accountId,
modifiedById]`, filter `modifiedById: z.string().uuid().optional()`, FE picker
`filter-modified-by` / `pickerOpen === 'modifiedBy'`, i18n «Кто изменил» /
«Kim o'zgartirgan»). This change **mirrors that convention exactly** for Product
(single-pick parity — the products Фильтр panel has no multi-select variant).

The actor was already threaded: `product.service.{create,update}` receive
`userId` (= `user.sub` = the authenticated **employee** id, the same value that
already populates `ownerId` on create) for `logAudit`, so stamping the modifier
needed no new plumbing on create and only one extra arg on update.

## Changes

- **schema** `Product.modifiedById String? @map("modified_by_id")` + relation
  `modifiedBy Employee? @relation("ProductModifiedBy", onDelete: SetNull)` +
  `@@index([accountId, modifiedById])` + Employee back-rel `modifiedProducts`.
  Migration `20260613000000_product_modified_by` (ADD COLUMN + index + FK,
  mirroring PO migration `20260508165830`).
- **repo** `create`: `modifiedById: ownerId` (on create the actor is owner =
  modifier). `update(accountId, userId, id, input, version)`: sets
  `modifiedBy: { connect: { id: userId } }` **inside the version-bumping write**
  (checked-input relation connect; `userId` is always a valid employee, so the
  connect never misses). `list` where: `modifiedById` equality.
- **service** `update` threads `userId` into `repo.update`.
- **ProductFilterSchema** `modifiedById: uuid.optional()`.
- **FE** `products/page.tsx`: «Кто изменил» Employee-picker field (after «Когда
  изменен», before the extras), `modifiedBy` CatalogPicker (`/employees`),
  state/params/queryKey/hasActiveFilter/clear wiring; omission comment updated.
- **i18n** `filters.modified_by` = «Кто изменил» (ru) / «Kim o'zgartirgan» (uz).
- **guards** FE `products-filter-fields.test.ts` (render + i18n + params-forward
  spread + queryKey membership + picker `/employees`) and BE
  `product-filter-parity.test.ts` (schema field + repo where + **write-path
  stamp lock**: create `modifiedById: ownerId`, update actor-arg + connect,
  service threads userId). All non-vacuous.

### Deliberate scope (honest)

- **create + update only** stamp the modifier. `archive`/`restore`/`delete` are
  left unstamped — whether moysklad re-attributes «Кто изменил» on a bare
  archive toggle is **unverifiable** from the capture, so the conservative,
  unambiguous edit paths were chosen (the filter still works for every
  created/edited row). Re-evaluate if a capture proves otherwise.
- Pre-existing rows have `modifiedById = NULL` (nullable column) — they read as
  «unknown» and are simply excluded by the filter until next edited. Correct.

## Phase-2 live smoke (`tools/scripts/verify-product-modified-by-smoke.mjs`) — 6/6

Against live api:4000 + DB (seeded `admin@demo.local`):

- **A** `products.modified_by_id` column + `products_modified_by_id_fkey` present.
- **B** POST /products as admin → DB row `modifiedById === admin` (create stamp).
- **C** GET `?modifiedById=<admin>` **includes** the created product (count=1 —
  seeded rows are NULL, so the signal is clean) — filter applied (positive).
- **D** GET `?modifiedById=<stray uuid>` **excludes** it while the unfiltered
  list **includes** it → filter is **non-vacuous** (not silently ignored).
- **E** a row seeded directly with `modifiedById = NULL`, then api-PATCHed by
  admin → `modifiedById` becomes admin **and** version 1→2 (update stamps from
  the actor, isolated from the create value; coexists with the optimistic-lock
  version bump).
- **F** **ZERO 5xx** across every call — proves the running api knows the new
  arg (a stale Prisma client would 500 on `where.modifiedById`).

## Gate

api tc0 · web tc0 · db tc0 · biome0 (changed source; `.mjs` smoke tolerated as
prior `verify-*`) · **api Vitest 2957 (+4, 0 regress)** · **web Vitest 2189 (+3,
0 regress)**.

## Incident note (environment, not the change)

Mid-session (~07:10) an **external workspace reset** (`git restore` + `clean`
reverted every tracked edit and removed the untracked migration/smoke files,
**and** the dev DB was rolled back — column gone, 119→118 migrations; HEAD never
moved). It landed *after* the first smoke had already passed 6/6. All edits were
re-applied verbatim, re-verified (smoke 6/6 again, full suites green), and
committed (`bd23e08c`) to make the work reset-proof. Likely a parallel session
or a "reset dev env" action — flagged for the operator. If it recurs, stop and
ask rather than racing (wiring-protocol lesson).

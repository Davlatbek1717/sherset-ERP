# P-IT — Items (Mahsulotlar) ref-parity audit

**Sana:** 2026-05-28
**Referens:** `D:\projects-desktop\projects\KONTRAGENTLAR\src\app\(dashboard)\items\*` (2120 satr UI) + `src/hooks/use-items.ts` (166) + `src/app/api/items/{route,stats,groups,[id]/refresh}/route.ts`.
**Hozirgi:** `apps/web/src/app/(app)/analitika/mahsulotlar/page.tsx` (154 satr — soddagina savat-flow).

---

## Referens komponentlar (re-build target)

| Fayl | Satr | Vazifa |
|---|---|---|
| `items-view.tsx` | 444 | Orkestrator: filter state, savat state, queries, layout (toolbar + group-tree + stats + table + sticky cart) |
| `items-toolbar.tsx` | 430 | Filter bar: qidiruv, sort+order, lowStock toggle, noPartner toggle, onlyInCart toggle, salesFrom/salesTo davr selektori, page-size |
| `items-stats.tsx` | 157 | KPI bar: jami / kam qoldiq / yetkazib beruvchisiz / savatdagilar |
| `items-table.tsx` | 583 | Boy jadval (rasm/kod/nom/birlik/guruh/brand/davlat/NDS/xarid narxi/sotuv narxi/xarid miqdori/sotilgan/davr ichida sotilgan/qoldiq/oxirgi yetkazib beruvchi/oxirgi xarid sanasi) + savatga qty input + mobile-card view + sort headerlar |
| `group-tree.tsx` | 230 | Sidebar guruhlar daraxti — parent/child, "Hammasi", har guruhda mahsulotlar soni, tanlangan guruh highlight, collapse/expand |
| `group-tree-utils.ts` | 83 | `buildTree(flatGroups)`, `flattenForRender(roots, expanded)` |
| `group-tree-utils.test.ts` | 99 | Unit testlar (parent/child binding, depth, empty roots) |
| `loading.tsx` | 74 | Skeleton |
| `page.tsx` | 20 | Wrapper |

## Referens API endpointlar

- `GET /api/items` — filter+pagination, qaytaradi: `{items[], total, page, pageSize, totalPages}`. ItemRow: id/code/name/imageUrl/unitName/groupId/groupName/brand/country/vatPercent/buyPrice/sellPrice/purchasedQty/soldQty/soldInPeriod/stock/lastPartnerId/lastPartnerName/lastBuyDate.
- `GET /api/items/stats` — `{totalItems, lowStockCount, noPartnerCount}` (filter ham qabul qiladi — joriy view'ga mos).
- `GET /api/items/groups` — `{groups: [{groupId, groupName, groupPath, itemCount}]}` (tree quyish uchun flat ro'yxat).
- `POST /api/items/[id]/refresh` — REGOS dan bitta mahsulotni qayta sinxronlash (bizda — Stock+Product yangilash).

## Filterlar (bizda kerak)

- `groupId` — guruh bo'yicha
- `search` — nom/kod
- `sort` + `order` — name/code/stock/sold/price + asc/desc
- `lowStock` — kam qoldiqdagilarni ko'rsatish
- `noPartner` — yetkazib beruvchisi belgilanmaganlar
- `onlyInCart` + `inCartIds` — faqat savatdagilar (state UI'da, IDs query'ga)
- `salesFrom` / `salesTo` — "sotilgan davr ichida" hisoblash uchun sana oralig'i
- `page`/`pageSize`

## Moysklad'da xaritalash

| Ref maydon | Moysklad manba |
|---|---|
| id | `Product.id` (UUID) |
| code | `Product.code` |
| name | `Product.name` |
| imageUrl | `ProductImage` relation (primary/first) — TODO image module endpoint |
| unitName | `Product.uom` (string) |
| groupId/groupName | `Product.productFolderId` → `ProductFolder.{id,name}` (yoki groupId → Group.name?) |
| brand | yo'q → null |
| country | `Product.countryId` → `Country.name`? (TODO) |
| vatPercent | `Product.taxRateId` → `TaxRate.percent`? (TODO) |
| buyPrice | `Product.buyPrice` (BigInt → number) |
| sellPrice | `pickSalePriceMinor(salePrices, defaultPriceTypeId)` |
| purchasedQty | Σ SupplyPosition.quantity for product (all-time posted) |
| soldQty | Σ DemandPosition.quantity (all-time posted) |
| soldInPeriod | Σ DemandPosition.quantity within [salesFrom, salesTo] |
| stock | Σ Stock.qty (all stores) for product |
| lastPartnerId/Name | Last posted Supply'da `agentId` → Counterparty.name |
| lastBuyDate | max Supply.moment for product |

## Yangi backend (apps/api/src/modules/analitika/items.{schema,service,controller}.ts)

- `ItemsFilterSchema` (Zod): groupId(uuid?), search?, sort('name'|'code'|'stock'|'sold'|'price' default 'name'), order('asc'|'desc' default 'asc'), lowStock(bool), noPartner(bool), onlyInCart(bool), inCartIds(uuid[]), salesFrom(iso?), salesTo(iso?), page/pageSize.
- `ItemsStatsFilterSchema`: subset (groupId/search/onlyInCart/inCartIds).
- `items.service`:
  - `list(accountId, filter)` → fetch products with selected fields + aggregated supply/demand/stock per page (batch via group-by). Compute per-row.
  - `stats(accountId, filter)` → count totalItems + lowStockCount (stock < LOW_STOCK_THRESHOLD = e.g. 10 yoki product.minStock) + noPartnerCount (supplierId IS NULL).
  - `groups(accountId)` → fetch ProductFolder (id, name, parentId) + count items per folder → return flat list with `groupPath` ("Parent/Child").
- Endpoints: `GET /analitika/items`, `GET /analitika/items/stats`, `GET /analitika/items/groups`.
- Tests: mock prisma — list+stats+groups, sort by stock/price, lowStock filter, noPartner filter, salesFrom date window math.

## Yangi UI (apps/web/src/app/(app)/analitika/mahsulotlar/)

- `_lib/types.ts` (ItemRow, ItemGroupNode, ItemsResponse, ItemsStats, filter shapes)
- `_lib/group-tree.ts` (buildTree + flattenForRender + tests)
- `_lib/format.ts` (fmtMoney, fmtQty)
- `_components/items-stats.tsx` (KPI bar)
- `_components/items-toolbar.tsx` (filter bar)
- `_components/group-tree.tsx` (sidebar)
- `_components/items-table.tsx` (desktop+mobile)
- `_components/sticky-cart-bar.tsx` (chiqarib qo'yiladi)
- `page.tsx` (orchestrator: layout = group-tree | (stats + toolbar + table + sticky-cart))

Joriy cart-flow logikasini saqlab qolaman — savat-tab + "Buyurtma shakllantirish" o'sha ishlaydi, lekin endi richer table + filterlar + group-tree bilan.

## Tests

- `group-tree-utils.test.ts` (port ref'ning 99 satr testidan)
- `items.service.test.ts` (mock prisma — list/stats/groups/filters/sort/lowStock/noPartner)
- Web typecheck + biome
- Live API curl: list/stats/groups + filter combinations

## Sketchli ish hajmi (1 sessiya emas)

- Backend: ~600 satr (schema 70 + service 400 + controller 60 + tests 120). 1 sessiya.
- Web `_lib`: 200 satr (group-tree + tests). 0.5 sessiya.
- Web `_components`: 1500 satr (stats + toolbar + tree + table + sticky-cart). 1.5 sessiya.
- Orchestrator + i18n: 250 satr. 0.5 sessiya.
- Live smoke + tuzatishlar. 0.5 sessiya.
- **Jami: ~3-4 sessiya** (P-I dan kattaroq).

## Quality gate'lar

Har sub-fazada: typecheck + biome + tests + commit. P-IT-1 (backend), P-IT-2 (group-tree utils + tests), P-IT-3 (UI), P-IT-4 (smoke).

## Halol qoldiq (ushbu auditdagi nomarjlar)

- Brand/country/vatPercent moysklad'da mavjud, lekin standartdagi schema'da TaxRate.percent yoki Country.name — TODO solishtirish kerak (P-IT-1 da).
- `lastPartnerId/Name` joriy ma'lumotni `Product.supplierId` dan emas, **so'nggi posted Supply.agentId** dan oladi (ref shu xulq).
- `noPartner` filtri `Product.supplierId IS NULL` ga xaritalanadi (bu boshqacha mantiq bo'lishi mumkin — supplier vs "any supply ever").
- `LOW_STOCK_THRESHOLD` boshlang'ich = 10 (configurable bo'lmasligi mumkin — Product'da `minStock` bo'lsa undan, aks holda kontstanta).

## Keyingi qadam

Yangi sessiyada P-IT-1 boshlanadi (audit → plan → backend schema/service/controller + tests → commit).

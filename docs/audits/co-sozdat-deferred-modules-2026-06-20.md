# Customer-order «Создать документ» — 3 deferred items (build later)

> Saved 2026-06-20 at the user's request («to'liq saqlab qo'y, bu keyinroq quriladi»).
> These are the 3 DISABLED entries in the customer-order /new + /[id] «Создать документ»
> menu. moysklad shows them ENABLED; ours are `disabled: true`. They are NOT a /new
> defect — /new's own form/picker/owner/sort are complete (2026-06-20). Each item is a
> «create document X based on this order» (from-order conversion), so it depends on doc
> type X existing + a from-order bridge.

## Where they live (the hook point)
`apps/web/src/app/(app)/customer-orders/new/page.tsx` (and the same on `/[id]/page.tsx`,
via the shared `DetailToolbar` create menu). The 3 disabled entries:
- `{ label: tDetailTitles('picking_wave'), disabled: true }`     (~line 1380)
- `{ label: tDetailTitles('retail_sale'), disabled: true }`      (~line 1423)
- `{ label: tDetailTitles('supply_planning'), disabled: true }`  (~line 1424)
i18n keys already exist: `detail_titles.picking_wave` / `retail_sale` / `supply_planning`.
The 8 ENABLED items (move/invoice/demand/payment/cash-in/prepayment/purchase-order/
po-available) save-then-navigate to the target `/new?fromOrder=<id>`; mirror that.

## 1. Розничная продажа (Chakana savdo / retail sale)  — PARTIAL (module exists)
Real-world: sell the order's goods as an immediate over-the-counter RETAIL sale (POS),
not a B2B order. moysklad converts the order into a retail-sale document.

**Existing scaffolding (substantial!):**
- BE: full `apps/api/src/modules/retail-sale/` module — controller (`@Controller('retail-sales')`:
  GET / GET :id / POST / POST :id/post / :id/cancel / :id/refund / z-report) + service +
  schema + fiscal + loyalty + payment + refund-validation + tests.
- DB: `RetailSale` model EXISTS, with a `CustomerOrder.retailSales RetailSale[]` relation
  («RetailSaleCustomerOrder») — the FK link is already modelled.
- Web: `/retail`, `/retail/sales`, `/retail/sessions`, `/retail/z-report` pages exist
  (standalone POS workspace, reached via the «Розница» top-nav).

**Remaining to enable the «Создать» item:** retail-sale CREATE does NOT accept
`customerOrderId` yet (no from-order prefill). Add: (a) `customerOrderId` + position
prefill to the retail-sale create schema/service (set the existing relation), (b) a
retail-sale create surface that accepts `?fromOrder=<id>` (the POS is session-based — may
need a non-session "from order" create path), (c) un-disable + wire the menu item. Mostly
a BRIDGE on top of an existing module, not a from-scratch build.

## 2. Снабжение (Ta'minot / procurement planning)  — NOT built (name clash!)
Real-world: a procurement-PLANNING workspace — looks at demand vs stock and proposes
purchase orders to suppliers to cover shortfalls.

**Name clash to avoid:** our `apps/api/src/modules/supply/` + `/supplies` web page is
«Приёмка» (goods RECEIPT against a purchase order — `CreateFromPurchaseOrderSchema`), a
DIFFERENT document. It is NOT «Снабжение». Do not conflate them.

**Note:** the narrow «create a purchase order to cover this order's shortfall» need is
ALREADY served by the ENABLED «Заказ поставщику с учётом доступно» item (CO
`getSupplyShortfall` → `/purchase-orders/new?fromOrder=...`). moysklad's standalone
«Снабжение» planning module (multi-order demand aggregation) is the un-built part — a
genuine new module (list + planning UI + backend). Lowest priority; partly redundant
with the existing shortfall-PO flow.

## 3. Волна отбора (Yig'ish to'lqini / pick wave)  — NOT built (nothing exists)
Real-world: a WAREHOUSE picking wave — groups several orders into one optimised
shelf-collection list so a picker gathers goods for many orders in one pass.

**Existing scaffolding:** NONE (no model, no API module, no web page). Full from-scratch
build: `PickingWave` model + positions, API module (list/create/post), web pages
(list/new/[id]), and the order→wave linkage. A complete new vertical. Highest effort,
warehouse-WMS feature — only worth it if the account runs wave picking.

## Priority recommendation (when building later)
1. **Розничная продажа** — most-used; a bridge on an EXISTING module (cheapest, high value).
2. **Снабжение** — a planning module; lower value (shortfall-PO already covers the common need).
3. **Волна отбора** — full new WMS vertical; build only if the account does wave picking.

## Honesty correction (logged)
An earlier statement in this session called these «3 modules that don't exist / 3 separate
products». That was imprecise: retail-sale + supply(=Приёмка) modules DO exist; the real
gaps are the from-order BRIDGES (retail), a planning module (Снабжение, partly redundant),
and one genuinely-absent vertical (Волна отбора). Verify against this file before building.

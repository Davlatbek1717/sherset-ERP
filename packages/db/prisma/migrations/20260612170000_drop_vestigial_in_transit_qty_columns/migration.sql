-- Drop the vestigial `in_transit_qty` columns on `stocks` and
-- `purchase_order_positions`.
--
-- Both were designed-but-unwired denormalisations: NOTHING ever wrote them.
-- Every `StockService` upsert created `stocks.in_transit_qty` as 0 and no
-- increment/decrement existed anywhere; `purchase_order_positions.in_transit_qty`
-- (a "reserved expected stock" scaffold) had zero writes repo-wide. They sat at
-- their migration DEFAULT 0 forever — yet `StockService.getBalances` /
-- `lockBalances` surfaced the permanent 0 to the UI-facing `/stocks` endpoint
-- (Demand/Loss/Inventory/Move stock badges), the same silent-wrong-0 trap the
-- 11h «Ниже минимума» / 11s `products.stock_minor` audits removed.
--
-- The stock-balance report's «Ожидание» / in-transit column now derives
-- expected-incoming at QUERY TIME from active supplier-order positions
-- (MAX(0, quantity − received_qty) over confirmed/partially_received POs,
-- 2026-06-12) — it never read these columns. Verified repo-wide: no app code,
-- seed, sync, or test reads them, so they are removed.
ALTER TABLE "stocks" DROP COLUMN "in_transit_qty";

ALTER TABLE "purchase_order_positions" DROP COLUMN "in_transit_qty";

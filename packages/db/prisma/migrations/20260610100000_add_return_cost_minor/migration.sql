-- Per-unit weighted-average COST frozen at post-time on customer/supplier
-- return positions (tiyin). Before this, post() restored/removed inventory at
-- the SALE/DOCUMENT price basis, so a posted return drifted
-- Stock.costBalanceMinor by the margin (sales-return: +margin; purchase-return:
-- price≠cost). Now post() freezes the store's weighted-average unit cost here
-- (costBalanceMinor ÷ qty-on-hand, same basis as Loss 3add5a13) and unpost()/
-- cancel() reverse the identical value → cost zero-sum. Additive nullable
-- column; NULL on drafts and on pre-existing rows (already-posted historical
-- returns keep their original stock ledger; only NEW posts use the cost basis).
ALTER TABLE "sales_return_positions" ADD COLUMN "cost_minor" BIGINT;
ALTER TABLE "purchase_return_positions" ADD COLUMN "cost_minor" BIGINT;

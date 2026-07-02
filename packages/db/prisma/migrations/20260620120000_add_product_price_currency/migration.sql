-- Per-price currency for buyPrice / minPrice (moysklad parity: each price row
-- carries its own currency). Additive + nullable: NULL = the account base
-- currency, so every existing row keeps its current (base) meaning. Sale prices
-- already carry currencyCode inside the salePrices JSON.
ALTER TABLE "products" ADD COLUMN "buy_price_currency" VARCHAR(3);
ALTER TABLE "products" ADD COLUMN "min_price_currency" VARCHAR(3);

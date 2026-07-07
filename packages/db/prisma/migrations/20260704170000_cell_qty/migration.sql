-- Multi-bin Phase 2: per-cell quantity (manually maintained; null = not tracked).
-- Product.loc_qty  — units in the PRIMARY home bin (loc_sklad..loc_yacheyka).
-- product_locations.qty — units in each ADDITIONAL bin.

-- AlterTable
ALTER TABLE "products" ADD COLUMN "loc_qty" DECIMAL(20,6);

-- AlterTable
ALTER TABLE "product_locations" ADD COLUMN "qty" DECIMAL(20,6);

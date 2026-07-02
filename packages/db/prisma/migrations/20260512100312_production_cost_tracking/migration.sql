-- AlterTable
ALTER TABLE "processing_orders" ADD COLUMN     "moved_sum_minor" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "processings" ADD COLUMN     "materials_snapshot" JSONB;

-- AlterTable
ALTER TABLE "stocks" ADD COLUMN     "cost_balance_minor" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "processing_orders" ADD COLUMN     "delivery_planned_moment" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "retire_orders" ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
ADD COLUMN     "rate_value" BIGINT NOT NULL DEFAULT 100000000,
ADD COLUMN     "sync_id" UUID,
ADD COLUMN     "vat_sum_minor" BIGINT NOT NULL DEFAULT 0;

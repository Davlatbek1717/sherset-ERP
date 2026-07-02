-- AlterTable
ALTER TABLE "counterparties" ADD COLUMN     "actual_address" VARCHAR(255),
ADD COLUMN     "actual_address_full" JSONB,
ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "bonus_points" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discount_card_number" VARCHAR(100),
ADD COLUMN     "discounts" JSONB,
ADD COLUMN     "external_code" VARCHAR(255),
ADD COLUMN     "fax" VARCHAR(50),
ADD COLUMN     "legal_address_full" JSONB,
ADD COLUMN     "sync_id" UUID;

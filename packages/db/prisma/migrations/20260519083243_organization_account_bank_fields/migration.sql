-- AlterTable
ALTER TABLE "organization_accounts" ADD COLUMN     "bank_location" VARCHAR(255),
ADD COLUMN     "correspondent_account" VARCHAR(50);

-- AlterTable
ALTER TABLE "processing_process_positions" ALTER COLUMN "updated_at" DROP DEFAULT;

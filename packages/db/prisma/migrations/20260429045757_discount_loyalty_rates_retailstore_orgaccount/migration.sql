-- AlterTable
ALTER TABLE "discounts" ADD COLUMN     "earn_rate_uzs_to_point" DECIMAL(15,2),
ADD COLUMN     "earn_while_redeeming" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "max_paid_rate_percents" INTEGER,
ADD COLUMN     "spend_rate_points_to_uzs" DECIMAL(15,2);

-- AlterTable
ALTER TABLE "retail_stores" ADD COLUMN     "organization_account_id" UUID;

-- AddForeignKey
ALTER TABLE "retail_stores" ADD CONSTRAINT "retail_stores_organization_account_id_fkey" FOREIGN KEY ("organization_account_id") REFERENCES "organization_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

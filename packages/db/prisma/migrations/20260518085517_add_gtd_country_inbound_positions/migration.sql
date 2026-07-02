-- AlterTable
ALTER TABLE "sales_return_positions" ADD COLUMN     "country_id" UUID,
ADD COLUMN     "gtd_number" VARCHAR(255),
ADD COLUMN     "gtd_sum_minor" BIGINT;

-- AlterTable
ALTER TABLE "supply_positions" ADD COLUMN     "country_id" UUID,
ADD COLUMN     "gtd_number" VARCHAR(255),
ADD COLUMN     "gtd_sum_minor" BIGINT;

-- CreateIndex
CREATE INDEX "sales_return_positions_country_id_idx" ON "sales_return_positions"("country_id");

-- CreateIndex
CREATE INDEX "supply_positions_country_id_idx" ON "supply_positions"("country_id");

-- AddForeignKey
ALTER TABLE "supply_positions" ADD CONSTRAINT "supply_positions_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_positions" ADD CONSTRAINT "sales_return_positions_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

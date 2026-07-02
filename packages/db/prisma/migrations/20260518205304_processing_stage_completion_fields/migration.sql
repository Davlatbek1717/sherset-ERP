-- AlterTable
ALTER TABLE "processings" ADD COLUMN     "defect" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "enable_hour_accounting" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "labour_unit_cost_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "performer_id" UUID,
ADD COLUMN     "processing_stage_id" UUID,
ADD COLUMN     "standard_hour_cost_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "standard_hour_unit" DECIMAL(20,6) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "processings_account_id_processing_stage_id_idx" ON "processings"("account_id", "processing_stage_id");

-- AddForeignKey
ALTER TABLE "processings" ADD CONSTRAINT "processings_processing_stage_id_fkey" FOREIGN KEY ("processing_stage_id") REFERENCES "processing_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processings" ADD CONSTRAINT "processings_performer_id_fkey" FOREIGN KEY ("performer_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "processing_stages" ADD COLUMN     "all_performers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "next_stage_id" UUID;

-- AddForeignKey
ALTER TABLE "processing_stages" ADD CONSTRAINT "processing_stages_next_stage_id_fkey" FOREIGN KEY ("next_stage_id") REFERENCES "processing_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

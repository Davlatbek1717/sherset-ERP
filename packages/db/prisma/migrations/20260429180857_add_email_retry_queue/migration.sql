-- AlterTable
ALTER TABLE "email_logs" ADD COLUMN     "attachment_ids" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "attempted_at" TIMESTAMPTZ,
ADD COLUMN     "max_attempts" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "next_retry_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "email_logs_status_next_retry_at_idx" ON "email_logs"("status", "next_retry_at");

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT,
    "entity" VARCHAR(50),
    "entity_id" UUID,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_account_id_recipient_id_read_at_created_at_idx" ON "notifications"("account_id", "recipient_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_account_id_recipient_id_created_at_idx" ON "notifications"("account_id", "recipient_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

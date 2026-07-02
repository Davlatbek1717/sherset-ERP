-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "entity" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "uploader_id" UUID,
    "filename" VARCHAR(255) NOT NULL,
    "mime" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachments_account_id_entity_entity_id_created_at_idx" ON "attachments"("account_id", "entity", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "attachments_account_id_uploader_id_created_at_idx" ON "attachments"("account_id", "uploader_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "publications" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "target_type" VARCHAR(40) NOT NULL,
    "target_id" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "description" TEXT,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "last_viewed_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,
    "password_hash" VARCHAR(255),
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "publications_token_key" ON "publications"("token");

-- CreateIndex
CREATE INDEX "publications_account_id_revoked_at_expires_at_idx" ON "publications"("account_id", "revoked_at", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "publications_account_id_target_type_target_id_key" ON "publications"("account_id", "target_type", "target_id");

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

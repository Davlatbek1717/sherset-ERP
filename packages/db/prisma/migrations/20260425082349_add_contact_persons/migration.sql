-- CreateTable
CREATE TABLE "contact_persons" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "counterparty_id" UUID NOT NULL,
    "owner_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "position" VARCHAR(255),
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "description" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "contact_persons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_persons_account_id_counterparty_id_idx" ON "contact_persons"("account_id", "counterparty_id");

-- CreateIndex
CREATE INDEX "contact_persons_account_id_archived_idx" ON "contact_persons"("account_id", "archived");

-- AddForeignKey
ALTER TABLE "contact_persons" ADD CONSTRAINT "contact_persons_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_persons" ADD CONSTRAINT "contact_persons_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_persons" ADD CONSTRAINT "contact_persons_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

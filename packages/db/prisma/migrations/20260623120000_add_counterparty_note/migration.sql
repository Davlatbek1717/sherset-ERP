-- CreateTable
CREATE TABLE "counterparty_notes" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "counterparty_id" UUID NOT NULL,
    "author_id" UUID,
    "text" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "counterparty_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "counterparty_notes_account_id_counterparty_id_created_at_idx" ON "counterparty_notes"("account_id", "counterparty_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "counterparty_notes" ADD CONSTRAINT "counterparty_notes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_notes" ADD CONSTRAINT "counterparty_notes_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_notes" ADD CONSTRAINT "counterparty_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

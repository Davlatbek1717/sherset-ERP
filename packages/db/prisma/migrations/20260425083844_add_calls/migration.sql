-- CreateTable
CREATE TABLE "calls" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "counterparty_id" UUID,
    "contact_person_id" UUID,
    "owner_id" UUID,
    "direction" VARCHAR(10) NOT NULL,
    "channel" VARCHAR(20) NOT NULL DEFAULT 'call',
    "status" VARCHAR(20) NOT NULL DEFAULT 'completed',
    "started_at" TIMESTAMPTZ NOT NULL,
    "duration_sec" INTEGER,
    "external_number" VARCHAR(50),
    "summary" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calls_account_id_counterparty_id_started_at_idx" ON "calls"("account_id", "counterparty_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "calls_account_id_owner_id_started_at_idx" ON "calls"("account_id", "owner_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "calls_account_id_started_at_idx" ON "calls"("account_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "calls_account_id_archived_idx" ON "calls"("account_id", "archived");

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_contact_person_id_fkey" FOREIGN KEY ("contact_person_id") REFERENCES "contact_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

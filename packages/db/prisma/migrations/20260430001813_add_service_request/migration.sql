-- CreateTable
CREATE TABLE "service_requests" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "external_code" VARCHAR(50),
    "subject" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "counterparty_id" UUID,
    "contact_person_id" UUID,
    "assignee_id" UUID,
    "channel" VARCHAR(20) NOT NULL DEFAULT 'other',
    "priority" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "status" VARCHAR(30) NOT NULL DEFAULT 'new',
    "due_date" TIMESTAMPTZ,
    "resolved_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "attributes" JSONB DEFAULT '{}',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_requests_account_id_status_due_date_idx" ON "service_requests"("account_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "service_requests_account_id_assignee_id_status_idx" ON "service_requests"("account_id", "assignee_id", "status");

-- CreateIndex
CREATE INDEX "service_requests_account_id_counterparty_id_created_at_idx" ON "service_requests"("account_id", "counterparty_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "service_requests_account_id_name_key" ON "service_requests"("account_id", "name");

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_contact_person_id_fkey" FOREIGN KEY ("contact_person_id") REFERENCES "contact_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

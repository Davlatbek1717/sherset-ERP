-- CreateTable
CREATE TABLE "pipelines" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "pipeline_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "type" VARCHAR(10) NOT NULL DEFAULT 'open',
    "probability" INTEGER NOT NULL DEFAULT 50,
    "color" VARCHAR(7),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "number" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "pipeline_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "counterparty_id" UUID,
    "contact_person_id" UUID,
    "owner_id" UUID,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "probability" INTEGER,
    "expected_close_date" TIMESTAMPTZ,
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "closed_at" TIMESTAMPTZ,
    "source" VARCHAR(50),
    "lost_reason" TEXT,
    "description" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipelines_account_id_archived_idx" ON "pipelines"("account_id", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "pipelines_account_id_name_key" ON "pipelines"("account_id", "name");

-- CreateIndex
CREATE INDEX "pipeline_stages_account_id_pipeline_id_position_idx" ON "pipeline_stages"("account_id", "pipeline_id", "position");

-- CreateIndex
CREATE INDEX "opportunities_account_id_pipeline_id_stage_id_idx" ON "opportunities"("account_id", "pipeline_id", "stage_id");

-- CreateIndex
CREATE INDEX "opportunities_account_id_counterparty_id_status_idx" ON "opportunities"("account_id", "counterparty_id", "status");

-- CreateIndex
CREATE INDEX "opportunities_account_id_owner_id_status_idx" ON "opportunities"("account_id", "owner_id", "status");

-- CreateIndex
CREATE INDEX "opportunities_account_id_status_archived_idx" ON "opportunities"("account_id", "status", "archived");

-- CreateIndex
CREATE INDEX "opportunities_account_id_archived_created_at_idx" ON "opportunities"("account_id", "archived", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_account_id_number_key" ON "opportunities"("account_id", "number");

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_contact_person_id_fkey" FOREIGN KEY ("contact_person_id") REFERENCES "contact_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

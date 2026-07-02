-- AlterTable
ALTER TABLE "counterparties" ADD COLUMN     "bonus_program_id" UUID,
ADD COLUMN     "state_id" UUID;

-- CreateTable
CREATE TABLE "states" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "color" VARCHAR(9),
    "state_type" VARCHAR(20) NOT NULL DEFAULT 'Regular',
    "position" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bonus_programs" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "earn_rate_rules" JSONB,
    "transaction_type" VARCHAR(20) NOT NULL DEFAULT 'EARNING',
    "all_agents" BOOLEAN NOT NULL DEFAULT true,
    "agent_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "all_products" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "applicable_from_date" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bonus_programs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "states_account_id_entity_type_archived_idx" ON "states"("account_id", "entity_type", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "states_account_id_entity_type_name_key" ON "states"("account_id", "entity_type", "name");

-- CreateIndex
CREATE INDEX "bonus_programs_account_id_archived_idx" ON "bonus_programs"("account_id", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "bonus_programs_account_id_name_key" ON "bonus_programs"("account_id", "name");

-- CreateIndex
CREATE INDEX "counterparties_state_id_idx" ON "counterparties"("state_id");

-- AddForeignKey
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_bonus_program_id_fkey" FOREIGN KEY ("bonus_program_id") REFERENCES "bonus_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "states" ADD CONSTRAINT "states_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_programs" ADD CONSTRAINT "bonus_programs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

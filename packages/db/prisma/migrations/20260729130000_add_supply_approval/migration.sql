-- Qabul-tasdiqlash workflow (2026-07-29 spec): Supply.approval_stage + audit jadval
ALTER TABLE "supplies" ADD COLUMN "approval_stage" VARCHAR(30) NOT NULL DEFAULT 'none';

CREATE TABLE "supply_approval_events" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "supply_id" UUID NOT NULL,
    "from_stage" VARCHAR(30) NOT NULL,
    "to_stage" VARCHAR(30) NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "actor_type" VARCHAR(20) NOT NULL,
    "actor_id" UUID,
    "reason" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supply_approval_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supply_approval_events_account_id_supply_id_created_at_idx"
    ON "supply_approval_events"("account_id", "supply_id", "created_at");

ALTER TABLE "supply_approval_events" ADD CONSTRAINT "supply_approval_events_supply_id_fkey"
    FOREIGN KEY ("supply_id") REFERENCES "supplies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

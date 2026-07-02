-- Sherset custom (Part D — Yig'ish / picking):
--   1. Extend restock_tasks into a generic warehouse-task table: a `type`
--      ('restock' | 'picking'), a `sklad_no` (the warehouse zone a picking task
--      collects from), and a nullable `assignee_id` (a picking group whose sklad
--      has no keeper yet shows unassigned).
--   2. Add sklad_keepers — maps a sklad (warehouse zone) number → omborchi
--      (warehouse-keeper employee), so a sold order's lines route to the right
--      keeper by their products' bin-code first segment.

ALTER TABLE "restock_tasks" ADD COLUMN "type" VARCHAR(20) NOT NULL DEFAULT 'restock';
ALTER TABLE "restock_tasks" ADD COLUMN "sklad_no" INTEGER;
ALTER TABLE "restock_tasks" ALTER COLUMN "assignee_id" DROP NOT NULL;

CREATE INDEX "restock_tasks_account_id_type_idx" ON "restock_tasks" ("account_id", "type");

CREATE TABLE "sklad_keepers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "account_id" UUID NOT NULL,
  "sklad_no" INTEGER NOT NULL,
  "employee_id" UUID NOT NULL,
  "employee_name" VARCHAR(255),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "sklad_keepers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sklad_keepers_account_id_sklad_no_key" ON "sklad_keepers" ("account_id", "sklad_no");
CREATE INDEX "sklad_keepers_account_id_idx" ON "sklad_keepers" ("account_id");

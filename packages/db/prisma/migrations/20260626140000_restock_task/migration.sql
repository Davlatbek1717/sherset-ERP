-- Sherset custom: return-to-warehouse restock tasks. A cashier sends returned
-- goods (a SalesReturn) to a warehouse-keeper (omborchi); the task carries a
-- snapshot of each returned product + its home bin location, confirmed per-line.

CREATE TABLE "restock_tasks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "account_id" UUID NOT NULL,
  "source_type" VARCHAR(30) NOT NULL DEFAULT 'salesreturn',
  "source_id" UUID NOT NULL,
  "source_name" VARCHAR(255),
  "store_id" UUID,
  "store_name" VARCHAR(255),
  "assignee_id" UUID NOT NULL,
  "assignee_name" VARCHAR(255),
  "created_by_id" UUID NOT NULL,
  "created_by_name" VARCHAR(255),
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "restock_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "restock_task_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "account_id" UUID NOT NULL,
  "restock_task_id" UUID NOT NULL,
  "product_id" UUID,
  "product_name" VARCHAR(255) NOT NULL,
  "quantity" DECIMAL(20,6) NOT NULL,
  "bin_location" VARCHAR(20),
  "confirmed_at" TIMESTAMPTZ,
  "confirmed_by_id" UUID,
  "confirmed_by_name" VARCHAR(255),
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "restock_task_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "restock_tasks_account_id_status_created_at_idx" ON "restock_tasks" ("account_id", "status", "created_at" DESC);
CREATE INDEX "restock_tasks_account_id_assignee_id_status_idx" ON "restock_tasks" ("account_id", "assignee_id", "status");
CREATE INDEX "restock_tasks_account_id_source_type_source_id_idx" ON "restock_tasks" ("account_id", "source_type", "source_id");
CREATE INDEX "restock_task_lines_restock_task_id_position_idx" ON "restock_task_lines" ("restock_task_id", "position");
CREATE INDEX "restock_task_lines_account_id_product_id_idx" ON "restock_task_lines" ("account_id", "product_id");

ALTER TABLE "restock_task_lines" ADD CONSTRAINT "restock_task_lines_restock_task_id_fkey"
  FOREIGN KEY ("restock_task_id") REFERENCES "restock_tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

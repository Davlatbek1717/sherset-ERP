-- §126 — ProcessingStage becomes a STANDALONE moysklad catalog;
-- ProcessingProcess gets POSITIONS (referencing stages) with a
-- nextPositions DAG. DATA-PRESERVING: every existing
-- processing_stages row (which had process_id + position +
-- next_stage_id) is migrated into a processing_process_positions
-- row (process↔stage link + order kept) and next_stage_id links
-- become DAG edges, BEFORE the per-process columns are dropped.

-- 1. Standalone moysklad fields on processing_stages (additive first).
ALTER TABLE "processing_stages"
  ADD COLUMN "distribution_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "material_store_id" UUID,
  ADD COLUMN "standard_hour_cost_minor" BIGINT NOT NULL DEFAULT 0;

-- 2. New tables (positions / performers / DAG edges).
CREATE TABLE "processing_stage_performers" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    CONSTRAINT "processing_stage_performers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "processing_process_positions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "process_id" UUID NOT NULL,
    "processing_stage_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "processing_process_positions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "processing_process_position_edges" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "from_position_id" UUID NOT NULL,
    "to_position_id" UUID NOT NULL,
    CONSTRAINT "processing_process_position_edges_pkey" PRIMARY KEY ("id")
);

-- 3. BACKFILL — one position per existing stage (preserves the
--    process↔stage link + display order).
INSERT INTO "processing_process_positions"
  ("id", "account_id", "process_id", "processing_stage_id", "position", "created_at", "updated_at")
SELECT gen_random_uuid(), "account_id", "process_id", "id", "position", now(), now()
FROM "processing_stages";

-- 4. BACKFILL — turn each old next_stage_id link into a DAG edge
--    (each stage has exactly one position from step 3).
INSERT INTO "processing_process_position_edges"
  ("id", "account_id", "from_position_id", "to_position_id")
SELECT gen_random_uuid(), p1."account_id", p1."id", p2."id"
FROM "processing_stages" s
JOIN "processing_process_positions" p1 ON p1."processing_stage_id" = s."id"
JOIN "processing_process_positions" p2 ON p2."processing_stage_id" = s."next_stage_id"
WHERE s."next_stage_id" IS NOT NULL;

-- 5. Indexes.
CREATE INDEX "processing_stage_performers_account_id_stage_id_idx" ON "processing_stage_performers"("account_id", "stage_id");
CREATE UNIQUE INDEX "processing_stage_performers_stage_id_employee_id_key" ON "processing_stage_performers"("stage_id", "employee_id");
CREATE INDEX "processing_process_positions_account_id_process_id_position_idx" ON "processing_process_positions"("account_id", "process_id", "position");
CREATE INDEX "processing_process_position_edges_account_id_from_position__idx" ON "processing_process_position_edges"("account_id", "from_position_id");
CREATE UNIQUE INDEX "processing_process_position_edges_from_position_id_to_posit_key" ON "processing_process_position_edges"("from_position_id", "to_position_id");
CREATE INDEX "processing_stages_account_id_archived_idx" ON "processing_stages"("account_id", "archived");

-- 6. FKs for the new tables + the new processing_stages.material_store_id.
ALTER TABLE "processing_stages" ADD CONSTRAINT "processing_stages_material_store_id_fkey" FOREIGN KEY ("material_store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "processing_stage_performers" ADD CONSTRAINT "processing_stage_performers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "processing_stage_performers" ADD CONSTRAINT "processing_stage_performers_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "processing_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "processing_stage_performers" ADD CONSTRAINT "processing_stage_performers_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "processing_process_positions" ADD CONSTRAINT "processing_process_positions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "processing_process_positions" ADD CONSTRAINT "processing_process_positions_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "processing_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "processing_process_positions" ADD CONSTRAINT "processing_process_positions_processing_stage_id_fkey" FOREIGN KEY ("processing_stage_id") REFERENCES "processing_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "processing_process_position_edges" ADD CONSTRAINT "processing_process_position_edges_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "processing_process_position_edges" ADD CONSTRAINT "processing_process_position_edges_from_position_id_fkey" FOREIGN KEY ("from_position_id") REFERENCES "processing_process_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "processing_process_position_edges" ADD CONSTRAINT "processing_process_position_edges_to_position_id_fkey" FOREIGN KEY ("to_position_id") REFERENCES "processing_process_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Now safe to drop the per-process columns from processing_stages
--    (their data is preserved in processing_process_positions /
--    processing_process_position_edges above).
ALTER TABLE "processing_stages" DROP CONSTRAINT "processing_stages_next_stage_id_fkey";
ALTER TABLE "processing_stages" DROP CONSTRAINT "processing_stages_process_id_fkey";
DROP INDEX "processing_stages_account_id_process_id_position_idx";
ALTER TABLE "processing_stages"
  DROP COLUMN "default",
  DROP COLUMN "next_stage_id",
  DROP COLUMN "position",
  DROP COLUMN "process_id";

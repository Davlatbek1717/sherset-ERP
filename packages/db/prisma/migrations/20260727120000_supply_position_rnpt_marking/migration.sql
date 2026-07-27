-- Приёмка «РНПТ» + «Маркировка» (Честный знак) per-position free-text fields.
-- Idempotent (IF NOT EXISTS) so a re-run / drifted prod applies cleanly.
ALTER TABLE "supply_positions" ADD COLUMN IF NOT EXISTS "rnpt" VARCHAR(255);
ALTER TABLE "supply_positions" ADD COLUMN IF NOT EXISTS "marking" VARCHAR(500);

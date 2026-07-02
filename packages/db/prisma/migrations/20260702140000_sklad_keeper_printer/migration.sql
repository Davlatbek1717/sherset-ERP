-- Per-warehouse printer routing: each sklad-keeper zone can name the Windows
-- printer its picking sheet is sent to (via the local print-agent).
ALTER TABLE "sklad_keepers" ADD COLUMN IF NOT EXISTS "printer_name" VARCHAR(255);

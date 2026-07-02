-- Optimistic concurrency version column (moysklad parity).
-- Incremented on every field-edit save; a stale value rejects the write
-- with HTTP 409 so two users editing the same row cannot silently
-- lost-update each other. Existing rows default to version 1.

-- AlterTable
ALTER TABLE "products" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "variants" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Atomic per-account document-number counter. Replaces the read-max-then-insert
-- auto-numbering used by every document service:
--
--   const last = await prisma.<doc>.findFirst({
--     where: { accountId, name: { startsWith: prefix } },
--     orderBy: { name: 'desc' }, select: { name: true },
--   });
--   const next = (parseInt(last?.name.slice(prefix.length)) || 0) + 1;  // RACE
--
-- Two concurrent creates read the same `last`, both compute the same next
-- number, both INSERT the same "ЗП-2026-NNNNN". The loser hits the
-- (account_id, name) unique constraint and `handlePrisma` maps the P2002 to a
-- ConflictException (HTTP 409) with NO retry — so the second create is silently
-- dropped. A 12-way concurrent burst reproduced 3 success / 9 spurious-409.
-- This bites multi-user editing, e-commerce order sync, and bulk import.
--
-- Number allocation now goes through an atomic `UPDATE ... SET value = value + 1`
-- (row-locked, serialises concurrent allocations → distinct values). One row per
-- (account, key) where key is the doc-type + year prefix. Lazily seeded from the
-- current max per (account, prefix) on first use. Additive — no existing table
-- is touched.

CREATE TABLE "document_sequences" (
    "account_id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("account_id", "key")
);

ALTER TABLE "document_sequences"
    ADD CONSTRAINT "document_sequences_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

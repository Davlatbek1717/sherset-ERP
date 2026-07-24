-- Trigram search indexes (perf audit 2026-07-23).
--
-- The list search boxes use ILIKE '%term%' (Prisma `contains` + insensitive),
-- which a btree index cannot serve (leading wildcard) → full seq-scan. GIN +
-- pg_trgm turns those into index scans on the largest searched tables
-- (demands ~44k, products, counterparties). OFFLINE authored (no local DB) →
-- applied by `prisma migrate deploy`. Matches the `@@index(..., type: Gin,
-- ops: raw("gin_trgm_ops"))` declarations in schema.prisma (so `migrate dev`
-- will not later drop these as drift).
--
-- pg_trgm is a TRUSTED extension (PG13+): the DB owner can create it. If the
-- deploy DB user lacks the privilege, create it once as superuser then
-- re-deploy (CREATE EXTENSION IF NOT EXISTS is then a no-op needing no privilege):
--   sudo -u postgres psql -d sherset -c "CREATE EXTENSION IF NOT EXISTS pg_trgm"
--
-- CREATE INDEX briefly locks the table; at these row counts (<50k) it is
-- sub-second — deploy at low load.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "demands_name_trgm_idx" ON "demands" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "demands_description_trgm_idx" ON "demands" USING gin ("description" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "products_name_trgm_idx" ON "products" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "counterparties_name_trgm_idx" ON "counterparties" USING gin ("name" gin_trgm_ops);

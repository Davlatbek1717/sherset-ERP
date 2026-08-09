-- Index pack — audit 2026-08-08, REJA faza 25 (DB-04, DB-05, DB-08, PERF-12, PERF-14).
-- Indexes ONLY: no column, constraint or application-logic change. No UNIQUE is
-- added (barcode/INN duplicates must be merged by a separate data-migration first).
--
-- Every expression below was taken from the SQL Prisma 5.22 actually emits
-- (captured with `log: ['query']`) and then from how Postgres normalizes it in
-- EXPLAIN — NOT from how the ORM filter reads. That matters: the audit proposed
-- `((uz_requisites->>'inn'))`, but Prisma emits `#>>ARRAY['inn']::text[]`
-- (jsonb_extract_path_text), and Postgres only matches an expression index whose
-- parse tree is identical, so a `->>` index would never be used.
--
-- CREATE INDEX takes a SHARE lock (blocks writes on that table) for its duration;
-- these tables are <100k rows today, so it is seconds — deploy at low load.
-- CONCURRENTLY is not usable: Prisma runs each migration inside a transaction.
--
-- IF NOT EXISTS everywhere: the deploy DBs are not `_prisma_migrations`-tracked
-- (see the project notes), so this file is also applied by hand via
-- `prisma db execute` — re-running it must stay a no-op.

-- ---------------------------------------------------------------------------
-- DB-08 — FK columns Postgres does not index by itself.
-- Single-column on purpose: these UUID FKs are already account-unique (so the
-- account-scoped list filter stays selective) and only a leading FK column can
-- serve the referential-integrity scan the parent's ON DELETE SET NULL /
-- RESTRICT runs (`WHERE status_id = $1` — that query has no account_id).
-- ---------------------------------------------------------------------------

-- CreateIndex
CREATE INDEX IF NOT EXISTS "customer_orders_status_id_idx" ON "customer_orders"("status_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "customer_orders_contract_id_idx" ON "customer_orders"("contract_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "customer_orders_project_id_idx" ON "customer_orders"("project_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "customer_orders_store_id_idx" ON "customer_orders"("store_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "demands_status_id_idx" ON "demands"("status_id");

-- PERF-12 — «Покупатели» tab: `id IN (SELECT agent_id FROM retail_sales …)`.
-- CreateIndex
CREATE INDEX IF NOT EXISTS "retail_sales_agent_id_idx" ON "retail_sales"("agent_id");

-- DB-08 — «Muammoli qarzdorlar» scope: (account_id, problem, status).
-- CreateIndex
CREATE INDEX IF NOT EXISTS "debts_account_id_problem_status_idx" ON "debts"("account_id", "problem", "status");

-- ---------------------------------------------------------------------------
-- DB-04 — POS barcode scan: `barcodes: { has: tok }` → `barcodes @> ARRAY[tok]`.
-- Only GIN array_ops serves the containment operator (btree cannot).
-- gin_trgm_ops is NOT needed here (that is for LIKE on text, not array @>).
-- ---------------------------------------------------------------------------

-- CreateIndex
CREATE INDEX IF NOT EXISTS "products_barcodes_gin_idx" ON "products" USING GIN ("barcodes" array_ops);

-- ---------------------------------------------------------------------------
-- The two below are EXPRESSION indexes, which Prisma cannot express in
-- schema.prisma — they live in migration history only.
--
-- Drift: MEASURED after applying this file — `prisma migrate diff
-- --from-schema-datasource --to-schema-datamodel` emits neither DROP nor any
-- mention of them. Prisma's introspection simply cannot see an index it cannot
-- represent, so a later `migrate dev` will NOT drop them. (It also means they
-- are invisible in schema.prisma — this file is their only documentation.)
-- ---------------------------------------------------------------------------

-- PERF-14 — warehouse cell scanner (product.service.ts, `attributes` JSON path
-- `__yacheyka`). Prisma emits:
--   (attributes #> ARRAY['__yacheyka']::text[])::jsonb::jsonb = $1
-- which Postgres normalizes to `(attributes #> '{__yacheyka}'::text[])` — the
-- no-op ::jsonb casts are dropped, so the index expression below matches.
-- Partial on `deleted_at IS NULL` because the query always carries that predicate.
-- CreateIndex
CREATE INDEX IF NOT EXISTS "products_yacheyka_idx"
  ON "products" ((("attributes" #> '{__yacheyka}'::text[])))
  WHERE "deleted_at" IS NULL;

-- DB-05 — counterparty INN filter (counterparty.service.ts, `string_contains`).
-- Prisma emits `(uz_requisites #>> ARRAY['inn']::text[]) LIKE '%…%'`; a leading
-- wildcard rules out btree, so this is trigram GIN over the extracted text.
-- pg_trgm is already installed (migration 20260723150000_trgm_search_indexes).
-- CreateIndex
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "counterparties_inn_trgm_idx"
  ON "counterparties" USING GIN (((("uz_requisites" #>> '{inn}'::text[]))) gin_trgm_ops);

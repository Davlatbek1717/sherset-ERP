-- Sherset ERP — per-database PostgreSQL tuning (applied to the `sherset` DB only).
-- Multi-tenant box: the postgres CLUSTER also serves erp/akademiya/sherset_servis,
-- so we use per-DATABASE settings (ALTER DATABASE) — NOT cluster-wide postgresql.conf —
-- to avoid touching other tenants and to avoid a cluster restart.
--
-- Applied 2026-07-23 (perf audit P3). Re-apply after any DB restore/rebuild.
-- Effect: new connections to `sherset` pick these up; existing pooled API connections
-- pick them up as they recycle (or on `pm2 restart sherset-api`).
--
--   run as:  sudo -u postgres psql -d sherset -f db-tuning.sql

-- Disk is SSD (lsblk rota=0) → the default random_page_cost=4 (HDD) wrongly
-- discourages index scans. 1.1 reflects SSD random-read cost, so the planner
-- prefers index scans on borderline queries.
ALTER DATABASE sherset SET random_page_cost = 1.1;

-- Default work_mem=4MB spills larger sorts/hashes/aggregates to disk. Measured:
-- a 161k-row demand_positions sort spilled 22MB → 1122ms; at 16MB it stays
-- in-memory → 536ms (−52%). 16MB × ~pool size stays well within the 12GB box.
-- (16384 = 16MB in kB.)
ALTER DATABASE sherset SET work_mem = 16384;

-- Verify (fresh session):
--   SHOW random_page_cost;  -- expect 1.1
--   SHOW work_mem;          -- expect 16MB

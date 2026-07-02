-- H4 record-scope (RFC _H4-OWN-GROUP-SCOPE-RFC.md, W4). Per-account opt-in for
-- OWN/OWN_GROUP per-record visibility enforcement. Default FALSE — when false the
-- read-path adds no scope filter (today's behaviour). Backward-compatible, no backfill.
ALTER TABLE "accounts" ADD COLUMN "record_scope_enforced" BOOLEAN NOT NULL DEFAULT false;

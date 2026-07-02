-- Backfill RBAC permissions for the new 'analitika' entity on EXISTING roles.
-- In the seed matrix every entity gets identical (action -> scope) rows per
-- role (scope depends only on role+action, not entity), so the already-seeded
-- 'report' entity is a faithful template. Copy its rows as 'analitika'.
-- Idempotent: ON CONFLICT DO NOTHING. New accounts already seed 'analitika'
-- directly (it is in the entities universe), and this guard skips duplicates.
INSERT INTO "role_permissions" ("role_id", "entity", "action", "scope")
SELECT "role_id", 'analitika', "action", "scope"
FROM "role_permissions"
WHERE "entity" = 'report'
ON CONFLICT ("role_id", "entity", "action") DO NOTHING;

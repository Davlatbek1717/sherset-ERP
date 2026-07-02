-- Refresh-token rotation grace window (cross-tab refresh race — residual of
-- the 2026-06-10h auth single-flight fix 006f2fe4): the API rotates the
-- refresh cookie on every /auth/refresh and immediately revoked the old
-- token, so two browser TABS (separate JS contexts — the FE single-flight
-- cannot help there) racing a refresh with the same cookie logged the loser
-- out. New columns:
--   family_id      — rotation lineage root (the login token's own id),
--                    inherited by every rotation successor; lets a post-grace
--                    replay revoke the WHOLE stolen lineage in one UPDATE
--                    (OWASP reuse detection) without nuking the user's other
--                    devices/browsers.
--   replaced_by_id — set when a token is revoked BY ROTATION (vs logout);
--                    rotation-revoked tokens stay re-usable for a short grace
--                    window so the racing tab gets a sibling token instead of
--                    a 401 logout.
-- Additive; backfill family_id = id so every pre-existing row is its own
-- family root.
ALTER TABLE "refresh_tokens" ADD COLUMN "family_id" UUID;
ALTER TABLE "refresh_tokens" ADD COLUMN "replaced_by_id" UUID;
UPDATE "refresh_tokens" SET "family_id" = "id" WHERE "family_id" IS NULL;
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- Optimistic concurrency version column (moysklad parity) for the Employee
-- model — the "pair lock" deferred by the 2026-06-08h gap-sweep. One physical
-- row is editable from THREE field-edit forms, so all three lost-update
-- surfaces converge on this single column:
--   /hr/employees           (HR module, PUT)   — header field edit
--   /analitika/staff/:id     (Analitika, PATCH) — Class A child-array (EmployeeRole rewrite in tx)
--   /auth/me                 (self-profile)     — fullName/phone (bump-only)
--
-- The lock is applied ONLY to those edit-form update() paths + the writers of
-- form-visible fields (archive/restore/set-password bump version so a stale
-- edit-form save 409s). Auth bookkeeping writes (login success/failure
-- last_login_at + failed_login_attempts + locked_until, and password_hash) are
-- deliberately LEFT UNGUARDED: they are not edit-form fields, so versioning
-- them would 409 every open admin edit-form after any login — the exact
-- false-409 hazard that caused this pair to be deferred for focused design.
-- Additive: existing rows default to version 1.
-- See _PHASE2-optimistic-lock.audit.md (Employee-pair section) for the per-writer design.

ALTER TABLE "employees" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

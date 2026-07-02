-- Optimistic concurrency version column (moysklad parity) for the 7 entities
-- the prior "rollout complete (47 entities)" claim MISSED. Each has a real
-- field-edit update() reachable from a dedicated detail/edit form where two
-- users can load the same record and silently clobber each other (lost-update);
-- a recon of all 28 services with an unlocked update() classified these 7 as
-- GAP and the other 19 as N/A-by-design (bespoke / inline-CRUD settings modals /
-- no edit form / per-user personal records). Additive: existing rows default to
-- version 1. The lock is applied ONLY to the draft field-edit update() (the same
-- scope as the other 47) — FSM transitions, clone, softDelete and mass-edit stay
-- unlocked (documented post-during-edit TOCTOU residual). See
-- _PHASE2-optimistic-lock.audit.md (gap-sweep section) for the per-entity design.
--
-- price-list  — Прайс-листы (header-only)
-- task        — Задачи / CRM task (header-only)
-- store       — Склады (header-only)
-- pipeline    — Воронки / CRM pipeline (nested child-array: stages rewrite in tx)
-- payroll     — Зарплата document (nested child-array: lines rewrite in tx)
-- organization-account — Счета организации / bank account (config-in-tx: demote-default)
-- role        — RBAC role + permission matrix (config-in-tx: matrix rewrite)

ALTER TABLE "price_lists" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "tasks" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "stores" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "pipelines" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "payrolls" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "organization_accounts" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "roles" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- H4 P2 — backfill `group_id` (creating department) on the core transactional
-- documents from the creating employee's group. Pairs with the P1 create-stamp
-- (commits ae1ce994 + this round): P1 stamps NEW rows, P2 fills EXISTING rows.
--
-- Read-only-safe: nothing enforces record scope yet (no RECORD_SCOPE_ENFORCED /
-- no scopedWhere call), so this only populates the column the future OWN_GROUP
-- visibility check will read — no behaviour change.
--
-- Idempotent: WHERE group_id IS NULL (re-running is a no-op). Reversible: set the
-- backfilled rows back to NULL. Only fills from employees that HAVE a group.
-- See docs/audits/_H4-OWN-GROUP-SCOPE-RFC.md (W2).

UPDATE "demands"                  d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL;
UPDATE "supplies"                 d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL;
UPDATE "customer_orders"          d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL;
UPDATE "invoices_out"             d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL;
UPDATE "invoices_in"              d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL;
UPDATE "sales_returns"            d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL;
UPDATE "purchase_returns"         d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL;
UPDATE "purchase_orders"          d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL;
UPDATE "cash_in"                  d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL;
UPDATE "cash_out"                 d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL;
UPDATE "payments_in"              d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL;
UPDATE "payments_out"             d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL;
UPDATE "prepayments"              d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL;
UPDATE "prepayment_returns"       d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL;
UPDATE "counterparty_adjustments" d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL;
UPDATE "internal_orders"          d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL;
UPDATE "moves"                    d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL;
UPDATE "losses"                   d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL;
UPDATE "enters"                   d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL;
UPDATE "inventories"              d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL;

-- Optimistic concurrency version column (moysklad parity) for Tier-1 simple-CRUD
-- editable entities. Additive: existing rows default to version 1. See the
-- product/variant rollout (migration optimistic_lock_product_variant) for the pattern.

ALTER TABLE "cash_desks" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "contact_persons" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "counterparties" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "custom_entities" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "discounts" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "expense_items" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "label_templates" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "opportunities" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "organizations" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "price_types" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "projects" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "publications" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "sales_channels" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "tax_rates" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "tracking_codes" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "uoms" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

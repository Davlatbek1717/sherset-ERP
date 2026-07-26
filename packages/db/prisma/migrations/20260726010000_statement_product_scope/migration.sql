-- Product-scoped statements: agent optional, add product_id.
ALTER TABLE "counterparty_statement" ALTER COLUMN "counterparty_id" DROP NOT NULL;
ALTER TABLE "counterparty_statement" ADD COLUMN "product_id" UUID;

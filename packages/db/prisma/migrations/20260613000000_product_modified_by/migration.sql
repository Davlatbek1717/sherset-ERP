-- «Кто изменил» (last-modifier) for products, mirroring the established
-- purchase_orders.modified_by_id convention (20260508165830). Nullable FK to
-- employees with ON DELETE SET NULL so removing an employee blanks the
-- attribution rather than blocking the delete or orphaning the row.

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "modified_by_id" UUID;

-- CreateIndex
CREATE INDEX "products_account_id_modified_by_id_idx" ON "products"("account_id", "modified_by_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_modified_by_id_fkey" FOREIGN KEY ("modified_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

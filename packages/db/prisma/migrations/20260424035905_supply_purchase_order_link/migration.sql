-- AlterTable
ALTER TABLE "supplies" ADD COLUMN     "purchase_order_id" UUID;

-- AlterTable
ALTER TABLE "supply_positions" ADD COLUMN     "purchase_order_position_id" UUID;

-- CreateIndex
CREATE INDEX "supplies_account_id_purchase_order_id_idx" ON "supplies"("account_id", "purchase_order_id");

-- CreateIndex
CREATE INDEX "supply_positions_account_id_purchase_order_position_id_idx" ON "supply_positions"("account_id", "purchase_order_position_id");

-- AddForeignKey
ALTER TABLE "supplies" ADD CONSTRAINT "supplies_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_positions" ADD CONSTRAINT "supply_positions_purchase_order_position_id_fkey" FOREIGN KEY ("purchase_order_position_id") REFERENCES "purchase_order_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

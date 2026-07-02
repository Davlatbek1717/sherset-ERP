-- moysklad custom document status: CustomerOrder.statusId -> State (entityType="customerorder").
-- Additive + nullable; the `state` FSM column is untouched. ON DELETE SET NULL so deleting
-- a status just clears it on documents (no cascade delete of orders).

-- AlterTable
ALTER TABLE "customer_orders" ADD COLUMN "status_id" UUID;

-- AddForeignKey
ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

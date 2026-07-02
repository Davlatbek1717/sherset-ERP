-- moysklad parity: a payment-in operation can allocate to a Customer Order
-- DIRECTLY (Заказ покупателя), not only an Invoice. Additive, nullable column
-- + index + FK (ON DELETE SET NULL). Mirrors the invoiceOutId wiring.

-- AlterTable
ALTER TABLE "payment_in_operations" ADD COLUMN     "customer_order_id" UUID;

-- CreateIndex
CREATE INDEX "payment_in_operations_account_id_customer_order_id_idx" ON "payment_in_operations"("account_id", "customer_order_id");

-- AddForeignKey
ALTER TABLE "payment_in_operations" ADD CONSTRAINT "payment_in_operations_customer_order_id_fkey" FOREIGN KEY ("customer_order_id") REFERENCES "customer_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

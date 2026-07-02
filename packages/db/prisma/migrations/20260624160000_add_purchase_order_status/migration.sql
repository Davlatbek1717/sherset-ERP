-- moysklad «Статус» on «Заказ поставщику» — account-defined custom status
-- (State row, entityType="purchaseorder"), mirroring CustomerOrder.statusId.
-- Orthogonal to the FSM `state` column + the «Проведено» flag: the header pill
-- shows a grey «Статус» until the admin creates statuses in Настройки. SetNull
-- so deleting a status just unlinks the orders that used it (no cascade).
ALTER TABLE "purchase_orders" ADD COLUMN     "status_id" UUID;

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

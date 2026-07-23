-- moysklad «Статус» on «Счёт покупателю» (InvoiceOut) — account-defined custom
-- status (State row, entityType="invoiceout"), mirroring Supply.statusId.
-- Orthogonal to the FSM `state` column + the «Проведено» flag: the editor pill
-- sets it (PATCH :id/status) and /new sends it on create; the pill shows a grey
-- «Статус» until the admin creates statuses in Настройки. SetNull so deleting a
-- status just unlinks the invoices that used it (no cascade).
ALTER TABLE "invoices_out" ADD COLUMN     "status_id" UUID;

ALTER TABLE "invoices_out" ADD CONSTRAINT "invoices_out_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

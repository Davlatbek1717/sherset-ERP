-- Bitta POS qarz-to'lovining barcha qatorlarini bog'lovchi id.
-- Bitta summa FIFO bo'yicha N ta qarzga bo'linadi, PKO cheki esa BITTA hujjat:
-- chekni qayta chop etish uchun qatorlarni aniq yig'ish kerak (taxmin emas).
ALTER TABLE "debt_payments" ADD COLUMN "batch_id" UUID;

CREATE INDEX "debt_payments_account_id_batch_id_idx" ON "debt_payments"("account_id", "batch_id");

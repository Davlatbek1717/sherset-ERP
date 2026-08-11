-- P1 (2026-08-11) — «POS to'lovi BALANS bo'yicha ishlaydi».
--
-- Balansda mavjud qarzni to'lash uchun ochiladigan reyestr qatori BALANSGA
-- `+total` YOZMAYDI (qarz u yerda allaqachon bor). Bu ustun ana shu
-- assimetriyani hujjatlashtiradi va `remove()` teskari deltasini to'sadi.
-- `DEFAULT false` — mavjud qatorlarning hammasi odatdagi (balansga yozgan)
-- qarzlar, ya'ni backfill kerak emas.
ALTER TABLE "debts" ADD COLUMN IF NOT EXISTS "balance_adopted" BOOLEAN NOT NULL DEFAULT false;

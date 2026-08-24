-- G3 — vozvrat qabul oqimi: SalesReturn'ga manba KASSA CHEKI bog'i.
--
-- Nega yangi ustun (`demand_id` yetmaydi): POS sotuvi `Demand` hujjatini
-- YARATMAYDI — u `RetailSale`. Ya'ni «mijoz kassadan sotib oldi, keyin tovarni
-- omborga qaytardi» yo'lini mavjud `demand_id` bilan ifodalab bo'lmaydi.
-- `attributes` JSON ham yaramaydi: `AttributeMetadataService.validateAndNormalize`
-- ro'yxatdan o'tmagan kalitni TASHLAB YUBORADI (registrsiz `__` kaliti saqlanmaydi).
--
-- ON DELETE SET NULL: chek o'chirilsa vozvrat hujjati (pul va qoldiq izi) qoladi,
-- faqat manba bog'i uziladi — G1 to'lovi va mijoz balansi buzilmaydi.
--
-- Deploy bazalari har doim ham `_prisma_migrations` bilan kuzatilmaydi
-- (20260809140000 dagi eslatma) — har qadam idempotent: qayta yugurtirish
-- no-op bo'lib qolishi shart.

ALTER TABLE "sales_returns" ADD COLUMN IF NOT EXISTS "retail_sale_id" UUID;

DO $$ BEGIN
  ALTER TABLE "sales_returns"
    ADD CONSTRAINT "sales_returns_retail_sale_id_fkey"
    FOREIGN KEY ("retail_sale_id") REFERENCES "retail_sales"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "sales_returns_account_id_retail_sale_id_idx"
  ON "sales_returns"("account_id", "retail_sale_id");

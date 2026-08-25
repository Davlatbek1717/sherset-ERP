-- Q4 (2026-08-25) — «Kassa qarzining muddati SOZLANADIGAN bo'lsin»
-- Reja: docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md (§Q4, vazifa 4).
--
-- Q1 kassa chekidan tug'iladigan qarz qatoriga **14 kunlik** default muddat
-- qo'ygan edi (egasi, 2026-08-25: «hozircha shunday qur») va o'sha yerda
-- «Q4 da sozlanadigan bo'ladi» deb yozib qo'yilgan. Bu migratsiya AYNAN shu
-- sozlamani ochadi.
--
-- ⚠️ YANGI JADVAL OCHILMAYDI (reja talabi): sozlama mavjud akkaunt-singleton
-- `company_settings` qatoriga ustun bo'lib tushadi. Sherset sozlamalari
-- (`messaging_phone`, `messaging_card`, `receipt_printer_name`) allaqachon
-- shu yerda yashaydi — ikkinchi sozlamalar uyi qurilmaydi.
--
-- ⚠️ NULL SEMANTIKASI — NULL ≠ 0. Ustun NULLABLE va DEFAULT'siz:
--   NULL  = «akkaunt hech qachon sozlamagan» ⇒ kod Q1 ning
--           `DEFAULT_SALE_DEBT_TERM_DAYS` (14) ni oladi;
--   0     = «o'sha kuniyoq muddati keladi» — ATAYLAB qo'yilgan, HAQIQIY qiymat.
-- Ustunga `DEFAULT 14` qo'yilsa bu ikki holat bir-biridan ajralmasdi va
-- kelajakda default o'zgarsa jonlidagi qatorlar eski qiymatda MUZLAB qolardi.
--
-- PULGA VA MAVJUD QATORLARGA TA'SIRI YO'Q: bitta nullable ustun qo'shiladi,
-- birorta ham `UPDATE`/`DELETE` yo'q. Sozlama yozilmaguncha kassa qarzining
-- muddati AYNAN avvalgidek — post + 14 kun.
--
-- Deploy bazalari har doim ham `_prisma_migrations` bilan kuzatilmaydi
-- (20260809140000 dagi eslatma) — har qadam idempotent: qayta yugurtirish
-- no-op bo'lishi SHART.

ALTER TABLE "company_settings"
  ADD COLUMN IF NOT EXISTS "sale_debt_term_days" INTEGER;

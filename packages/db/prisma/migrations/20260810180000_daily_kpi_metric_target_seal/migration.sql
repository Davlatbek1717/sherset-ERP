-- KPI-03 / 4M TZ §2.3, §2.5 — KUNGA MUHRLANGAN MAQSAD.
--
-- `employee_kpi_targets` (KPI-01) ATAYLAB versiyalanmaydi. `kpi_profile_versions`
-- ning yagona vazifasi «og'irlik/maqsad bugun o'zgarsa, o'tgan oyning raqami
-- o'zgarmasin» edi — bu ikki ustun o'sha kafolatni versiya jadvalisiz beradi:
-- kun hisoblanganda o'sha ondagi maqsad qator ICHIGA muhrlanadi, keyingi tahrir
-- esa faqat KELAJAK kunlarga tegadi (tan-narx muzlatish klassi).
--
-- 🔴 MAVJUD QATORLAR BACKFILL QILINMAYDI (`UPDATE` yo'q, DEFAULT yo'q).
-- `target_source` NULL = «muhr yo'q» → o'quvchi avvalgidek profil versiyasidagi
-- maqsadga tushadi, ya'ni bu migratsiya HECH BIR mavjud kunning ballini
-- o'zgartirmaydi. Backfill qilinsa aynan «tarixni qayta yozish» bo'lardi.
--
-- `target_value` NULL ikki xil ma'noga ega bo'lmasligi uchun manba ustuni
-- MAJBURIY hamroh: «muhrlangan maqsadsizlik» (`none`) va «umuman muhrlanmagan»
-- holatlarini faqat `target_source` farqlaydi (NULL ≠ 0 intizomi).

-- AlterTable
ALTER TABLE "employee_daily_kpi_metrics"
  ADD COLUMN "target_value" BIGINT,
  ADD COLUMN "target_source" VARCHAR(20);

-- Yopiq lug'at — `kpi-target.ts` dagi `TargetSource` bilan AYNAN bir xil.
-- Notanish qiymat kirsa o'quvchi uni «muhrlangan» deb o'qib, hech qachon
-- profilga tushmaydigan va hech qachon to'g'ri bo'lmaydigan maqsad berardi.
ALTER TABLE "employee_daily_kpi_metrics"
  ADD CONSTRAINT "employee_daily_kpi_metrics_target_source_known"
  CHECK ("target_source" IS NULL OR "target_source" IN ('employee_target', 'target_override', 'profile', 'none'));

-- MUHR BUTUNLIGI: qiymat bor, manbasi yo'q holati mumkin emas. Bunday qator
-- o'quvchi tomonidan «muhrlanmagan» deb o'qilib profilga tushardi va
-- muhrdagi raqam JIMGINA e'tiborsiz qolardi.
ALTER TABLE "employee_daily_kpi_metrics"
  ADD CONSTRAINT "employee_daily_kpi_metrics_target_seal_complete"
  CHECK ("target_value" IS NULL OR "target_source" IS NOT NULL);

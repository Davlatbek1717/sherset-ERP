-- KPI-05 / 4M TZ §2.2, §2.3 — KUNGA MUHRLANGAN OG'IRLIK.
--
-- Og'irlik endi ikki manbadan kelishi mumkin: `employee_kpi_targets.weight`
-- (biriktirilgan KPI — VERSIYALANMAYDI) va `kpi_profile_metrics.weight`
-- (profil versiyasi). Birinchisi versiyalanmagani uchun, muhrsiz o'qilsa
-- menejerning BUGUNGI og'irlik tahriri O'TGAN kunlarning ballini qayta
-- yozardi. `kpi_profile_versions` aynan shuni to'sish uchun bor edi — bu ikki
-- ustun o'sha kafolatni versiya jadvalisiz beradi (maqsad tomonida u
-- `target_value`/`target_source` muhrida, KPI-03).
--
-- 🔴 MAVJUD QATORLAR BACKFILL QILINMAYDI (`UPDATE` yo'q, DEFAULT yo'q).
-- `weight_source` NULL = «muhr yo'q» → o'quvchi avvalgidek profil
-- versiyasidagi og'irlikka tushadi, ya'ni bu migratsiya HECH BIR mavjud
-- kunning ballini o'zgartirmaydi.
--
-- `weight_applied` NULL ikki xil ma'noga ega bo'lmasligi uchun manba ustuni
-- MAJBURIY hamroh: «muhrlangan og'irliksizlik» (menejer ataylab ballsiz
-- qo'ygan KPI) va «umuman muhrlanmagan» holatlarini faqat `weight_source`
-- farqlaydi (NULL ≠ 0 intizomi).

-- AlterTable
ALTER TABLE "employee_daily_kpi_metrics"
  ADD COLUMN "weight_applied" DECIMAL(5, 2),
  ADD COLUMN "weight_source" VARCHAR(20);

-- Yopiq lug'at — `kpi-target.ts` dagi `WeightSource` bilan AYNAN bir xil.
-- Notanish qiymat kirsa o'quvchi qatorni «muhrlangan» deb o'qib, hech qachon
-- profilga tushmaydigan og'irlik bilan ballardi.
ALTER TABLE "employee_daily_kpi_metrics"
  ADD CONSTRAINT "employee_daily_kpi_metrics_weight_source_known"
  CHECK ("weight_source" IS NULL OR "weight_source" IN ('employee_target', 'profile', 'none'));

-- MUHR BUTUNLIGI: og'irlik bor, manbasi yo'q holati mumkin emas. Bunday qator
-- o'quvchi tomonidan «muhrlanmagan» deb o'qilib profilga tushardi va muhrdagi
-- og'irlik JIMGINA e'tiborsiz qolardi.
ALTER TABLE "employee_daily_kpi_metrics"
  ADD CONSTRAINT "employee_daily_kpi_metrics_weight_seal_complete"
  CHECK ("weight_applied" IS NULL OR "weight_source" IS NOT NULL);

-- Oraliq MANBADAGI CHECK bilan bir xil (`employee_kpi_targets_weight_range`,
-- `kpi_profile_metrics` 0…100). Manbada ruxsat etilgan qiymat muhrda rad
-- etilsa, tungi hisoblash butun kun bo'yicha YIQILARDI.
ALTER TABLE "employee_daily_kpi_metrics"
  ADD CONSTRAINT "employee_daily_kpi_metrics_weight_range"
  CHECK ("weight_applied" IS NULL OR ("weight_applied" >= 0 AND "weight_applied" <= 100));

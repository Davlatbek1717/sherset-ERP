-- Faza 16 (DB-01 + M-03) — valyuta konventsiyasini yagonalash. DATA-ONLY.
--
-- 1) DB-01: DebtPayment.exchangeRate ×10^4 → KANONIK ×10^8.
--    Barcha hujjatlar rateValue'si ×10^8 da; qarz-to'lov kursi yagona istisno
--    edi (12 800,50 so'm → 128005000). Endi bir masshtab: × 10 000.
--    Idempotentlik: allaqachon ×10^8 bo'lgan qiymat (≥ 10^9 = 10 so'm) qayta
--    ko'paytirilmaydi — USD kursi hech qachon 10 so'mdan past bo'lmagan,
--    ×10^4 qiymatlar esa doim < 10^9 (10^5 so'mgacha kursni qamraydi).
UPDATE debt_payments
SET exchange_rate = exchange_rate * 10000
WHERE exchange_rate IS NOT NULL
  AND exchange_rate < 1000000000;

-- 2) M-03: legacy Currency qatorlarini normalizatsiya — ALPHA kod `code`da
--    turgan (eski konventsiya yoki almashgan) qatorlarda iso_code'ni ALPHA
--    bilan to'ldirish. Yangi konventsiya: code = NUMERIC ('860'),
--    iso_code = ALPHA ('UZS'); rate-lookup/CBU endi iso_code orqali.
UPDATE currencies
SET iso_code = UPPER(code)
WHERE code ~ '^[A-Za-z]{3}$'
  AND (iso_code IS NULL OR iso_code !~ '^[A-Za-z]{3}$');

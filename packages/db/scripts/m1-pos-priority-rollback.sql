-- M1 QAYTARISH (qoida 12) — `m1-apply.sql` ni AYNAN bekor qiladi.
-- Natija `/root/m1-stores-before-20260830.txt` bilan bayt-ma-bayt teng bo'lishi shart.
-- 2026-08-30 DRY (BEGIN…ROLLBACK) da jonli bazada sinaldi: zond asl holatni tikladi.
\set ON_ERROR_STOP on
BEGIN;

UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb) || '{"__posPriority": 1}'::jsonb
 WHERE id = '968f9da2-6dbb-4375-b5e2-d19799b51de6';   -- Taqsimlanmagan -> 1 (asl)
UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb) || '{"__posPriority": 2}'::jsonb
 WHERE id = '01662dbe-ee31-405f-a82f-ff8a82dc8809';   -- Ombor 02 -> 2 (asl)
UPDATE stores SET attributes = attributes - '__posPriority'
 WHERE id IN ('02016d74-e750-4333-808a-a5ceda7e3970',  -- Ombor 07
              '7400bf94-c2b0-4d5c-b12d-f971cd10e187',  -- Ombor 01
              '1e5df878-e447-464b-9b28-01e4aa497e67',  -- Ombor 03
              'b628f0d0-a95c-4749-9fb3-d94230abae8b',  -- Ombor 04
              '75878ad6-6a4d-4539-ad14-a4655c203cb4',  -- Ombor 05
              'ed80b5ce-55ca-4770-a8a6-6b5f4c4d514a'); -- Ombor 06

\echo '=== ZOND (qaytarishdan keyin) ==='
SELECT id || '|' || name || '|' || coalesce(attributes::text,'{}') AS qator
  FROM stores ORDER BY name;

COMMIT;

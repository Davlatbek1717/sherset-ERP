-- M1.2 — POS kaskad prioritetlari, kanonik jadval (reja 4-bo'lim).
-- Qaytarish: `m1-rollback.sql` (qoida 12). DRY 2026-08-30 da ikkala yo'nalishda sinaldi.
\set ON_ERROR_STOP on
BEGIN;

UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb) || '{"__posPriority": 1}'::jsonb
 WHERE id = '02016d74-e750-4333-808a-a5ceda7e3970';   -- Ombor 07 (kassaga eng yaqin)
UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb) || '{"__posPriority": 2}'::jsonb
 WHERE id = '7400bf94-c2b0-4d5c-b12d-f971cd10e187';   -- Ombor 01
UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb) || '{"__posPriority": 3}'::jsonb
 WHERE id = '01662dbe-ee31-405f-a82f-ff8a82dc8809';   -- Ombor 02 (2 -> 3, H6/1 yopiladi)
UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb) || '{"__posPriority": 4}'::jsonb
 WHERE id = '1e5df878-e447-464b-9b28-01e4aa497e67';   -- Ombor 03
UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb) || '{"__posPriority": 5}'::jsonb
 WHERE id = 'b628f0d0-a95c-4749-9fb3-d94230abae8b';   -- Ombor 04
UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb) || '{"__posPriority": 6}'::jsonb
 WHERE id = '75878ad6-6a4d-4539-ad14-a4655c203cb4';   -- Ombor 05
UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb) || '{"__posPriority": 7}'::jsonb
 WHERE id = 'ed80b5ce-55ca-4770-a8a6-6b5f4c4d514a';   -- Ombor 06
UPDATE stores SET attributes = coalesce(attributes,'{}'::jsonb) || '{"__posPriority": 8}'::jsonb
 WHERE id = '968f9da2-6dbb-4375-b5e2-d19799b51de6';   -- Taqsimlanmagan (ENG OXIRIDA)
-- Ombor 99 (BRAK) ga ATAYLAB TEGILMAYDI — kaskadda bo'lmasligi SHART.

\echo '=== ZOND (COMMIT dan oldin) ==='
SELECT name, coalesce(attributes->>'__posPriority','-') AS pp
  FROM stores ORDER BY (attributes->>'__posPriority')::int NULLS LAST, name;

COMMIT;

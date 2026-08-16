#!/bin/bash
# BIR MARTALIK (egasi buyrug'i, 2026-08-16): Umidning joriy ochiq smenasidagi
# 12:00 (Toshkent) DAN OLDINGI 2 ta chekni yangi yaratiladigan ADMINISTRATIV
# YOPIQ mini-smenaga ko'chirish. Cheklar DB'da TO'LIQ qoladi (mijoz/qarz),
# faqat joriy smena hisobidan chiqadi. Sessiya hisoblagichlari ham ko'chadi.
set -euo pipefail
cd /var/www/sherset-v2
set -a; . apps/api/.env; set +a
DBURL="${DATABASE_URL%%\?*}"

psql "$DBURL" <<'SQL'
BEGIN;

-- 1) Administrativ yopiq mini-smena (maydonlar joriy smenadan nusxa).
WITH src AS (
  SELECT * FROM cashier_sessions WHERE id = 'f0ba08a2-e459-4522-a7e8-e94ab1e871ea'
), ins AS (
  INSERT INTO cashier_sessions
    (id, account_id, owner_id, group_id, cashier_id, cash_desk_id, smena_id, store_id,
     organization_id, state, opened_at, closed_at, opening_cash_minor, opening_cash_usd_minor,
     acceptance_state, acceptance_changed_at, created_at, updated_at)
  SELECT gen_random_uuid(), account_id, owner_id, group_id, cashier_id, cash_desk_id, smena_id,
     store_id, organization_id, 'closed', opened_at, '2026-08-16 07:00:00+00', 0, 0,
     'pending', '2026-08-16 07:00:00+00', now(), now()
  FROM src
  RETURNING id
)
-- 2) Ikkala chek yangi smenaga.
UPDATE retail_sales r
SET session_id = (SELECT id FROM ins), updated_at = now()
WHERE r.id IN ('fcecf993-c3da-4531-9bd4-304a853467da', 'd776b23c-6d2a-4bf2-81a2-f9df84671bef');

-- 3) Hisoblagichlar: yopiq mini-smenaga yig'indi, joriydan ayirma.
UPDATE cashier_sessions s SET
  sales_count = (SELECT count(*) FROM retail_sales r
                 WHERE r.session_id = s.id AND r.state IN ('posted','refunded')
                   AND r.refunded_from_id IS NULL),
  sales_sum_minor = (SELECT COALESCE(sum(r.sum_minor),0) FROM retail_sales r
                     WHERE r.session_id = s.id AND r.state IN ('posted','refunded')
                       AND r.refunded_from_id IS NULL),
  updated_at = now()
WHERE s.id = 'f0ba08a2-e459-4522-a7e8-e94ab1e871ea'
   OR s.id = (SELECT session_id FROM retail_sales
              WHERE id = 'fcecf993-c3da-4531-9bd4-304a853467da');

COMMIT;

-- Tekshiruv: joriy ochiq smenada 12:00 gacha chek QOLMADI; mini-smenada 2 ta.
SELECT s.state, s.closed_at::timestamp(0),
       count(r.id) FILTER (WHERE r.moment <  '2026-08-16 07:00:00+00') AS chek_1200gacha,
       count(r.id) FILTER (WHERE r.moment >= '2026-08-16 07:00:00+00') AS chek_1200keyin,
       s.sales_count, s.sales_sum_minor/100 AS savdo_jami
FROM cashier_sessions s
LEFT JOIN retail_sales r ON r.session_id = s.id AND r.state IN ('posted','refunded')
WHERE s.cashier_id = (SELECT cashier_id FROM cashier_sessions
                      WHERE id='f0ba08a2-e459-4522-a7e8-e94ab1e871ea')
GROUP BY s.id ORDER BY s.opened_at;

-- Qarz-mijoz cheki joyida (mijoz bog'lanishi bilan):
SELECT r.name, c.name AS mijoz, r.sum_minor/100 AS summa, s.state AS smena_holati
FROM retail_sales r
JOIN cashier_sessions s ON s.id = r.session_id
LEFT JOIN counterparties c ON c.id = r.agent_id
WHERE r.id IN ('fcecf993-c3da-4531-9bd4-304a853467da','d776b23c-6d2a-4bf2-81a2-f9df84671bef');
SQL

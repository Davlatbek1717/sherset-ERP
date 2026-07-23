-- «Полученный отчёт комиссионера» in-editor header fields — «Входящий номер» + «от».
-- The commissioner's own document number/date on the received report (OUT has none).
ALTER TABLE "commission_reports_in" ADD COLUMN "incoming_number" VARCHAR(50);
ALTER TABLE "commission_reports_in" ADD COLUMN "incoming_date" TIMESTAMPTZ;

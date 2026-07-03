-- Customer sales-receipt printer routing: the account can name the Windows
-- printer its customer receipt («mijoz cheki») is sent to via the local
-- print-agent — the receipt counterpart of sklad_keepers.printer_name.
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "receipt_printer_name" VARCHAR(255);

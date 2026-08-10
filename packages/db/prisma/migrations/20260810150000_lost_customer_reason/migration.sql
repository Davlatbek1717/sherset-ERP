-- MK17 — «yo'qolgan mijozlar signali»: ketish sababining QO'LDA qo'yiladigan belgisi.
--
-- Yangi jadval ATAYLAB ochilmadi: belgi mavjud `counterparty_notes` jurnaliga
-- `kind='lost_reason'` bilan yoziladi (MK16 `debt_notes.kind='reminder'` bilan ayni
-- naqsh). Ikki foydasi bor: (1) belgi mijozning muloqot tarixida operator ko'radigan
-- joyda turadi, (2) tarix bepul — «amaldagi sabab» = eng oxirgi belgi, oldingilari
-- o'chmaydi.
--
-- Ikkala ustun ham QO'SHIMCHA va sukut qiymatli ⇒ mavjud qatorlar va mavjud
-- `counterparty-note` CRUD yo'llari o'zgarishsiz ishlaydi.

ALTER TABLE "counterparty_notes"
  ADD COLUMN "kind" VARCHAR(20) NOT NULL DEFAULT 'note',
  ADD COLUMN "reason_code" VARCHAR(30);

-- O'quvchi so'rovning AYNAN shakli:
--   SELECT DISTINCT ON (counterparty_id) …
--   WHERE account_id = $1 AND kind = 'lost_reason'
--   ORDER BY counterparty_id, created_at DESC
CREATE INDEX "counterparty_notes_account_id_kind_counterparty_id_created_idx"
  ON "counterparty_notes" ("account_id", "kind", "counterparty_id", "created_at" DESC);

-- 4M.4 — suhbat va ogohlantirish jurnali (xodim kartasi 360°).
-- APPEND-ONLY: yozuv tahrirlanmaydi/o'chirilmaydi; xato yozuv voided_at
-- bilan bekor qilinadi va tarixda ko'rinib turadi.
CREATE TABLE "employee_notes" (
  "id"             UUID PRIMARY KEY,
  "account_id"     UUID NOT NULL,
  "employee_id"    UUID NOT NULL,
  "kind"           VARCHAR(20) NOT NULL,
  "text"           TEXT NOT NULL,
  "author_id"      UUID,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "voided_at"      TIMESTAMPTZ,
  "voided_by_id"   UUID,
  "void_reason"    TEXT
);

CREATE INDEX "employee_notes_employee_created_idx"
  ON "employee_notes"("account_id", "employee_id", "created_at" DESC);
CREATE INDEX "employee_notes_kind_created_idx"
  ON "employee_notes"("account_id", "kind", "created_at" DESC);

ALTER TABLE "employee_notes"
  ADD CONSTRAINT "employee_notes_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_notes_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_notes_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_notes_voided_by_id_fkey"
    FOREIGN KEY ("voided_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

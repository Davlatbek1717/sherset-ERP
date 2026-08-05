-- Smena farq akti (kassa TZ §8.4).
-- discrepancy_minor faqat oxirgi raqamni saqlaydi — sabab, kassir izohi va
-- ko'rilgani yo'q. Farq = pul yo'qolishi da'vosi, yonida dalil turishi kerak.
CREATE TABLE "cashier_session_variances" (
  "id"                  UUID PRIMARY KEY,
  "account_id"          UUID NOT NULL,
  "session_id"          UUID NOT NULL,
  "cashier_id"          UUID NOT NULL,
  "currency"            VARCHAR(3) NOT NULL DEFAULT 'UZS',
  "expected_minor"      BIGINT NOT NULL,
  "counted_minor"       BIGINT NOT NULL,
  "variance_minor"      BIGINT NOT NULL,
  "kind"                VARCHAR(20) NOT NULL,
  "cashier_note"        TEXT,
  "acknowledged_at"     TIMESTAMPTZ,
  "acknowledged_by_id"  UUID,
  "manager_note"        TEXT,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bir smena + bir valyuta = bitta akt (ikki marta yopish ikkinchi akt yaratmaydi).
CREATE UNIQUE INDEX "cashier_session_variances_session_id_currency_key"
  ON "cashier_session_variances"("session_id", "currency");
CREATE INDEX "cashier_session_variances_ack_idx"
  ON "cashier_session_variances"("account_id", "acknowledged_at", "created_at" DESC);
CREATE INDEX "cashier_session_variances_cashier_idx"
  ON "cashier_session_variances"("account_id", "cashier_id", "kind", "created_at" DESC);

ALTER TABLE "cashier_session_variances"
  ADD CONSTRAINT "cashier_session_variances_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "cashier_session_variances_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "cashier_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "cashier_session_variances_cashier_id_fkey"
  FOREIGN KEY ("cashier_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "cashier_session_variances_acknowledged_by_id_fkey"
  FOREIGN KEY ("acknowledged_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

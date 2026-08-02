-- Kassa TZ §9 — kassir hodisalari jurnali («erkinlik + nazorat» modelining nazorat yarmi).
--
-- Bu jadval mavjud `audit_log`dan ALOHIDA: u hujjat maydonlarining diff'i
-- (moysklad History tabi), bu esa smena/kassir kesimida so'raladigan xulq
-- hodisalari. `session_id` aynan shu o'q — `audit_log`da u yo'q.
--
-- Qaytarish: DROP TABLE "cashier_audit_events";

-- CreateTable
CREATE TABLE "cashier_audit_events" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "doc_id" UUID,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cashier_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cashier_audit_events_account_id_session_id_created_at_idx" ON "cashier_audit_events"("account_id", "session_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "cashier_audit_events_account_id_employee_id_type_created_at_idx" ON "cashier_audit_events"("account_id", "employee_id", "type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "cashier_audit_events_account_id_type_created_at_idx" ON "cashier_audit_events"("account_id", "type", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "cashier_audit_events" ADD CONSTRAINT "cashier_audit_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_audit_events" ADD CONSTRAINT "cashier_audit_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "cashier_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_audit_events" ADD CONSTRAINT "cashier_audit_events_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


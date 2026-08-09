-- MK26 — xodim darajasidagi ruxsat override qatlami (TZ §3.1 «Ikki qatlam»).
--
--     Amaldagi ruxsat = rol qatlami MAX(scope) → employee_permissions (qator bo'lsa, u G'OLIB)
--
-- Jadval BO'SH tug'iladi: qator yo'q ⇒ rol qatlami o'zgarishsiz qoladi, ya'ni
-- migratsiya hech kimning amaldagi ruxsatini o'zgartirmaydi (kengayish ham,
-- torayish ham yo'q). HR yozuvlarini ko'chirish — alohida skript (MK27,
-- `apps/api/src/scripts/migrate-hr-permissions.ts`).

CREATE TABLE "employee_permissions" (
    "account_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "entity" VARCHAR(50) NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "scope" VARCHAR(20) NOT NULL DEFAULT 'NO',
    "granted_by_id" UUID,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" VARCHAR(255),

    CONSTRAINT "employee_permissions_pkey" PRIMARY KEY ("employee_id","entity","action")
);

CREATE INDEX "employee_permissions_account_id_employee_id_idx"
    ON "employee_permissions"("account_id", "employee_id");

ALTER TABLE "employee_permissions"
    ADD CONSTRAINT "employee_permissions_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_permissions"
    ADD CONSTRAINT "employee_permissions_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ruxsatni bergan xodim o'chirilsa qator YO'QOLMAYDI (SET NULL) — «kim berdi»
-- ma'lumoti yo'qoladi, lekin ruxsatning O'ZI saqlanadi. CASCADE bo'lsa admin
-- ishdan bo'shaganda u bergan barcha cheklovlar jimgina ochilib ketardi.
ALTER TABLE "employee_permissions"
    ADD CONSTRAINT "employee_permissions_granted_by_id_fkey"
    FOREIGN KEY ("granted_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

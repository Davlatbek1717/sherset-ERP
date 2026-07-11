-- «Qarz undirish» (debt collection) moduli — TZ v2.
--
-- Call-markaz + kassa uchun mustaqil qarz daftari. TZ §7 talabi: mavjud
-- savdo/ombor oqimiga TEGMAYDI (counterparty_balances siljimaydi,
-- stock_operations yozilmaydi) — sof additive.
--
-- Pul BigInt minor (tiyin) — ADR-0004.
-- Screenshot mavjud `attachments` jadvalida (entity='debtpayment') saqlanadi;
-- debt_payments.attachment_id — o'sha satrga id-ishora (polimorf, FK emas).

-- CreateTable: qarzlar
CREATE TABLE "debts" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "counterparty_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "total_minor" BIGINT NOT NULL,
    "paid_minor" BIGINT NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "status" VARCHAR(20) NOT NULL DEFAULT 'unpaid',
    "next_contact_at" TIMESTAMPTZ,
    "owner_id" UUID,
    "issued_by_id" UUID,
    "comment" TEXT,
    "closed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "debts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: qarz to'lovlari (cash | terminal | card_screenshot)
CREATE TABLE "debt_payments" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "debt_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "source_name" VARCHAR(120),
    "cash_desk_id" UUID,
    "attachment_id" UUID,
    "comment" TEXT,
    "received_by_id" UUID,
    "received_by_role" VARCHAR(20) NOT NULL DEFAULT 'cashier',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: muloqot tarixi (append-only)
CREATE TABLE "debt_notes" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "debt_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "next_contact_at" TIMESTAMPTZ,
    "author_id" UUID,
    "author_role" VARCHAR(20) NOT NULL DEFAULT 'operator',
    "kind" VARCHAR(20) NOT NULL DEFAULT 'call',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_notes_pkey" PRIMARY KEY ("id")
);

-- Indexes: debts
CREATE UNIQUE INDEX "debts_account_id_name_key" ON "debts"("account_id", "name");
-- «Qarzdorlar ro'yxati» (§3.1) — faol qarzlar status kesimida.
CREATE INDEX "debts_account_id_status_next_contact_at_idx" ON "debts"("account_id", "status", "next_contact_at");
-- «Bugungi qo'ng'iroqlar» (§3.5) — sana bo'yicha tanlash.
CREATE INDEX "debts_account_id_next_contact_at_idx" ON "debts"("account_id", "next_contact_at");
CREATE INDEX "debts_account_id_counterparty_id_idx" ON "debts"("account_id", "counterparty_id");
CREATE INDEX "debts_account_id_owner_id_idx" ON "debts"("account_id", "owner_id");
-- §3.9 — kassir bergan yangi qarzlar (kassir, kun) kesimi.
CREATE INDEX "debts_account_id_issued_by_id_created_at_idx" ON "debts"("account_id", "issued_by_id", "created_at");

-- Indexes: debt_payments
CREATE INDEX "debt_payments_account_id_debt_id_created_at_idx" ON "debt_payments"("account_id", "debt_id", "created_at" DESC);
-- §3.9 — kunlik kassir hisoboti (kassir, kun) kesimi.
CREATE INDEX "debt_payments_account_id_received_by_id_created_at_idx" ON "debt_payments"("account_id", "received_by_id", "created_at");
-- §4 — davr bo'yicha to'lov turi kesimida hisobot.
CREATE INDEX "debt_payments_account_id_method_created_at_idx" ON "debt_payments"("account_id", "method", "created_at");

-- Indexes: debt_notes
CREATE INDEX "debt_notes_account_id_debt_id_created_at_idx" ON "debt_notes"("account_id", "debt_id", "created_at" DESC);
CREATE INDEX "debt_notes_account_id_author_id_created_at_idx" ON "debt_notes"("account_id", "author_id", "created_at");

-- FKs: debts
ALTER TABLE "debts" ADD CONSTRAINT "debts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "debts" ADD CONSTRAINT "debts_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "debts" ADD CONSTRAINT "debts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "debts" ADD CONSTRAINT "debts_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FKs: debt_payments
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_cash_desk_id_fkey" FOREIGN KEY ("cash_desk_id") REFERENCES "cash_desks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FKs: debt_notes
ALTER TABLE "debt_notes" ADD CONSTRAINT "debt_notes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "debt_notes" ADD CONSTRAINT "debt_notes_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "debt_notes" ADD CONSTRAINT "debt_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

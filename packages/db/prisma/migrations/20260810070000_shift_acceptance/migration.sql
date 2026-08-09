-- MK08 / 4M TZ §6 — SMENA YAKUNINI QABUL QILISH.
--
-- Ikki narsa qo'shiladi:
--   1. `cashier_sessions` ga QABUL o'qi (`acceptance_state` + kim/qachon).
--      Mavjud `state` ustuni smenaning HAYOTI (`open`/`closed`); qabul esa
--      boshqa savol — «kim buni ko'rdi va rozi bo'ldi». Ikkalasini bitta
--      ustunga siqish «yopilgan-u ko'rilmagan» holatini ifodalab bo'lmas
--      qilardi.
--   2. `cashier_session_acceptance_events` — APPEND-ONLY jurnal. Yagona
--      `reject_reason` ustuni faqat OXIRGI holatni saqlardi; nizoda esa
--      «kim, qachon, nima deb yozgan» kerak (TZ §6/§7).
--
-- 🔴 BACKFILL QARORI (ochiq yozilgan, jimgina emas):
-- allaqachon YOPILGAN smenalar `pending` ga o'tkaziladi, `accepted` ga EMAS.
-- Sabab: ularni hech kim ko'rmagan — `accepted` deb belgilash «menejer
-- tasdiqladi» degan YOLG'ON yozuv bo'lardi (NULL ≠ 0 bilan bir klass).
-- Natijada birinchi kuni navbat uzun bo'ladi; ekranda sana filtri bor va
-- menejer yaqin kunlardan boshlaydi. `acceptance_changed_at` = yopilgan vaqt,
-- shuning uchun eskalatsiya soati ham to'g'ri joydan sanaydi.

ALTER TABLE "cashier_sessions"
  ADD COLUMN "acceptance_state" VARCHAR(20) NOT NULL DEFAULT 'open';
ALTER TABLE "cashier_sessions" ADD COLUMN "accepted_by_id" UUID;
ALTER TABLE "cashier_sessions" ADD COLUMN "accepted_at" TIMESTAMPTZ;
ALTER TABLE "cashier_sessions" ADD COLUMN "acceptance_changed_at" TIMESTAMPTZ;

UPDATE "cashier_sessions"
   SET "acceptance_state" = 'pending',
       "acceptance_changed_at" = COALESCE("closed_at", "updated_at")
 WHERE "state" = 'closed';

CREATE INDEX "cashier_sessions_account_id_acceptance_state_acceptance_changed_at_idx"
  ON "cashier_sessions"("account_id", "acceptance_state", "acceptance_changed_at");

CREATE INDEX "cashier_sessions_account_id_cashier_id_acceptance_state_idx"
  ON "cashier_sessions"("account_id", "cashier_id", "acceptance_state");

CREATE TABLE "cashier_session_acceptance_events" (
  "id"          UUID         NOT NULL,
  "account_id"  UUID         NOT NULL,
  "session_id"  UUID         NOT NULL,
  "from_state"  VARCHAR(20)  NOT NULL,
  "to_state"    VARCHAR(20)  NOT NULL,
  "action"      VARCHAR(30)  NOT NULL,
  "actor_type"  VARCHAR(20)  NOT NULL,
  "actor_id"    UUID,
  "reason_code" VARCHAR(40),
  "comment"     TEXT,
  "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cashier_session_acceptance_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cashier_session_acceptance_events_account_id_session_id_created_at_idx"
  ON "cashier_session_acceptance_events"("account_id", "session_id", "created_at");

CREATE INDEX "cashier_session_acceptance_events_account_id_created_at_idx"
  ON "cashier_session_acceptance_events"("account_id", "created_at" DESC);

CREATE INDEX "cashier_session_acceptance_events_account_id_action_created_at_idx"
  ON "cashier_session_acceptance_events"("account_id", "action", "created_at" DESC);

ALTER TABLE "cashier_session_acceptance_events"
  ADD CONSTRAINT "cashier_session_acceptance_events_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cashier_session_acceptance_events"
  ADD CONSTRAINT "cashier_session_acceptance_events_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "cashier_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

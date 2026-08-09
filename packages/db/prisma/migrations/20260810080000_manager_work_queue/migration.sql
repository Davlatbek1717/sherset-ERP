-- MK06 / 4M TZ §5 — MENEJER ISH NAVBATI (dvigatel va model).
--
-- Uch jadval:
--   1. `manager_rule_configs` — qoida chegaralari (asl TZ §5.2 dagi
--      `ApprovalRule { type, threshold, mode }` kengaytmasi). Bugungacha
--      chegaralar so'rov parametri edi (MK11 shuni ochiq qarz deb yozgan) —
--      ya'ni menejer chegarani o'zgartirsa, ertaga u yo'qolardi.
--   2. `manager_work_items` — BITTA NAVBAT (§5.1). Har manba o'z ro'yxatini
--      yasasa, «bugun nima muhim» degan savolga besh joydan javob izlanardi.
--   3. `manager_work_item_events` — APPEND-ONLY jurnal. Yagona `resolution_code`
--      ustuni faqat OXIRGI holatni saqlaydi; §5.3 esa statistika so'raydi
--      («zararga sotuvlarning 30% — raqobatchi narxi»).
--
-- 🔴 NAVBAT BLOKLAMAYDI (§5.1). Shuning uchun bu yerda `blocked` maydoni YO'Q
-- va `mode` da `block` qiymati YO'Q. CHECK cheklovi bilan qulflangan: kimdir
-- navbatdan taqiq yasamoqchi bo'lsa, avval migratsiyani buzishi kerak bo'ladi.
--
-- BACKFILL YO'Q — bu yangi ombor. Mavjud hodisalar (narx o'zgarishi, kassa
-- farqi) navbatga faqat dvigatel ishga tushirilganda (`POST manager/queue/sync`)
-- tushadi. Ataylab: bir yillik audit jurnalini migratsiya paytida navbatga
-- ag'darish menejerni birinchi kuniyoq ko'mib tashlardi, `sync` esa davr
-- (`sinceDays`) bilan boshqariladi.

CREATE TABLE "manager_rule_configs" (
  "id"              UUID           NOT NULL,
  "account_id"      UUID           NOT NULL,
  "rule_type"       VARCHAR(40)    NOT NULL,
  "enabled"         BOOLEAN        NOT NULL DEFAULT true,
  "threshold_value" DECIMAL(20, 4),
  "threshold_unit"  VARCHAR(10),
  "mode"            VARCHAR(10)    NOT NULL DEFAULT 'notify',
  "severity"        VARCHAR(10)    NOT NULL DEFAULT 'warning',
  "params"          JSONB,
  "updated_by_id"   UUID,
  "created_at"      TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "manager_rule_configs_pkey" PRIMARY KEY ("id"),
  -- §5.1 qulfi: navbat kuzatadi, to'xtatmaydi.
  CONSTRAINT "manager_rule_configs_mode_not_blocking" CHECK ("mode" IN ('observe', 'notify')),
  -- Chegara qiymati birligisiz MA'NOSIZ: foizni tiyin deb o'qish shu repoda
  -- allaqachon yuz bergan bug-klass.
  CONSTRAINT "manager_rule_configs_threshold_needs_unit"
    CHECK ("threshold_value" IS NULL OR "threshold_unit" IS NOT NULL)
);

CREATE UNIQUE INDEX "manager_rule_configs_account_id_rule_type_key"
  ON "manager_rule_configs"("account_id", "rule_type");

CREATE TABLE "manager_work_items" (
  "id"                  UUID          NOT NULL,
  "account_id"          UUID          NOT NULL,
  "rule_type"           VARCHAR(40)   NOT NULL,
  "dedup_key"           VARCHAR(200)  NOT NULL,
  "status"              VARCHAR(20)   NOT NULL DEFAULT 'open',
  "severity"            VARCHAR(10)   NOT NULL DEFAULT 'warning',
  "subject_employee_id" UUID,
  "amount_minor"        BIGINT,
  "currency"            VARCHAR(3),
  "doc_type"            VARCHAR(30),
  "doc_id"              VARCHAR(64),
  "occurred_at"         TIMESTAMPTZ   NOT NULL,
  "context"             JSONB,
  "stale_at"            TIMESTAMPTZ,
  "resolution_code"     VARCHAR(40),
  "resolution_comment"  TEXT,
  "resolved_by_id"      UUID,
  "status_changed_at"   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at"         TIMESTAMPTZ,
  "created_at"          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "manager_work_items_pkey" PRIMARY KEY ("id")
);

-- Dedup KAFOLATI. Dvigatel `createMany({ skipDuplicates: true })` ga tayanadi:
-- ikki parallel `sync` bir hodisadan ikki element yasay olmaydi.
CREATE UNIQUE INDEX "manager_work_items_account_id_dedup_key_key"
  ON "manager_work_items"("account_id", "dedup_key");

CREATE INDEX "manager_work_items_account_id_status_occurred_at_idx"
  ON "manager_work_items"("account_id", "status", "occurred_at" DESC);

CREATE INDEX "manager_work_items_account_id_subject_employee_id_status_idx"
  ON "manager_work_items"("account_id", "subject_employee_id", "status");

CREATE INDEX "manager_work_items_account_id_rule_type_status_idx"
  ON "manager_work_items"("account_id", "rule_type", "status");

CREATE TABLE "manager_work_item_events" (
  "id"          UUID         NOT NULL,
  "account_id"  UUID         NOT NULL,
  "item_id"     UUID         NOT NULL,
  "from_status" VARCHAR(20)  NOT NULL,
  "to_status"   VARCHAR(20)  NOT NULL,
  "action"      VARCHAR(30)  NOT NULL,
  "actor_type"  VARCHAR(20)  NOT NULL,
  "actor_id"    UUID,
  "reason_code" VARCHAR(40),
  "comment"     TEXT,
  "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "manager_work_item_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "manager_work_item_events_account_id_item_id_created_at_idx"
  ON "manager_work_item_events"("account_id", "item_id", "created_at");

CREATE INDEX "manager_work_item_events_account_id_action_created_at_idx"
  ON "manager_work_item_events"("account_id", "action", "created_at" DESC);

ALTER TABLE "manager_rule_configs"
  ADD CONSTRAINT "manager_rule_configs_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "manager_rule_configs"
  ADD CONSTRAINT "manager_rule_configs_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "manager_work_items"
  ADD CONSTRAINT "manager_work_items_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "manager_work_items"
  ADD CONSTRAINT "manager_work_items_subject_employee_id_fkey"
  FOREIGN KEY ("subject_employee_id") REFERENCES "employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "manager_work_items"
  ADD CONSTRAINT "manager_work_items_resolved_by_id_fkey"
  FOREIGN KEY ("resolved_by_id") REFERENCES "employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "manager_work_item_events"
  ADD CONSTRAINT "manager_work_item_events_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "manager_work_item_events"
  ADD CONSTRAINT "manager_work_item_events_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "manager_work_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

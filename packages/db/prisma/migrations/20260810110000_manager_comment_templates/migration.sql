-- MK20 / 4M TZ §8.1/6 — SHABLON IZOHLAR (tez javob matnlari).
--
-- Menejer sozlaydigan matnlar: rad etish · tuzatma · ogohlantirish.
--
-- 🔴 JURNALDA HAVOLA YO'Q. Bu migratsiya `manager_work_item_events` yoki
-- `employee_daily_kpi_events` ga `template_id` USTUNI QO'SHMAYDI — bu ataylab.
-- Shablon tanlanganda uning matni jurnal `comment` ustuniga NUSXA bo'lib
-- tushadi. Havola saqlansa, shablon ertaga tahrirlanganda kechagi qaror bugun
-- boshqacha o'qilardi (tarix jimgina o'zgarardi) — «summa qoidadan nusxa»
-- (MK01 bonus) va «tan narx muzlatiladi» (retail) bilan bir xil klass.
--
-- BACKFILL YO'Q: yangi ombor, tarixiy shablon mavjud emas. Boshlang'ich
-- shablonlar ham SEED QILINMAYDI — «menejer sozlaydi» degani menejerning o'z
-- so'zlari; tayyor matn qo'yilsa u jurnalga jimgina ko'chib, hech kim
-- yozmagan gap rasmiy izohga aylanardi.

CREATE TABLE "manager_comment_templates" (
  "id"            UUID         NOT NULL,
  "account_id"    UUID         NOT NULL,
  -- rejection | correction | warning
  "kind"          VARCHAR(20)  NOT NULL,
  "locale"        VARCHAR(5)   NOT NULL DEFAULT 'uz',
  "title"         VARCHAR(120) NOT NULL,
  "body"          TEXT         NOT NULL,
  -- Bo'sh massiv = hamma qoidaga / xarita bo'yicha hamma amalga.
  "rule_types"    TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "actions"       TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sort_order"    INTEGER      NOT NULL DEFAULT 0,
  "usage_count"   INTEGER      NOT NULL DEFAULT 0,
  "last_used_at"  TIMESTAMPTZ,
  "archived_at"   TIMESTAMPTZ,
  "created_by_id" UUID,
  "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "manager_comment_templates_pkey" PRIMARY KEY ("id"),
  -- Yopiq ro'yxat kodda ham (`COMMENT_TEMPLATE_KIND`), bazada ham. Noma'lum
  -- tur kirsa shablon hech qanday amalga taklif qilinmay, «yaratdim-u
  -- ko'rinmaydi» degan jim nuqson bo'lardi.
  CONSTRAINT "manager_comment_templates_kind_check"
    CHECK ("kind" IN ('rejection', 'correction', 'warning')),
  -- Bo'sh sarlavha/tana ma'nosiz: tanlagichda ko'rinmas qator, jurnalda esa
  -- bo'sh izoh paydo bo'lardi.
  CONSTRAINT "manager_comment_templates_title_not_blank" CHECK (btrim("title") <> ''),
  CONSTRAINT "manager_comment_templates_body_not_blank" CHECK (btrim("body") <> ''),
  -- Izoh chegarasi bilan BIR XIL (`MAX_COMMENT_LENGTH` = 2000). Uzunroq
  -- shablon serverda materiallashib, foydalanuvchi qo'lda hech qachon yubora
  -- olmaydigan uzunlikdagi izohni jurnalga tushirardi.
  CONSTRAINT "manager_comment_templates_body_length" CHECK (length("body") <= 2000)
);

-- Asosiy so'rov: «shu hisobning tirik shablonlari, turi bo'yicha».
CREATE INDEX "manager_comment_templates_account_id_archived_at_kind_idx"
  ON "manager_comment_templates"("account_id", "archived_at", "kind");

ALTER TABLE "manager_comment_templates"
  ADD CONSTRAINT "manager_comment_templates_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL: muallif ishdan ketsa shablon qoladi (u endi hisobning matni).
ALTER TABLE "manager_comment_templates"
  ADD CONSTRAINT "manager_comment_templates_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

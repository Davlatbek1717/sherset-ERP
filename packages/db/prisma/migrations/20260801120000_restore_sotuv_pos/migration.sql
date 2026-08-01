-- /sotuv (POS) bo'limini QAYTARISH — sherset.biznesjon.uz bilan 1:1.
--
-- climart adoption (55cf3bf) «sherset-only» deb quyidagilarni o'chirgan edi:
--   · Smena/ShiftSchedule/SmenaEmployee — kassir navbati (/sotuv smena ochish);
--   · SkladKeeper/RestockTask/RestockTaskLine — omborchiga yig'ish topshirig'i;
--   · CashierSession.smena_id + out_of_shift_reason;
--   · CompanySettings.receipt_printer_name.
--
-- DIQQAT — bu migratsiya FAQAT yuqoridagilarni o'z ichiga oladi. `prisma
-- migrate diff` `debts`/`telegram_*`/`sms_templates`/`company_settings
-- .messaging_*` ni ham ko'rsatdi: ular MAVJUD migratsiya qarzi
-- (sherset-v2-schema-drift), bu yerga ataylab qo'shilmadi.
--
-- Manzil tizimi: sherset'ning `Product.loc_sklad/loc_polka/...` ustunlari
-- QAYTARILMADI (egasining qarori). Omborchi oqimi climart'ning yacheyka kodini
-- (`Product.attributes.__yacheyka` = «01-02-03-05») o'qiydi — bitta manzil
-- tizimi qoladi.

ALTER TABLE "cashier_sessions" ADD COLUMN     "out_of_shift_reason" VARCHAR(500),
ADD COLUMN     "smena_id" UUID;

ALTER TABLE "company_settings" ADD COLUMN     "receipt_printer_name" VARCHAR(255);

CREATE TABLE "shift_schedules" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "shift_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "smenas" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "schedule_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "smenas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "smena_employees" (
    "smena_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,

    CONSTRAINT "smena_employees_pkey" PRIMARY KEY ("smena_id","employee_id")
);

CREATE TABLE "sklad_keepers" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "sklad_no" INTEGER NOT NULL,
    "employee_id" UUID NOT NULL,
    "employee_name" VARCHAR(255),
    "printer_name" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sklad_keepers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "restock_tasks" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL DEFAULT 'restock',
    "sklad_no" INTEGER,
    "source_type" VARCHAR(30) NOT NULL DEFAULT 'salesreturn',
    "source_id" UUID NOT NULL,
    "source_name" VARCHAR(255),
    "store_id" UUID,
    "store_name" VARCHAR(255),
    "assignee_id" UUID,
    "assignee_name" VARCHAR(255),
    "created_by_id" UUID NOT NULL,
    "created_by_name" VARCHAR(255),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "restock_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "restock_task_lines" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "restock_task_id" UUID NOT NULL,
    "product_id" UUID,
    "product_name" VARCHAR(255) NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "bin_location" VARCHAR(20),
    "confirmed_at" TIMESTAMPTZ,
    "confirmed_by_id" UUID,
    "confirmed_by_name" VARCHAR(255),
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "restock_task_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shift_schedules_account_id_archived_idx" ON "shift_schedules"("account_id", "archived");

CREATE INDEX "smenas_account_id_archived_idx" ON "smenas"("account_id", "archived");

CREATE INDEX "sklad_keepers_account_id_idx" ON "sklad_keepers"("account_id");

CREATE UNIQUE INDEX "sklad_keepers_account_id_sklad_no_key" ON "sklad_keepers"("account_id", "sklad_no");

CREATE INDEX "restock_tasks_account_id_status_created_at_idx" ON "restock_tasks"("account_id", "status", "created_at" DESC);

CREATE INDEX "restock_tasks_account_id_assignee_id_status_idx" ON "restock_tasks"("account_id", "assignee_id", "status");

CREATE INDEX "restock_tasks_account_id_source_type_source_id_idx" ON "restock_tasks"("account_id", "source_type", "source_id");

CREATE INDEX "restock_tasks_account_id_type_idx" ON "restock_tasks"("account_id", "type");

CREATE INDEX "restock_task_lines_restock_task_id_position_idx" ON "restock_task_lines"("restock_task_id", "position");

CREATE INDEX "restock_task_lines_account_id_product_id_idx" ON "restock_task_lines"("account_id", "product_id");

ALTER TABLE "shift_schedules" ADD CONSTRAINT "shift_schedules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "smenas" ADD CONSTRAINT "smenas_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "smenas" ADD CONSTRAINT "smenas_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "shift_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "smenas" ADD CONSTRAINT "smenas_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "smena_employees" ADD CONSTRAINT "smena_employees_smena_id_fkey" FOREIGN KEY ("smena_id") REFERENCES "smenas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "smena_employees" ADD CONSTRAINT "smena_employees_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "restock_task_lines" ADD CONSTRAINT "restock_task_lines_restock_task_id_fkey" FOREIGN KEY ("restock_task_id") REFERENCES "restock_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_smena_id_fkey" FOREIGN KEY ("smena_id") REFERENCES "smenas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

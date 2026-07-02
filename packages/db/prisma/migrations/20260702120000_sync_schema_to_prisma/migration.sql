-- Reconcile the committed migrations with schema.prisma (drift captured via
-- prisma migrate diff). Adds smenas/shift_schedules/smena_employees, the
-- retail_sales.terminal_amount_minor column, cashier_sessions.smena_id +
-- nullable cash_desk/store, and the employees(account_id,username) unique key.
-- Previously these lived only in schema.prisma → a fresh 'migrate deploy' built
-- an incomplete schema (needed 'db push'). This migration closes that gap.

-- DropForeignKey
ALTER TABLE "cashier_sessions" DROP CONSTRAINT "cashier_sessions_cash_desk_id_fkey";

-- DropForeignKey
ALTER TABLE "cashier_sessions" DROP CONSTRAINT "cashier_sessions_store_id_fkey";

-- AlterTable
ALTER TABLE "cashier_sessions" ADD COLUMN     "out_of_shift_reason" VARCHAR(500),
ADD COLUMN     "smena_id" UUID,
ALTER COLUMN "cash_desk_id" DROP NOT NULL,
ALTER COLUMN "store_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "restock_task_lines" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "restock_tasks" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "retail_sales" ADD COLUMN     "terminal_amount_minor" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sklad_keepers" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "smena_employees" (
    "smena_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,

    CONSTRAINT "smena_employees_pkey" PRIMARY KEY ("smena_id","employee_id")
);

-- CreateIndex
CREATE INDEX "shift_schedules_account_id_archived_idx" ON "shift_schedules"("account_id", "archived");

-- CreateIndex
CREATE INDEX "smenas_account_id_archived_idx" ON "smenas"("account_id", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "employees_account_id_username_key" ON "employees"("account_id", "username");

-- AddForeignKey
ALTER TABLE "shift_schedules" ADD CONSTRAINT "shift_schedules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smenas" ADD CONSTRAINT "smenas_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smenas" ADD CONSTRAINT "smenas_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "shift_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smenas" ADD CONSTRAINT "smenas_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smena_employees" ADD CONSTRAINT "smena_employees_smena_id_fkey" FOREIGN KEY ("smena_id") REFERENCES "smenas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smena_employees" ADD CONSTRAINT "smena_employees_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_cash_desk_id_fkey" FOREIGN KEY ("cash_desk_id") REFERENCES "cash_desks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_smena_id_fkey" FOREIGN KEY ("smena_id") REFERENCES "smenas"("id") ON DELETE SET NULL ON UPDATE CASCADE;


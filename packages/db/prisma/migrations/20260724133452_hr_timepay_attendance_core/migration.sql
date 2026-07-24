-- HR TimePay davomat yadrosi: Bo'lim / Lavozim / Jadval / multi-branch.
-- Additive-only, prod-safe. Prerequisite migration: 20260723194426_hr_davomat_gps
-- (provides hr_work_locations, referenced by hr_employee_branches).

-- AlterTable: new nullable FK columns on employees (source-of-truth going forward;
-- legacy department/position VARCHARs kept for back-compat).
ALTER TABLE "employees" ADD COLUMN     "department_id" UUID,
ADD COLUMN     "position_id" UUID,
ADD COLUMN     "schedule_id" UUID;

-- CreateTable
CREATE TABLE "hr_departments" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "hr_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_positions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "hr_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_schedules" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "type" VARCHAR(12) NOT NULL DEFAULT 'flexible',
    "start_date" DATE NOT NULL,
    "cycle_days" INTEGER NOT NULL,
    "calc_overtime" BOOLEAN NOT NULL DEFAULT false,
    "extended_work_min" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "hr_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_schedule_days" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "day_index" INTEGER NOT NULL,
    "is_workday" BOOLEAN NOT NULL DEFAULT true,
    "start_time" VARCHAR(5),
    "end_time" VARCHAR(5),
    "break_start" VARCHAR(5),
    "break_end" VARCHAR(5),

    CONSTRAINT "hr_schedule_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_employee_branches" (
    "account_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_location_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_employee_branches_pkey" PRIMARY KEY ("employee_id","work_location_id")
);

-- CreateIndex
CREATE INDEX "hr_departments_account_id_archived_idx" ON "hr_departments"("account_id", "archived");

-- CreateIndex
CREATE INDEX "hr_positions_account_id_archived_idx" ON "hr_positions"("account_id", "archived");

-- CreateIndex
CREATE INDEX "hr_schedules_account_id_archived_idx" ON "hr_schedules"("account_id", "archived");

-- CreateIndex
CREATE INDEX "hr_schedule_days_account_id_schedule_id_idx" ON "hr_schedule_days"("account_id", "schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "hr_schedule_days_schedule_id_day_index_key" ON "hr_schedule_days"("schedule_id", "day_index");

-- CreateIndex
CREATE INDEX "hr_employee_branches_account_id_work_location_id_idx" ON "hr_employee_branches"("account_id", "work_location_id");

-- CreateIndex
CREATE INDEX "employees_account_id_department_id_idx" ON "employees"("account_id", "department_id");

-- CreateIndex
CREATE INDEX "employees_account_id_position_id_idx" ON "employees"("account_id", "position_id");

-- CreateIndex
CREATE INDEX "employees_account_id_schedule_id_idx" ON "employees"("account_id", "schedule_id");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "hr_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "hr_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "hr_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_departments" ADD CONSTRAINT "hr_departments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_positions" ADD CONSTRAINT "hr_positions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_schedules" ADD CONSTRAINT "hr_schedules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_schedule_days" ADD CONSTRAINT "hr_schedule_days_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_schedule_days" ADD CONSTRAINT "hr_schedule_days_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "hr_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employee_branches" ADD CONSTRAINT "hr_employee_branches_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employee_branches" ADD CONSTRAINT "hr_employee_branches_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employee_branches" ADD CONSTRAINT "hr_employee_branches_work_location_id_fkey" FOREIGN KEY ("work_location_id") REFERENCES "hr_work_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

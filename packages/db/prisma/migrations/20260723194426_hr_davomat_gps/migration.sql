-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "attendance_opt_in" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "work_location_id" UUID;

-- AlterTable
ALTER TABLE "hr_attendance" ADD COLUMN     "auto_closed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "check_in_accuracy" INTEGER,
ADD COLUMN     "check_in_lat" DOUBLE PRECISION,
ADD COLUMN     "check_in_lng" DOUBLE PRECISION,
ADD COLUMN     "check_out_lat" DOUBLE PRECISION,
ADD COLUMN     "check_out_lng" DOUBLE PRECISION,
ADD COLUMN     "late_minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "source" VARCHAR(12) NOT NULL DEFAULT 'auto_gps',
ADD COLUMN     "work_location_id" UUID;

-- CreateTable
CREATE TABLE "hr_work_locations" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radius_meters" INTEGER NOT NULL DEFAULT 150,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "hr_work_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_work_schedules" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "is_day_off" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "employee_work_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_location_pings" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" INTEGER NOT NULL,
    "inside" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_location_pings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hr_work_locations_account_id_archived_idx" ON "hr_work_locations"("account_id", "archived");

-- CreateIndex
CREATE INDEX "employee_work_schedules_account_id_employee_id_idx" ON "employee_work_schedules"("account_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_work_schedules_employee_id_weekday_key" ON "employee_work_schedules"("employee_id", "weekday");

-- CreateIndex
CREATE INDEX "hr_location_pings_account_id_employee_id_created_at_idx" ON "hr_location_pings"("account_id", "employee_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_work_location_id_fkey" FOREIGN KEY ("work_location_id") REFERENCES "hr_work_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_work_locations" ADD CONSTRAINT "hr_work_locations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_work_schedules" ADD CONSTRAINT "employee_work_schedules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_work_schedules" ADD CONSTRAINT "employee_work_schedules_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_location_pings" ADD CONSTRAINT "hr_location_pings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

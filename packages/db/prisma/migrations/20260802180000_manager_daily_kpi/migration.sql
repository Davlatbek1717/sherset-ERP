-- Menejer kengaytmasi 4M.1 — kunlik xodim KPI o'lchov yadrosi.
--
-- Mavjud `hr_kpi_daily_log` TEGILMAYDI: HR oylik dvigateli undan o'qiydi.
-- U uchta qat'iy ustundan iborat (sotuv / target / bajarish foizi) va kassa,
-- davomat, vazifa hamda ombor ko'rsatkichlari unga ustun sifatida sig'maydi.
-- Yangi ombor kalit-qiymat shaklida: yangi o'lchov migratsiyasiz qo'shiladi.
--
-- Qaytarish: DROP TABLE employee_daily_kpi_metrics, employee_daily_kpi,
--            kpi_profile_metrics, kpi_profile_versions, kpi_profiles,
--            kpi_metric_defs;

-- CreateTable
CREATE TABLE "kpi_metric_defs" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "label_uz" VARCHAR(120) NOT NULL,
    "label_ru" VARCHAR(120) NOT NULL,
    "unit" VARCHAR(10) NOT NULL,
    "direction" VARCHAR(15) NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "per_hour" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "kpi_metric_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_profiles" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "position_id" UUID,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "kpi_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_profile_versions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "note" VARCHAR(300),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,

    CONSTRAINT "kpi_profile_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_profile_metrics" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "profile_version_id" UUID NOT NULL,
    "metric_def_id" UUID NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "kpi_profile_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_daily_kpi" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "profile_version_id" UUID,
    "state" VARCHAR(20) NOT NULL DEFAULT 'computed',
    "data_complete" BOOLEAN NOT NULL DEFAULT true,
    "worked_minutes" INTEGER,
    "stale_at" TIMESTAMPTZ,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "employee_daily_kpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_daily_kpi_metrics" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "daily_kpi_id" UUID NOT NULL,
    "metric_key" VARCHAR(50) NOT NULL,
    "auto_value" BIGINT,
    "adjust_value" BIGINT,
    "reason_code" VARCHAR(40),
    "complete" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "employee_daily_kpi_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_cash_handovers" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "shift_id" UUID,
    "trip_id" UUID,
    "amount_minor" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "status" VARCHAR(12) NOT NULL DEFAULT 'pending',
    "collected_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handed_at" TIMESTAMPTZ,
    "accepted_by_id" UUID,
    "cash_in_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "driver_cash_handovers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kpi_metric_defs_account_id_archived_idx" ON "kpi_metric_defs"("account_id", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_metric_defs_account_id_key_key" ON "kpi_metric_defs"("account_id", "key");

-- CreateIndex
CREATE INDEX "kpi_profiles_account_id_archived_idx" ON "kpi_profiles"("account_id", "archived");

-- CreateIndex
CREATE INDEX "kpi_profiles_account_id_position_id_idx" ON "kpi_profiles"("account_id", "position_id");

-- CreateIndex
CREATE INDEX "kpi_profile_versions_account_id_profile_id_effective_from_idx" ON "kpi_profile_versions"("account_id", "profile_id", "effective_from" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "kpi_profile_versions_profile_id_version_key" ON "kpi_profile_versions"("profile_id", "version");

-- CreateIndex
CREATE INDEX "kpi_profile_metrics_account_id_profile_version_id_idx" ON "kpi_profile_metrics"("account_id", "profile_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_profile_metrics_profile_version_id_metric_def_id_key" ON "kpi_profile_metrics"("profile_version_id", "metric_def_id");

-- CreateIndex
CREATE INDEX "employee_daily_kpi_account_id_date_state_idx" ON "employee_daily_kpi"("account_id", "date" DESC, "state");

-- CreateIndex
CREATE INDEX "employee_daily_kpi_account_id_employee_id_date_idx" ON "employee_daily_kpi"("account_id", "employee_id", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "employee_daily_kpi_account_id_employee_id_date_key" ON "employee_daily_kpi"("account_id", "employee_id", "date");

-- CreateIndex
CREATE INDEX "employee_daily_kpi_metrics_account_id_metric_key_idx" ON "employee_daily_kpi_metrics"("account_id", "metric_key");

-- CreateIndex
CREATE UNIQUE INDEX "employee_daily_kpi_metrics_daily_kpi_id_metric_key_key" ON "employee_daily_kpi_metrics"("daily_kpi_id", "metric_key");

-- CreateIndex
CREATE INDEX "driver_cash_handovers_account_id_driver_id_status_idx" ON "driver_cash_handovers"("account_id", "driver_id", "status");

-- CreateIndex
CREATE INDEX "driver_cash_handovers_account_id_status_collected_at_idx" ON "driver_cash_handovers"("account_id", "status", "collected_at" DESC);

-- AddForeignKey
ALTER TABLE "kpi_metric_defs" ADD CONSTRAINT "kpi_metric_defs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_profiles" ADD CONSTRAINT "kpi_profiles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_profiles" ADD CONSTRAINT "kpi_profiles_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "hr_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_profile_versions" ADD CONSTRAINT "kpi_profile_versions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_profile_versions" ADD CONSTRAINT "kpi_profile_versions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "kpi_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_profile_metrics" ADD CONSTRAINT "kpi_profile_metrics_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_profile_metrics" ADD CONSTRAINT "kpi_profile_metrics_profile_version_id_fkey" FOREIGN KEY ("profile_version_id") REFERENCES "kpi_profile_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_profile_metrics" ADD CONSTRAINT "kpi_profile_metrics_metric_def_id_fkey" FOREIGN KEY ("metric_def_id") REFERENCES "kpi_metric_defs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_daily_kpi" ADD CONSTRAINT "employee_daily_kpi_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_daily_kpi" ADD CONSTRAINT "employee_daily_kpi_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_daily_kpi" ADD CONSTRAINT "employee_daily_kpi_profile_version_id_fkey" FOREIGN KEY ("profile_version_id") REFERENCES "kpi_profile_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_daily_kpi_metrics" ADD CONSTRAINT "employee_daily_kpi_metrics_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_daily_kpi_metrics" ADD CONSTRAINT "employee_daily_kpi_metrics_daily_kpi_id_fkey" FOREIGN KEY ("daily_kpi_id") REFERENCES "employee_daily_kpi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_cash_handovers" ADD CONSTRAINT "driver_cash_handovers_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_cash_handovers" ADD CONSTRAINT "driver_cash_handovers_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;


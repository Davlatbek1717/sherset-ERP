-- HR haydovchi jonli-tracking (TZ 2026-07-28-hr-driver-tracking-design.md)
-- Idempotent (IF NOT EXISTS / guarded FK) — re-run / drifted prod'da toza qo'llanadi.

-- AlterTable: Employee tracking rejimi (geofence=ofis, field=haydovchi). Backfillsiz default.
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "tracking_mode" VARCHAR(10) NOT NULL DEFAULT 'geofence';

-- AlterTable: ping-oqimiga speed/heading (FIELD to'xtash-aniqlash + marker yo'nalishi).
ALTER TABLE "hr_location_pings" ADD COLUMN IF NOT EXISTS "speed" DOUBLE PRECISION;
ALTER TABLE "hr_location_pings" ADD COLUMN IF NOT EXISTS "heading" DOUBLE PRECISION;

-- CreateTable: driver_trips (yetkazma)
CREATE TABLE IF NOT EXISTS "driver_trips" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "order_type" VARCHAR(20),
    "order_id" UUID,
    "dest_lat" DOUBLE PRECISION NOT NULL,
    "dest_lng" DOUBLE PRECISION NOT NULL,
    "dest_address" TEXT,
    "geocode_source" VARCHAR(10) NOT NULL DEFAULT 'manual',
    "status" VARCHAR(12) NOT NULL DEFAULT 'assigned',
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ,
    "arrived_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "distance_meters" INTEGER,
    "eta_seconds" INTEGER,
    "eta_computed_at" TIMESTAMPTZ,

    CONSTRAINT "driver_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable: driver_shifts (smena — grafiksiz ish o'lchovi)
CREATE TABLE IF NOT EXISTS "driver_shifts" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ,
    "distance_meters" INTEGER NOT NULL DEFAULT 0,
    "active_seconds" INTEGER NOT NULL DEFAULT 0,
    "stop_seconds" INTEGER NOT NULL DEFAULT 0,
    "deliveries_count" INTEGER NOT NULL DEFAULT 0,
    "auto_closed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "driver_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "driver_trips_account_id_driver_id_status_idx" ON "driver_trips"("account_id", "driver_id", "status");
CREATE INDEX IF NOT EXISTS "driver_trips_account_id_status_idx" ON "driver_trips"("account_id", "status");
CREATE INDEX IF NOT EXISTS "driver_shifts_account_id_driver_id_started_at_idx" ON "driver_shifts"("account_id", "driver_id", "started_at" DESC);

-- AddForeignKey (driver_id → employees, ON DELETE CASCADE). Guarded — idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_trips_driver_id_fkey') THEN
    ALTER TABLE "driver_trips" ADD CONSTRAINT "driver_trips_driver_id_fkey"
      FOREIGN KEY ("driver_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_shifts_driver_id_fkey') THEN
    ALTER TABLE "driver_shifts" ADD CONSTRAINT "driver_shifts_driver_id_fkey"
      FOREIGN KEY ("driver_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- PARTIAL UNIQUE: har haydovchida bir vaqtda FAQAT bitta ochiq smena bo'ladi
-- (review: findFirst+create TOCTOU'ni DB darajasida bekitadi). Prisma partial
-- unique'ni modellay olmaydi (Employee username partial index kabi) — shu sabab
-- xom-SQL; DriverShift modeliда izoh qoldirildi (migrate dev drift'ini kutamiz).
CREATE UNIQUE INDEX IF NOT EXISTS "driver_shifts_one_open_per_driver"
  ON "driver_shifts" ("account_id", "driver_id") WHERE "ended_at" IS NULL;

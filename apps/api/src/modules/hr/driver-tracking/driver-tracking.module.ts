import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
// §7.2 — naqd topshirig'i ПКО'ni mavjud auditlangan yo'ldan yaratadi.
import { CashInModule } from '../../cash-in/cash-in.module.js';
import { DriverCashController } from './driver-cash.controller.js';
import { DriverCashService } from './driver-cash.service.js';
import { DriverFieldIngestService } from './driver-field-ingest.service.js';
import { DriverLiveService } from './driver-live.service.js';
import { DriverPublicController } from './driver-public.controller.js';
import { DriverShiftService } from './driver-shift.service.js';
import { DriverTrackingController } from './driver-tracking.controller.js';
import { DriverTripController } from './driver-trip.controller.js';
import { DriverTripService } from './driver-trip.service.js';
import { DriverEtaWorkerCron } from './eta-worker.cron.js';
import { GeocodeService } from './geocode.service.js';
import { NominatimGeocodeService } from './nominatim-geocode.service.js';
import { YandexGeocodeService } from './yandex-geocode.service.js';

/**
 * HR haydovchi jonli-tracking (TZ 2026-07-28-hr-driver-tracking-design.md).
 * Mavjud attendance-geo (haversine/jump-filter/ping-oqim) ustiga quriladi,
 * lekin geofence keldi/ketdi oqimiga TEGMAYDI (alohida endpoint, 0 regressiya).
 */
@Module({
  imports: [PrismaModule, AuthModule, CashInModule],
  controllers: [
    DriverTrackingController,
    DriverTripController,
    DriverCashController,
    DriverPublicController,
  ],
  providers: [
    DriverFieldIngestService,
    DriverShiftService,
    DriverTripService,
    DriverLiveService,
    // Geokoder: ikki provayder + tanlovchi fasad. Kontroller FAQAT fasadga
    // bog'lanadi — provayderni almashtirish uchun kontroller o'zgarmaydi.
    NominatimGeocodeService,
    YandexGeocodeService,
    GeocodeService,
    DriverCashService,
    DriverEtaWorkerCron,
  ],
  exports: [DriverShiftService],
})
export class DriverTrackingModule {}

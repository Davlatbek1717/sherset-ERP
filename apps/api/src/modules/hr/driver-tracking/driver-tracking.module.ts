import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { DriverFieldIngestService } from './driver-field-ingest.service.js';
import { DriverLiveService } from './driver-live.service.js';
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
  imports: [PrismaModule, AuthModule],
  controllers: [DriverTrackingController, DriverTripController],
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
    DriverEtaWorkerCron,
  ],
  exports: [DriverShiftService],
})
export class DriverTrackingModule {}

import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { DispatcherGuard } from './dispatcher.guard.js';
import { DriverFieldIngestService } from './driver-field-ingest.service.js';
import { signDriverToken } from './driver-link.util.js';
import { DriverLiveService } from './driver-live.service.js';
import { DriverShiftService } from './driver-shift.service.js';
import { FieldPingSchema } from './driver-tracking.schema.js';
import { DriverTripService } from './driver-trip.service.js';

/**
 * HR haydovchi jonli-tracking (TZ 2026-07-28).
 * SELF (native app, employeeId = user.sub): ping · smena · o'z yetkazmasi.
 * DISPECHER: jonli-board · kun-izi.
 *
 * TODO(rol-gate): dispecher endpoint'lari HR/menejer roliga cheklanadi
 * (permissions tizimi barqarorlashgach — hozir parallel sessiya refactor qilyapti).
 */
@Controller('driver-tracking')
@UseGuards(JwtAuthGuard)
export class DriverTrackingController {
  constructor(
    @Inject(DriverFieldIngestService) private readonly ingest: DriverFieldIngestService,
    @Inject(DriverShiftService) private readonly shifts: DriverShiftService,
    @Inject(DriverTripService) private readonly trips: DriverTripService,
    @Inject(DriverLiveService) private readonly live: DriverLiveService,
  ) {}

  // ── DISPECHER: haydovchiga PAROLSIZ magic-link (telefonда ochib GPS yuboradi) ──
  //
  // Faza Q10 (AUTH-07): `DispatcherGuard` QO'SHILDI. Ilgari kommentda «DISPECHER»
  // deb yozilgan-u, guard YO'Q edi — HAR autentifikatsiyalangan xodim ISTAGAN
  // `employeeId` uchun doimiy HMAC-token yasay olardi (`driver-link.util` — token
  // saqlanmaydi, bekor qilish faqat JWT_SECRET rotatsiyasi bilan). O'sha token
  // bilan `POST /p/driver/:token/ping|shift/start|shift/end` — ya'ni boshqa
  // haydovchi nomidan GPS-iz va smena yozish mumkin edi (davomat soxtalashtirish).
  @Get('link/:employeeId')
  @UseGuards(DispatcherGuard)
  driverLink(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string) {
    const token = signDriverToken(user.accountId, employeeId);
    const base = process.env.APP_BASE_URL || 'https://erp.sherset.uz';
    return { url: `${base}/p/driver/${token}` };
  }

  // ── SELF (native app) ──
  @Post('ping')
  async ping(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.ingest.ingestField(user.accountId, user.sub, FieldPingSchema.parse(body));
  }

  @Post('shifts/start')
  async startShift(@CurrentUser() user: AuthenticatedUser) {
    return this.shifts.start(user.accountId, user.sub);
  }

  @Post('shifts/end')
  async endShift(@CurrentUser() user: AuthenticatedUser) {
    return this.shifts.end(user.accountId, user.sub);
  }

  @Get('shifts/current')
  async currentShift(@CurrentUser() user: AuthenticatedUser) {
    return this.shifts.current(user.accountId, user.sub);
  }

  @Get('my/trips')
  async myTrips(@CurrentUser() user: AuthenticatedUser) {
    return this.trips.listForDriver(user.accountId, user.sub);
  }

  // ── DISPECHER (rol-gate: DispatcherGuard) ──
  @Get('live')
  @UseGuards(DispatcherGuard)
  async liveBoard(@CurrentUser() user: AuthenticatedUser) {
    return this.live.board(user.accountId);
  }

  /** Kun-izi (ping-polyline + to'xtash-nuqtalar). `from`/`to` ISO; default = 24 soat. */
  @Get('route')
  @UseGuards(DispatcherGuard)
  async route(
    @CurrentUser() user: AuthenticatedUser,
    @Query('driverId') driverId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 24 * 60 * 60 * 1000);
    return this.live.routeForDay(user.accountId, driverId, fromDate, toDate);
  }
}

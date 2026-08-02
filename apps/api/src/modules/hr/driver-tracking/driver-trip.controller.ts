import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { DispatcherGuard } from './dispatcher.guard.js';
import { TripAssignSchema, TripStatusSchema } from './driver-tracking.schema.js';
import { DriverTripService } from './driver-trip.service.js';
import { GeocodeService } from './geocode.service.js';

/**
 * Yetkazma (DriverTrip) — dispecher biriktirish + holat-o'tishlar (TZ §4.3).
 * Hamma endpoint dispecher (assign/status/list/geocode) → DispatcherGuard
 * (review #6/#9: field-haydovchi dispecher bo'la olmaydi + geocode metersiz proxy emas).
 */
@Controller('driver-trips')
@UseGuards(JwtAuthGuard, DispatcherGuard)
export class DriverTripController {
  constructor(
    @Inject(DriverTripService) private readonly trips: DriverTripService,
    @Inject(GeocodeService) private readonly geocoder: GeocodeService,
  ) {}

  /**
   * Manzil matnini koordinataga (gibrid AVTO qismi). O'chiq bo'lsa
   * `enabled:false` → dispecher koordinatani qo'lda kiritadi.
   *
   * `provider` qaytariladi: FE atributni to'g'ri ko'rsatishi uchun
   * (Nominatim natijasi ODbL — «© OpenStreetMap contributors»).
   *
   * ⚠️ Bu endpoint AVTOMATIK-TO'LDIRISH uchun chaqirilmasin — Nominatim
   * siyosatida autocomplete qat'iy taqiqlangan (ban sababi). FE'da u
   * «Topish» tugmasiga bog'langan, matn o'zgarishiga EMAS.
   */
  @Get('geocode')
  async geocode(@Query('address') address?: string) {
    if (!this.geocoder.isEnabled()) {
      return { enabled: false, provider: null, result: null };
    }
    const result = address ? await this.geocoder.geocode(address) : null;
    return { enabled: true, provider: this.geocoder.providerName(), result };
  }

  @Post()
  async assign(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.trips.assign(user.accountId, TripAssignSchema.parse(body));
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.trips.updateStatus(user.accountId, id, TripStatusSchema.parse(body));
  }

  /** driverId berilса — o'sha haydovchi yetkazmalari; aks holда barcha faol. */
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query('driverId') driverId?: string) {
    return driverId
      ? this.trips.listForDriver(user.accountId, driverId)
      : this.trips.listActive(user.accountId);
  }
}

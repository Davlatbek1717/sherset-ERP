import { Body, Controller, Get, Inject, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { CurrencyCodeSchema } from './exchange-rate.schema.js';
import { ExchangeRateService } from './exchange-rate.service.js';

@Controller('exchange-rates')
@UseGuards(JwtAuthGuard)
export class ExchangeRateController {
  constructor(@Inject(ExchangeRateService) private readonly svc: ExchangeRateService) {}

  /**
   * GET /exchange-rates/latest
   * Returns the most recent known rate per currency. UI table source.
   */
  @Get('latest')
  @RequirePermission({ entity: 'exchangerate', action: 'view' })
  async latest() {
    return this.svc.listLatest();
  }

  /**
   * GET /exchange-rates/history?currency=USD&date=2026-04-26&limit=90
   * Time-series for charting. Defaults to 90 days.
   */
  @Get('history')
  @RequirePermission({ entity: 'exchangerate', action: 'view' })
  async history(@Query() query: Record<string, unknown>) {
    const limit = query.limit ? Number.parseInt(String(query.limit), 10) : 90;
    return this.svc.listHistory(query, limit);
  }

  /**
   * GET /exchange-rates/rate?currency=USD&date=2026-04-26
   * Single point lookup for invoice/POS conversion. Carries forward across
   * weekends/holidays.
   */
  @Get('rate')
  @RequirePermission({ entity: 'exchangerate', action: 'view' })
  async rate(@Query('currency') currency: string, @Query('date') date?: string) {
    const ccy = CurrencyCodeSchema.parse(currency);
    const d = date ? new Date(date) : new Date();
    return this.svc.getRate(ccy, d);
  }

  /**
   * PUT /exchange-rates/manual  { currency, rate }
   *
   * Kursni QO'LDA qo'yish. Bitta amal ikkala qatlamni yozadi (kassa o'qiydigan
   * `exchange_rates` MANUAL qatori + ERP ishlatadigan `Currency.rateValue`) va
   * `AuditLog` ga «kim, qachon, nimadan nimaga» izini qoldiradi.
   *
   * 🔴 IKKI QULF (loyihada bu sinf ikki marta kuydirgan): bu yo'l kiosk
   * ro'yxatiga QO'SHILGAN (planshetdan chaqirilsin), lekin `update` ruxsati
   * kassirda YO'Q ⇒ kassir ko'radi, o'zgartira olmaydi.
   */
  @Put('manual')
  @RequirePermission({ entity: 'exchangerate', action: 'update' })
  async setManual(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.setManualRate(user.accountId, user.sub, body);
  }

  /**
   * GET /exchange-rates/manual/changes?currency=USD&limit=20
   * Qo'lda kurs o'zgarishlari tarixi (kim, qachon, nimadan nimaga).
   */
  @Get('manual/changes')
  @RequirePermission({ entity: 'exchangerate', action: 'view' })
  async manualChanges(
    @CurrentUser() user: AuthenticatedUser,
    @Query('currency') currency: string,
    @Query('limit') limit?: string,
  ) {
    const ccy = CurrencyCodeSchema.parse(currency);
    return this.svc.listManualChanges(user.accountId, ccy, limit ? Number.parseInt(limit, 10) : 20);
  }

  /**
   * POST /exchange-rates/sync?date=2026-04-26
   * Triggers a CBRU fetch + upsert for the given date (defaults to today).
   * V1: any authenticated user can trigger; V2 should restrict to admin role.
   */
  @Post('sync')
  @RequirePermission({ entity: 'exchangerate', action: 'create' })
  async sync(@Query('date') date?: string) {
    const d = date ? new Date(date) : new Date();
    return this.svc.sync(d);
  }
}

import { Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
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

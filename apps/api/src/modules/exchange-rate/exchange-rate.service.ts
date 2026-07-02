import { Prisma } from '@moysklad/db';
import { BadGatewayException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CurrencyService } from '../currency/currency.service.js';
import {
  CbruResponseSchema,
  type CbruRow,
  type CurrencyCode,
  ExchangeRateFilterSchema,
} from './exchange-rate.schema.js';

const CBRU_BASE = 'https://cbu.uz/uz/arkhiv-kursov-valyut/json';

export interface ExchangeRateRow {
  date: string;
  currency: string;
  rate: string;
  nominal: number;
  source: string;
}

export interface SyncResult {
  date: string;
  inserted: number;
  updated: number;
  total: number;
}

/**
 * ExchangeRateService — fetches central-bank rates from cbu.uz and
 * exposes a read API for the rest of the system. Source of truth is
 * the public JSON feed; we cache to Postgres so reads are fast and
 * historical rates remain available even if cbu.uz is down.
 *
 * CBRU publishes weekday-only. Reads use carry-forward (last known on
 * or before the requested date) so consumers don't have to special-case
 * weekends.
 *
 * V2 follow-ups:
 *   - Scheduled cron job (daily 09:00 Tashkent) to call sync(today)
 *   - Per-tenant rate overrides (e.g. internal markup) layered above CBRU
 *   - WebSocket invalidation push when a fresh sync lands
 */
@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CurrencyService) private readonly currency: CurrencyService,
  ) {}

  /**
   * Pull the rate snapshot for `date` from cbu.uz and upsert each row.
   * Idempotent: re-syncing the same date overwrites with the latest fetch.
   *
   * `date` is optional. CBRU's bare `/json/` endpoint always returns the
   * latest published rates (weekday only), and each row carries its own
   * Date field — we trust that to set the effective date in the DB.
   * Passing a historical `date` switches to per-currency historical URLs
   * (V2 — for now we only sync the latest, which is the realistic use case).
   */
  async sync(date?: Date): Promise<SyncResult> {
    const rows = await this.fetchFromCbru(date);
    const ymd = rows[0]?.Date ? parseDdmmyyyyToYmd(rows[0].Date) : toYMD(new Date());

    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const effectiveDate = parseDdmmyyyy(row.Date);
      const result = await this.prisma.client.exchangeRate.upsert({
        where: {
          date_currency_source: {
            date: effectiveDate,
            currency: row.Ccy,
            source: 'CBRU',
          },
        },
        create: {
          date: effectiveDate,
          currency: row.Ccy,
          rate: new Prisma.Decimal(row.Rate),
          nominal: Number.parseInt(row.Nominal, 10) || 1,
          source: 'CBRU',
        },
        update: {
          rate: new Prisma.Decimal(row.Rate),
          nominal: Number.parseInt(row.Nominal, 10) || 1,
          fetchedAt: new Date(),
        },
        select: { fetchedAt: true, date: true },
      });
      // Heuristic: an upsert that changed >1 second ago counts as "update";
      // newly inserted rows have fetchedAt within the same query window.
      const ageMs = Date.now() - result.fetchedAt.getTime();
      if (ageMs < 2000) inserted++;
      else updated++;
    }

    // Propagate the fresh quotes to every AUTO currency (margin +
    // nominal applied per currency; MANUAL/валюта-учёта untouched).
    const autoUpdated = await this.currency.applyAutoRatesFromSource(
      rows.map((r) => ({
        currency: r.Ccy,
        rate: r.Rate,
        nominal: Number.parseInt(r.Nominal, 10) || 1,
      })),
    );

    this.logger.log(
      `CBRU sync ${ymd}: ${rows.length} rows (${inserted} new, ${updated} updated); ${autoUpdated} AUTO currencies repriced`,
    );
    return { date: ymd, inserted, updated, total: rows.length };
  }

  /**
   * Latest known rate for `currency` on-or-before `date`. Carries forward
   * across weekends/holidays. UZS itself returns rate=1 trivially.
   */
  async getRate(currency: CurrencyCode, date: Date = new Date()): Promise<ExchangeRateRow> {
    if (currency === 'UZS') {
      return {
        date: toYMD(date),
        currency: 'UZS',
        rate: '1',
        nominal: 1,
        source: 'CBRU',
      };
    }
    const row = await this.prisma.client.exchangeRate.findFirst({
      where: {
        currency,
        date: { lte: startOfDayUTC(date) },
      },
      orderBy: { date: 'desc' },
    });
    if (!row) {
      throw new NotFoundException(
        `No rate found for ${currency} on or before ${toYMD(date)}. Run a sync first.`,
      );
    }
    return {
      date: toYMD(row.date),
      currency: row.currency,
      rate: row.rate.toString(),
      nominal: row.nominal,
      source: row.source,
    };
  }

  /**
   * List the latest known rate per currency. Used by the settings UI to show
   * "today's table" without scanning the whole history.
   */
  async listLatest(): Promise<ExchangeRateRow[]> {
    const rows = await this.prisma.client.$queryRaw<
      Array<{
        date: Date;
        currency: string;
        rate: Prisma.Decimal;
        nominal: number;
        source: string;
      }>
    >`
      SELECT DISTINCT ON (currency, source)
        date, currency, rate, nominal, source
      FROM exchange_rates
      ORDER BY currency, source, date DESC
    `;
    return rows.map((r) => ({
      date: toYMD(r.date),
      currency: r.currency,
      rate: r.rate.toString(),
      nominal: r.nominal,
      source: r.source,
    }));
  }

  /**
   * Read the historical series for a given currency. Bounded by limit so a
   * malicious request can't pull years of rows.
   */
  async listHistory(rawFilter: unknown, limit = 90): Promise<ExchangeRateRow[]> {
    const filter = ExchangeRateFilterSchema.parse(rawFilter);
    const where: Prisma.ExchangeRateWhereInput = {
      ...(filter.currency ? { currency: filter.currency } : {}),
      ...(filter.date ? { date: { lte: startOfDayUTC(filter.date) } } : {}),
    };
    const rows = await this.prisma.client.exchangeRate.findMany({
      where,
      orderBy: [{ date: 'desc' }, { currency: 'asc' }],
      take: Math.min(Math.max(limit, 1), 365),
    });
    return rows.map((r) => ({
      date: toYMD(r.date),
      currency: r.currency,
      rate: r.rate.toString(),
      nominal: r.nominal,
      source: r.source,
    }));
  }

  // -------------------------------------------------------------------
  // CBRU client
  // -------------------------------------------------------------------

  private async fetchFromCbru(date?: Date): Promise<CbruRow[]> {
    // V1: bare `/json/` returns latest published rates regardless of `date`.
    // CBRU's URL with a trailing date (`/json/YYYY-MM-DD/`) is documented
    // unofficially and 404s on most non-trading days, so we don't rely on
    // it. Each row carries its own `Date` field — that's the source of
    // truth for what day the snapshot actually reflects.
    const url = `${CBRU_BASE}/`;
    const label = date ? toYMD(date) : 'latest';
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      throw new BadGatewayException(`CBRU fetch failed for ${label}: ${(e as Error).message}`);
    }
    if (!res.ok) {
      throw new BadGatewayException(`CBRU HTTP ${res.status} for ${label}`);
    }
    const json = (await res.json()) as unknown;
    const parsed = CbruResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new BadGatewayException(
        `CBRU response shape changed: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    return parsed.data;
  }
}

// -------------------------------------------------------------------
// Date helpers (date-only, UTC) — kept local so the service doesn't
// pull a heavy date lib for two operations.
// -------------------------------------------------------------------

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function toYMD(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDdmmyyyy(s: string): Date {
  // CBRU returns DD.MM.YYYY — anchor at UTC midnight so the @db.Date
  // column stores exactly the day CBRU declared without TZ slippage.
  const [dd, mm, yyyy] = s.split('.');
  return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
}

function parseDdmmyyyyToYmd(s: string): string {
  const [dd, mm, yyyy] = s.split('.');
  return `${yyyy}-${mm}-${dd}`;
}

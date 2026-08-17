import { Prisma } from '@moysklad/db';
import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { alphaCurrencyCode } from '../currency/currency-code.util.js';
import { cbuRateToRateValue } from '../currency/currency-rate-source.js';
import { CurrencyService } from '../currency/currency.service.js';
import {
  CbruResponseSchema,
  type CbruRow,
  type CurrencyCode,
  ExchangeRateFilterSchema,
  ManualRateSchema,
} from './exchange-rate.schema.js';

const CBRU_BASE = 'https://cbu.uz/uz/arkhiv-kursov-valyut/json';

export interface ExchangeRateRow {
  date: string;
  currency: string;
  rate: string;
  nominal: number;
  /**
   * KANONIK kurs — bir birlik uchun, ×10^8 (DB-01 / Faza 16; `Currency.rateValue`,
   * `DebtPayment.exchangeRate`, `RetailSalePayment.rateMinor` bilan bir xil).
   *
   * NEGA SERVERDA: klient (POS dollar to'lovi) `usdRateMinor` ni aynan shu
   * masshtabda yuboradi va `retail-sale.schema.ts` stale-scale qo'riqchisi
   * `< 10^9` qiymatni rad etadi. O'girishni ekranga qoldirsak `rate/nominal`
   * formulasi ikkinchi nusxada yashardi — `nominal ≠ 1` valyutada jimgina
   * 100× xato. Bu yerda u `cbuRateToRateValue` bilan bitta manbada turadi.
   *
   * Margin QO'LLANMAYDI (0): bu jadval CBU tasmasining o'zi. Do'konning
   * ustamasi `Currency.margin` orqali `Currency.rateValue` ga tushadi —
   * ikkisi ataylab ajratilgan.
   */
  rateMinor: string;
  source: string;
}

/**
 * O'nlik CBU kotirovkasiga kanonik `rateMinor` ni qo'shadi — HAMMA o'quvchi
 * (rate · latest · history) shu yagona joydan o'tadi, aks holda biri jimgina
 * eskirib klientга masshtabsiz qator qaytarardi.
 */
function toExchangeRateRow(r: Omit<ExchangeRateRow, 'rateMinor'>): ExchangeRateRow {
  return { ...r, rateMinor: cbuRateToRateValue(r.rate, r.nominal, 0).toString() };
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
   * Kursni QO'LDA qo'yish (2026-08-17, egasi: «dollar kursini o'zim yozaman»).
   *
   * 🔴 NEGA BITTA TRANZAKSIYADA IKKI JADVAL: kurs loyihada ikki joyda yashaydi —
   * `exchange_rates` (source='MANUAL' qatori, KASSA `getRate()` orqali shundan
   * o'qiydi) va `Currency.rateValue` (ERP hujjatlari + hisobot konvertatsiyasi).
   * Faqat bittasini yozsak chek bilan hisobot BOSHQA kursdan hisoblaydi. Ikkisi
   * bitta `$transaction` da — yarim qo'llanish bo'lmaydi.
   *
   * Sana DOIM bugungi UTC kuni: o'tgan sanaga yozish hisobot konvertatsiyasini
   * orqaga qarab qayta hisoblab yuboradi (egasi «faqat bugundan» dedi). Post
   * qilingan hujjatlar o'z `rate_value` snapshotini saqlaydi ⇒ o'tmish tegilmaydi.
   */
  async setManualRate(
    accountId: string,
    userId: string | null,
    input: unknown,
  ): Promise<ExchangeRateRow> {
    const { currency, rate } = ManualRateSchema.parse(input);

    // Valyuta shu akkauntda bormi + baza valyutasi emasmi. Lookup alphaCode
    // orqali: legacy qatorlarda `code` da ALPHA turishi mumkin (M-03).
    const currencies = await this.prisma.client.currency.findMany({
      where: { accountId },
      select: {
        id: true,
        code: true,
        isoCode: true,
        default: true,
        rateValue: true,
        multiplicity: true,
      },
    });
    const target = currencies.find((c) => alphaCurrencyCode(c) === currency);
    if (!target) {
      throw new NotFoundException(
        `Valyuta ${currency} bu akkauntda topilmadi — avval «Sozlamalar → Valyutalar» da yarating.`,
      );
    }
    if (target.default) {
      throw new BadRequestException(
        `${currency} — hisob valyutasi (baza). Uning kursi har doim 1, o'zgartirib bo'lmaydi.`,
      );
    }

    const today = startOfDayUTC(new Date());
    // `nominal` mavjud MANUAL/CBRU qatoridan meros oladi — dollar uchun 1,
    // lekin per-1000 kotirovkali valyutada (KRW) uni 1 ga tushirib
    // yuborsak kurs 1000× xato bo'lardi.
    const known = await this.prisma.client.exchangeRate.findFirst({
      where: { currency },
      orderBy: { date: 'desc' },
      select: { nominal: true },
    });
    const nominal = known?.nominal && known.nominal > 0 ? known.nominal : 1;

    // Kanonik ×10^8. Margin QO'LLANMAYDI: qo'lda kiritilgan son AYNAN
    // o'zi ishlasin (egasi «12 000 deb hisobla» degani — ustama emas).
    const rateValue = cbuRateToRateValue(rate, nominal, 0);
    const before = target.rateValue;

    await this.prisma.client.$transaction(async (tx) => {
      await tx.exchangeRate.upsert({
        where: { date_currency_source: { date: today, currency, source: 'MANUAL' } },
        create: {
          date: today,
          currency,
          source: 'MANUAL',
          rate: new Prisma.Decimal(rate),
          nominal,
        },
        update: { rate: new Prisma.Decimal(rate), nominal, fetchedAt: new Date() },
      });

      await tx.currency.update({
        where: { id: target.id },
        data: { rateValue, rateUpdateType: 'MANUAL' },
      });

      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'currency',
          entityId: target.id,
          action: 'rate_change',
          fieldChanges: {
            rate: { before: before.toString(), after: rateValue.toString() },
          },
          context: { source: 'manual-rate', currency, nominal },
        },
      });
    });

    this.logger.log(
      `Qo'lda kurs: ${currency} → ${rate} (nominal ${nominal}, rateValue ${rateValue}) · user ${userId ?? 'system'}`,
    );

    return toExchangeRateRow({
      date: toYMD(today),
      currency,
      rate,
      nominal,
      source: 'MANUAL',
    });
  }

  /**
   * Qo'lda kurs o'zgarishlari tarixi — KIM, QACHON, nimadan nimaga.
   *
   * `AuditLog` dan o'qiydi (yozuv `setManualRate` da tushadi). Nega alohida
   * endpoint: sahifa `currencyId` ni topib `audit-log` filtrini qurmasin —
   * bitta so'rov bilan tarix keladi.
   */
  async listManualChanges(
    accountId: string,
    currency: CurrencyCode,
    limit = 20,
  ): Promise<
    Array<{ at: string; before: string; after: string; userName: string | null; currency: string }>
  > {
    const currencies = await this.prisma.client.currency.findMany({
      where: { accountId },
      select: { id: true, code: true, isoCode: true },
    });
    const target = currencies.find((c) => alphaCurrencyCode(c) === currency);
    if (!target) return [];

    const rows = await this.prisma.client.auditLog.findMany({
      where: { accountId, entity: 'currency', entityId: target.id, action: 'rate_change' },
      orderBy: { at: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      include: { user: { select: { name: true, email: true } } },
    });

    return rows.map((r) => {
      const changes = (r.fieldChanges ?? {}) as {
        rate?: { before?: unknown; after?: unknown };
      };
      return {
        at: r.at.toISOString(),
        before: String(changes.rate?.before ?? ''),
        after: String(changes.rate?.after ?? ''),
        userName: r.user?.name ?? r.user?.email ?? null,
        currency,
      };
    });
  }

  /**
   * Latest known rate for `currency` on-or-before `date`. Carries forward
   * across weekends/holidays. UZS itself returns rate=1 trivially.
   */
  async getRate(currency: CurrencyCode, date: Date = new Date()): Promise<ExchangeRateRow> {
    if (currency === 'UZS') {
      return toExchangeRateRow({
        date: toYMD(date),
        currency: 'UZS',
        rate: '1',
        nominal: 1,
        source: 'CBRU',
      });
    }
    // 2026-08-16 (egasi qarori): MANUAL kurs CBRU'dan USTUN. Do'kon o'z kursi
    // bilan ishlaydi («dollarni 12 000 deb hisobla») — kunlik CBRU-sinxron
    // yangi sana bilan qator qo'shsa ham, MANUAL qatori o'chirilmaguncha
    // kassadagi kurs o'zgarmaydi. MANUAL qatorlar `exchange_rates` da
    // source='MANUAL' bilan turadi (docstring'dagi «per-tenant override»
    // qatlamining minimal ko'rinishi).
    const manual = await this.prisma.client.exchangeRate.findFirst({
      where: { currency, source: 'MANUAL', date: { lte: startOfDayUTC(date) } },
      orderBy: { date: 'desc' },
    });
    if (manual) {
      return toExchangeRateRow({
        date: toYMD(manual.date),
        currency: manual.currency,
        rate: manual.rate.toString(),
        nominal: manual.nominal,
        source: manual.source,
      });
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
    return toExchangeRateRow({
      date: toYMD(row.date),
      currency: row.currency,
      rate: row.rate.toString(),
      nominal: row.nominal,
      source: row.source,
    });
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
    return rows.map((r) =>
      toExchangeRateRow({
        date: toYMD(r.date),
        currency: r.currency,
        rate: r.rate.toString(),
        nominal: r.nominal,
        source: r.source,
      }),
    );
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
    return rows.map((r) =>
      toExchangeRateRow({
        date: toYMD(r.date),
        currency: r.currency,
        rate: r.rate.toString(),
        nominal: r.nominal,
        source: r.source,
      }),
    );
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

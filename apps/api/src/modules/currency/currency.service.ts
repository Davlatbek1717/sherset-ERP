import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { alphaCurrencyCode } from './currency-code.util.js';
import { cbuRateToRateValue } from './currency-rate-source.js';
import {
  type CreateCurrencyInput,
  CreateCurrencySchema,
  CurrencyFilterSchema,
  type UpdateCurrencyInput,
  UpdateCurrencySchema,
  rateToRateValue,
  rateValueToRate,
} from './currency.schema.js';

const RATE_ONE = '100000000'; // 1.0 × 1e8 — the accounting currency's fixed rate.

interface CurrencyRow {
  rateValue: bigint;
  majorUnit: unknown;
  minorUnit: unknown;
  [k: string]: unknown;
}

/**
 * CurrencyService — moysklad `currency` entity CRUD.
 *
 * Invariants (moysklad parity):
 *  - exactly one row has default=true (валюта учёта / base); its rate
 *    is fixed at 1 and it can be neither rate-edited, archived, nor
 *    deleted;
 *  - an AUTO currency's rate is owned by the CBRU cron — it cannot be
 *    set through create/update;
 *  - a system currency's identity (code/isoCode/name/fullName) is
 *    immutable;
 *  - a system or default currency cannot be deleted.
 */
@Injectable()
export class CurrencyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = CurrencyFilterSchema.parse(rawFilter);
    const where: Prisma.CurrencyWhereInput = {
      accountId,
      ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
      ...(filter.search
        ? {
            OR: [
              { code: { contains: filter.search, mode: 'insensitive' } },
              { name: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.client.currency.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: 250,
    });
    return { items: rows.map((r) => this.serialize(r)), total: rows.length };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.currency.findFirst({ where: { id, accountId } });
    if (!row) throw new NotFoundException(`Valyuta ${id} topilmadi`);
    return this.serialize(row);
  }

  async create(accountId: string, raw: unknown) {
    const p = this.parse(CreateCurrencySchema, raw) as CreateCurrencyInput;
    // The base currency's rate is, by definition, exactly 1.
    const rateValue = p.default ? RATE_ONE : rateToRateValue(p.rate);

    try {
      // Serializable: the "≤1 валюта учёта" invariant is a check-then-
      // insert TOCTOU. Two concurrent default-creates each reading
      // "no default" then inserting would both pass under Read
      // Committed; Serializable makes the predicate read-write
      // conflict, so one transaction aborts (→ 409, retryable) instead
      // of silently creating two accounting currencies.
      const row = await this.prisma.client.$transaction(
        async (tx) => {
          if (p.default) {
            const existingDefault = await tx.currency.findFirst({
              where: { accountId, default: true },
              select: { id: true },
            });
            if (existingDefault) {
              throw new BadRequestException(
                'Hisob valyutasi (валюта учёта) allaqachon mavjud — ikkinchisini yaratib bo‘lmaydi',
              );
            }
          }
          return tx.currency.create({
            data: {
              accountId,
              code: p.code,
              isoCode: p.isoCode,
              name: p.name,
              fullName: p.fullName ?? null,
              default: p.default,
              indirect: p.indirect,
              system: p.system,
              rateUpdateType: p.rateUpdateType,
              rateValue: BigInt(rateValue),
              multiplicity: p.multiplicity,
              margin: p.margin ?? null,
              majorUnit: (p.majorUnit ?? null) as Prisma.InputJsonValue,
              minorUnit: (p.minorUnit ?? null) as Prisma.InputJsonValue,
            },
          });
        },
        { isolationLevel: 'Serializable' },
      );
      return this.serialize(row);
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, id: string, raw: unknown) {
    const p = this.parse(UpdateCurrencySchema, raw) as UpdateCurrencyInput;
    const cur = await this.prisma.client.currency.findFirst({ where: { id, accountId } });
    if (!cur) throw new NotFoundException(`Valyuta ${id} topilmadi`);

    const data: Prisma.CurrencyUpdateInput = {};

    if (cur.system) {
      if (p.code !== undefined && p.code !== cur.code)
        throw new BadRequestException('Tizim valyutasi kodini o‘zgartirib bo‘lmaydi');
      if (p.isoCode !== undefined && p.isoCode !== cur.isoCode)
        throw new BadRequestException('Tizim valyutasi ISO kodini o‘zgartirib bo‘lmaydi');
    } else {
      if (p.code !== undefined) data.code = p.code;
      if (p.isoCode !== undefined) data.isoCode = p.isoCode;
    }
    if (p.name !== undefined && !cur.system) data.name = p.name;
    if (p.fullName !== undefined && !cur.system) data.fullName = p.fullName ?? null;
    if (p.indirect !== undefined) data.indirect = p.indirect;
    if (p.multiplicity !== undefined) data.multiplicity = p.multiplicity;
    if (p.margin !== undefined) data.margin = p.margin ?? null;
    if (p.rateUpdateType !== undefined) data.rateUpdateType = p.rateUpdateType;
    if (p.majorUnit !== undefined) data.majorUnit = (p.majorUnit ?? null) as Prisma.InputJsonValue;
    if (p.minorUnit !== undefined) data.minorUnit = (p.minorUnit ?? null) as Prisma.InputJsonValue;

    if (p.rate !== undefined) {
      if (cur.default)
        throw new BadRequestException('Hisob valyutasi kursi o‘zgarmasdir (har doim 1)');
      const effType = p.rateUpdateType ?? cur.rateUpdateType;
      if (effType === 'AUTO')
        throw new BadRequestException(
          'AUTO valyuta kursi markaziy bank feed orqali yangilanadi — qo‘lda o‘zgartirib bo‘lmaydi',
        );
      data.rateValue = BigInt(rateToRateValue(p.rate));
    }
    // `default` is the валюта учёта flag — not a simple toggle.
    if (p.default !== undefined && p.default !== cur.default)
      throw new BadRequestException('Hisob valyutasini bu yo‘l bilan o‘zgartirib bo‘lmaydi');

    try {
      const row = await this.prisma.client.currency.update({ where: { id, accountId }, data });
      return this.serialize(row);
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async archive(accountId: string, id: string) {
    const cur = await this.prisma.client.currency.findFirst({ where: { id, accountId } });
    if (!cur) throw new NotFoundException(`Valyuta ${id} topilmadi`);
    if (cur.default) throw new BadRequestException('Hisob valyutasini arxivlab bo‘lmaydi');
    const row = await this.prisma.client.currency.update({
      where: { id, accountId },
      data: { archived: true },
    });
    return this.serialize(row);
  }

  async restore(accountId: string, id: string) {
    await this.findById(accountId, id);
    const row = await this.prisma.client.currency.update({
      where: { id, accountId },
      data: { archived: false },
    });
    return this.serialize(row);
  }

  async delete(accountId: string, id: string) {
    const cur = await this.prisma.client.currency.findFirst({ where: { id, accountId } });
    if (!cur) throw new NotFoundException(`Valyuta ${id} topilmadi`);
    if (cur.default) throw new BadRequestException('Hisob valyutasini o‘chirib bo‘lmaydi');
    if (cur.system) throw new BadRequestException('Tizim valyutasini o‘chirib bo‘lmaydi');
    try {
      await this.prisma.client.currency.delete({ where: { id, accountId } });
      return { ok: true };
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  /** Seed the UZS accounting currency if the account has none. */
  async seedDefaultsIfEmpty(accountId: string): Promise<void> {
    const existing = await this.prisma.client.currency.findFirst({
      where: { accountId },
      select: { id: true },
    });
    if (existing) return;
    await this.prisma.client.currency.create({
      data: {
        accountId,
        // moysklad currency model: `code` = ISO NUMERIC ("860"), `isoCode` = ISO
        // ALPHA ("UZS"). (Was swapped here — code:'UZS'/isoCode:'860' — which made
        // the «Валюта» dropdown show the raw numeric instead of «<name> (<isoCode>)».)
        code: '860',
        isoCode: 'UZS',
        name: 'сум',
        fullName: 'Узбекский сум',
        default: true,
        system: true,
        rateUpdateType: 'MANUAL',
        rateValue: BigInt(RATE_ONE),
        multiplicity: 1,
      },
    });
  }

  /**
   * Propagate a central-bank rate snapshot to every AUTO currency
   * (across all accounts). Only rateUpdateType='AUTO', non-default
   * (валюта учёта is always 1), non-archived currencies whose code
   * has a fresh quote are touched; each applies its own margin.
   * MANUAL currencies are never overwritten. Returns the count
   * updated. Called at the end of the CBU sync (cron + manual).
   */
  async applyAutoRatesFromSource(
    rows: Array<{ currency: string; rate: string; nominal: number }>,
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const byCode = new Map(rows.map((r) => [r.currency.toUpperCase(), r]));
    // M-03 (Faza 16): CBU feed ALPHA kod ('USD') beradi, Currency.code esa
    // moysklad konventsiyasida NUMERIC ('840') — matching ALPHA `isoCode`
    // orqali; legacy alpha-in-code qatorlar uchun `code` ham qamrab olinadi.
    const keys = [...byCode.keys()];
    const targets = await this.prisma.client.currency.findMany({
      where: {
        rateUpdateType: 'AUTO',
        default: false,
        archived: false,
        OR: [{ isoCode: { in: keys } }, { code: { in: keys } }],
      },
      select: { id: true, code: true, isoCode: true, margin: true },
    });
    let updated = 0;
    for (const c of targets) {
      const alpha = alphaCurrencyCode(c);
      const src = alpha ? byCode.get(alpha) : undefined;
      if (!src) continue;
      const rv = cbuRateToRateValue(
        src.rate,
        src.nominal,
        c.margin == null ? null : c.margin.toString(),
      );
      if (rv <= 0n) continue; // never persist a non-positive rate
      await this.prisma.client.currency.update({
        where: { id: c.id },
        data: { rateValue: rv },
      });
      updated++;
    }
    return updated;
  }

  // ---- helpers -------------------------------------------------------------

  private serialize(r: CurrencyRow) {
    return {
      ...r,
      rateValue: r.rateValue.toString(),
      rate: rateValueToRate(r.rateValue.toString()),
    };
  }

  private parse<T>(
    schema: {
      safeParse: (
        v: unknown,
      ) =>
        | { success: true; data: T }
        | { success: false; error: { issues: { message: string }[] } };
    },
    raw: unknown,
  ): T {
    const res = schema.safeParse(raw);
    if (!res.success)
      throw new BadRequestException(res.error.issues.map((i) => i.message).join(', '));
    return res.data;
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') throw new ConflictException('Bu kodli valyuta allaqachon mavjud');
    if (err.code === 'P2003' || err.code === 'P2014')
      throw new ConflictException('Valyuta ishlatilmoqda — avval bog‘liqliklarni uzing');
    if (err.code === 'P2025') throw new NotFoundException('Valyuta topilmadi');
    if (err.code === 'P2034')
      throw new ConflictException('Bir vaqtda o‘zgartirildi — qayta urinib ko‘ring');
    throw e as Error;
  }
}

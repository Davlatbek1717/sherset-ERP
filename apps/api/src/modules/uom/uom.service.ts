import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  type CreateUomInput,
  CreateUomSchema,
  UomFilterSchema,
  type UpdateUomInput,
  UpdateUomSchema,
} from './uom.schema.js';

// The full moysklad units-of-measure reference (the Russian OKEI classifier —
// ОКЕИ — that moysklad pre-loads into every account). Captured 1:1 from a real
// account: docs/moysklad-reference/admin/uom-list.json (59 units). New
// accounts get all of these; existing accounts are backfilled by code (see
// seedDefaultsIfEmpty), so the «Единица измерения» / «Упаковка» pickers match moysklad.
const DEFAULT_UOMS = [
  { name: 'мм', code: '003', description: 'Миллиметр' },
  { name: 'см', code: '004', description: 'Сантиметр' },
  { name: 'дм', code: '005', description: 'Дециметр' },
  { name: 'м', code: '006', description: 'Метр' },
  { name: 'км; 10^3 м', code: '008', description: 'Километр; тысяча метров' },
  { name: 'Мм; 10^6 м', code: '009', description: 'Мегаметр; миллион метров' },
  { name: 'пог. м', code: '018', description: 'Погонный метр' },
  { name: 'дюйм', code: '039', description: 'Дюйм (25,4 мм)' },
  { name: 'фут', code: '041', description: 'Фут (0,3048 м)' },
  { name: 'ярд', code: '043', description: 'Ярд (0,9144 м)' },
  { name: 'миля', code: '047', description: 'Морская миля (1852 м)' },
  { name: 'мм2', code: '050', description: 'Квадратный миллиметр' },
  { name: 'см2', code: '051', description: 'Квадратный сантиметр' },
  { name: 'дм2', code: '053', description: 'Квадратный дециметр' },
  { name: 'м2', code: '055', description: 'Квадратный метр' },
  { name: '10^3 м^2', code: '058', description: 'Тысяча квадратных метров' },
  { name: 'га', code: '059', description: 'Гектар' },
  { name: 'км2', code: '061', description: 'Квадратный километр' },
  { name: 'дюйм2', code: '071', description: 'Квадратный дюйм (645,16 мм2)' },
  { name: 'фут2', code: '073', description: 'Квадратный фут (0,092903 м2)' },
  { name: 'ярд2', code: '075', description: 'Квадратный ярд (0,8361274 м2)' },
  { name: 'а', code: '109', description: 'Ар (100 м2)' },
  { name: 'мм3', code: '110', description: 'Кубический миллиметр' },
  { name: 'см3; мл', code: '111', description: 'Кубический сантиметр; миллилитр' },
  { name: 'л; дм3', code: '112', description: 'Литр; кубический дециметр' },
  { name: 'м3', code: '113', description: 'Кубический метр' },
  { name: 'дл', code: '118', description: 'Децилитр' },
  { name: 'гл', code: '122', description: 'Гектолитр' },
  { name: 'Мл', code: '126', description: 'Мегалитр' },
  { name: 'дюйм3', code: '131', description: 'Кубический дюйм (16387,1 мм3)' },
  { name: 'фут3', code: '132', description: 'Кубический фут (0,02831685 м3)' },
  { name: 'ярд3', code: '133', description: 'Кубический ярд (0,764555 м3)' },
  { name: '10^6 м3', code: '159', description: 'Миллион кубических метров' },
  { name: 'гг', code: '160', description: 'Гектограмм' },
  { name: 'мг', code: '161', description: 'Миллиграмм' },
  { name: 'кар', code: '162', description: 'Метрический карат' },
  { name: 'г', code: '163', description: 'Грамм' },
  { name: 'кг', code: '166', description: 'Килограмм' },
  { name: 'т', code: '168', description: 'Тонна; метрическая тонна (1000 кг)' },
  { name: '10^3 т', code: '170', description: 'Килотонна' },
  { name: 'сг', code: '173', description: 'Сантиграмм' },
  { name: 'БРТ', code: '181', description: 'Брутто-регистровая тонна (2,8316 м3)' },
  { name: 'т грп', code: '185', description: 'Грузоподъемность в метрических тоннах' },
  {
    name: 'ц',
    code: '206',
    description:
      'Центнер (метрический) (100 кг); гектокилограмм; квинтал1 (метрический); децитонна',
  },
  { name: 'с', code: '354', description: 'Секунда' },
  { name: 'мин', code: '355', description: 'Минута' },
  { name: 'ч', code: '356', description: 'Час' },
  { name: 'сут; дн', code: '359', description: 'Сутки' },
  { name: 'нед', code: '360', description: 'Неделя' },
  { name: 'дек', code: '361', description: 'Декада' },
  { name: 'мес', code: '362', description: 'Месяц' },
  { name: 'кварт', code: '364', description: 'Квартал' },
  { name: 'полгода', code: '365', description: 'Полугодие' },
  { name: 'г; лет', code: '366', description: 'Год' },
  { name: 'деслет', code: '368', description: 'Десятилетие' },
  { name: 'рулон', code: '736', description: 'Рулон' },
  { name: 'шт', code: '796', description: 'Штука' },
  { name: 'ящ', code: '812', description: 'Ящик' },
  { name: 'блок', code: '813', description: 'Блок сигарет' },
];

@Injectable()
export class UomService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = UomFilterSchema.parse(rawFilter);
    const where: Prisma.UomWhereInput = {
      accountId,
      ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
    };
    const items = await this.prisma.client.uom.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: 200,
    });
    return { items, total: items.length };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.uom.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`Uom ${id} not found`);
    return row;
  }

  async create(accountId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    try {
      return await this.prisma.client.uom.create({
        data: {
          accountId,
          name: parsed.name,
          code: parsed.code,
          externalCode: parsed.externalCode,
          description: parsed.description,
          shared: parsed.shared,
        },
      });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    await this.findById(accountId, id);

    const data: Prisma.UomUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.code !== undefined) data.code = parsed.code;
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode;
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.shared !== undefined) data.shared = parsed.shared;

    try {
      // Optimistic lock: version predicate means a stale write matches zero rows →
      // Prisma P2025 → 409. findById above already proved the row exists, so
      // P2025 here can only be a conflict.
      return await this.prisma.client.uom.update({
        where: { id, accountId, version: parsed.version },
        data: { ...data, version: { increment: 1 } },
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'Uom');
      this.handlePrisma(e);
    }
  }

  async delete(accountId: string, id: string) {
    await this.findById(accountId, id);
    try {
      await this.prisma.client.uom.delete({ where: { id, accountId } });
      return { ok: true };
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  /**
   * Seed / backfill the moysklad OKEI units for an account. Idempotent and called
   * from the /uoms list endpoint: a brand-new account gets all DEFAULT_UOMS; an
   * existing account (created before the list grew) is topped up with any units
   * whose OKEI `code` it is missing — so every account ends up matching moysklad's
   * units reference. Existing custom units (e.g. «пачка») are left untouched.
   */
  async seedDefaultsIfEmpty(accountId: string): Promise<void> {
    const existing = await this.prisma.client.uom.findMany({
      where: { accountId },
      select: { code: true },
    });
    const haveCodes = new Set(existing.map((u) => u.code));
    // Fast path: account already has every default code → nothing to do.
    if (DEFAULT_UOMS.every((u) => haveCodes.has(u.code))) return;

    for (const u of DEFAULT_UOMS) {
      if (haveCodes.has(u.code)) continue;
      try {
        await this.prisma.client.uom.create({
          data: { accountId, name: u.name, code: u.code, description: u.description, shared: true },
        });
      } catch {
        // Unique-code race (a concurrent /uoms call seeded it) — safe to ignore.
      }
    }
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private parseCreate(raw: unknown): CreateUomInput {
    const r = CreateUomSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateUomInput {
    const r = UpdateUomSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException(
        `Bu kod bilan o'lchov birligi allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    // No table currently FK-references a uom row (Product.uom is free text),
    // but guard defensively so a future relation or a concurrent delete
    // returns a clean 409/404 instead of a 500 leaking through runBulk.
    if (err.code === 'P2003' || err.code === 'P2014')
      throw new ConflictException("O'lchov birligi ishlatilmoqda — avval bog'liqliklarni uzing");
    if (err.code === 'P2025') throw new NotFoundException("O'lchov birligi topilmadi");
    throw e as Error;
  }
}

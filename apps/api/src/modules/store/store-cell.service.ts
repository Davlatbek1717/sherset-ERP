import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { formatCellCode, parseCellCode } from '../product/cell-code.util.js';
import {
  AssignCellSchema,
  CellSearchSchema,
  CreateCellSchema,
  GenerateCellsSchema,
} from './store.schema.js';

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * StoreCellService — adresli saqlash (moysklad «Адресное хранение товаров»
 * analogi): ombor kartochkasidagi yacheykalar registri.
 *
 * Band/bo'shlik registrda SAQLANMAYDI — Product.loc* (asosiy manzil) ∪
 * ProductLocation (qo'shimcha manzillar) kod bo'yicha mos kelishidan har
 * so'rovda hisoblanadi (bitta haqiqat manbai: tovar biriktirish/olib tashlash
 * qayerda bo'lmasin, registr avtomatik to'g'ri qoladi).
 *
 * «Polka qo'shish» generatsiyasi (2026-07-16 talab): prefiks «NN-NN-NN» +
 * miqdor N → prefix-01 … prefix-NN ketma-ket yacheykalar; barcha kodlar
 * kanonik padded «NN-NN-NN-NN» ko'rinishda saqlanadi (label/scan bilan mos).
 */
@Injectable()
export class StoreCellService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Ombor mavjudligi/tenant guard — 404 (store module findById naqshi). */
  private async assertStore(accountId: string, storeId: string) {
    const store = await this.prisma.client.store.findFirst({
      where: { id: storeId, accountId },
      select: { id: true, name: true, code: true },
    });
    if (!store) throw new NotFoundException(`Store ${storeId} not found`);
    return store;
  }

  /**
   * Akkauntdagi BARCHA band manzillar: kod → shu manzilga biriktirilgan
   * tovarlar soni. Product.loc* (asosiy) ∪ ProductLocation (qo'shimcha).
   * NULL segment kanonik kodda «00» bo'ladi (formatBinLocation bilan bir xil).
   */
  private async occupancyMap(accountId: string): Promise<Map<string, number>> {
    const [primaries, extras] = await Promise.all([
      this.prisma.client.product.findMany({
        where: {
          accountId,
          deletedAt: null,
          OR: [
            { locSklad: { not: null } },
            { locPolka: { not: null } },
            { locQavat: { not: null } },
            { locYacheyka: { not: null } },
          ],
        },
        select: { locSklad: true, locPolka: true, locQavat: true, locYacheyka: true },
      }),
      this.prisma.client.productLocation.findMany({
        where: { accountId },
        select: { sklad: true, polka: true, qavat: true, yacheyka: true },
      }),
    ]);
    const map = new Map<string, number>();
    const bump = (code: string) => map.set(code, (map.get(code) ?? 0) + 1);
    for (const p of primaries) {
      bump(
        formatCellCode({
          sklad: p.locSklad ?? 0,
          polka: p.locPolka ?? 0,
          qavat: p.locQavat ?? 0,
          yacheyka: p.locYacheyka ?? 0,
        }),
      );
    }
    for (const l of extras) {
      bump(
        formatCellCode({
          sklad: l.sklad,
          polka: l.polka ?? 0,
          qavat: l.qavat ?? 0,
          yacheyka: l.yacheyka ?? 0,
        }),
      );
    }
    return map;
  }

  /**
   * Ombor yacheykalari ro'yxati + band/bo'sh holati. FE polka-svodka
   * jadvalini (Jami/Bo'sh/Band) shu ro'yxatdan o'zi guruhlaydi.
   */
  async list(accountId: string, storeId: string) {
    await this.assertStore(accountId, storeId);
    const [cells, occupancy] = await Promise.all([
      this.prisma.client.storeCell.findMany({
        where: { accountId, storeId },
        orderBy: { code: 'asc' },
      }),
      this.occupancyMap(accountId),
    ]);
    return {
      items: cells.map((c) => ({
        id: c.id,
        code: c.code,
        shelf: c.shelf,
        productCount: occupancy.get(c.code) ?? 0,
      })),
    };
  }

  /**
   * «Polka qo'shish» — prefix-01 … prefix-NN ketma-ket generatsiya.
   * Mavjud kodlar tashlab ketiladi (skipDuplicates) — natijada nechta
   * yaratilgani/o'tkazib yuborilgani qaytadi.
   */
  async generate(accountId: string, storeId: string, raw: unknown) {
    const parsed = GenerateCellsSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }
    await this.assertStore(accountId, storeId);
    const prefix = parsed.data.prefix.split('-').map(Number).map(pad2).join('-');
    const codes = Array.from({ length: parsed.data.count }, (_, i) => `${prefix}-${pad2(i + 1)}`);
    const res = await this.prisma.client.storeCell.createMany({
      data: codes.map((code) => ({
        accountId,
        storeId,
        code,
        shelf: parsed.data.shelf,
      })),
      skipDuplicates: true,
    });
    return { created: res.count, skipped: codes.length - res.count, codes };
  }

  /** «+ Yacheyka» — bitta yacheykani to'liq kod bilan qo'shish. */
  async createOne(accountId: string, storeId: string, raw: unknown) {
    const parsed = CreateCellSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }
    await this.assertStore(accountId, storeId);
    const addr = parseCellCode(parsed.data.code);
    if (!addr) throw new BadRequestException("Yacheyka kodi noto'g'ri");
    const code = formatCellCode(addr);
    const dup = await this.prisma.client.storeCell.findFirst({
      where: { accountId, storeId, code },
      select: { id: true },
    });
    if (dup) throw new BadRequestException(`Yacheyka "${code}" allaqachon mavjud`);
    return this.prisma.client.storeCell.create({
      data: { accountId, storeId, code, shelf: parsed.data.shelf ?? null },
    });
  }

  async delete(accountId: string, storeId: string, cellId: string) {
    const cell = await this.prisma.client.storeCell.findFirst({
      where: { id: cellId, accountId, storeId },
      select: { id: true },
    });
    if (!cell) throw new NotFoundException(`Cell ${cellId} not found`);
    await this.prisma.client.storeCell.delete({ where: { id: cellId } });
    return { ok: true };
  }

  /**
   * «+» amal — tanlangan tovarlarni yacheykaga biriktirish: har tovarning
   * ASOSIY manzili (Product.loc*) shu yacheyka segmentlariga o'rnatiladi.
   * version ham oshiriladi — ochiq turgan tovar formasi eskirgan nusxani
   * ustidan yozib yubormasin (optimistic-lock semantikasi saqlanadi).
   */
  async assign(accountId: string, storeId: string, cellId: string, raw: unknown) {
    const parsed = AssignCellSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }
    const cell = await this.prisma.client.storeCell.findFirst({
      where: { id: cellId, accountId, storeId },
      select: { code: true },
    });
    if (!cell) throw new NotFoundException(`Cell ${cellId} not found`);
    const addr = parseCellCode(cell.code);
    if (!addr) throw new BadRequestException(`Yacheyka kodi buzilgan: ${cell.code}`);
    const res = await this.prisma.client.product.updateMany({
      where: { accountId, deletedAt: null, id: { in: parsed.data.productIds } },
      data: {
        locSklad: addr.sklad,
        locPolka: addr.polka,
        locQavat: addr.qavat,
        locYacheyka: addr.yacheyka,
        version: { increment: 1 },
      },
    });
    return { ok: true, updated: res.count };
  }

  /**
   * Butun akkaunt bo'ylab yacheyka qidiruvi — tovar kartochkasidagi
   * qidiruvli dropdown uchun (kod yoki polka bo'yicha).
   */
  async searchAll(accountId: string, rawQuery: unknown) {
    const q = CellSearchSchema.parse(rawQuery);
    const items = await this.prisma.client.storeCell.findMany({
      where: {
        accountId,
        ...(q.search
          ? {
              OR: [
                { code: { contains: q.search, mode: 'insensitive' } },
                { shelf: { contains: q.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { store: { select: { id: true, name: true } } },
      orderBy: { code: 'asc' },
      take: q.limit,
    });
    return {
      items: items.map((c) => ({
        id: c.id,
        code: c.code,
        shelf: c.shelf,
        storeId: c.storeId,
        storeName: c.store?.name ?? null,
      })),
    };
  }
}

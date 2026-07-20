import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { formatCellCode, parseCellCode } from '../product/cell-code.util.js';
import {
  AssignCellSchema,
  CellSearchSchema,
  CreateCellSchema,
  GenerateCellsSchema,
  ResolveCellSchema,
  ScanLinkSchema,
} from './store.schema.js';

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Product.salePrices (JSON `[{ priceTypeId, value }]`) dan asosiy sotuv narxini
 * (minor) ajratadi: «default» aliasli yozuv, bo'lmasa birinchisi. TAN NARX
 * (buyPrice) BU YERDA UMUMAN ISHLATILMAYDI — omborchiga faqat sotuv narxi.
 */
function resolveDefaultSalePrice(salePrices: unknown): string | null {
  if (!Array.isArray(salePrices)) return null;
  const rows = salePrices as Array<{ priceTypeId?: string; value?: string | number }>;
  const def = rows.find((p) => p?.priceTypeId === 'default') ?? rows[0];
  if (!def || def.value == null) return null;
  return String(def.value);
}

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
   *
   * QASDDAN akkaunt bo'yicha, storeId'siz: 2026-07-20'gacha bu YOLG'ON edi
   * (ikki xil ombor bir xil kodni ishlatsa, occupancy noto'g'ri chiqardi) —
   * endi `StoreCell.code` butun akkaunt bo'yicha yagona (@@unique([accountId,
   * code]), schema.prisma), shuning uchun kod → manzil moslashuvi allaqachon
   * bir qiymatli va bu hisoblash TO'G'RI. Unumdorlik: bo'sh omborda (hali
   * yacheyka yaratilmagan) chaqiruvchi `list()` bu funksiyani umuman
   * chaqirmaydi (pastga qarang) — katta katalogda ham har «bo'sh ombor»
   * ko'rishda bekorchi to'liq skanerlash bo'lmaydi.
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
    const cells = await this.prisma.client.storeCell.findMany({
      where: { accountId, storeId },
      orderBy: { code: 'asc' },
    });
    // Hali yacheyka yaratilmagan (yangi/bo'sh ombor) — bekorchi butun-akkaunt
    // skanerlashdan qochamiz (occupancyMap unumdorlik izohiga qarang).
    if (cells.length === 0) {
      return {
        items: [] as Array<{
          id: string;
          code: string;
          shelf: string | null;
          productCount: number;
        }>,
      };
    }
    const occupancy = await this.occupancyMap(accountId);
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
   * yaratilgani/o'tkazib yuborilgani qaytadi. 2026-07-20: kod BUTUN AKKAUNT
   * bo'yicha yagona bo'lgani uchun (`@@unique([accountId, code])`),
   * skipDuplicates endi boshqa ombordagi bir xil kodni ham to'g'ri
   * o'tkazib yuboradi — DB cheklovi buni avtomatik ta'minlaydi.
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

  /**
   * «+ Yacheyka» — bitta yacheykani to'liq kod bilan qo'shish.
   *
   * 2026-07-20: kod BUTUN AKKAUNT bo'yicha yagona (@@unique([accountId,
   * code]) — pastga qarang), shuning uchun dublikat tekshiruvi ham
   * storeId'siz, akkaunt bo'yicha. Boshqa omborda band bo'lsa — aynan shuni
   * aytamiz (aks holda "allaqachon mavjud" degan xabar chalkashtiradi: bu
   * omborda yo'q-ku, deb o'ylashi mumkin).
   */
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
      where: { accountId, code },
      select: { id: true, storeId: true, store: { select: { name: true } } },
    });
    if (dup) {
      throw new BadRequestException(
        dup.storeId === storeId
          ? `Yacheyka "${code}" allaqachon mavjud`
          : `Yacheyka "${code}" allaqachon "${dup.store.name}" omborida band`,
      );
    }
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
   * Skan orqali biriktirish — 1-bosqich: skanerlangan yacheyka shtrix-kodini
   * shu ombordagi HAQIQIY yacheykaga aylantirish. Kod tireli yoki 8-raqamli
   * (label CODE128C) shakl bo'lishi mumkin (parseCellCode ikkalasini ham
   * tushunadi). Kod formati buzuq → 400; shu omborda bunday yacheyka yo'q →
   * 404 (talab: «yacheyka kodi mavjud bo'lmasa, aniq xatolik»). FE 2-skan
   * maydonini shu qadam muvaffaqiyatli bo'lgandan keyin ochadi.
   */
  async resolveByCode(accountId: string, storeId: string, raw: unknown) {
    const parsed = ResolveCellSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }
    await this.assertStore(accountId, storeId);
    const addr = parseCellCode(parsed.data.code);
    if (!addr) {
      throw new BadRequestException(
        "Yacheyka kodi noto'g'ri — NN-NN-NN-NN yoki 8 raqamli barcode kutiladi",
      );
    }
    const code = formatCellCode(addr);
    const cell = await this.prisma.client.storeCell.findFirst({
      where: { accountId, storeId, code },
      select: { id: true, code: true, shelf: true },
    });
    if (!cell) {
      throw new NotFoundException(`Bu omborda "${code}" yacheykasi topilmadi`);
    }
    return cell;
  }

  /**
   * Skan orqali biriktirish — 2-bosqich: skanerlangan mahsulot shtrix-kodini
   * shu yacheykaga biriktirish. Mahsulot `Product.barcodes[]` (aniq token) yoki
   * asosiy `barcode` bo'yicha topiladi; topilmasa 404 («shtrix-kod topilmadi»).
   * Biriktirish = mahsulotning asosiy loc* manzilini yacheyka segmentlariga
   * o'rnatish (qo'lda «+» biriktirish bilan bir xil) — natija «Yacheyka»
   * ustunida aks etadi va bir yacheykaga bir nechta mahsulot bog'lanishi mumkin.
   * Idempotent: mahsulot allaqachon shu yacheykada bo'lsa `alreadyLinked: true`
   * qaytadi, qayta yozuv qilinmaydi (version behuda oshmaydi).
   */
  async scanLink(accountId: string, storeId: string, cellId: string, raw: unknown) {
    const parsed = ScanLinkSchema.safeParse(raw);
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

    const code = parsed.data.barcode;
    // POS skaner naqshi (product.repository.findByScanCode): barcodes[] ustidan
    // aniq token mosligi — nom/kod bilan aralashmaydi. Bir nechta mos kelsa
    // determinik birinchisi (createdAt asc).
    const product = await this.prisma.client.product.findFirst({
      where: { accountId, deletedAt: null, barcodes: { has: code } },
      select: {
        id: true,
        name: true,
        code: true,
        article: true,
        uom: true,
        barcodes: true,
        // Sotuv narxi ko'rsatiladi; TAN NARX (buyPrice) QASDDAN OLINMAYDI —
        // omborchi tan narxni ko'rmasligi kerak (talab).
        salePrices: true,
        locSklad: true,
        locPolka: true,
        locQavat: true,
        locYacheyka: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!product) {
      throw new NotFoundException(`Shtrix-kod topilmadi: ${code}`);
    }

    const alreadyLinked =
      (product.locSklad ?? 0) === addr.sklad &&
      (product.locPolka ?? 0) === addr.polka &&
      (product.locQavat ?? 0) === addr.qavat &&
      (product.locYacheyka ?? 0) === addr.yacheyka;

    if (!alreadyLinked) {
      // version ham oshiriladi — ochiq turgan tovar formasi eskirgan nusxani
      // ustidan yozib yubormasin (assign bilan bir xil optimistic-lock).
      await this.prisma.client.product.update({
        where: { id: product.id },
        data: {
          locSklad: addr.sklad,
          locPolka: addr.polka,
          locQavat: addr.qavat,
          locYacheyka: addr.yacheyka,
          version: { increment: 1 },
        },
      });
    }

    // Ombor bo'ylab jami qoldiq (omborchi «nechta bor»ni ko'rsin).
    const stocks = await this.prisma.client.stock.findMany({
      where: { accountId, assortmentKind: 'product', assortmentId: product.id },
      select: { qty: true },
    });
    const totalQty = stocks.reduce((sum, s) => sum + Number(s.qty.toFixed(6)), 0);

    return {
      ok: true,
      alreadyLinked,
      cell: { code: formatCellCode(addr) },
      product: {
        id: product.id,
        name: product.name,
        code: product.code,
        article: product.article,
        uom: product.uom,
        barcode: product.barcodes[0] ?? code,
        // Sotuv narxi (minor). TAN NARX javobda YO'Q.
        salePrice: resolveDefaultSalePrice(product.salePrices),
        totalQty,
      },
    };
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

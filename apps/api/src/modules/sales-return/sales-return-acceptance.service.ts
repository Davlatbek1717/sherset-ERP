import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { readPosPriority } from '../retail-sale/retail-stock-cascade.js';
import {
  type AcceptanceRequestLine,
  type CellTarget,
  type ReturnableLine,
  computeReturnableLines,
  planAcceptance,
  readBrakStore,
} from './sales-return-acceptance.js';
import { AcceptReturnSchema, AcceptanceReceiptsFilterSchema } from './sales-return.schema.js';
import { SalesReturnService } from './sales-return.service.js';

/**
 * G3 — vozvrat QABUL oqimi (katta omborchi ekrani).
 *
 * Oqim: manba kassa cheki → qaytariladigan qatorlar (cap bilan) → har qatorga
 * yacheyka (sifatli ombor yoki BRAK ombori) → ВП hujjat(lar)i yaratilib
 * o'tkaziladi → javobda YORLIQ ma'lumoti (shtrix + yacheyka kodi) qaytadi.
 *
 * ── Nega alohida servis va alohida ruxsat entity'si (`returnacceptance`) ────
 * Qabul oqimi `SalesReturn` hujjatini YARATADI va O'TKAZADI, ya'ni umumiy
 * `salesreturn.create`+`approve` kerak bo'lardi. Uni katta omborchiga berish
 * butun `/sales-returns` modulini (mass-edit, delete, ixtiyoriy narxda hujjat
 * yaratish) ochib yuborardi. G2 dagi `retailcontrol` naqshi: tor oqim — tor
 * entity. Oddiy omborchi (`storekeeper`) ATAYLAB olmaydi.
 *
 * ── Nega POS «mirror» chek qabul manbasi EMAS ──────────────────────────────
 * Kassadagi tez qaytarish (`RetailSale.refundedFromId`) pulni DARHOL beradi va
 * tovarni kaskad omboriga YACHEYKASIZ qaytaradi (`retail-sale.service` refund
 * yo'li). Ya'ni qoldiq ALLAQACHON tiklangan — uning ustiga ВП yozish qoldiqni
 * IKKI marta oshirardi. Shu sabab manba faqat ASL chek (`refundedFromId=null`)
 * bo'la oladi; mirror cheklar esa cap'da hisobga olinadi (§`computeReturnableLines`).
 * Mirror chekdagi tovarni jismonan yacheykaga qo'yish — joylashtirish ishi
 * (F7 `cell-place`), qabul emas.
 */
@Injectable()
export class SalesReturnAcceptanceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SalesReturnService) private readonly returns: SalesReturnService,
  ) {}

  /**
   * Qabul mo'ljallari: omborlar + BRAK ombori + kaskad boshi (standart tanlov).
   * Yacheykalar ATAYLAB bu yerda emas — ular tanlangan ombor bo'yicha mavjud
   * `GET /admin/stores/:id/address-storage` dan olinadi (bitta manba).
   */
  async listTargets(accountId: string) {
    const stores = await this.prisma.client.store.findMany({
      where: { accountId, archived: false },
      select: { id: true, name: true, attributes: true },
      orderBy: { name: 'asc' },
    });
    const rows = stores.map((s) => ({
      id: s.id,
      name: s.name,
      brak: readBrakStore(s.attributes),
      posPriority: readPosPriority(s.attributes),
    }));
    // Sifatli tovar standart bo'yicha kassa kaskadining BIRINCHI omboriga
    // tushadi — sotuv qayerdan ayirsa, qaytish ham o'sha yerga (F6 refund
    // qoidasi bilan bir xil). Kaskad sozlanmagan bo'lsa — standart yo'q,
    // omborchi o'zi tanlaydi.
    const cascadeHead = rows
      .filter((s) => !s.brak && s.posPriority != null)
      .sort(
        (a, b) => (a.posPriority ?? 0) - (b.posPriority ?? 0) || a.name.localeCompare(b.name),
      )[0];
    const brak = rows.find((s) => s.brak);
    return {
      stores: rows,
      defaultStoreId: cascadeHead?.id ?? null,
      brakStoreId: brak?.id ?? null,
    };
  }

  /** Manba chek qidiruvi — faqat ASL (mirror emas), o'tkazilgan cheklar. */
  async listReceipts(accountId: string, rawFilter: unknown) {
    const filter = AcceptanceReceiptsFilterSchema.parse(rawFilter ?? {});
    const rows = await this.prisma.client.retailSale.findMany({
      where: {
        accountId,
        deletedAt: null,
        // Faqat pul olingan cheklar qaytariladi; mirror (qaytarish) cheki
        // manba bo'la olmaydi — yuqoridagi izohga qarang.
        state: { in: ['posted', 'refunded'] },
        refundedFromId: null,
        ...(filter.agentId ? { agentId: filter.agentId } : {}),
        ...(filter.q
          ? {
              OR: [
                { name: { contains: filter.q, mode: 'insensitive' as const } },
                { agent: { name: { contains: filter.q, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        moment: true,
        sumMinor: true,
        state: true,
        agent: { select: { id: true, name: true } },
        _count: { select: { positions: true } },
      },
      orderBy: { moment: 'desc' },
      take: filter.limit,
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        moment: r.moment,
        sumMinor: r.sumMinor.toString(),
        state: r.state,
        agent: r.agent,
        positionCount: r._count.positions,
      })),
    };
  }

  /** Chek + qaytariladigan qatorlar (cap hisoblangan holda). */
  async getSource(accountId: string, retailSaleId: string) {
    const { sale, returnable, products } = await this.loadSource(accountId, retailSaleId);
    return {
      sale: {
        id: sale.id,
        name: sale.name,
        moment: sale.moment,
        sumMinor: sale.sumMinor.toString(),
        state: sale.state,
        agent: sale.agent,
        organizationId: sale.organizationId,
      },
      lines: returnable.map((r) => {
        const p = products.get(r.productId);
        return {
          ...r,
          productName: p?.name ?? '—',
          barcode: p?.barcode ?? null,
          article: p?.article ?? null,
          pieceTracked: p?.pieceTracked === true,
        };
      }),
    };
  }

  /**
   * Qabul: hujjat(lar) yaratiladi va (standart bo'yicha) o'tkaziladi.
   *
   * Sifatli va brak qatorlar AJRALGAN hujjatlarga tushadi (`planAcceptance`) —
   * `assertCellsInStore` bitta hujjatning barcha yacheykalarini bitta omborda
   * bo'lishini talab qiladi. Javobda har pozitsiya uchun YORLIQ ma'lumoti
   * (shtrix + yacheyka kodi) bor: ekran qo'shimcha so'rovsiz chop etadi.
   */
  async accept(accountId: string, userId: string, retailSaleId: string, raw: unknown) {
    const body = AcceptReturnSchema.parse(raw ?? {});
    const { sale, returnable, products } = await this.loadSource(accountId, retailSaleId);

    if (!sale.agentId) {
      throw new BadRequestException(
        "Chekda mijoz ko'rsatilmagan — qaytarim kimga yozilishini aniqlab bo'lmaydi",
      );
    }
    const organizationId = await this.resolveOrganizationId(accountId, sale.organizationId);

    const cellIds = [...new Set(body.positions.map((p) => p.cellId))];
    const cells = await this.prisma.client.storeCell.findMany({
      where: { id: { in: cellIds }, accountId },
      select: {
        id: true,
        name: true,
        storeId: true,
        store: { select: { attributes: true } },
      },
    });
    const targets: CellTarget[] = cells.map((c) => ({
      cellId: c.id,
      cellName: c.name,
      storeId: c.storeId,
      brak: readBrakStore(c.store.attributes),
    }));

    const lines: AcceptanceRequestLine[] = body.positions.map((p) => ({
      productId: p.productId,
      quantity: p.quantity,
      cellId: p.cellId,
      // K5 — qaytgan bo'lak tarkibi. `SalesReturnService.create` uni
      // tekshiradi (Σ === quantity) va post reyestrga qaytaradi.
      pieceEntry: p.pieceEntry ?? null,
    }));
    const plan = planAcceptance(lines, returnable, targets);
    if (!plan.ok) throw new BadRequestException(plan.error);

    const created: Array<{
      id: string;
      name: string;
      storeId: string;
      brak: boolean;
      state: string;
      sumMinor: string;
      positions: Array<{
        productId: string;
        productName: string;
        barcode: string | null;
        quantity: string;
        cellId: string;
        cellName: string;
      }>;
    }> = [];

    for (const doc of plan.documents) {
      const saved = await this.returns.create(accountId, userId, {
        agentId: sale.agentId,
        organizationId,
        storeId: doc.storeId,
        retailSaleId: sale.id,
        reason: body.reason ?? null,
        currency: sale.currency,
        rateValue: sale.rateValue.toString(),
        vatEnabled: sale.vatEnabled,
        vatIncluded: sale.vatIncluded,
        // `applicable` create() ichida AYNAN `transition('post')` yo'lini
        // yuritadi (qoldiq + mijoz balansi bitta tekshirilgan yo'ldan).
        applicable: body.post,
        positions: doc.positions.map((p) => ({
          assortmentKind: 'product' as const,
          assortmentId: p.productId,
          quantity: p.quantity,
          priceMinor: p.priceMinor,
          discount: p.discount,
          cellId: p.cellId,
          cell: p.cellName,
          pieceEntry: p.pieceEntry,
        })),
      });
      created.push({
        id: saved.id,
        name: saved.name,
        storeId: doc.storeId,
        brak: doc.brak,
        state: saved.state,
        sumMinor: saved.sumMinor.toString(),
        positions: doc.positions.map((p) => ({
          productId: p.productId,
          productName: products.get(p.productId)?.name ?? '—',
          barcode: products.get(p.productId)?.barcode ?? null,
          quantity: p.quantity,
          cellId: p.cellId,
          cellName: p.cellName,
        })),
      });
    }

    return { returns: created };
  }

  // ── ichki ────────────────────────────────────────────────────────────────

  /**
   * Chek + cap uchun kerak bo'lgan hamma narsa BITTA joyda: `getSource` va
   * `accept` bir xil raqamni ko'rishi shart (ekranda «3 ta qaytarish mumkin»
   * deb turib, saqlashda boshqa javob chiqmasin).
   */
  private async loadSource(accountId: string, retailSaleId: string) {
    const sale = await this.prisma.client.retailSale.findFirst({
      where: { id: retailSaleId, accountId, deletedAt: null },
      select: {
        id: true,
        name: true,
        moment: true,
        state: true,
        sumMinor: true,
        agentId: true,
        organizationId: true,
        currency: true,
        rateValue: true,
        vatEnabled: true,
        vatIncluded: true,
        refundedFromId: true,
        agent: { select: { id: true, name: true } },
        positions: {
          select: { productId: true, quantity: true, priceMinor: true, discount: true },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!sale) throw new NotFoundException('Chek topilmadi');
    if (sale.refundedFromId) {
      throw new BadRequestException(
        "Bu chek — kassadagi qaytarish (mirror). Uning tovari qoldiqqa allaqachon qaytgan; omborda qabul qilish o'rniga yacheykaga JOYLASHTIRING",
      );
    }
    if (sale.state !== 'posted' && sale.state !== 'refunded') {
      throw new BadRequestException(
        `Chek '${sale.state}' holatida — faqat o'tkazilgan chekdan qaytarish mumkin`,
      );
    }

    const sold = sale.positions
      .filter((p): p is typeof p & { productId: string } => p.productId != null)
      .map((p) => ({
        productId: p.productId,
        quantity: String(p.quantity),
        priceMinor: p.priceMinor.toString(),
        discount: String(p.discount),
      }));

    // POS mirror qaytarishlari — bekor qilinganlari (`cancelled`) hech narsa
    // qaytarmagan, cap'ni kamaytirmaydi (retail-sale `priorRefunds` bilan bir xil shart).
    const mirrors = await this.prisma.client.retailSale.findMany({
      where: {
        accountId,
        refundedFromId: sale.id,
        state: { in: ['posted', 'refunded'] },
        deletedAt: null,
      },
      select: { positions: { select: { productId: true, quantity: true } } },
    });
    const posRefunded = mirrors.flatMap((m) =>
      m.positions
        .filter((p): p is typeof p & { productId: string } => p.productId != null)
        .map((p) => ({ productId: p.productId, quantity: String(p.quantity) })),
    );

    // Shu chekka bog'langan ВП hujjatlari — `draft` ham hisobga olinadi
    // (qoralama qatorni band qiladi, from-demand naqshi bilan bir xil).
    const priorReturns = await this.prisma.client.salesReturnPosition.findMany({
      where: {
        accountId,
        assortmentKind: 'product',
        salesReturn: { retailSaleId: sale.id, deletedAt: null, state: { not: 'cancelled' } },
      },
      select: { assortmentId: true, quantity: true },
    });
    const warehouseReturned = priorReturns.map((p) => ({
      productId: p.assortmentId,
      quantity: String(p.quantity),
    }));

    const returnable: ReturnableLine[] = computeReturnableLines(
      sold,
      posRefunded,
      warehouseReturned,
    );

    const productRows = await this.prisma.client.product.findMany({
      where: { id: { in: returnable.map((r) => r.productId) }, accountId },
      // K5 — `pieceTracked`: qabul ekrani bo'lak yorlig'i maydonini FAQAT
      // bayrog'i yoqilgan tovarda chizadi. Mavjud `select` ga qo'shilgan
      // maydon — yangi so'rov kerak emas.
      select: {
        id: true,
        name: true,
        code: true,
        article: true,
        barcodes: true,
        pieceTracked: true,
      },
    });
    const products = new Map(
      productRows.map((p) => [
        p.id,
        {
          name: p.name,
          article: p.article,
          // Yorliq shtrixi — mahsulotning BIRINCHI shtrixi, bo'lmasa kodi
          // (`labels/print` va `qr-price-tag-print` bilan bir xil tartib).
          barcode: p.barcodes?.[0] ?? p.code ?? null,
          pieceTracked: p.pieceTracked,
        },
      ]),
    );

    return { sale, returnable, products };
  }

  /**
   * ВП hujjati uchun tashkilot. Chekda ko'rsatilgan bo'lsa — o'sha. Aks holda
   * FAQAT akkauntda bitta tashkilot bo'lsa avtomatik tanlanadi: bir nechtasi
   * bo'lsa jimgina birinchisini olish qaytarimni NOTO'G'RI yuridik shaxsga
   * yozardi (`assertOrgAccountMatchesOrg` qo'riqlaydigan xato sinfi).
   */
  private async resolveOrganizationId(accountId: string, fromSale: string | null) {
    if (fromSale) return fromSale;
    const orgs = await this.prisma.client.organization.findMany({
      where: { accountId },
      select: { id: true },
      take: 2,
    });
    if (orgs.length === 1 && orgs[0]) return orgs[0].id;
    throw new BadRequestException(
      "Chekda tashkilot ko'rsatilmagan va akkauntda bir nechta tashkilot bor — qaytarimni qaysi tashkilotga yozishni aniqlab bo'lmadi",
    );
  }
}

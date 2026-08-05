import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
// MS pozitsiyasi -> mahalliy tovar -> yacheyka: sof, testlangan qoidalar.
import {
  type LocalProductLike,
  type MsPositionLike,
  pickCoverage,
  resolvePickCells,
} from './pick-cell-resolve.js';

/** One snapshot position (kept for the dormant external-sync service's type). */
export interface PickListPosition {
  msAssortmentId: string | null;
  name: string;
  qty: number;
  code: string | null;
  barcode: string | null;
  priceMinor?: number;
  discount?: number;
  uom?: string | null;
}

/** One resolved pick-list position (product + its CURRENT home cell). */
export interface ResolvedPosition {
  name: string;
  qty: number;
  uom: string | null;
  cell: string | null;
}

/** Buyurtma qayerdan keldi. */
export const PICK_SOURCE = {
  /** MoySklad akkauntidan sync qilingan «Заказ покупателя»/«Возврат». */
  moysklad: 'moysklad',
  /** Bu ilovaning o'z «Счёт покупателю» hujjati. */
  own: 'own',
} as const;

export type PickSource = (typeof PICK_SOURCE)[keyof typeof PICK_SOURCE];

/** Omborchi zanjiri (faqat MoySklad buyurtmalarida). */
export const PICK_STATE = {
  new: 'new',
  picking: 'picking',
  picked: 'picked',
} as const;

export type PickState = (typeof PICK_STATE)[keyof typeof PICK_STATE];

/**
 * Ruxsat etilgan o'tishlar.
 *
 * `picked -> picking` ATAYLAB ochiq: omborchi «yig'ildi» deb bosib, keyin bir
 * dona kam ekanini ko'rishi mumkin — orqaga qaytarish taqiqlansa u yolg'on
 * holatni qoldirib ketardi. `new -> picked` ham ochiq: bitta pozitsiyalik
 * buyurtmada «boshlash» qadami ortiqcha ish.
 */
const PICK_TRANSITIONS: Record<PickState, ReadonlyArray<PickState>> = {
  new: [PICK_STATE.picking, PICK_STATE.picked],
  picking: [PICK_STATE.picked, PICK_STATE.new],
  picked: [PICK_STATE.picking],
};

/**
 * «Yig'ish ro'yxatlari» — pick lists sourced from OUR OWN «Счёт покупателю»
 * (InvoiceOut) documents (own-orders variant, owner 2026-07-28: sales live in
 * THIS app as invoices-out, not mirrored from an external MoySklad account).
 * The list is the warehouse screen; each invoice prints a 72mm pick list
 * grouped by cell («Лист сборки»).
 *
 * Cells are resolved at READ time from the product's `__yacheyka` attribute —
 * re-binding a product to a new cell shows on the very next print. For our own
 * documents the position → product link is direct (productId), so no code/
 * barcode matching is needed.
 */
@Injectable()
export class PickListService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Ro'yxat — MoySklad buyurtmalari yoki o'z hisob-fakturalari.
   *
   * `source` berilmasa: sync ma'lumoti bor bo'lsa MoySklad, aks holda o'z
   * hujjatlari. NEGA avtomatik: egasi MoySklad'ga qaytdi, lekin ilovada
   * 3404 ta o'z hisob-fakturasi bor va ular yo'qolmasligi kerak; bo'sh
   * ekran esa omborchiga «hammasi yig'ildi» degan yolg'on taassurot berardi.
   */
  async listPick(accountId: string, query: Record<string, unknown>) {
    const explicit = typeof query.source === 'string' ? query.source : null;
    const source: PickSource =
      explicit === PICK_SOURCE.own
        ? PICK_SOURCE.own
        : explicit === PICK_SOURCE.moysklad
          ? PICK_SOURCE.moysklad
          : (await this.prisma.client.msPickList.count({ where: { accountId } })) > 0
            ? PICK_SOURCE.moysklad
            : PICK_SOURCE.own;
    if (source === PICK_SOURCE.own) {
      const own = await this.list(accountId, query);
      return { ...own, source: PICK_SOURCE.own };
    }
    return this.listMoysklad(accountId, query);
  }

  /** MoySklad'dan sync qilingan buyurtmalar — omborchining asosiy ekrani. */
  private async listMoysklad(accountId: string, query: Record<string, unknown>) {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const offset = Math.max(Number(query.offset) || 0, 0);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const state = typeof query.state === 'string' ? query.state : null;
    const where = {
      accountId,
      // «Проведено» bo'lmagan buyurtma hali tasdiqlanmagan: omborchi uni
      // yig'a boshlasa, kassir uni o'chirib qo'yishi mumkin.
      applicable: true,
      ...(state && state in PICK_TRANSITIONS ? { pickState: state } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { agentName: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.client.msPickList.findMany({
        where,
        // Yig'ilmaganlar TEPADA ('new' < 'picked' < 'picking' alifbo bo'yicha
        // emas — shuning uchun holat bo'yicha saralash kifoya qilmaydi va
        // FE guruhlaydi; bu yerda faqat barqaror tartib kerak).
        orderBy: [{ moment: 'desc' }],
        take: limit,
        skip: offset,
        select: {
          id: true,
          name: true,
          docType: true,
          moment: true,
          agentName: true,
          storeName: true,
          ownerName: true,
          sumMinor: true,
          payedMinor: true,
          positions: true,
          printedAt: true,
          pickState: true,
          pickedAt: true,
          pickedBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.client.msPickList.count({ where }),
    ]);
    return {
      source: PICK_SOURCE.moysklad,
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        docType: r.docType,
        moment: r.moment,
        agentName: r.agentName,
        storeName: r.storeName,
        ownerName: r.ownerName,
        sumMinor: r.sumMinor,
        payedMinor: r.payedMinor,
        positionsCount: Array.isArray(r.positions) ? r.positions.length : 0,
        printedAt: r.printedAt,
        pickState: r.pickState,
        pickedAt: r.pickedAt,
        pickedBy: r.pickedBy,
      })),
      total,
    };
  }

  /**
   * MoySklad buyurtmasi + yacheykalar (yacheykali chek uchun).
   *
   * Yacheyka O'QISH vaqtida yechiladi: tovar boshqa javonga ko'chirilsa,
   * keyingi chek darhol yangi joyni ko'rsatadi (snapshot saqlanmaydi).
   */
  async findMoyskladById(accountId: string, id: string) {
    const row = await this.prisma.client.msPickList.findFirst({
      where: { id, accountId },
      select: {
        id: true,
        name: true,
        docType: true,
        moment: true,
        agentName: true,
        agentPhone: true,
        ownerName: true,
        storeName: true,
        description: true,
        positions: true,
        printedAt: true,
        pickState: true,
        pickedAt: true,
        pickNote: true,
        pickedBy: { select: { id: true, name: true } },
      },
    });
    if (!row) throw new NotFoundException(`Pick list ${id} not found`);

    // `positions` — JSON snapshot (sync yozgan). Tur `unknown` orqali
    // o'giriladi: JSON'ning o'zi hech narsani kafolatlamaydi, lekin `resolvePickCells`
    // har maydonni alohida tozalaydi (bo'sh/probel → null).
    const raw = (Array.isArray(row.positions) ? row.positions : []) as unknown as MsPositionLike[];
    const codes = raw.map((x) => (x.code ?? '').trim()).filter(Boolean);
    const barcodes = raw.map((x) => (x.barcode ?? '').trim()).filter(Boolean);

    // Faqat kerakli tovarlar o'qiladi — butun katalogni yuklash shart emas.
    const products =
      codes.length + barcodes.length === 0
        ? []
        : await this.prisma.client.product.findMany({
            where: {
              accountId,
              deletedAt: null,
              OR: [
                ...(codes.length ? [{ code: { in: codes } }] : []),
                ...(barcodes.length ? [{ barcodes: { hasSome: barcodes } }] : []),
              ],
            },
            select: { id: true, code: true, barcodes: true, attributes: true },
          });

    const local: LocalProductLike[] = products.map((x) => ({
      id: x.id,
      code: x.code,
      barcodes: x.barcodes,
      cell: cellOf(x.attributes),
    }));
    const positions = resolvePickCells(raw, local);

    return {
      id: row.id,
      name: row.name,
      source: PICK_SOURCE.moysklad,
      docType: row.docType,
      moment: row.moment,
      agentName: row.agentName,
      agentPhone: row.agentPhone,
      ownerName: row.ownerName,
      storeName: row.storeName,
      description: row.description,
      printedAt: row.printedAt,
      pickState: row.pickState,
      pickedAt: row.pickedAt,
      pickNote: row.pickNote,
      pickedBy: row.pickedBy,
      positions,
      /** Chek boshida: nechta pozitsiyaning javoni ma'lum. */
      coverage: pickCoverage(positions),
    };
  }

  /**
   * Yig'ish holatini o'zgartirish.
   *
   * ⚠️ **Optimistik qulf**: `updateMany` joriy holatni SHART qilib oladi.
   * Ikki omborchi bir vaqtda «boshlash» bosса faqat bittasi o'tadi —
   * ikkinchisi buyurtma allaqachon olinganini ko'radi. Busiz ikkisi bitta
   * buyurtmani birga yig'ardi.
   */
  async setPickState(accountId: string, employeeId: string, id: string, raw: unknown) {
    const body = (raw ?? {}) as { state?: unknown; note?: unknown };
    const next = String(body.state ?? '');
    if (!(next in PICK_TRANSITIONS)) {
      throw new BadRequestException(`Noma'lum holat: ${next}`);
    }
    const current = await this.prisma.client.msPickList.findFirst({
      where: { id, accountId },
      select: { pickState: true },
    });
    if (!current) throw new NotFoundException(`Pick list ${id} not found`);
    const from = current.pickState as PickState;
    if (from === next) return { id, pickState: from, changed: false };
    if (!PICK_TRANSITIONS[from]?.includes(next as PickState)) {
      throw new BadRequestException(`«${from}» dan «${next}» ga o'tish mumkin emas`);
    }

    const now = new Date();
    const flip = await this.prisma.client.msPickList.updateMany({
      // Holat SHARTI — poyga himoyasi.
      where: { id, accountId, pickState: from },
      data: {
        pickState: next,
        ...(next === PICK_STATE.picking
          ? { pickedById: employeeId, pickStartedAt: now, pickedAt: null }
          : {}),
        ...(next === PICK_STATE.picked ? { pickedById: employeeId, pickedAt: now } : {}),
        // Boshiga qaytarilsa iz tozalanadi — «kim yig'di» yolg'on qolmasin.
        ...(next === PICK_STATE.new
          ? { pickedById: null, pickStartedAt: null, pickedAt: null }
          : {}),
        ...(typeof body.note === 'string' ? { pickNote: body.note.trim() || null } : {}),
      },
    });
    if (flip.count === 0) {
      throw new BadRequestException(
        'Buyurtma holati o`zgargan — ro`yxatni yangilab, qaytadan urinib ko`ring',
      );
    }
    return { id, pickState: next, changed: true };
  }

  /** Chek chop etilgani (MoySklad buyurtmalarida haqiqiy maydon). */
  async markMoyskladPrinted(accountId: string, id: string) {
    const row = await this.prisma.client.msPickList.findFirst({
      where: { id, accountId },
      select: { id: true, printedAt: true },
    });
    if (!row) throw new NotFoundException(`Pick list ${id} not found`);
    // BIRINCHI chop etish vaqti saqlanadi: qayta chop etish uni surmaydi,
    // aks holda «qachon yig'ishga berildi» yo'qolardi.
    if (row.printedAt) return { id, printedAt: row.printedAt };
    return this.prisma.client.msPickList.update({
      where: { id },
      data: { printedAt: new Date() },
      select: { id: true, printedAt: true },
    });
  }

  async list(accountId: string, query: Record<string, unknown>) {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const offset = Math.max(Number(query.offset) || 0, 0);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const where = {
      accountId,
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { agent: { name: { contains: search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.client.invoiceOut.findMany({
        where,
        orderBy: { moment: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          name: true,
          moment: true,
          sumMinor: true,
          payedSumMinor: true,
          agent: { select: { name: true } },
          store: { select: { name: true } },
          owner: { select: { name: true } },
          _count: { select: { positions: true } },
        },
      }),
      this.prisma.client.invoiceOut.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        docType: 'invoiceout',
        moment: r.moment,
        agentName: r.agent?.name ?? null,
        storeName: r.store?.name ?? null,
        ownerName: r.owner?.name ?? null,
        sumMinor: r.sumMinor,
        payedMinor: r.payedSumMinor,
        positionsCount: r._count.positions,
        // Own orders carry no pick-print flag — always «new» (feature parity dropped).
        printedAt: null as Date | null,
      })),
      total,
    };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.invoiceOut.findFirst({
      where: { id, accountId, deletedAt: null },
      select: {
        id: true,
        name: true,
        moment: true,
        description: true,
        agent: { select: { name: true, phone: true } },
        owner: { select: { name: true } },
        positions: {
          orderBy: { position: 'asc' },
          select: {
            quantity: true,
            product: { select: { name: true, uom: true, attributes: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException(`Invoice ${id} not found`);
    const positions: ResolvedPosition[] = row.positions.map((p) => ({
      name: p.product?.name ?? '?',
      qty: Number(p.quantity),
      uom: p.product?.uom ?? null,
      cell: cellOf(p.product?.attributes),
    }));
    return {
      id: row.id,
      name: row.name,
      docType: 'invoiceout',
      moment: row.moment,
      agentName: row.agent?.name ?? null,
      agentPhone: row.agent?.phone ?? null,
      ownerName: row.owner?.name ?? null,
      description: row.description,
      positions,
    };
  }

  /** No-op in the own-orders variant (own orders have no pick-print flag). */
  async markPrinted(_accountId: string, id: string) {
    return { id, printedAt: null as Date | null };
  }

  /** Home cells for OUR products by id — the «Печать → Лист сборки» action on
   *  customer-orders/new + sales-returns/new resolves cells for the positions
   *  currently in the form. */
  async cellsByProductIds(
    accountId: string,
    raw: unknown,
  ): Promise<{ cells: Record<string, string | null> }> {
    const ids =
      typeof raw === 'string'
        ? raw
            .split(',')
            .map((s) => s.trim())
            .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
            .slice(0, 500)
        : [];
    if (!ids.length) return { cells: {} };
    const products = await this.prisma.client.product.findMany({
      where: { accountId, id: { in: ids }, deletedAt: null },
      select: { id: true, attributes: true },
    });
    const cells: Record<string, string | null> = {};
    for (const p of products) {
      cells[p.id] = cellOf(p.attributes);
    }
    return { cells };
  }
}

/** Read the product's home cell from its `__yacheyka` attribute (else null). */
function cellOf(attrs: unknown): string | null {
  if (attrs && typeof attrs === 'object' && '__yacheyka' in attrs) {
    const v = (attrs as Record<string, unknown>).__yacheyka;
    return typeof v === 'string' && v.length > 0 ? v : null;
  }
  return null;
}

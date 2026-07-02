import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type CreateOrderInput, CreateOrderSchema, OrderFilterSchema } from './order.schema.js';
import { type SalePricesJson, pickSalePriceMinor } from './sale-price.util.js';

export interface OrderLineDto {
  productId: string;
  productName: string;
  productCode: string | null;
  qty: number;
  priceMinor: string;
  sumMinor: string;
}
export interface OrderDto {
  id: string;
  number: string;
  counterpartyId: string | null;
  counterpartyName: string | null;
  state: string;
  totalMinor: string;
  createdAt: string;
  lineCount: number;
}
export interface OrderDetailDto extends OrderDto {
  lines: OrderLineDto[];
}

const MAX_NUMBER_RETRIES = 5;

@Injectable()
export class OrderService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown): Promise<{ items: OrderDto[]; total: number }> {
    const filter = OrderFilterSchema.parse(rawFilter);

    // Search matches either the order number OR a counterparty name (legal
    // title or display name). AnalitikaOrder.counterpartyId is a raw FK
    // (no relation in schema), so we resolve matching counterparty ids
    // first, then OR them into the main where.
    let extraSearchWhere: Prisma.AnalitikaOrderWhereInput | null = null;
    if (filter.search) {
      const q = { contains: filter.search, mode: 'insensitive' as const };
      const matchingCps = await this.prisma.client.counterparty.findMany({
        where: { accountId, OR: [{ name: q }, { legalTitle: q }] },
        select: { id: true },
        take: 200,
      });
      const cpIds = matchingCps.map((c) => c.id);
      extraSearchWhere = {
        OR: [{ number: q }, ...(cpIds.length > 0 ? [{ counterpartyId: { in: cpIds } }] : [])],
      };
    }

    const where: Prisma.AnalitikaOrderWhereInput = {
      accountId,
      ...(filter.state ? { state: filter.state } : {}),
      ...(extraSearchWhere ?? {}),
    };
    const orders = await this.prisma.client.analitikaOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { _count: { select: { lines: true } } },
    });
    const names = await this.counterpartyNames(
      accountId,
      orders.map((o) => o.counterpartyId).filter((x): x is string => !!x),
    );
    const items = orders.map((o) => ({
      id: o.id,
      number: o.number,
      counterpartyId: o.counterpartyId,
      counterpartyName: o.counterpartyId ? (names.get(o.counterpartyId) ?? null) : null,
      state: o.state,
      totalMinor: o.totalMinor.toString(),
      createdAt: o.createdAt.toISOString(),
      lineCount: o._count.lines,
    }));
    return { items, total: items.length };
  }

  async getById(accountId: string, id: string): Promise<OrderDetailDto> {
    const order = await this.prisma.client.analitikaOrder.findFirst({
      where: { id, accountId },
      include: { lines: true },
    });
    if (!order) throw new NotFoundException(`Order ${id} not found`);

    const products = await this.loadProducts(
      accountId,
      order.lines.map((l) => l.productId),
    );
    const names = order.counterpartyId
      ? await this.counterpartyNames(accountId, [order.counterpartyId])
      : new Map<string, string>();

    return {
      id: order.id,
      number: order.number,
      counterpartyId: order.counterpartyId,
      counterpartyName: order.counterpartyId ? (names.get(order.counterpartyId) ?? null) : null,
      state: order.state,
      totalMinor: order.totalMinor.toString(),
      createdAt: order.createdAt.toISOString(),
      lineCount: order.lines.length,
      lines: order.lines.map((l) => ({
        productId: l.productId,
        productName: products.get(l.productId)?.name ?? '—',
        productCode: products.get(l.productId)?.code ?? null,
        qty: Number(l.qty),
        priceMinor: l.priceMinor.toString(),
        sumMinor: l.sumMinor.toString(),
      })),
    };
  }

  /**
   * Create an order from selected products. Prices are snapshotted from each
   * product's default sale price; line sums and the order total are derived
   * server-side. The human-readable number is sequential per account, with a
   * retry on the unique-collision race.
   */
  async create(accountId: string, raw: unknown): Promise<OrderDetailDto> {
    const input = this.parse(raw);

    const productIds = [...new Set(input.lines.map((l) => l.productId))];
    const [products, defaultType] = await Promise.all([
      this.prisma.client.product.findMany({
        where: { accountId, id: { in: productIds } },
        select: { id: true, name: true, code: true, salePrices: true },
      }),
      this.prisma.client.priceType.findFirst({
        where: { accountId, isDefault: true },
        select: { id: true },
      }),
    ]);
    const productMap = new Map(products.map((p) => [p.id, p]));
    for (const line of input.lines) {
      if (!productMap.has(line.productId)) {
        throw new BadRequestException(`Product ${line.productId} not found`);
      }
    }

    let totalMinor = 0n;
    const lineData = input.lines.map((line) => {
      const product = productMap.get(line.productId);
      const priceMinor = pickSalePriceMinor(product?.salePrices as SalePricesJson, defaultType?.id);
      const sumMinor = BigInt(Math.round(line.qty * Number(priceMinor)));
      totalMinor += sumMinor;
      return {
        accountId,
        productId: line.productId,
        qty: line.qty,
        priceMinor,
        sumMinor,
      };
    });

    const order = await this.createWithNumber(accountId, {
      counterpartyId: input.counterpartyId ?? null,
      totalMinor,
      lineData,
    });
    return this.getById(accountId, order.id);
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private async createWithNumber(
    accountId: string,
    payload: {
      counterpartyId: string | null;
      totalMinor: bigint;
      lineData: Prisma.AnalitikaOrderLineCreateManyOrderInput[];
    },
  ) {
    let seq = (await this.prisma.client.analitikaOrder.count({ where: { accountId } })) + 1;
    for (let attempt = 0; attempt < MAX_NUMBER_RETRIES; attempt++) {
      const number = `ANL-${String(seq).padStart(5, '0')}`;
      try {
        return await this.prisma.client.analitikaOrder.create({
          data: {
            accountId,
            number,
            counterpartyId: payload.counterpartyId,
            state: 'formed',
            totalMinor: payload.totalMinor,
            lines: { create: payload.lineData },
          },
        });
      } catch (e) {
        if ((e as { code?: string }).code === 'P2002') {
          seq += 1; // number taken by a concurrent create — try the next one
          continue;
        }
        throw e;
      }
    }
    throw new BadRequestException('Buyurtma raqamini yaratib bo‘lmadi, qayta urinib ko‘ring');
  }

  private parse(raw: unknown): CreateOrderInput {
    const r = CreateOrderSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private async loadProducts(accountId: string, productIds: string[]) {
    const unique = [...new Set(productIds)];
    if (unique.length === 0) return new Map<string, { name: string; code: string | null }>();
    const products = await this.prisma.client.product.findMany({
      where: { accountId, id: { in: unique } },
      select: { id: true, name: true, code: true },
    });
    return new Map(products.map((p) => [p.id, { name: p.name, code: p.code }]));
  }

  private async counterpartyNames(accountId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map<string, string>();
    const rows = await this.prisma.client.counterparty.findMany({
      where: { accountId, id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}

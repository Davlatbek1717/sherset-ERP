import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AnalysisFilterSchema, CounterpartyListFilterSchema } from './analysis.schema.js';
import { type SalePricesJson, pickSalePriceMinor } from './sale-price.util.js';

/**
 * Rich partner shape, 1:1 with the Alibobo reference (`D:\projects-desktop\
 * projects\KONTRAGENTLAR src/hooks/use-partners.ts`). Fields not tracked by
 * moysklad's `Counterparty` model are exposed as `null` to keep the contract
 * stable. `id` is a UUID string (moysklad's PK type) — the reference uses
 * numeric ids, the client adapts.
 */
export interface PartnerDTO {
  id: string;
  code: string | null;
  name: string;
  fullname: string | null;
  bossName: string | null;
  legalStatus: 'Juridical' | 'Natural' | null;
  groupId: string | null;
  groupName: string | null;
  inn: string | null;
  phones: string | null;
  address: string | null;
  description: string | null;
  bankName: string | null;
  mfo: string | null;
  rs: string | null;
  oked: string | null;
  vatIndex: string | null;
  isDeleted: boolean;
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PartnersPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface UzRequisites {
  inn?: string;
  okoned?: string;
  mfo?: string;
}

/** Structural shape of a Counterparty row projected via `partnerSelect`. */
interface PartnerRow {
  id: string;
  code: string | null;
  name: string;
  legalTitle: string | null;
  companyType: string;
  phone: string | null;
  legalAddress: string | null;
  actualAddress: string | null;
  description: string | null;
  uzRequisites: unknown;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  groupId: string | null;
  group: { name: string } | null;
}

function emptyStats(): AnalysisStats {
  return {
    purchasedQty: 0,
    soldQty: 0,
    purchasedCost: 0,
    soldCost: 0,
    purchasedSaleValue: 0,
    soldValue: 0,
    soldShare: 0,
    lastPurchaseAt: null,
    lastSaleAt: null,
  };
}

/**
 * Per-supplier money + qty stats, 1:1 with the Alibobo reference (`use-analysis.ts`).
 * All monetary values are minor units (tiyin) expressed as `number` to match the
 * reference shape exactly. For realistic dev/staging data (< 9×10¹⁵ tiyin =
 * 90 trillion so'm) Number is exact; large enterprise totals may need a switch
 * to BigInt string later.
 */
export interface AnalysisStats {
  purchasedQty: number;
  soldQty: number;
  purchasedCost: number;
  soldCost: number;
  purchasedSaleValue: number;
  soldValue: number;
  /** 0..1 (decimal share, not percent) — match reference. */
  soldShare: number;
  lastPurchaseAt: string | null;
  lastSaleAt: string | null;
}

export interface AnalysisProduct {
  id: string;
  code: string | null;
  name: string;
  imageUrl: string | null;
  unitName: string | null;
  buyPrice: number;
  sellPrice: number;
  soldQty: number;
  purchasedQty: number;
  finalStock: number;
}

export interface AnalysisResponse {
  partner: PartnerDTO;
  stats: AnalysisStats;
  products: AnalysisProduct[];
  range: { from: string; to: string };
}

const DAY_MS = 86_400_000;

@Injectable()
export class AnalysisService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Paginated counterparty list mirroring the reference `/api/partners`
   * contract: `{ partners, groups, pagination }`. Group filter targets the
   * Counterparty's group name; `showDeleted=true` includes archived rows.
   * Search matches `name`, `legalTitle`, `code`, or `phone` case-insensitively.
   */
  async listCounterparties(
    accountId: string,
    rawFilter: unknown,
  ): Promise<{ partners: PartnerDTO[]; groups: string[]; pagination: PartnersPagination }> {
    const filter = CounterpartyListFilterSchema.parse(rawFilter);
    const skip = (filter.page - 1) * filter.pageSize;

    const where = {
      accountId,
      ...(filter.showDeleted ? {} : { archived: false }),
      ...(filter.groupName ? { group: { name: filter.groupName } } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' as const } },
              { legalTitle: { contains: filter.search, mode: 'insensitive' as const } },
              { code: { contains: filter.search, mode: 'insensitive' as const } },
              { phone: { contains: filter.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total, groupRows] = await Promise.all([
      this.prisma.client.counterparty.findMany({
        where,
        select: this.partnerSelect,
        orderBy: { name: 'asc' },
        skip,
        take: filter.pageSize,
      }),
      this.prisma.client.counterparty.count({ where }),
      this.prisma.client.group.findMany({
        where: { accountId, counterparties: { some: {} } },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const partners: PartnerDTO[] = rows.map((r) => this.toPartnerDTO(r));

    const totalPages = Math.max(1, Math.ceil(total / filter.pageSize));
    return {
      partners,
      groups: [...new Set(groupRows.map((g) => g.name))],
      pagination: { page: filter.page, pageSize: filter.pageSize, total, totalPages },
    };
  }

  /** Map moysklad `companyType` to the reference `legalStatus` vocabulary. */
  private mapLegalStatus(companyType: string): 'Juridical' | 'Natural' | null {
    if (companyType === 'legalUZ' || companyType === 'legal') return 'Juridical';
    if (companyType === 'individualUZ' || companyType === 'individual') return 'Natural';
    return null;
  }

  /**
   * Per-supplier analysis matching the Alibobo reference contract
   * `{ partner, stats, products, range }`. "Supplier's products" = products with
   * `supplierId = counterpartyId`. Purchased/sold quantities + money aggregate
   * posted Supply/Demand positions for those products within [from, to] (default
   * last 30 days). `lastPurchaseAt`/`lastSaleAt` are all-time; `finalStock` is
   * current. `purchasedSaleValue` = sum of purchased qty × current sale price
   * (what those purchases would gross at retail). Money in minor units as
   * `number` to mirror the reference DTO.
   */
  async analyze(
    accountId: string,
    counterpartyId: string,
    rawFilter: unknown,
  ): Promise<AnalysisResponse> {
    const filter = AnalysisFilterSchema.parse(rawFilter);
    const cpRow = await this.prisma.client.counterparty.findFirst({
      where: { id: counterpartyId, accountId },
      select: this.partnerSelect,
    });
    if (!cpRow) throw new NotFoundException(`Counterparty ${counterpartyId} not found`);
    const partner = this.toPartnerDTO(cpRow);

    const to = filter.to ? new Date(filter.to) : new Date();
    const from = filter.from ? new Date(filter.from) : new Date(to.getTime() - 30 * DAY_MS);
    const range = { from: from.toISOString(), to: to.toISOString() };

    const products = await this.prisma.client.product.findMany({
      where: { accountId, supplierId: counterpartyId, deletedAt: null },
      select: { id: true, code: true, name: true, uom: true, buyPrice: true, salePrices: true },
    });
    const productIds = products.map((p) => p.id);

    if (productIds.length === 0) {
      return { partner, stats: emptyStats(), products: [], range };
    }

    const [supplyRows, lastSupply, demandRows, lastDemand, stocks, defaultType] = await Promise.all(
      [
        this.prisma.client.supplyPosition.findMany({
          where: {
            accountId,
            productId: { in: productIds },
            supply: { state: 'posted', moment: { gte: from, lte: to } },
          },
          select: { productId: true, quantity: true, priceMinor: true },
          take: 20_000,
        }),
        this.prisma.client.supplyPosition.findFirst({
          where: { accountId, productId: { in: productIds }, supply: { state: 'posted' } },
          select: { supply: { select: { moment: true } } },
          orderBy: { supply: { moment: 'desc' } },
        }),
        this.prisma.client.demandPosition.findMany({
          where: {
            accountId,
            productId: { in: productIds },
            demand: { state: 'posted', moment: { gte: from, lte: to } },
          },
          select: { productId: true, quantity: true, priceMinor: true, costMinor: true },
          take: 20_000,
        }),
        this.prisma.client.demandPosition.findFirst({
          where: { accountId, productId: { in: productIds }, demand: { state: 'posted' } },
          select: { demand: { select: { moment: true } } },
          orderBy: { demand: { moment: 'desc' } },
        }),
        this.prisma.client.stock.findMany({
          where: { accountId, assortmentKind: 'product', assortmentId: { in: productIds } },
          select: { assortmentId: true, qty: true },
        }),
        // Resolve the account default price type so salePrices is read by real id
        // (mirrors items/order.service), not just the first-entry fallback.
        this.prisma.client.priceType.findFirst({
          where: { accountId, isDefault: true },
          select: { id: true },
        }),
      ],
    );

    // Per-product aggregates (BigInt for money to avoid drift across many rows).
    const purchasedByProduct = new Map<string, { qty: number; cost: bigint }>();
    for (const r of supplyRows) {
      if (!r.productId) continue;
      const q = Number(r.quantity);
      const cost = BigInt(Math.round(q * Number(r.priceMinor)));
      const cur = purchasedByProduct.get(r.productId) ?? { qty: 0, cost: 0n };
      cur.qty += q;
      cur.cost += cost;
      purchasedByProduct.set(r.productId, cur);
    }
    const soldByProduct = new Map<string, { qty: number; value: bigint; cost: bigint }>();
    for (const r of demandRows) {
      if (!r.productId) continue;
      const q = Number(r.quantity);
      const value = BigInt(Math.round(q * Number(r.priceMinor)));
      const cost = BigInt(Math.round(q * Number(r.costMinor ?? 0n)));
      const cur = soldByProduct.get(r.productId) ?? { qty: 0, value: 0n, cost: 0n };
      cur.qty += q;
      cur.value += value;
      cur.cost += cost;
      soldByProduct.set(r.productId, cur);
    }
    const stockByProduct = new Map(stocks.map((s) => [s.assortmentId, Number(s.qty)]));

    // Build per-product DTO + accumulate stats.
    let purchasedQtyTotal = 0;
    let soldQtyTotal = 0;
    let purchasedCostMinor = 0n;
    let soldValueMinor = 0n;
    let soldCostMinor = 0n;
    let purchasedSaleValueMinor = 0n;

    const productsDto: AnalysisProduct[] = products.map((p) => {
      const sellPriceMinor = pickSalePriceMinor(p.salePrices as SalePricesJson, defaultType?.id);
      const sellPrice = Number(sellPriceMinor);
      const buyPrice = Number(p.buyPrice ?? 0n);
      const pur = purchasedByProduct.get(p.id) ?? { qty: 0, cost: 0n };
      const sold = soldByProduct.get(p.id) ?? { qty: 0, value: 0n, cost: 0n };
      const finalStock = stockByProduct.get(p.id) ?? 0;

      purchasedQtyTotal += pur.qty;
      soldQtyTotal += sold.qty;
      purchasedCostMinor += pur.cost;
      soldValueMinor += sold.value;
      soldCostMinor += sold.cost;
      purchasedSaleValueMinor += BigInt(Math.round(pur.qty * sellPrice));

      return {
        id: p.id,
        code: p.code,
        name: p.name,
        imageUrl: null, // TODO: derive primary image URL when image module endpoint is wired
        unitName: p.uom ?? null,
        buyPrice,
        sellPrice,
        soldQty: sold.qty,
        purchasedQty: pur.qty,
        finalStock,
      };
    });

    const stats: AnalysisStats = {
      purchasedQty: purchasedQtyTotal,
      soldQty: soldQtyTotal,
      purchasedCost: Number(purchasedCostMinor),
      soldCost: Number(soldCostMinor),
      purchasedSaleValue: Number(purchasedSaleValueMinor),
      soldValue: Number(soldValueMinor),
      soldShare: purchasedQtyTotal > 0 ? soldQtyTotal / purchasedQtyTotal : 0,
      lastPurchaseAt: lastSupply?.supply?.moment?.toISOString() ?? null,
      lastSaleAt: lastDemand?.demand?.moment?.toISOString() ?? null,
    };

    return { partner, stats, products: productsDto, range };
  }

  // ---- helpers ----

  /** Shared `select` for Counterparty rows that feed `toPartnerDTO`. */
  private readonly partnerSelect = {
    id: true,
    code: true,
    name: true,
    legalTitle: true,
    companyType: true,
    phone: true,
    legalAddress: true,
    actualAddress: true,
    description: true,
    uzRequisites: true,
    archived: true,
    createdAt: true,
    updatedAt: true,
    groupId: true,
    group: { select: { name: true } },
  } as const;

  private toPartnerDTO(r: PartnerRow): PartnerDTO {
    const uz = (r.uzRequisites as UzRequisites | null) ?? null;
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      fullname: r.legalTitle,
      bossName: null,
      legalStatus: this.mapLegalStatus(r.companyType),
      groupId: r.groupId,
      groupName: r.group?.name ?? null,
      inn: uz?.inn ?? null,
      phones: r.phone,
      address: r.actualAddress ?? r.legalAddress ?? null,
      description: r.description,
      bankName: null,
      mfo: uz?.mfo ?? null,
      rs: null,
      oked: uz?.okoned ?? null,
      vatIndex: null,
      isDeleted: r.archived,
      syncedAt: r.updatedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}

import { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import {
  BonusOperationFilterSchema,
  BonusProgramFilterSchema,
  CreateBonusOperationSchema,
  CreateBonusProgramSchema,
  RedeemBonusSchema,
  UpdateBonusProgramSchema,
} from './loyalty.schema.js';

/**
 * LoyaltyService — bonus program CRUD + accrual/redemption ledger.
 *
 * Balance model: signed sum of COMMITTED operations
 *   balance(agent) = SUM(BonusOperation.bonusValue)
 *     WHERE accountId = ?
 *       AND agentId = ?
 *       AND transactionStatus = 'COMMITTED'
 *
 * EARNING ops are positive (+10 points), SPENDING ops are stored
 * negative (-10 points) so the simple sum yields the running balance.
 *
 * Redemption guard: refuses to write a SPENDING op that would push the
 * balance negative. Race-safe via $transaction(Serializable).
 */
@Injectable()
export class LoyaltyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // --- BonusProgram CRUD ------------------------------------------------

  async listPrograms(accountId: string, rawFilter: unknown) {
    const filter = BonusProgramFilterSchema.parse(rawFilter);
    const where: Prisma.BonusProgramWhereInput = {
      accountId,
      ...(filter.active !== undefined ? { active: filter.active } : {}),
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
      ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
    };
    const rows = await this.prisma.client.bonusProgram.findMany({
      where,
      orderBy: { name: 'asc' },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.bonusProgram.count({ where });
    return { items, nextCursor, total };
  }

  async findProgram(accountId: string, id: string) {
    const row = await this.prisma.client.bonusProgram.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`BonusProgram ${id} not found`);
    return row;
  }

  async createProgram(accountId: string, raw: unknown) {
    const r = CreateBonusProgramSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    const parsed = r.data;
    try {
      return await this.prisma.client.bonusProgram.create({
        data: {
          accountId,
          name: parsed.name,
          currency: parsed.currency,
          transactionType: parsed.transactionType,
          earnRateRulesJson: parsed.earnRateRules
            ? (parsed.earnRateRules as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          allAgents: parsed.allAgents,
          agentTags: parsed.agentTags,
          allProducts: parsed.allProducts,
          active: parsed.active,
          applicableFromDate: parsed.applicableFromDate
            ? new Date(parsed.applicableFromDate)
            : null,
        },
      });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async updateProgram(accountId: string, id: string, raw: unknown) {
    const r = UpdateBonusProgramSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    const parsed = r.data;
    await this.findProgram(accountId, id);
    const data: Prisma.BonusProgramUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.currency !== undefined) data.currency = parsed.currency;
    if (parsed.transactionType !== undefined) data.transactionType = parsed.transactionType;
    if (parsed.earnRateRules !== undefined) {
      data.earnRateRulesJson = (parsed.earnRateRules as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    }
    if (parsed.allAgents !== undefined) data.allAgents = parsed.allAgents;
    if (parsed.agentTags !== undefined) data.agentTags = { set: parsed.agentTags };
    if (parsed.allProducts !== undefined) data.allProducts = parsed.allProducts;
    if (parsed.active !== undefined) data.active = parsed.active;
    if (parsed.applicableFromDate !== undefined) {
      data.applicableFromDate = parsed.applicableFromDate
        ? new Date(parsed.applicableFromDate)
        : null;
    }
    try {
      return await this.prisma.client.bonusProgram.update({ where: { id }, data });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async archiveProgram(accountId: string, id: string) {
    await this.findProgram(accountId, id);
    return this.prisma.client.bonusProgram.update({
      where: { id },
      data: { archived: true, active: false },
    });
  }

  async deleteProgram(accountId: string, id: string) {
    await this.findProgram(accountId, id);
    const opsCount = await this.prisma.client.bonusOperation.count({
      where: { accountId, bonusProgramId: id },
    });
    if (opsCount > 0) {
      throw new BadRequestException(
        `Bu dasturga ${opsCount} ta operatsiya bog'liq — avval arxivlang yoki o'chirib bo'lmaydi`,
      );
    }
    await this.prisma.client.bonusProgram.delete({ where: { id } });
    return { ok: true };
  }

  // --- BonusOperation list + create ------------------------------------

  async listOperations(accountId: string, rawFilter: unknown) {
    const filter = BonusOperationFilterSchema.parse(rawFilter);
    const where: Prisma.BonusOperationWhereInput = {
      accountId,
      ...(filter.agentId ? { agentId: filter.agentId } : {}),
      ...(filter.bonusProgramId ? { bonusProgramId: filter.bonusProgramId } : {}),
      ...(filter.transactionType ? { transactionType: filter.transactionType } : {}),
      ...(filter.transactionStatus ? { transactionStatus: filter.transactionStatus } : {}),
      ...(filter.parentEntity ? { parentEntity: filter.parentEntity } : {}),
      ...(filter.parentId ? { parentId: filter.parentId } : {}),
      ...(filter.momentFrom || filter.momentTo
        ? {
            moment: tashkentRangeBounds(filter.momentFrom, filter.momentTo),
          }
        : {}),
      // «Номер или комментарий» — match the operation name (№) or its description.
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' as const } },
              { description: { contains: filter.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.client.bonusOperation.findMany({
      where,
      orderBy: { moment: 'desc' },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      // Names for the «Контрагент» + «Бонусная программа» columns (the list shows
      // labels, not ids).
      include: {
        agent: { select: { id: true, name: true } },
        bonusProgram: { select: { id: true, name: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.bonusOperation.count({ where });
    return { items, nextCursor, total };
  }

  async createOperation(accountId: string, userId: string, raw: unknown) {
    const r = CreateBonusOperationSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    const parsed = r.data;
    if (parsed.transactionType === 'SPENDING' && parsed.bonusValue > 0) {
      throw new BadRequestException("SPENDING operatsiyaning bonus qiymati manfiy bo'lishi shart");
    }
    if (parsed.transactionType === 'EARNING' && parsed.bonusValue < 0) {
      throw new BadRequestException("EARNING operatsiyaning bonus qiymati musbat bo'lishi shart");
    }
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    return this.prisma.client.bonusOperation.create({
      data: {
        accountId,
        ownerId: userId,
        groupId: creatorGroupId,
        agentId: parsed.agentId,
        bonusProgramId: parsed.bonusProgramId ?? null,
        organizationId: parsed.organizationId ?? null,
        transactionType: parsed.transactionType,
        categoryType: parsed.categoryType,
        transactionStatus: 'COMMITTED',
        bonusValue: parsed.bonusValue,
        name: this.nextOpName(),
        description: parsed.description ?? null,
        parentEntity: parsed.parentEntity ?? null,
        parentId: parsed.parentId ?? null,
      },
    });
  }

  // --- Balance + redemption --------------------------------------------

  /**
   * Sum of COMMITTED bonus operations for an agent. Excludes PENDING
   * (not yet earned, e.g. waiting for return window) and CANCELLED.
   */
  async getBalance(
    accountId: string,
    agentId: string,
  ): Promise<{ agentId: string; balance: number }> {
    const result = await this.prisma.client.bonusOperation.aggregate({
      where: { accountId, agentId, transactionStatus: 'COMMITTED' },
      _sum: { bonusValue: true },
    });
    return { agentId, balance: result._sum.bonusValue ?? 0 };
  }

  /**
   * Redeem points at POS / checkout. Race-safe — runs inside a
   * Serializable transaction with a fresh balance read so two parallel
   * redemptions can't both succeed against the same balance.
   *
   * Writes a single SPENDING op with bonusValue = -points (negative so
   * the simple SUM yields the running balance).
   */
  async redeem(accountId: string, userId: string, raw: unknown) {
    const r = RedeemBonusSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    const parsed = r.data;
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    return this.prisma.client.$transaction(
      async (tx) => {
        const agg = await tx.bonusOperation.aggregate({
          where: {
            accountId,
            agentId: parsed.agentId,
            transactionStatus: 'COMMITTED',
          },
          _sum: { bonusValue: true },
        });
        const balance = agg._sum.bonusValue ?? 0;
        if (balance < parsed.bonusValue) {
          throw new BadRequestException(
            `Yetarli bonus yo'q: balans ${balance}, so'ralmoqda ${parsed.bonusValue}`,
          );
        }
        return tx.bonusOperation.create({
          data: {
            accountId,
            ownerId: userId,
            groupId: creatorGroupId,
            agentId: parsed.agentId,
            bonusProgramId: parsed.bonusProgramId ?? null,
            transactionType: 'SPENDING',
            categoryType: 'REGULAR',
            transactionStatus: 'COMMITTED',
            bonusValue: -parsed.bonusValue,
            name: this.nextOpName(),
            description: parsed.description ?? null,
            parentEntity: parsed.parentEntity ?? null,
            parentId: parsed.parentId ?? null,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  // --- helpers ---------------------------------------------------------

  /**
   * Compute earned points for a given purchase amount via a program's
   * earn rate rules. Pure — no IO; caller passes the program rules.
   *
   * Default behaviour (no rules / no match): 0 points.
   * Used by RetailSale checkout to call `accrueForSale` after the basket
   * total is known.
   */
  computeEarnedPoints(program: { earnRateRulesJson: unknown }, amountMinor: bigint): number {
    type Rule = { predicate?: string; ratePerUnit?: string; priority?: number };
    const rulesRaw = program.earnRateRulesJson;
    if (!Array.isArray(rulesRaw) || rulesRaw.length === 0) return 0;
    const rules = rulesRaw as Rule[];
    const sortedByPriority = [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    for (const rule of sortedByPriority) {
      if (rule.predicate === 'all' && rule.ratePerUnit) {
        const rate = Number(rule.ratePerUnit);
        const amount = Number(amountMinor) / 100;
        return Math.floor(rate * amount);
      }
    }
    return 0;
  }

  private nextOpName(): string {
    return `BNS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  private handlePrisma(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        throw new ConflictException('Bunday nom allaqachon mavjud');
      }
    }
    throw e;
  }
}

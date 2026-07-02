import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  CashDeskFilterSchema,
  type CreateCashDeskInput,
  CreateCashDeskSchema,
  type UpdateCashDeskInput,
  UpdateCashDeskSchema,
} from './cash-desk.schema.js';

@Injectable()
export class CashDeskService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = CashDeskFilterSchema.parse(rawFilter);
    const where: Prisma.CashDeskWhereInput = {
      accountId,
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
      ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
    };
    const rows = await this.prisma.client.cashDesk.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.cashDesk.count({ where });
    return {
      items: items.map((r) => ({ ...r, balanceMinor: r.balanceMinor.toString() })),
      nextCursor,
      total,
    };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.cashDesk.findFirst({ where: { id, accountId } });
    if (!row) throw new NotFoundException(`CashDesk ${id} not found`);
    return { ...row, balanceMinor: row.balanceMinor.toString() };
  }

  async create(accountId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    const row = await this.prisma.client.cashDesk.create({
      data: {
        accountId,
        name: parsed.name,
        currency: parsed.currency,
      },
    });
    return { ...row, balanceMinor: row.balanceMinor.toString() };
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    // Prove the row exists (accountId-scoped 404) before the versioned update.
    await this.assertExists(accountId, id);
    const data: Prisma.CashDeskUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.currency !== undefined) data.currency = parsed.currency;
    try {
      // Optimistic lock: version filter only matches if the row is unchanged
      // since the form loaded. Stale version → zero rows → Prisma P2025 → 409.
      // NOTE: version is incremented ONLY on this settings update path.
      // money.service.ts posts (balanceMinor) use a separate tx.cashDesk.update
      // with NO version change — they are intentionally left untouched here.
      const row = await this.prisma.client.cashDesk.update({
        where: { id, accountId, version: parsed.version },
        data: { ...data, version: { increment: 1 } },
      });
      return { ...row, balanceMinor: row.balanceMinor.toString() };
    } catch (e) {
      mapVersionedUpdateError(e, 'CashDesk');
      throw e;
    }
  }

  async archive(accountId: string, id: string) {
    await this.assertExists(accountId, id);
    const row = await this.prisma.client.cashDesk.update({
      where: { id, accountId },
      data: { archived: true },
    });
    return { ...row, balanceMinor: row.balanceMinor.toString() };
  }

  async restore(accountId: string, id: string) {
    await this.assertExists(accountId, id);
    const row = await this.prisma.client.cashDesk.update({
      where: { id, accountId },
      data: { archived: false },
    });
    return { ...row, balanceMinor: row.balanceMinor.toString() };
  }

  async delete(accountId: string, id: string) {
    const desk = await this.prisma.client.cashDesk.findFirst({
      where: { id, accountId },
      select: { balanceMinor: true },
    });
    if (!desk) throw new NotFoundException(`CashDesk ${id} not found`);
    if (desk.balanceMinor !== 0n) {
      throw new BadRequestException(
        `Kassada qoldiq bor — o'chirib bo'lmaydi (avval chiqarib oling)`,
      );
    }
    const [cashInCount, cashOutCount] = await this.prisma.client.$transaction([
      this.prisma.client.cashIn.count({
        where: { accountId, cashDeskId: id, deletedAt: null },
      }),
      this.prisma.client.cashOut.count({
        where: { accountId, cashDeskId: id, deletedAt: null },
      }),
    ]);
    const total = cashInCount + cashOutCount;
    if (total > 0) {
      throw new BadRequestException(
        `Kassa ${total} ta hujjatda ishlatilgan — o'chirib bo'lmaydi (arxivlang)`,
      );
    }
    await this.prisma.client.cashDesk.delete({ where: { id, accountId } });
    return { ok: true };
  }

  private async assertExists(accountId: string, id: string): Promise<void> {
    const row = await this.prisma.client.cashDesk.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException(`CashDesk ${id} not found`);
  }

  private parseCreate(raw: unknown): CreateCashDeskInput {
    const r = CreateCashDeskSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateCashDeskInput {
    const r = UpdateCashDeskSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}

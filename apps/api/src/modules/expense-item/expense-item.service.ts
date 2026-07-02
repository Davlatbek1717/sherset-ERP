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
  type CreateExpenseItemInput,
  CreateExpenseItemSchema,
  ExpenseItemFilterSchema,
  type UpdateExpenseItemInput,
  UpdateExpenseItemSchema,
} from './expense-item.schema.js';

const DEFAULT_EXPENSE_ITEMS = [
  // moysklad auto-creates «Списания» as the canonical write-off expense item —
  // the #loss editor «Статья расходов» defaults to it. Keep it first.
  'Списания',
  'Аренда',
  'Реклама',
  'Канцелярия',
  'Зарплата',
  'Налоги',
  'Транспорт',
  'Связь',
  'Прочее',
];

@Injectable()
export class ExpenseItemService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = ExpenseItemFilterSchema.parse(rawFilter);
    const where: Prisma.ExpenseItemWhereInput = {
      accountId,
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
      ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
    };
    const items = await this.prisma.client.expenseItem.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: 200,
    });
    return { items, total: items.length };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.expenseItem.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`ExpenseItem ${id} not found`);
    return row;
  }

  async create(accountId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    try {
      return await this.prisma.client.expenseItem.create({
        data: {
          accountId,
          name: parsed.name,
          code: parsed.code,
          externalCode: parsed.externalCode,
          description: parsed.description,
        },
      });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    await this.findById(accountId, id);

    const data: Prisma.ExpenseItemUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.code !== undefined) data.code = parsed.code;
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode;
    if (parsed.description !== undefined) data.description = parsed.description;

    try {
      return await this.prisma.client.expenseItem.update({
        where: { id, accountId, version: parsed.version },
        data: { ...data, version: { increment: 1 } },
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'ExpenseItem');
      this.handlePrisma(e);
    }
  }

  async archive(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.expenseItem.update({
      where: { id, accountId },
      data: { archived: true },
    });
  }

  async restore(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.expenseItem.update({
      where: { id, accountId },
      data: { archived: false },
    });
  }

  async delete(accountId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.expenseItem.delete({ where: { id, accountId } });
    return { ok: true };
  }

  /** Seed default expense categories if account has none. */
  async seedDefaultsIfEmpty(accountId: string): Promise<void> {
    const existing = await this.prisma.client.expenseItem.findFirst({ where: { accountId } });
    if (existing) return;

    for (const name of DEFAULT_EXPENSE_ITEMS) {
      await this.prisma.client.expenseItem.create({
        data: { accountId, name },
      });
    }
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private parseCreate(raw: unknown): CreateExpenseItemInput {
    const r = CreateExpenseItemSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateExpenseItemInput {
    const r = UpdateExpenseItemSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException(
        `Bu kod bilan xarajat moddasi allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}

import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  type CreateOrganizationAccountInput,
  CreateOrganizationAccountSchema,
  OrganizationAccountFilterSchema,
  type UpdateOrganizationAccountInput,
  UpdateOrganizationAccountSchema,
} from './organization-account.schema.js';

@Injectable()
export class OrganizationAccountService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = OrganizationAccountFilterSchema.parse(rawFilter);
    const where: Prisma.OrganizationAccountWhereInput = {
      accountId,
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.currency ? { currency: filter.currency } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { bankName: { contains: filter.search, mode: 'insensitive' } },
              { accountNumber: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.client.organizationAccount.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.organizationAccount.count({ where });
    return {
      items: items.map((r) => ({ ...r, balanceMinor: r.balanceMinor.toString() })),
      nextCursor,
      total,
    };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.organizationAccount.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`OrganizationAccount ${id} not found`);
    return { ...row, balanceMinor: row.balanceMinor.toString() };
  }

  async create(accountId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    const row = await this.prisma.client.$transaction(async (tx) => {
      if (parsed.isDefault) {
        await tx.organizationAccount.updateMany({
          where: {
            accountId,
            organizationId: parsed.organizationId,
            currency: parsed.currency,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      }
      return tx.organizationAccount.create({
        data: {
          accountId,
          organizationId: parsed.organizationId,
          name: parsed.name,
          isDefault: parsed.isDefault,
          currency: parsed.currency,
          bankName: parsed.bankName ?? null,
          bankLocation: parsed.bankLocation ?? null,
          accountNumber: parsed.accountNumber ?? null,
          correspondentAccount: parsed.correspondentAccount ?? null,
          bic: parsed.bic ?? null,
        },
      });
    });
    return { ...row, balanceMinor: row.balanceMinor.toString() };
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.prisma.client.organizationAccount.findFirst({
      where: { id, accountId },
      select: { organizationId: true, currency: true },
    });
    if (!existing) throw new NotFoundException(`OrganizationAccount ${id} not found`);

    const data: Prisma.OrganizationAccountUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.isDefault !== undefined) data.isDefault = parsed.isDefault;
    if (parsed.currency !== undefined) data.currency = parsed.currency;
    if (parsed.bankName !== undefined) data.bankName = parsed.bankName;
    if (parsed.bankLocation !== undefined) data.bankLocation = parsed.bankLocation;
    if (parsed.accountNumber !== undefined) data.accountNumber = parsed.accountNumber;
    if (parsed.correspondentAccount !== undefined)
      data.correspondentAccount = parsed.correspondentAccount;
    if (parsed.bic !== undefined) data.bic = parsed.bic;

    // When flipping isDefault to true, demote the current default in the same
    // (organizationId, currency) bucket within a transaction.
    const flippingDefault = parsed.isDefault === true;
    const targetOrgId = parsed.organizationId ?? existing.organizationId;
    const targetCurrency = parsed.currency ?? existing.currency;

    try {
      // Optimistic lock: the version filter matches only if no concurrent write
      // bumped the version since the form loaded. The existence findFirst above
      // proves the row exists, so a P2025 here is a concurrency conflict — and it
      // aborts the whole tx, so the demote-default updateMany rolls back too.
      const row = await this.prisma.client.$transaction(async (tx) => {
        if (flippingDefault) {
          await tx.organizationAccount.updateMany({
            where: {
              accountId,
              organizationId: targetOrgId,
              currency: targetCurrency,
              isDefault: true,
              NOT: { id },
            },
            data: { isDefault: false },
          });
        }
        return tx.organizationAccount.update({
          where: { id, accountId, version: parsed.version },
          data: { ...data, version: { increment: 1 } },
        });
      });
      return { ...row, balanceMinor: row.balanceMinor.toString() };
    } catch (e) {
      mapVersionedUpdateError(e, 'OrganizationAccount');
      throw e;
    }
  }

  async archive(accountId: string, id: string) {
    await this.assertExists(accountId, id);
    const row = await this.prisma.client.organizationAccount.update({
      where: { id, accountId },
      data: { archived: true },
    });
    return { ...row, balanceMinor: row.balanceMinor.toString() };
  }

  async restore(accountId: string, id: string) {
    await this.assertExists(accountId, id);
    const row = await this.prisma.client.organizationAccount.update({
      where: { id, accountId },
      data: { archived: false },
    });
    return { ...row, balanceMinor: row.balanceMinor.toString() };
  }

  async delete(accountId: string, id: string) {
    const acct = await this.prisma.client.organizationAccount.findFirst({
      where: { id, accountId },
      select: { balanceMinor: true },
    });
    if (!acct) throw new NotFoundException(`OrganizationAccount ${id} not found`);
    if (acct.balanceMinor !== 0n) {
      throw new BadRequestException(`Hisob-varaqda qoldiq bor — o'chirib bo'lmaydi (avval yoping)`);
    }
    // Check MoneyOperation references (ledger entries tied to this account).
    const moneyOpCount = await this.prisma.client.moneyOperation.count({
      where: { accountId, organizationAccountId: id },
    });
    if (moneyOpCount > 0) {
      throw new BadRequestException(
        `Hisob-varaq ${moneyOpCount} ta pul operatsiyasida ishlatilgan — o'chirib bo'lmaydi (arxivlang)`,
      );
    }
    await this.prisma.client.organizationAccount.delete({ where: { id, accountId } });
    return { ok: true };
  }

  private async assertExists(accountId: string, id: string): Promise<void> {
    const row = await this.prisma.client.organizationAccount.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException(`OrganizationAccount ${id} not found`);
  }

  private parseCreate(raw: unknown): CreateOrganizationAccountInput {
    const r = CreateOrganizationAccountSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateOrganizationAccountInput {
    const r = UpdateOrganizationAccountSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}

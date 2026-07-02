import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import {
  type CreateContractInput,
  CreateContractSchema,
  type UpdateContractInput,
  UpdateContractSchema,
} from './contract.schema.js';

interface ListQuery {
  search?: string;
  /** Filter by counterparty — used by the customer-order picker. */
  agentId?: string;
  archived?: string | boolean;
  limit?: string | number;
  cursor?: string;
}

@Injectable()
export class ContractService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, query: ListQuery) {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 250);
    const archived =
      query.archived === undefined ? false : query.archived === true || query.archived === 'true';

    const items = await this.prisma.client.contract.findMany({
      where: {
        accountId,
        archived,
        ...(query.agentId ? { agentId: query.agentId } : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: String(query.search), mode: 'insensitive' } },
                { code: { contains: String(query.search), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: limit,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        code: true,
        contractType: true,
        agentId: true,
        ownAgentId: true,
        currency: true,
        sumMinor: true,
        moment: true,
        description: true,
        archived: true,
        // Names the list view renders for Контрагент / Организация columns.
        agent: { select: { id: true, name: true } },
        ownAgent: { select: { id: true, name: true } },
      },
    });
    return { items };
  }

  async findById(accountId: string, id: string) {
    const contract = await this.prisma.client.contract.findFirst({
      where: { id, accountId },
      select: {
        id: true,
        name: true,
        code: true,
        contractType: true,
        ownAgentId: true,
        agentId: true,
        agentAccountId: true,
        organizationAccountId: true,
        currency: true,
        rateValue: true,
        sumMinor: true,
        rewardPercent: true,
        rewardType: true,
        moment: true,
        description: true,
        archived: true,
        // Names the edit form needs to render the picker labels.
        agent: { select: { id: true, name: true } },
        ownAgent: { select: { id: true, name: true } },
      },
    });
    if (!contract) throw new NotFoundException(`Contract ${id} not found`);
    return contract;
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    await this.ensureRefs(
      accountId,
      parsed.agentId,
      parsed.ownAgentId,
      parsed.agentAccountId,
      parsed.organizationAccountId,
    );

    // H4 P1: stamp the creating employee's department group at create time so
    // the future OWN_GROUP record-scope check has a value to match. Read-only
    // today (no scope is enforced yet). Stamp ONCE; never rewrite on edit.
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    try {
      const created = await this.prisma.client.contract.create({
        data: {
          accountId,
          ownerId: userId,
          groupId: creatorGroupId,
          name: parsed.name,
          code: parsed.code ?? null,
          contractType: parsed.contractType,
          ownAgentId: parsed.ownAgentId,
          agentId: parsed.agentId,
          agentAccountId: parsed.agentAccountId ?? null,
          organizationAccountId: parsed.organizationAccountId ?? null,
          currency: parsed.currency,
          rateValue: BigInt(parsed.rateValue),
          sumMinor: BigInt(parsed.sumMinor),
          rewardPercent: parsed.rewardPercent ?? null,
          rewardType: parsed.rewardType ?? null,
          moment: parsed.moment ? new Date(parsed.moment) : new Date(),
          description: parsed.description ?? null,
        },
      });
      await this.logAudit(accountId, userId, 'create', created.id, null);
      return created;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);

    // Validate any ref that is being changed.
    if (
      parsed.agentId !== undefined ||
      parsed.ownAgentId !== undefined ||
      parsed.agentAccountId !== undefined ||
      parsed.organizationAccountId !== undefined
    ) {
      await this.ensureRefs(
        accountId,
        parsed.agentId ?? existing.agentId,
        parsed.ownAgentId ?? existing.ownAgentId,
        parsed.agentAccountId,
        parsed.organizationAccountId,
      );
    }

    const data: Prisma.ContractUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.code !== undefined) data.code = parsed.code ?? null;
    if (parsed.contractType !== undefined) data.contractType = parsed.contractType;
    if (parsed.currency !== undefined) data.currency = parsed.currency;
    if (parsed.rateValue !== undefined) data.rateValue = BigInt(parsed.rateValue);
    if (parsed.sumMinor !== undefined) data.sumMinor = BigInt(parsed.sumMinor);
    if (parsed.rewardPercent !== undefined) data.rewardPercent = parsed.rewardPercent ?? null;
    if (parsed.rewardType !== undefined) data.rewardType = parsed.rewardType ?? null;
    if (parsed.moment !== undefined) data.moment = new Date(parsed.moment);
    if (parsed.description !== undefined) data.description = parsed.description ?? null;
    // Relation FKs go through nested connect/disconnect (Prisma update input).
    if (parsed.ownAgentId !== undefined) {
      data.ownAgent = { connect: { id: parsed.ownAgentId } };
    }
    if (parsed.agentId !== undefined) {
      data.agent = { connect: { id: parsed.agentId } };
    }
    if (parsed.agentAccountId !== undefined) {
      data.agentAccount = parsed.agentAccountId
        ? { connect: { id: parsed.agentAccountId } }
        : { disconnect: true };
    }
    if (parsed.organizationAccountId !== undefined) {
      data.organizationAccount = parsed.organizationAccountId
        ? { connect: { id: parsed.organizationAccountId } }
        : { disconnect: true };
    }

    try {
      // No optimistic lock: Contract has no version column. findById above
      // proves the row exists in this tenant, so this is a plain update.
      const updated = await this.prisma.client.contract.update({
        where: { id, accountId },
        data,
      });
      const diff = this.diff(existing, updated);
      if (Object.keys(diff).length) {
        await this.logAudit(accountId, userId, 'update', id, diff);
      }
      return updated;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async archive(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.contract.update({
      where: { id, accountId },
      data: { archived: true },
    });
    await this.logAudit(accountId, userId, 'archived', id, null);
    return updated;
  }

  async restore(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.contract.update({
      where: { id, accountId },
      data: { archived: false },
    });
    await this.logAudit(accountId, userId, 'restored', id, null);
    return updated;
  }

  async delete(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    // Hard-delete. Documents reference Contract via an OPTIONAL FK; if any are
    // linked, Prisma raises P2003 → the global PrismaExceptionFilter maps it to
    // 409 (the response-only filter handles it — no per-site catch needed).
    await this.prisma.client.contract.delete({ where: { id, accountId } });
    await this.logAudit(accountId, userId, 'delete', id, null);
    return { ok: true };
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private parseCreate(raw: unknown): CreateContractInput {
    const r = CreateContractSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateContractInput {
    const r = UpdateContractSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  /**
   * Tenant-scope every referenced id. agentId («Контрагент») and ownAgentId
   * («Организация») are required; the two account refs are optional. A ref that
   * belongs to another account (or does not exist) is a bad request, not a 500.
   */
  private async ensureRefs(
    accountId: string,
    agentId: string,
    ownAgentId: string,
    agentAccountId?: string | null,
    organizationAccountId?: string | null,
  ): Promise<void> {
    const [agent, ownAgent, agentAcc, orgAcc] = await Promise.all([
      this.prisma.client.counterparty.findFirst({ where: { id: agentId, accountId } }),
      this.prisma.client.organization.findFirst({ where: { id: ownAgentId, accountId } }),
      agentAccountId
        ? this.prisma.client.counterpartyAccount.findFirst({
            where: { id: agentAccountId, accountId },
          })
        : Promise.resolve(true),
      organizationAccountId
        ? this.prisma.client.organizationAccount.findFirst({
            where: { id: organizationAccountId, accountId },
          })
        : Promise.resolve(true),
    ]);
    if (!agent) throw new BadRequestException('Kontragent topilmadi');
    if (!ownAgent) throw new BadRequestException('Tashkilot topilmadi');
    if (!agentAcc) throw new BadRequestException('Kontragent hisob raqami topilmadi');
    if (!orgAcc) throw new BadRequestException('Tashkilot hisob raqami topilmadi');
  }

  private diff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Record<string, { before: unknown; after: unknown }> {
    const d: Record<string, { before: unknown; after: unknown }> = {};
    for (const k of Object.keys(after)) {
      if (k === 'createdAt' || k === 'updatedAt') continue;
      // BigInt values are not JSON-serialisable; compare via String().
      const serialize = (v: unknown) => (typeof v === 'bigint' ? v.toString() : JSON.stringify(v));
      if (serialize(before[k]) !== serialize(after[k])) {
        d[k] = {
          before: typeof before[k] === 'bigint' ? (before[k] as bigint).toString() : before[k],
          after: typeof after[k] === 'bigint' ? (after[k] as bigint).toString() : after[k],
        };
      }
    }
    return d;
  }

  private async logAudit(
    accountId: string,
    userId: string,
    action: string,
    entityId: string,
    fieldChanges: Record<string, unknown> | null,
  ): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        accountId,
        userId,
        entity: 'Contract',
        entityId,
        action,
        fieldChanges: fieldChanges as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException(
        `Bu nom bilan shartnoma allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}

import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CounterpartyBalanceService } from '../counterparty-balance/counterparty-balance.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { withSerializationRetry } from '../shared/serialization-retry.js';
import { MONEY_TX_OPTS, transitionWithClaim } from '../shared/transition-with-claim.js';
import {
  type CounterpartyAdjustmentFilterInput,
  CounterpartyAdjustmentFilterSchema,
  CreateCounterpartyAdjustmentSchema,
  UpdateCounterpartyAdjustmentSchema,
} from './counterparty-adjustment.schema.js';

/**
 * CounterpartyAdjustment service — manual debt corrections.
 *
 * The accounting trick this implements: when a clerk posts an adjustment
 * doc, the materialized CounterpartyBalance row gets nudged so the running
 * balance on /reports/counterparty-balance reflects the tweak immediately.
 * Unposting reverses it. Cancel keeps the doc as a paper trail but reverses
 * the balance touch.
 *
 * Sign convention (mirrors moysklad.uz):
 *   INCREASE → +sumMinor (counterparty OWES us more / their +balance grows)
 *   DECREASE → −sumMinor (counterparty OWES us less / their +balance shrinks)
 *
 * Idempotency: the doc's own `applicable` flag is the source of truth — if
 * it's already true, post() refuses; if it's false, unpost()/cancel() skip
 * the balance reverse. This matches CashIn/PaymentIn semantics so the
 * counterparty balance report stays consistent across all money docs.
 */
@Injectable()
export class CounterpartyAdjustmentService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CounterpartyBalanceService)
    private readonly balances: CounterpartyBalanceService,
  ) {}

  async list(accountId: string, raw: unknown) {
    const filter = CounterpartyAdjustmentFilterSchema.parse(raw);
    const where = this.buildListWhere(accountId, filter);

    // Relational sort: 'agent' / 'organization' need Prisma's nested
    // `{ relation: { field } }` form. Other keys are plain columns on the
    // adjustment row. (Before this sweep `sortBy` only allowed plain
    // columns, so the nested case never existed — the bug it prevents is
    // sorting by counterparty/organization name producing a Prisma
    // validation error.)
    const orderBy =
      filter.sortBy === 'agent'
        ? { agent: { name: filter.sortDir } }
        : filter.sortBy === 'organization'
          ? { organization: { name: filter.sortDir } }
          : { [filter.sortBy]: filter.sortDir };

    const rows = await this.prisma.client.counterpartyAdjustment.findMany({
      where,
      orderBy,
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        agent: { select: { id: true, name: true, legalTitle: true } },
        organization: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.counterpartyAdjustment.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * Shared WHERE builder for `list` (and any future aggregate that reuses
   * the active filter set). Extracted to mirror cash-in/payment-in.service
   * so the adjustment filter panel reaches moysklad «Корректировки
   * взаиморасчётов» parity (~12 backed fields) without two-place drift.
   * Keeps the accountId tenant guard + deletedAt/includeDeleted soft-delete
   * handling.
   */
  private buildListWhere(
    accountId: string,
    filter: CounterpartyAdjustmentFilterInput,
  ): Prisma.CounterpartyAdjustmentWhereInput {
    return {
      accountId,
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.direction ? { direction: filter.direction } : {}),
      ...(filter.agentId ? { agentId: filter.agentId } : {}),
      ...(filter.agentGroupId ? { agent: { groupId: filter.agentGroupId } } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.contractId ? { contractId: filter.contractId } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.currency ? { currency: filter.currency } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
              { agent: { name: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(filter.momentFrom || filter.momentTo
        ? {
            moment: tashkentRangeBounds(filter.momentFrom, filter.momentTo),
          }
        : {}),
      ...(filter.updatedFrom || filter.updatedTo
        ? {
            updatedAt: tashkentRangeBounds(filter.updatedFrom, filter.updatedTo),
          }
        : {}),
      ...(filter.sumMinorFrom !== undefined || filter.sumMinorTo !== undefined
        ? {
            sumMinor: {
              ...(filter.sumMinorFrom !== undefined ? { gte: BigInt(filter.sumMinorFrom) } : {}),
              ...(filter.sumMinorTo !== undefined ? { lte: BigInt(filter.sumMinorTo) } : {}),
            },
          }
        : {}),
    };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.counterpartyAdjustment.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        contract: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true } },
      },
    });
    if (!row) throw new NotFoundException(`CounterpartyAdjustment ${id} not found`);
    return row;
  }

  async create(accountId: string, ownerId: string, raw: unknown) {
    const data = CreateCounterpartyAdjustmentSchema.parse(raw);
    // Auto-numbering: next sequential per-account. Format: KV-YYYY-NNNNN.
    // KV = «Korrektirovka Vzaimoraschetov» (mirrors moysklad's RU prefix).
    const n = await allocateDocumentNumber(
      this.prisma.client,
      accountId,
      'counterpartyadjustment',
      async () => {
        // moysklad-parity: plain 5-digit zero-padded «Номер» (no prefix). Seed = highest
        // TRAILING number across all names (handles legacy prefixed + new plain) → continues.
        const rows = await this.prisma.client.counterpartyAdjustment.findMany({
          where: { accountId },
          select: { name: true },
        });
        let max = 0;
        for (const r of rows) {
          const m = r.name.match(/\d+$/);
          if (m) max = Math.max(max, Number.parseInt(m[0], 10) || 0);
        }
        return max;
      },
    );
    const name = String(n).padStart(5, '0');

    const moment = data.moment ? new Date(data.moment) : new Date();
    const applicable = data.applicable ?? false;
    const state = applicable ? 'posted' : 'draft';
    const postedAt = applicable ? new Date() : null;
    const sumMinor = BigInt(data.sumMinor);

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, ownerId);

    const created = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.counterpartyAdjustment.create({
        data: {
          accountId,
          ownerId,
          groupId: creatorGroupId,
          agentId: data.agentId,
          organizationId: data.organizationId,
          contractId: data.contractId ?? null,
          projectId: data.projectId ?? null,
          name,
          direction: data.direction,
          sumMinor,
          currency: data.currency,
          rateValue: BigInt(data.rateValue),
          description: data.description,
          externalCode: data.externalCode,
          moment,
          applicable,
          state,
          postedAt,
        },
      });
      if (applicable) {
        const delta = data.direction === 'INCREASE' ? sumMinor : -sumMinor;
        await this.balances.applyDelta(tx, accountId, data.agentId, data.currency, delta);
      }
      return row;
    });
    // History parity (mirrors cash-in.service): every create writes an audit
    // row so the document's «Tarix» tab populates. Was silently empty — the
    // service wrote ZERO auditLog rows, so /audit-logs?entity=CounterpartyAdjustment
    // never returned anything.
    await this.logAudit(accountId, ownerId, 'create', created.id, {
      direction: created.direction,
      amount: sumMinor.toString(),
    });
    return created;
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const data = UpdateCounterpartyAdjustmentSchema.parse(raw);
    const row = await this.findById(accountId, id);
    // Editing a posted doc would silently invalidate the balance impact
    // because applyDelta was already called with the OLD values. Force
    // unpost first — the UI also gates this but a malicious POST would
    // otherwise slip through.
    if (row.applicable) {
      throw new BadRequestException(
        'Provedeno hujjatni tahrirlash mumkin emas — avval unpost qiling',
      );
    }
    // Optimistic lock: the versioned WHERE matches only if no concurrent save
    // bumped the row since the edit form loaded. A mismatch updates zero rows →
    // Prisma P2025 → 409 OPTIMISTIC_LOCK (existence already confirmed by
    // findById above, so P2025 here can only mean a version race).
    try {
      await this.prisma.client.counterpartyAdjustment.update({
        where: { id, version: data.version },
        data: {
          ...(data.agentId ? { agentId: data.agentId } : {}),
          ...(data.organizationId ? { organizationId: data.organizationId } : {}),
          ...(data.contractId !== undefined ? { contractId: data.contractId ?? null } : {}),
          ...(data.projectId !== undefined ? { projectId: data.projectId ?? null } : {}),
          ...(data.direction ? { direction: data.direction } : {}),
          ...(data.sumMinor ? { sumMinor: BigInt(data.sumMinor) } : {}),
          ...(data.currency ? { currency: data.currency } : {}),
          ...(data.rateValue ? { rateValue: BigInt(data.rateValue) } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.externalCode !== undefined ? { externalCode: data.externalCode } : {}),
          ...(data.moment ? { moment: new Date(data.moment) } : {}),
          version: { increment: 1 },
        },
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'CounterpartyAdjustment');
      throw e;
    }
    await this.logAudit(accountId, userId, 'update', id, null);
    return this.findById(accountId, id);
  }

  async softDelete(accountId: string, userId: string, id: string) {
    const row = await this.findById(accountId, id);
    // If the doc is posted we must reverse the balance touch first;
    // otherwise the materialized CounterpartyBalance row keeps the stale
    // delta forever (deletedAt does not propagate to derived data).
    await this.prisma.client.$transaction(async (tx) => {
      if (row.applicable) {
        const delta = row.direction === 'INCREASE' ? row.sumMinor : -row.sumMinor;
        await this.balances.applyDelta(tx, accountId, row.agentId, row.currency, -delta);
      }
      await tx.counterpartyAdjustment.update({
        where: { id },
        data: {
          applicable: false,
          state: 'cancelled',
          deletedAt: new Date(),
        },
      });
    });
    await this.logAudit(accountId, userId, 'delete', id, null);
    return { ok: true };
  }

  async massEditApply(
    accountId: string,
    userId: string,
    id: string,
    patch: { ownerId?: string | null; projectId?: string | null; description?: string | null },
  ) {
    await this.findById(accountId, id);
    await assertMassEditRefsInTenant(this.prisma, accountId, patch);
    const data: Record<string, unknown> = {};
    if ('ownerId' in patch) data.ownerId = patch.ownerId;
    if ('projectId' in patch) data.projectId = patch.projectId;
    if ('description' in patch) data.description = patch.description;
    const updated = await this.prisma.client.counterpartyAdjustment.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch as Record<string, unknown>);
    return updated;
  }

  async markPrinted(accountId: string, id: string, printed: boolean) {
    await this.findById(accountId, id);
    return this.prisma.client.counterpartyAdjustment.update({
      where: { id, accountId },
      data: { printed },
    });
  }

  async clone(accountId: string, ownerId: string, sourceId: string) {
    const src = await this.findById(accountId, sourceId);
    // Mirrors the moysklad "Дублировать" affordance: copy meta+sum but
    // never carry over `applicable` — the clone always starts as a clean
    // draft. The clone re-runs auto-numbering through create() so the new
    // KV-YYYY-NNNNN slot is reserved atomically.
    return this.create(accountId, ownerId, {
      agentId: src.agentId,
      organizationId: src.organizationId,
      contractId: src.contractId ?? undefined,
      projectId: src.projectId ?? undefined,
      direction: src.direction,
      sumMinor: src.sumMinor.toString(),
      currency: src.currency,
      rateValue: src.rateValue.toString(),
      description: src.description ?? undefined,
      externalCode: src.externalCode ?? undefined,
      applicable: false,
    });
  }

  async transition(
    accountId: string,
    userId: string,
    id: string,
    target: 'post' | 'unpost' | 'cancel',
  ) {
    // M-01/DUP-01 — see payment-in.transition: Serializable + retry, and the
    // row re-read inside the closure so a retry never re-posts an adjustment a
    // rival transaction already posted.
    await withSerializationRetry(() => this.runTransition(accountId, userId, id, target));
    return this.findById(accountId, id);
  }

  private async runTransition(
    accountId: string,
    userId: string,
    id: string,
    target: 'post' | 'unpost' | 'cancel',
  ) {
    const row = await this.findById(accountId, id);
    const sumMinor = row.sumMinor;
    const delta = row.direction === 'INCREASE' ? sumMinor : -sumMinor;

    await this.prisma.client.$transaction(async (tx) => {
      if (target === 'post') {
        if (row.applicable) throw new BadRequestException('Already posted');
        // TOCTOU guard (M-01/DUP-01): atomically claim the state flip as the
        // FIRST op — the loser of a double-«Провести» sees count 0 → 409,
        // never a second balance delta.
        await transitionWithClaim(tx.counterpartyAdjustment, {
          id,
          accountId,
          fromStates: [row.state],
          toState: 'posted',
          message: "Korrektirovka holati o'zgargan (allaqachon o'tkazilgan)",
        });
        await tx.counterpartyAdjustment.update({
          where: { id },
          data: { applicable: true, state: 'posted', postedAt: new Date() },
        });
        await this.balances.applyDelta(tx, accountId, row.agentId, row.currency, delta);
        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'CounterpartyAdjustment',
            entityId: id,
            action: 'transition:posted',
            fieldChanges: {
              from: { before: row.state, after: 'posted' },
              direction: row.direction,
              amount: sumMinor.toString(),
            } as Prisma.InputJsonValue,
          },
        });
      } else if (target === 'unpost') {
        if (!row.applicable) throw new BadRequestException('Not posted');
        await transitionWithClaim(tx.counterpartyAdjustment, {
          id,
          accountId,
          fromStates: [row.state],
          toState: 'draft',
          message: "Korrektirovka holati o'zgargan (allaqachon o'zgartirilgan)",
        });
        await tx.counterpartyAdjustment.update({
          where: { id },
          data: { applicable: false, state: 'draft', postedAt: null },
        });
        await this.balances.applyDelta(tx, accountId, row.agentId, row.currency, -delta);
        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'CounterpartyAdjustment',
            entityId: id,
            action: 'transition:unposted',
            fieldChanges: {
              from: { before: row.state, after: 'draft' },
            } as Prisma.InputJsonValue,
          },
        });
      } else if (target === 'cancel') {
        // cancel claims the EXACT snapshotted state so a concurrent unpost that
        // already flipped posted→draft can't be double-reversed here.
        await transitionWithClaim(tx.counterpartyAdjustment, {
          id,
          accountId,
          fromStates: [row.state],
          toState: 'cancelled',
          message: "Korrektirovka holati o'zgargan (allaqachon o'zgartirilgan)",
        });
        if (row.applicable) {
          await this.balances.applyDelta(tx, accountId, row.agentId, row.currency, -delta);
        }
        await tx.counterpartyAdjustment.update({
          where: { id },
          data: { applicable: false, state: 'cancelled' },
        });
        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'CounterpartyAdjustment',
            entityId: id,
            action: 'transition:cancelled',
            fieldChanges: {
              from: { before: row.state, after: 'cancelled' },
            } as Prisma.InputJsonValue,
          },
        });
      }
    }, MONEY_TX_OPTS);
  }

  /**
   * Write an audit-trail row for the document's «Tarix» / History tab.
   * Mirrors cash-in.service — non-transactional sites (create/update/delete/
   * mass-edit) use the plain client; FSM transitions inline `tx.auditLog.create`
   * so the audit row commits atomically with the state change + balance delta.
   * The `entity` string MUST equal the web page's
   * `auditEntity="CounterpartyAdjustment"`, or the History tab stays empty.
   */
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
        entity: 'CounterpartyAdjustment',
        entityId,
        action,
        fieldChanges: fieldChanges as Prisma.InputJsonValue | undefined,
      },
    });
  }
}

import type { Prisma } from '@moysklad/db';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SupplyService } from '../supply/supply.service.js';
import {
  type ActorType,
  type ApprovalStage,
  diffAdjustments,
  rejectTarget,
} from './supply-approval.fsm.js';
import { OmborchiConfirmSchema, RejectSchema } from './supply-approval.schema.js';

/**
 * Qabul-tasdiqlash workflow — yupqa I/O qatlam (2026-07-29 spec). Bosqich-o'tish
 * qoidalari `supply-approval.fsm.ts`da (pure, test qilingan). Bu yer faqat:
 * atomik bosqich-da'vosi (optimistik updateMany), audit-event yozish, va admin
 * tasdig'ida mavjud `SupplyService.transition(...,'post')` orqali stock oshirish.
 */
@Injectable()
export class SupplyApprovalService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SupplyService) private readonly supply: SupplyService,
  ) {}

  /** Joriy bosqich + event-tarixi (yangisi birinchi). */
  async getApproval(accountId: string, supplyId: string) {
    const s = await this.prisma.client.supply.findFirst({
      where: { id: supplyId, accountId, deletedAt: null },
      select: { approvalStage: true, state: true, applicable: true },
    });
    if (!s) throw new NotFoundException('Qabul topilmadi');
    const events = await this.prisma.client.supplyApprovalEvent.findMany({
      where: { accountId, supplyId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      stage: s.approvalStage as ApprovalStage,
      state: s.state,
      applicable: s.applicable,
      events,
    };
  }

  /** Atomik bosqich-da'vosi — updateMany joriy bosqichga gate. count 0 → 409/404. */
  private async claim(accountId: string, supplyId: string, from: ApprovalStage, to: ApprovalStage) {
    const res = await this.prisma.client.supply.updateMany({
      where: { id: supplyId, accountId, approvalStage: from, deletedAt: null },
      data: { approvalStage: to },
    });
    if (res.count === 0) {
      const exists = await this.prisma.client.supply.findFirst({
        where: { id: supplyId, accountId, deletedAt: null },
        select: { approvalStage: true },
      });
      if (!exists) throw new NotFoundException('Qabul topilmadi');
      throw new ConflictException(
        `Bosqich '${from}' emas (joriy: '${exists.approvalStage}') — o'tish bekor`,
      );
    }
  }

  private logEvent(
    accountId: string,
    supplyId: string,
    fromStage: ApprovalStage,
    toStage: ApprovalStage,
    action: string,
    actorType: ActorType,
    actorId: string | null,
    reason?: string,
  ) {
    return this.prisma.client.supplyApprovalEvent.create({
      data: {
        accountId,
        supplyId,
        fromStage,
        toStage,
        action,
        actorType,
        actorId,
        reason: reason ?? null,
      },
    });
  }

  /** Egasi taminotchiga yuboradi (none → awaiting_supplier). Faza B: shu yerda Excel+Telegram. */
  async send(accountId: string, userId: string, id: string) {
    await this.claim(accountId, id, 'none', 'awaiting_supplier');
    await this.logEvent(accountId, id, 'none', 'awaiting_supplier', 'send', 'system', userId);
    return this.getApproval(accountId, id);
  }

  /** Omborchi sanaydi + kerak bo'lsa tuzatadi (delivering → awaiting_admin). Atomik. */
  async omborchiConfirm(accountId: string, userId: string, id: string, raw: unknown) {
    const dto = OmborchiConfirmSchema.parse(raw);
    const positions = await this.prisma.client.supplyPosition.findMany({
      where: { supplyId: id, accountId },
      select: { id: true, quantity: true },
    });
    const detail = diffAdjustments(
      positions.map((p) => ({ id: p.id, quantity: p.quantity.toString() })),
      dto.adjustments,
    );
    await this.prisma.client.$transaction(async (tx) => {
      for (const d of detail) {
        await tx.supplyPosition.update({ where: { id: d.positionId }, data: { quantity: d.now } });
      }
      const res = await tx.supply.updateMany({
        where: { id, accountId, approvalStage: 'delivering', deletedAt: null },
        data: { approvalStage: 'awaiting_admin' },
      });
      if (res.count === 0) throw new ConflictException("Bosqich 'delivering' emas");
      await tx.supplyApprovalEvent.create({
        data: {
          accountId,
          supplyId: id,
          fromStage: 'delivering',
          toStage: 'awaiting_admin',
          action: 'omborchi_ok',
          actorType: 'omborchi',
          actorId: userId,
          detail: detail.length ? (detail as unknown as Prisma.InputJsonValue) : undefined,
        },
      });
    });
    return this.getApproval(accountId, id);
  }

  /** Admin yakuniy tasdiq (awaiting_admin → completed) + stock post. */
  async adminConfirm(accountId: string, userId: string, id: string) {
    await this.claim(accountId, id, 'awaiting_admin', 'completed');
    try {
      await this.supply.transition(accountId, userId, id, 'post'); // draft→posted + stock
    } catch (e) {
      // rollback the stage claim so admin can retry
      await this.prisma.client.supply.updateMany({
        where: { id, accountId },
        data: { approvalStage: 'awaiting_admin' },
      });
      throw e;
    }
    await this.logEvent(accountId, id, 'awaiting_admin', 'completed', 'admin_ok', 'admin', userId);
    return this.getApproval(accountId, id);
  }

  /** Omborchi/admin ERP'dan rad etadi — joriy bosqichdan oldingisiga, sabab bilan. */
  async reject(
    accountId: string,
    userId: string,
    id: string,
    raw: unknown,
    actorType: ActorType = 'omborchi',
  ) {
    const dto = RejectSchema.parse(raw);
    const s = await this.prisma.client.supply.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { approvalStage: true },
    });
    if (!s) throw new NotFoundException('Qabul topilmadi');
    const from = s.approvalStage as ApprovalStage;
    const to = rejectTarget(from);
    await this.claim(accountId, id, from, to);
    await this.logEvent(accountId, id, from, to, 'reject', actorType, userId, dto.reason);
    return this.getApproval(accountId, id);
  }

  /** Faza B (Telegram callback) chaqiradi — taminotchi tasdiq/rad. */
  async applySupplierDecision(accountId: string, id: string, approve: boolean, reason?: string) {
    if (approve) {
      await this.claim(accountId, id, 'awaiting_supplier', 'delivering');
      await this.logEvent(
        accountId,
        id,
        'awaiting_supplier',
        'delivering',
        'supplier_ok',
        'supplier',
        null,
      );
    } else {
      await this.claim(accountId, id, 'awaiting_supplier', 'none');
      await this.logEvent(
        accountId,
        id,
        'awaiting_supplier',
        'none',
        'reject',
        'supplier',
        null,
        reason,
      );
    }
    return this.getApproval(accountId, id);
  }
}

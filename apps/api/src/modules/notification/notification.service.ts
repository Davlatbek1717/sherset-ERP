import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { readEmployeeSystemAttrs } from '../hr/hr-employee/hr-employee.service.js';
import { isEmailDeliveryAllowed, isWebDeliveryAllowed } from './notification-settings-filter.js';
import { NotificationGateway } from './notification.gateway.js';
import {
  type MarkReadInput,
  MarkReadSchema,
  NotificationFilterSchema,
  type NotificationKindValue,
} from './notification.schema.js';

@Injectable()
export class NotificationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationGateway) private readonly gateway: NotificationGateway,
  ) {}

  async list(accountId: string, recipientId: string, rawFilter: unknown) {
    const filter = NotificationFilterSchema.parse(rawFilter);
    const rows = await this.prisma.client.notification.findMany({
      where: {
        accountId,
        recipientId,
        ...(filter.unreadOnly ? { readAt: null } : {}),
        ...(filter.kind ? { kind: filter.kind } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

    const total = await this.prisma.client.notification.count({
      where: { accountId, recipientId },
    });
    const unreadCount = await this.prisma.client.notification.count({
      where: { accountId, recipientId, readAt: null },
    });

    return { items, nextCursor, total, unreadCount };
  }

  async markRead(accountId: string, recipientId: string, raw: unknown) {
    const parsed = this.parseMarkRead(raw);
    const result = await this.prisma.client.notification.updateMany({
      where: {
        accountId,
        recipientId,
        id: { in: parsed.ids },
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { ok: true, updated: result.count };
  }

  async markAllRead(accountId: string, recipientId: string) {
    const result = await this.prisma.client.notification.updateMany({
      where: { accountId, recipientId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, updated: result.count };
  }

  /**
   * Internal helper — call from other services to create a notification.
   * Non-blocking: errors are swallowed so notification failures never
   * break the caller's flow.
   */
  async emit(
    accountId: string,
    recipientId: string,
    kind: NotificationKindValue,
    title: string,
    body?: string | null,
    entity?: string | null,
    entityId?: string | null,
  ): Promise<void> {
    try {
      // moysklad employee card «Уведомления»: honour the recipient's matrix.
      // The channels are INDEPENDENT — Веб-интерфейс (this bell/SSE funnel)
      // and Почта (EmailLog queue) each consult their own checkbox.
      const recipient = await this.prisma.client.employee.findFirst({
        where: { id: recipientId, accountId },
        select: { attributes: true, email: true },
      });
      const sys = recipient ? readEmployeeSystemAttrs(recipient.attributes) : {};
      const webAllowed = !recipient || isWebDeliveryAllowed(sys, kind);
      const emailAllowed = !!recipient && isEmailDeliveryAllowed(sys, kind);

      if (emailAllowed && recipient) {
        await this.enqueueEmail(
          accountId,
          recipientId,
          recipient.email,
          title,
          body,
          entity,
          entityId,
        );
      }
      if (!webAllowed) return;
      const row = await this.prisma.client.notification.create({
        data: {
          accountId,
          recipientId,
          kind,
          title,
          body: body ?? null,
          entity: entity ?? null,
          entityId: entityId ?? null,
        },
      });
      // Realtime fan-out — subscribers get the event via SSE so the bell
      // badge updates without polling. Best-effort: failures here must not
      // break the caller's flow.
      this.gateway.publish({
        id: row.id,
        accountId: row.accountId,
        recipientId: row.recipientId,
        kind: row.kind,
        title: row.title,
        body: row.body,
        entity: row.entity,
        entityId: row.entityId,
        createdAt: row.createdAt.toISOString(),
      });
    } catch {
      // Notification failures must never break the caller's transaction
    }
  }

  /**
   * «Почта» channel: enqueue the notification onto the EmailLog queue (the
   * 30s EmailDeliveryService cron performs the SMTP send + retries).
   * Best-effort and quiet by design: no SMTP config or a placeholder e-mail
   * (auto-generated @hr.local) simply skips — a notification e-mail must
   * never break or delay the emitting flow. Direct emailLog.create instead
   * of EmailService.send(): that path also flips the document «Отправлен»
   * flag, which is wrong for a notification.
   */
  private async enqueueEmail(
    accountId: string,
    recipientId: string,
    toEmail: string,
    title: string,
    body?: string | null,
    entity?: string | null,
    entityId?: string | null,
  ): Promise<void> {
    try {
      if (!toEmail || toEmail.endsWith('@hr.local')) return;
      const cfg = await this.prisma.client.emailConfig.findFirst({
        where: { accountId },
        select: { id: true },
      });
      if (!cfg) return;
      const esc = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      await this.prisma.client.emailLog.create({
        data: {
          accountId,
          senderId: recipientId,
          entity: entity ?? null,
          entityId: entityId ?? null,
          toAddresses: [toEmail],
          ccAddresses: [],
          subject: title,
          bodyHtml: `<p>${esc(body ?? title)}</p>`,
          attachmentIds: [],
          status: 'pending',
          attempt: 1,
          maxAttempts: 4,
          nextRetryAt: new Date(),
        },
      });
    } catch {
      // best-effort — the notification itself already went out (or will)
    }
  }

  async delete(accountId: string, recipientId: string, id: string) {
    const row = await this.prisma.client.notification.findFirst({
      where: { id, accountId, recipientId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException(`Notification ${id} not found`);
    await this.prisma.client.notification.delete({ where: { id } });
    return { ok: true };
  }

  private parseMarkRead(raw: unknown): MarkReadInput {
    const r = MarkReadSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}

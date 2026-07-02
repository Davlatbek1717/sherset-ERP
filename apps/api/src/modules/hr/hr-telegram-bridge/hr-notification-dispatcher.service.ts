import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type {
  HrNotificationDocType,
  HrNotificationEventType,
} from '../hr-notification-template/hr-notification-template.schema.js';
import { HrNotificationTemplateService } from '../hr-notification-template/hr-notification-template.service.js';
import { normalizeTelegramPhone } from '../hr-shared/phone-normalize.util.js';
import {
  type NotificationRenderContext,
  formatMinor,
  renderNotificationTemplate,
} from './template-render.util.js';

/**
 * Shared notification pipeline used by the per-document listeners
 * (listeners/*.listener.ts). One place owns:
 *   1. active-template lookup for (account, docType, eventType) — no template
 *      ⇒ silent skip (admin hasn't opted in).
 *   2. counterparty Telegram destination resolve (phone → canonical +998…).
 *   3. Eta render (errors logged, never propagated — a broken template must
 *      not block the source document).
 *   4. HrTelegramOutbox enqueue (the outbox worker picks it up next tick).
 *
 * All failures are swallowed by design — listeners run out-of-band of the
 * source request, so throwing would only surface in logs anyway.
 */
@Injectable()
export class HrNotificationDispatcher {
  private readonly logger = new Logger(HrNotificationDispatcher.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(HrNotificationTemplateService)
    private readonly templates: HrNotificationTemplateService,
  ) {}

  async dispatch(args: {
    accountId: string;
    counterpartyId: string;
    docType: HrNotificationDocType;
    eventType: HrNotificationEventType;
    sourceDocId: string;
    buildContext: (base: NotificationRenderContext) => NotificationRenderContext;
  }): Promise<void> {
    try {
      const template = await this.templates.findActive(
        args.accountId,
        args.docType,
        args.eventType,
      );
      if (!template) return; // no template configured → admin-opt-in not set

      const counterparty = await this.prisma.client.counterparty.findFirst({
        where: { id: args.counterpartyId, accountId: args.accountId },
        select: { id: true, name: true, phone: true },
      });
      if (!counterparty) {
        this.logger.debug(
          `Counterparty ${args.counterpartyId} not found for ${args.docType}.${args.eventType}`,
        );
        return;
      }
      const normalizedPhone = safeNormalize(counterparty.phone);
      if (!normalizedPhone) {
        this.logger.debug(
          `Counterparty ${args.counterpartyId} has no Telegram phone — skip notification`,
        );
        return;
      }

      const balance = await this.lookupBalance(args.accountId, args.counterpartyId);

      const ctx = args.buildContext({
        counterparty: { name: counterparty.name, phone: normalizedPhone },
        balance: { formatted: balance },
      });

      let rendered: string;
      try {
        rendered = renderNotificationTemplate(template.templateText, ctx);
      } catch (e) {
        this.logger.error(
          `Template render failed (${args.docType}.${args.eventType}): ${(e as Error).message}`,
        );
        return;
      }

      await this.prisma.client.hrTelegramOutbox.create({
        data: {
          accountId: args.accountId,
          counterpartyId: counterparty.id,
          toPhone: normalizedPhone,
          messageText: rendered,
          status: 'pending',
          sourceEventType: `${args.docType}.${args.eventType}`,
          sourceDocId: args.sourceDocId,
        },
      });
    } catch (e) {
      // Final safety net — listener errors must never propagate to the
      // upstream service (the doc post operation has already succeeded).
      this.logger.error(
        `Notification dispatch failed (${args.docType}.${args.eventType}): ${(e as Error).message}`,
      );
    }
  }

  /**
   * Returns the formatted UZS balance for `counterpartyId`, or "—" when no
   * row exists or the lookup fails. We don't currency-mix yet — single UZS.
   */
  private async lookupBalance(accountId: string, counterpartyId: string): Promise<string> {
    try {
      const row = await this.prisma.client.counterpartyBalance.findFirst({
        where: { accountId, counterpartyId },
        orderBy: { updatedAt: 'desc' },
        select: { balanceMinor: true },
      });
      return formatMinor(row?.balanceMinor ?? null);
    } catch {
      return '—';
    }
  }
}

function safeNormalize(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return normalizeTelegramPhone(raw);
  } catch {
    return null;
  }
}

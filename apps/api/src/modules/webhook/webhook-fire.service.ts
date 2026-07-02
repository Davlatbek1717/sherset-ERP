import type { Prisma } from '@moysklad/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { WebhookService } from './webhook.service.js';

/**
 * Webhook event enqueuer.
 *
 * Caller pattern (in entity services):
 *   this.webhookFire.fireForEvent(accountId, 'customerorder', 'CREATE', id);
 *
 * Looks up active subscriptions for the (accountId, entityType, action)
 * triple and writes one WebhookDelivery row per subscription. The actual
 * HTTP POST is performed by WebhookDeliveryService running on a 30-second
 * cron. Delivery survives process restarts (rows persist in Postgres).
 *
 * Never throws — silently logs failures so entity mutations are never
 * blocked by webhook subsystem issues.
 */
@Injectable()
export class WebhookFireService {
  private readonly logger = new Logger(WebhookFireService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WebhookService) private readonly webhookService: WebhookService,
  ) {}

  /** Enqueue webhook deliveries for an entity event. Returns immediately. */
  fireForEvent(
    accountId: string,
    entityType: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    entityId: string,
    updatedFields?: string[],
  ): void {
    void this.enqueue(accountId, entityType, action, entityId, updatedFields);
  }

  private async enqueue(
    accountId: string,
    entityType: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    entityId: string,
    updatedFields: string[] | undefined,
  ): Promise<void> {
    try {
      const webhooks = await this.webhookService.findActiveForEvent(accountId, entityType, action);
      if (webhooks.length === 0) return;

      const payload = this.buildPayload(accountId, entityType, action, entityId, updatedFields);
      const now = new Date();

      await this.prisma.client.webhookDelivery.createMany({
        data: webhooks.map((w) => ({
          accountId,
          webhookId: w.id,
          payload: payload as Prisma.InputJsonValue,
          status: 'pending',
          attempt: 1,
          maxAttempts: 6,
          nextRetryAt: now,
        })),
      });
    } catch (err) {
      this.logger.warn(
        `Webhook enqueue failed for ${entityType}/${action} ${entityId}: ${String(err)}`,
      );
    }
  }

  /**
   * Builds a moysklad-compatible event payload. Single event per delivery
   * (events[] always has length 1) — mirrors moysklad's API shape so
   * consumers iterate events[] uniformly.
   */
  private buildPayload(
    accountId: string,
    entityType: string,
    action: string,
    entityId: string,
    updatedFields: string[] | undefined,
  ): object {
    const href = `/api/remap/1.2/entity/${entityType}/${entityId}`;
    return {
      events: [
        {
          meta: { type: entityType, href },
          action,
          accountId,
          updatedFields: updatedFields ?? null,
          additionalInfo: null,
        },
      ],
      auditContext: { meta: { type: 'audit' }, moment: new Date().toISOString() },
    };
  }
}

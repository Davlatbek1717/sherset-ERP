import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { type CustomerOrderCreatedEvent, HR_EVENT } from '../../hr-shared/hr-events.types.js';
import { HrNotificationDispatcher } from '../hr-notification-dispatcher.service.js';
import { formatMinor } from '../template-render.util.js';

/** customerOrder.created → Telegram notification. */
@Injectable()
export class HrCustomerOrderListener {
  constructor(
    @Inject(HrNotificationDispatcher) private readonly dispatcher: HrNotificationDispatcher,
  ) {}

  @OnEvent(HR_EVENT.CUSTOMER_ORDER_CREATED, { async: true, promisify: true })
  async onCustomerOrderCreated(payload: CustomerOrderCreatedEvent): Promise<void> {
    await this.dispatcher.dispatch({
      accountId: payload.accountId,
      counterpartyId: payload.counterpartyId,
      docType: 'customer_order',
      eventType: 'created',
      sourceDocId: payload.customerOrderId,
      buildContext: (ctx) => ({
        ...ctx,
        order: { totalFormatted: formatMinor(payload.totalMinor) },
      }),
    });
  }
}

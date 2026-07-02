import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { HR_EVENT, type PaymentInPostedEvent } from '../../hr-shared/hr-events.types.js';
import { HrNotificationDispatcher } from '../hr-notification-dispatcher.service.js';
import { formatMinor } from '../template-render.util.js';

/** paymentIn.posted → Telegram notification. */
@Injectable()
export class HrPaymentInListener {
  constructor(
    @Inject(HrNotificationDispatcher) private readonly dispatcher: HrNotificationDispatcher,
  ) {}

  @OnEvent(HR_EVENT.PAYMENT_IN_POSTED, { async: true, promisify: true })
  async onPaymentInPosted(payload: PaymentInPostedEvent): Promise<void> {
    await this.dispatcher.dispatch({
      accountId: payload.accountId,
      counterpartyId: payload.counterpartyId,
      docType: 'payment_in',
      eventType: 'posted',
      sourceDocId: payload.paymentInId,
      buildContext: (ctx) => ({
        ...ctx,
        payment: { sumFormatted: formatMinor(payload.sumMinor) },
      }),
    });
  }
}

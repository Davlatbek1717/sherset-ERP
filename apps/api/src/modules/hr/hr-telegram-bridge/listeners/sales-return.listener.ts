import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { HR_EVENT, type SalesReturnPostedEvent } from '../../hr-shared/hr-events.types.js';
import { HrNotificationDispatcher } from '../hr-notification-dispatcher.service.js';
import { formatMinor } from '../template-render.util.js';

/** salesReturn.posted → Telegram notification. */
@Injectable()
export class HrSalesReturnListener {
  constructor(
    @Inject(HrNotificationDispatcher) private readonly dispatcher: HrNotificationDispatcher,
  ) {}

  @OnEvent(HR_EVENT.SALES_RETURN_POSTED, { async: true, promisify: true })
  async onSalesReturnPosted(payload: SalesReturnPostedEvent): Promise<void> {
    await this.dispatcher.dispatch({
      accountId: payload.accountId,
      counterpartyId: payload.counterpartyId,
      docType: 'sales_return',
      eventType: 'posted',
      sourceDocId: payload.salesReturnId,
      buildContext: (ctx) => ({
        ...ctx,
        returnDoc: { totalFormatted: formatMinor(payload.totalMinor) },
      }),
    });
  }
}

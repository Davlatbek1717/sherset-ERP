import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { HR_EVENT, type SupplyPostedEvent } from '../../hr-shared/hr-events.types.js';
import { HrNotificationDispatcher } from '../hr-notification-dispatcher.service.js';
import { formatMinor } from '../template-render.util.js';

/** supply.posted → Telegram notification. */
@Injectable()
export class HrSupplyListener {
  constructor(
    @Inject(HrNotificationDispatcher) private readonly dispatcher: HrNotificationDispatcher,
  ) {}

  @OnEvent(HR_EVENT.SUPPLY_POSTED, { async: true, promisify: true })
  async onSupplyPosted(payload: SupplyPostedEvent): Promise<void> {
    await this.dispatcher.dispatch({
      accountId: payload.accountId,
      counterpartyId: payload.counterpartyId,
      docType: 'supply',
      eventType: 'posted',
      sourceDocId: payload.supplyId,
      buildContext: (ctx) => ({
        ...ctx,
        supply: { totalFormatted: formatMinor(payload.totalMinor) },
      }),
    });
  }
}

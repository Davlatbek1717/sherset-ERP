import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { type DemandPostedEvent, HR_EVENT } from '../../hr-shared/hr-events.types.js';
import { HrNotificationDispatcher } from '../hr-notification-dispatcher.service.js';
import { formatMinor } from '../template-render.util.js';

/** demand.posted → Telegram notification (см. HrNotificationDispatcher). */
@Injectable()
export class HrDemandListener {
  constructor(
    @Inject(HrNotificationDispatcher) private readonly dispatcher: HrNotificationDispatcher,
  ) {}

  @OnEvent(HR_EVENT.DEMAND_POSTED, { async: true, promisify: true })
  async onDemandPosted(payload: DemandPostedEvent): Promise<void> {
    await this.dispatcher.dispatch({
      accountId: payload.accountId,
      counterpartyId: payload.counterpartyId,
      docType: 'demand',
      eventType: 'posted',
      sourceDocId: payload.demandId,
      buildContext: (ctx) => ({
        ...ctx,
        demand: { totalFormatted: formatMinor(payload.totalMinor) },
      }),
    });
  }
}

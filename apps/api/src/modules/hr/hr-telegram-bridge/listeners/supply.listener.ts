import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { HR_EVENT, type SupplyPostedEvent } from '../../hr-shared/hr-events.types.js';
import { HR_TZ } from '../../hr-shared/tz.util.js';
import { HrNotificationDispatcher } from '../hr-notification-dispatcher.service.js';
import { buildSupplyReceipt, formatMinor } from '../template-render.util.js';

/** Format a Date as «DD.MM.YYYY» in the account's local (Tashkent) timezone. */
function formatLocalDate(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: HR_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
    .format(d)
    .replace(/\//g, '.');
}

/**
 * supply.posted → Telegram: two messages to the supplier counterparty —
 *   1. short «qabul qilib olindi» confirmation (admin's editable template);
 *   2. the itemized «qabul cheki» receipt (code-generated, always consistent).
 * Both only fire when an active supply/posted template exists (opt-in) and the
 * counterparty has a Telegram phone — the dispatcher enforces both.
 */
@Injectable()
export class HrSupplyListener {
  constructor(
    @Inject(HrNotificationDispatcher) private readonly dispatcher: HrNotificationDispatcher,
  ) {}

  @OnEvent(HR_EVENT.SUPPLY_POSTED, { async: true, promisify: true })
  async onSupplyPosted(payload: SupplyPostedEvent): Promise<void> {
    const items = payload.items.map((it) => ({
      name: it.name,
      quantity: it.quantity,
      uom: it.uom,
      priceFormatted: formatMinor(it.priceMinor),
      sumFormatted: formatMinor(it.lineSumMinor),
    }));

    await this.dispatcher.dispatch({
      accountId: payload.accountId,
      counterpartyId: payload.counterpartyId,
      docType: 'supply',
      eventType: 'posted',
      sourceDocId: payload.supplyId,
      buildContext: (ctx) => ({
        ...ctx,
        supply: {
          number: payload.supplyNumber,
          totalFormatted: formatMinor(payload.totalMinor),
          dateFormatted: formatLocalDate(payload.postedAt),
          items,
        },
      }),
      // Second message: the itemized receipt, rendered from the resolved context
      // (so it carries the counterparty name + the same formatted lines).
      buildExtraMessages: (ctx) => [buildSupplyReceipt(ctx)],
    });
  }
}

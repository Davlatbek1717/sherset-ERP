import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AttachmentModule } from '../../attachment/attachment.module.js';
import { TelegramModule } from '../../telegram/telegram.module.js';
import { TelegramService } from '../../telegram/telegram.service.js';
import { HrNotificationTemplateModule } from '../hr-notification-template/hr-notification-template.module.js';
import { HrTelegramAccountModule } from '../hr-telegram-account/hr-telegram-account.module.js';
import { HrTelegramEntityCacheService } from './entity-cache.service.js';
import { HrAdminNotifier } from './hr-admin-notifier.service.js';
import { HrNotificationDispatcher } from './hr-notification-dispatcher.service.js';
import { HrTelegramClientModule } from './hr-telegram-client.module.js';
import { HrTelegramOutboxWorker } from './hr-telegram-outbox-worker.service.js';
import { HrCustomerOrderListener } from './listeners/customer-order.listener.js';
import { HrDemandListener } from './listeners/demand.listener.js';
import { HrPaymentInListener } from './listeners/payment-in.listener.js';
import { HrSalesReturnListener } from './listeners/sales-return.listener.js';
import { HrSupplyListener } from './listeners/supply.listener.js';
import { MTPROTO_ADAPTER, type MtprotoAdapter, NoopMtprotoAdapter } from './mtproto-adapter.js';
import { MTPROTO_INBOUND_HANDLER } from './mtproto-inbound-handler.js';
import { MtprotoWorkerService } from './mtproto-worker.service.js';
import { TelegramBackfillWorkerService } from './telegram-backfill-worker.service.js';

/**
 * Bridge module. Switches between the real gramjs adapter and a no-op
 * adapter via `HR_TELEGRAM_DISABLED` env so CI / unconfigured environments
 * can still boot the API without Telegram credentials. The TELEGRAM_CLIENT_FACTORY
 * binding (always Gramjs) lives in HrTelegramClientModule so the account
 * module's login wizard can still attempt OTP even when the SEND path is
 * disabled — admin can wire credentials first, then flip the flag.
 *
 * Pool:
 *   • MTPROTO_ADAPTER → MtprotoWorkerService (default)
 *                       OR NoopMtprotoAdapter (when HR_TELEGRAM_DISABLED='1' / 'true')
 *   • HrTelegramOutboxWorker — @Cron('*\/5 * * * * *')
 *   • HrTelegramEntityCacheService — used by Gramjs adapter for peer cache
 */
function isTelegramDisabled(): boolean {
  const flag = process.env.HR_TELEGRAM_DISABLED;
  return flag === '1' || flag === 'true';
}

@Module({
  imports: [
    // EventEmitterModule.forRoot() is registered globally in app.module.ts —
    // adding it here would create a second emitter instance (silent split-brain).
    ScheduleModule.forRoot(),
    PrismaModule,
    HrTelegramClientModule,
    HrTelegramAccountModule,
    HrNotificationTemplateModule,
    // MTPROTO_INBOUND_HANDLER binds to TelegramService.handleIncoming — no
    // cycle: TelegramModule's own imports (Auth/Attachment/HrTelegramClient/
    // HrTelegramAccount) never import HrTelegramBridgeModule back.
    TelegramModule,
    // AttachmentModule — backfill worker media'ni (chek/rasm) Attachment'ga
    // yuklab oladi (TelegramModule AttachmentService'ni re-export qilmaydi).
    AttachmentModule,
  ],
  providers: [
    HrTelegramEntityCacheService,
    MtprotoWorkerService,
    NoopMtprotoAdapter,
    {
      provide: MTPROTO_ADAPTER,
      useFactory: (gramjs: MtprotoWorkerService, noop: NoopMtprotoAdapter): MtprotoAdapter =>
        isTelegramDisabled() ? noop : gramjs,
      inject: [MtprotoWorkerService, NoopMtprotoAdapter],
    },
    { provide: MTPROTO_INBOUND_HANDLER, useExisting: TelegramService },
    HrTelegramOutboxWorker,
    TelegramBackfillWorkerService,
    HrAdminNotifier,
    HrNotificationDispatcher,
    HrDemandListener,
    HrPaymentInListener,
    HrCustomerOrderListener,
    HrSupplyListener,
    HrSalesReturnListener,
  ],
  exports: [MTPROTO_ADAPTER, HrTelegramOutboxWorker, HrTelegramEntityCacheService],
})
export class HrTelegramBridgeModule {}

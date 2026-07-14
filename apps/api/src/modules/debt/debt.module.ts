import { Module } from '@nestjs/common';
import { AttachmentModule } from '../attachment/attachment.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartyBalanceModule } from '../counterparty-balance/counterparty-balance.module.js';
import { NotificationModule } from '../notification/notification.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { TelegramModule } from '../telegram/telegram.module.js';
import { DebtReminderService } from './debt-reminder.service.js';
import { DebtController } from './debt.controller.js';
import { DebtService } from './debt.service.js';

/**
 * «Qarz undirish» moduli (TZ v2) — call-markaz + kassa.
 *
 * AttachmentModule — §3.7 chek screenshot'i mavjud polimorf `attachments`
 * jadvalida saqlanadi (yangi blob-store ochilmaydi).
 * PermissionsModule — §6 rol matritsasi (kassir ≠ operator) serverda kuchga kiradi.
 */
@Module({
  imports: [
    AuthModule,
    AttachmentModule,
    PermissionsModule,
    PrintTemplateModule,
    // Qo'ng'iroq-eslatma cron'i bildirishnoma yuboradi (2026-07-12).
    NotificationModule,
    // Qarz to'lovi kontragent balansini ham kamaytiradi (2026-07-13).
    CounterpartyBalanceModule,
    // Mijozga Telegram xabari: qarz berildi / to'lov qabul qilindi / yopildi.
    TelegramModule,
  ],
  controllers: [DebtController],
  providers: [DebtService, DebtReminderService],
  exports: [DebtService],
})
export class DebtModule {}

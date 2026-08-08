import { Module } from '@nestjs/common';
import { AttachmentModule } from '../attachment/attachment.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartyBalanceModule } from '../counterparty-balance/counterparty-balance.module.js';
import { MoneyModule } from '../money/money.module.js';
import { NotificationModule } from '../notification/notification.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { SmsModule } from '../sms/sms.module.js';
import { TelegramModule } from '../telegram/telegram.module.js';
import { DebtReminderService } from './debt-reminder.service.js';
import { DebtController } from './debt.controller.js';
import { DebtService } from './debt.service.js';
import { PosDebtPaymentService } from './pos-debt-payment.service.js';

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
    // Naqd qarz to'lovi kassa qoldig'iga ham tushadi (Faza 11, `M-05`).
    MoneyModule,
    // Mijozga Telegram xabari: qarz berildi / to'lov qabul qilindi / yopildi.
    TelegramModule,
    // Ommaviy SMS eslatmasi (2026-07-20): SmsService + SmsTemplateService.
    SmsModule,
  ],
  controllers: [DebtController],
  providers: [DebtService, DebtReminderService, PosDebtPaymentService],
  exports: [DebtService, PosDebtPaymentService],
})
export class DebtModule {}

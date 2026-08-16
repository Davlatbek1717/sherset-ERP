import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartyStatementModule } from '../counterparty-statement/counterparty-statement.module.js';
import { CounterpartyDebtNotifier } from './counterparty-debt-notifier.service.js';
import { DebtReceiptController } from './debt-receipt.controller.js';
import { DebtReceiptService } from './debt-receipt.service.js';

/**
 * Owner counterparty debt/payment Telegram notifier. EventEmitter2 is global
 * (EventEmitterModule.forRoot() in app.module.ts) — do NOT re-register it here
 * (would split-brain the emitter). Just provide the @OnEvent listener.
 *
 * 2026-08-16 — «hisob-kitob cheki» (mijoz kartasidan qo'lda yuborish) shu
 * modulga qo'shildi: u AYNI so'z boyligi va AYNI navbat bilan ishlaydi.
 * `AuthModule` — `JwtAuthGuard`/ruxsat qo'riqchisi uchun `TokenService`;
 * `CounterpartyStatementModule` — butun tarixni yig'adigan `aggregate`
 * (OSHKORA import: @Global emas, DI faqat runtime'da yiqilardi).
 */
@Module({
  imports: [PrismaModule, AuthModule, CounterpartyStatementModule],
  controllers: [DebtReceiptController],
  providers: [CounterpartyDebtNotifier, DebtReceiptService],
})
export class CounterpartyDebtNotifyModule {}

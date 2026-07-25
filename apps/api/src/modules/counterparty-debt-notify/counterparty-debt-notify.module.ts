import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CounterpartyDebtNotifier } from './counterparty-debt-notifier.service.js';

/**
 * Owner counterparty debt/payment Telegram notifier. EventEmitter2 is global
 * (EventEmitterModule.forRoot() in app.module.ts) — do NOT re-register it here
 * (would split-brain the emitter). Just provide the @OnEvent listener.
 */
@Module({
  imports: [PrismaModule],
  providers: [CounterpartyDebtNotifier],
})
export class CounterpartyDebtNotifyModule {}

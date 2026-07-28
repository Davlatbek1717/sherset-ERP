import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CounterpartySettlementService } from './counterparty-settlement.service.js';

/**
 * «Kim kimdan qancha qarzdor» — yagona manba. Kontragentga son yuboradigan
 * HAR modul (akt-sverka, qabul-tovarlari, qarz eslatmasi, SMS/Telegram
 * shablonlari) shu servisdan o'qishi kerak, o'zicha qayta hisoblamasin.
 */
@Module({
  imports: [PrismaModule],
  providers: [CounterpartySettlementService],
  exports: [CounterpartySettlementService],
})
export class CounterpartySettlementModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
// Kassa TZ §7.1 — qarzga sotish mijoz balansiga yoziladi.
import { CounterpartyBalanceModule } from '../counterparty-balance/counterparty-balance.module.js';
// §109: LoyaltyModule exports LoyaltyService — injected to accrue/
// reverse points on RetailSale post/refund. loyalty module not edited.
import { LoyaltyModule } from '../loyalty/loyalty.module.js';
import { MoneyModule } from '../money/money.module.js';
// F2: «Отправил кладовщику» pushes a 🔔 to the warehouse keeper.
import { NotificationModule } from '../notification/notification.module.js';
import { StockModule } from '../stock/stock.module.js';
import { RetailSaleController } from './retail-sale.controller.js';
import { RetailSaleService } from './retail-sale.service.js';

@Module({
  imports: [
    AuthModule,
    StockModule,
    MoneyModule,
    LoyaltyModule,
    NotificationModule,
    CounterpartyBalanceModule,
  ],
  controllers: [RetailSaleController],
  providers: [RetailSaleService],
  exports: [RetailSaleService],
})
export class RetailSaleModule {}

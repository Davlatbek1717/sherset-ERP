import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CashierSessionController } from './cashier-session.controller.js';
import { CashierSessionService } from './cashier-session.service.js';
import { ShiftAcceptanceService } from './shift-acceptance.service.js';

/**
 * MK08 — `ShiftAcceptanceService` shu modulda ro'yxatdan o'tadi. Yetim modul
 * = o'lik funksiya (repoda bo'lgan hodisa: `DebtModule` `AppModule` ga
 * ulanmagani uchun prodda 404 bergan); `app-boot.test.ts` buni qo'riqlaydi.
 */
@Module({
  imports: [AuthModule],
  controllers: [CashierSessionController],
  providers: [CashierSessionService, ShiftAcceptanceService],
  exports: [CashierSessionService, ShiftAcceptanceService],
})
export class CashierSessionModule {}

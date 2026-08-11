import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CashierSessionController } from './cashier-session.controller.js';
import { CashierSessionService } from './cashier-session.service.js';
import { ShiftAcceptanceCron } from './shift-acceptance.cron.js';
import { ShiftAcceptanceService } from './shift-acceptance.service.js';

/**
 * MK08 — `ShiftAcceptanceService` shu modulda ro'yxatdan o'tadi. Yetim modul
 * = o'lik funksiya (repoda bo'lgan hodisa: `DebtModule` `AppModule` ga
 * ulanmagani uchun prodda 404 bergan); `app-boot.test.ts` buni qo'riqlaydi.
 *
 * F13 — `ShiftAcceptanceCron` shu yerda provayder bo'ladi. `@Cron` dekoratori
 * FAQAT ro'yxatdan o'tgan provayderda topiladi: sinf yozilgan-u modulga
 * qo'shilmagan bo'lsa, jadval jimgina hech qachon yurmaydi (aynan shu sabab
 * `escalateOverdue` bir faza davomida o'lik turgan edi).
 *
 * `PrismaModule` OSHKORA import qilinadi — u `@Global`, lekin @Global bekor
 * qilinsa DI grafi yiqilib API umuman ko'tarilmaydi (prod 502 klassi).
 * `ScheduleModule` bu yerda QAYTA ro'yxatdan o'tkazilmaydi: `AppModule` da
 * `forRoot()` bilan global ko'tarilgan.
 */
@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [CashierSessionController],
  providers: [CashierSessionService, ShiftAcceptanceService, ShiftAcceptanceCron],
  exports: [CashierSessionService, ShiftAcceptanceService],
})
export class CashierSessionModule {}

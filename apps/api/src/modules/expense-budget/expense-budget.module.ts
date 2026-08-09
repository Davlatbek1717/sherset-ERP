import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { ExpenseBudgetController } from './expense-budget.controller.js';
import { ExpenseBudgetService } from './expense-budget.service.js';

/**
 * MK12 / 4M TZ §8 — xarajat byudjeti (modda × oy, plan/fakt/og'ish).
 *
 * `PermissionsModule` OSHKORA import qilinadi: `RequirePermission` dekoratori
 * `PermissionsGuard` orqali `PermissionsService` ni talab qiladi. `@Global`
 * ga tayanish prod'da «API umuman ko'tarilmaydi» bilan tugagan hodisa bor
 * ([[global-di-injection-unguarded]]).
 *
 * ⚠️ Bu modul `app.module.ts` ga ULANGAN bo'lishi SHART — ulanmagan controller
 * prodda 404 qaytaradi ([[orphan-module-dead-feature]]). `app-boot.test.ts`
 * dagi yetim-modul qo'riqchisi shuni tekshiradi.
 */
@Module({
  imports: [PrismaModule, AuthModule, PermissionsModule],
  controllers: [ExpenseBudgetController],
  providers: [ExpenseBudgetService],
  exports: [ExpenseBudgetService],
})
export class ExpenseBudgetModule {}

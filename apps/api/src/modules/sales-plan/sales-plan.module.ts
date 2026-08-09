import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { HrAuthModule } from '../hr/hr-auth/hr-auth.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { SalesPlanController } from './sales-plan.controller.js';
import { SalesPlanService } from './sales-plan.service.js';

/**
 * MK37 — sotuv rejasi (xodim × oy × plan turi, reja/fakt/sur'at).
 *
 * `PermissionsModule` va `HrAuthModule` OSHKORA import qilinadi:
 * `RequireHrPermission` dekoratori `HrPermissionGuard` orqali ishlaydi va u
 * `PermissionsService` ni talab qiladi. `@Global` ga tayanish prodda «API
 * umuman ko'tarilmaydi» bilan tugagan hodisa bor
 * ([[global-di-injection-unguarded]]).
 *
 * ⚠️ Bu modul `app.module.ts` ga ULANGAN bo'lishi SHART — ulanmagan
 * controller prodda 404 qaytaradi ([[orphan-module-dead-feature]]).
 * `app-boot.test.ts` dagi yetim-modul qo'riqchisi shuni tekshiradi.
 */
@Module({
  imports: [PrismaModule, AuthModule, PermissionsModule, HrAuthModule],
  controllers: [SalesPlanController],
  providers: [SalesPlanService],
  exports: [SalesPlanService],
})
export class SalesPlanModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { PermissionsModule } from '../../permissions/permissions.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { EquipmentService } from './equipment.service.js';
import { HrEquipmentController } from './hr-equipment.controller.js';

/**
 * Jihoz reyestri (MK05) — 4M TZ §6.4/§6.3.
 *
 * `PermissionsModule` OSHKORA import qilinadi: u @Global bo'lsa ham,
 * `HrPermissionGuard` `PermissionsService` ni in'yeksiya qiladi — global'ga
 * tayanish DI grafini jim buzilishga ochiq qoldiradi.
 */
@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule, PermissionsModule],
  controllers: [HrEquipmentController],
  providers: [EquipmentService],
  exports: [EquipmentService],
})
export class HrEquipmentModule {}

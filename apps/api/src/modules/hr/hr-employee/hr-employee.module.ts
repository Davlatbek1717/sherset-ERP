import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { PermissionsModule } from '../../permissions/permissions.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { EmployeeCardService } from './employee-card.service.js';
import { EmployeeTelegramService } from './employee-telegram.service.js';
import { HrEmployeeController } from './hr-employee.controller.js';
import { HrEmployeeService } from './hr-employee.service.js';
import { OffboardingService } from './offboarding.service.js';

@Module({
  // PermissionsModule OSHKORA: u @Global bo'lsa ham, `OffboardingService`
  // `PermissionsService`ni to'g'ridan-to'g'ri in'yeksiya qiladi (AUTH-05) —
  // global'ga tayanish DI grafini jim buzilishga ochiq qoldiradi.
  imports: [PrismaModule, AuthModule, HrAuthModule, PermissionsModule],
  controllers: [HrEmployeeController],
  providers: [HrEmployeeService, EmployeeTelegramService, OffboardingService, EmployeeCardService],
  // EmployeeTelegramService export — telegram moduli `/start bind_` callback'da ishlatadi.
  exports: [HrEmployeeService, EmployeeTelegramService, OffboardingService, EmployeeCardService],
})
export class HrEmployeeModule {}

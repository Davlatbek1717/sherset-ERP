import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { EmployeeTelegramService } from './employee-telegram.service.js';
import { HrEmployeeController } from './hr-employee.controller.js';
import { HrEmployeeService } from './hr-employee.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule],
  controllers: [HrEmployeeController],
  providers: [HrEmployeeService, EmployeeTelegramService],
  // EmployeeTelegramService export — telegram moduli `/start bind_` callback'da ishlatadi.
  exports: [HrEmployeeService, EmployeeTelegramService],
})
export class HrEmployeeModule {}

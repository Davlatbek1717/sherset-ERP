import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrBonusFineModule } from '../hr-bonus-fine/hr-bonus-fine.module.js';
import { HrPayrollService } from './hr-payroll.service.js';
import { HrSalaryController } from './hr-salary.controller.js';
import { HrSalaryService } from './hr-salary.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule, HrBonusFineModule],
  controllers: [HrSalaryController],
  providers: [HrSalaryService, HrPayrollService],
  exports: [HrSalaryService, HrPayrollService],
})
export class HrSalaryModule {}

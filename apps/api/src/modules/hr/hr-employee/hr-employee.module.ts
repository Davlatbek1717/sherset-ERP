import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrEmployeeController } from './hr-employee.controller.js';
import { HrEmployeeService } from './hr-employee.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule],
  controllers: [HrEmployeeController],
  providers: [HrEmployeeService],
  exports: [HrEmployeeService],
})
export class HrEmployeeModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrEmployeePermissionController } from './hr-employee-permission.controller.js';
import { HrEmployeePermissionService } from './hr-employee-permission.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule],
  controllers: [HrEmployeePermissionController],
  providers: [HrEmployeePermissionService],
  exports: [HrEmployeePermissionService],
})
export class HrEmployeePermissionModule {}

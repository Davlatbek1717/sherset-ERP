import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrDepartmentController } from './hr-department.controller.js';
import { HrDepartmentService } from './hr-department.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule],
  controllers: [HrDepartmentController],
  providers: [HrDepartmentService],
  exports: [HrDepartmentService],
})
export class HrDepartmentModule {}

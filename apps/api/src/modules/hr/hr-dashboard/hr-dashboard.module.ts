import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrDashboardController } from './hr-dashboard.controller.js';
import { HrDashboardService } from './hr-dashboard.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule],
  controllers: [HrDashboardController],
  providers: [HrDashboardService],
  exports: [HrDashboardService],
})
export class HrDashboardModule {}

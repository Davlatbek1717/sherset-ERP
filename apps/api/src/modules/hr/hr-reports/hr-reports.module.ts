import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrReportsController } from './hr-reports.controller.js';
import { HrReportsService } from './hr-reports.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule],
  controllers: [HrReportsController],
  providers: [HrReportsService],
  exports: [HrReportsService],
})
export class HrReportsModule {}

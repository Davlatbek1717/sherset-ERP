import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CompanySettingsController } from './company-settings.controller.js';
import { CompanySettingsService } from './company-settings.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CompanySettingsController],
  providers: [CompanySettingsService],
  exports: [CompanySettingsService],
})
export class CompanySettingsModule {}

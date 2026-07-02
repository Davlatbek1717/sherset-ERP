import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UserSettingsController } from './user-settings.controller.js';
import { UserSettingsService } from './user-settings.service.js';

@Module({
  imports: [AuthModule],
  controllers: [UserSettingsController],
  providers: [UserSettingsService],
  exports: [UserSettingsService],
})
export class UserSettingsModule {}

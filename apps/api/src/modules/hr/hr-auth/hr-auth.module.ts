import { Module } from '@nestjs/common';
import { HrPermissionGuard } from './hr-permission.guard.js';

@Module({
  providers: [HrPermissionGuard],
  exports: [HrPermissionGuard],
})
export class HrAuthModule {}

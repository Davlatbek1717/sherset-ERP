import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AppInstallController } from './app-install.controller.js';
import { AppInstallService } from './app-install.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AppInstallController],
  providers: [AppInstallService],
  exports: [AppInstallService],
})
export class AppInstallModule {}

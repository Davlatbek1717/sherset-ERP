import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrTelegramClientModule } from '../hr-telegram-bridge/hr-telegram-client.module.js';
import { HrTelegramAccountController } from './hr-telegram-account.controller.js';
import { HrTelegramAccountService } from './hr-telegram-account.service.js';
import { HrTelegramLoginController } from './hr-telegram-login.controller.js';
import { HrTelegramLoginService } from './hr-telegram-login.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule, HrTelegramClientModule],
  controllers: [HrTelegramAccountController, HrTelegramLoginController],
  providers: [HrTelegramAccountService, HrTelegramLoginService],
  exports: [HrTelegramAccountService, HrTelegramLoginService],
})
export class HrTelegramAccountModule {}

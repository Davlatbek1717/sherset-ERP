import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrNotificationTemplateController } from './hr-notification-template.controller.js';
import { HrNotificationTemplateService } from './hr-notification-template.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule],
  controllers: [HrNotificationTemplateController],
  providers: [HrNotificationTemplateService],
  exports: [HrNotificationTemplateService],
})
export class HrNotificationTemplateModule {}

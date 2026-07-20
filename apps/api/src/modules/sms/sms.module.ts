import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SmsDeliveryService } from './sms-delivery.service.js';
import { MessageTemplateController } from './sms-template.controller.js';
import { MessageTemplateService } from './sms-template.service.js';
import { SmsController } from './sms.controller.js';
import { SmsService } from './sms.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SmsController, MessageTemplateController],
  providers: [SmsService, SmsDeliveryService, MessageTemplateService],
  exports: [SmsService, MessageTemplateService],
})
export class SmsModule {}

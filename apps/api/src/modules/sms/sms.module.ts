import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SmsDeliveryService } from './sms-delivery.service.js';
import { SmsTemplateController } from './sms-template.controller.js';
import { SmsTemplateService } from './sms-template.service.js';
import { SmsController } from './sms.controller.js';
import { SmsService } from './sms.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SmsController, SmsTemplateController],
  providers: [SmsService, SmsDeliveryService, SmsTemplateService],
  exports: [SmsService, SmsTemplateService],
})
export class SmsModule {}

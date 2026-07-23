import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SmsDeliveryService } from './sms-delivery.service.js';
import { SmsController } from './sms.controller.js';
import { SmsService } from './sms.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SmsController],
  providers: [SmsService, SmsDeliveryService],
  exports: [SmsService],
})
export class SmsModule {}

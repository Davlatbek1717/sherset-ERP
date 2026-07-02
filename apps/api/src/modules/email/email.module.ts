import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EmailDeliveryService } from './email-delivery.service.js';
import { EmailController } from './email.controller.js';
import { EmailService } from './email.service.js';

@Module({
  imports: [AuthModule],
  controllers: [EmailController],
  providers: [EmailService, EmailDeliveryService],
  exports: [EmailService],
})
export class EmailModule {}

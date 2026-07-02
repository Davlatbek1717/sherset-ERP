import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { HrAuthModule } from '../hr-auth/hr-auth.module.js';
import { HrMessagesController } from './hr-messages.controller.js';
import { HrMessagesService } from './hr-messages.service.js';

@Module({
  imports: [PrismaModule, AuthModule, HrAuthModule],
  controllers: [HrMessagesController],
  providers: [HrMessagesService],
  exports: [HrMessagesService],
})
export class HrMessagesModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SalesChannelController } from './sales-channel.controller.js';
import { SalesChannelService } from './sales-channel.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SalesChannelController],
  providers: [SalesChannelService],
  exports: [SalesChannelService],
})
export class SalesChannelModule {}

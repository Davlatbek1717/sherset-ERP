import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MoyskladSyncController } from './moysklad-sync.controller.js';
import { MoyskladSyncService } from './moysklad-sync.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MoyskladSyncController],
  providers: [MoyskladSyncService],
  exports: [MoyskladSyncService],
})
export class MoyskladSyncModule {}

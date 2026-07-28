import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PickListSyncService } from './pick-list-sync.service.js';
import { PickListController } from './pick-list.controller.js';
import { PickListService } from './pick-list.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PickListController],
  providers: [PickListService, PickListSyncService],
  exports: [PickListService],
})
export class PickListModule {}

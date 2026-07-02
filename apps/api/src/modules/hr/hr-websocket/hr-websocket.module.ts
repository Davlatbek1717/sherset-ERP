import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { HrEventsModule } from '../hr-events/hr-events.module.js';
import { HrSyncGateway } from './hr-sync.gateway.js';
import { HrTasksGateway } from './hr-tasks.gateway.js';

@Module({
  imports: [AuthModule, HrEventsModule],
  providers: [HrTasksGateway, HrSyncGateway],
  exports: [HrTasksGateway, HrSyncGateway],
})
export class HrWebsocketModule {}

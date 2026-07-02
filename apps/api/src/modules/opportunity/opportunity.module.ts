import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationModule } from '../notification/notification.module.js';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { OpportunityController } from './opportunity.controller.js';
import { OpportunityService } from './opportunity.service.js';

@Module({
  imports: [AuthModule, PipelineModule, NotificationModule],
  controllers: [OpportunityController],
  providers: [OpportunityService],
  exports: [OpportunityService],
})
export class OpportunityModule {}

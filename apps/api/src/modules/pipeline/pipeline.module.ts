import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PipelineController } from './pipeline.controller.js';
import { PipelineService } from './pipeline.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PipelineController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}

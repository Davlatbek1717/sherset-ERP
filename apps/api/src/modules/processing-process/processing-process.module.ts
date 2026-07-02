import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProcessingProcessController } from './processing-process.controller.js';
import { ProcessingProcessService } from './processing-process.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ProcessingProcessController],
  providers: [ProcessingProcessService],
  exports: [ProcessingProcessService],
})
export class ProcessingProcessModule {}

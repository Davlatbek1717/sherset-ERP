import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CallController } from './call.controller.js';
import { CallService } from './call.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CallController],
  providers: [CallService],
  exports: [CallService],
})
export class CallModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TrackingCodeController } from './tracking-code.controller.js';
import { TrackingCodeService } from './tracking-code.service.js';

@Module({
  imports: [AuthModule],
  controllers: [TrackingCodeController],
  providers: [TrackingCodeService],
  exports: [TrackingCodeService],
})
export class TrackingCodeModule {}

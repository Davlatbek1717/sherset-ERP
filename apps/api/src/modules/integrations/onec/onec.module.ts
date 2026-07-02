import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { OneCSyncController } from './onec.controller.js';
import { OneCSyncService } from './onec.service.js';

@Module({
  imports: [AuthModule],
  controllers: [OneCSyncController],
  providers: [OneCSyncService],
  exports: [OneCSyncService],
})
export class OneCSyncModule {}

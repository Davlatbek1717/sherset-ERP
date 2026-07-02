import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MxikController } from './mxik.controller.js';
import { MxikService } from './mxik.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MxikController],
  providers: [MxikService],
  exports: [MxikService],
})
export class MxikModule {}

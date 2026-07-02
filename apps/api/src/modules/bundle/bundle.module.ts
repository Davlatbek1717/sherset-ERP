import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BundleController } from './bundle.controller.js';
import { BundleService } from './bundle.service.js';

@Module({
  imports: [AuthModule],
  controllers: [BundleController],
  providers: [BundleService],
  exports: [BundleService],
})
export class BundleModule {}

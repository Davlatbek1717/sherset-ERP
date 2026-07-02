import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RegionController } from './region.controller.js';
import { RegionService } from './region.service.js';

@Module({
  imports: [AuthModule],
  controllers: [RegionController],
  providers: [RegionService],
  exports: [RegionService],
})
export class RegionModule {}

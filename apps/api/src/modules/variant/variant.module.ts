import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { VariantController } from './variant.controller.js';
import { VariantService } from './variant.service.js';

@Module({
  imports: [AuthModule],
  controllers: [VariantController],
  providers: [VariantService],
  exports: [VariantService],
})
export class VariantModule {}

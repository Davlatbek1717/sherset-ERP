import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UomController } from './uom.controller.js';
import { UomService } from './uom.service.js';

@Module({
  imports: [AuthModule],
  controllers: [UomController],
  providers: [UomService],
  exports: [UomService],
})
export class UomModule {}

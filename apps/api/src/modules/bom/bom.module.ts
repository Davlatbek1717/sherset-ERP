import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BomController } from './bom.controller.js';
import { BomService } from './bom.service.js';

@Module({
  imports: [AuthModule],
  controllers: [BomController],
  providers: [BomService],
  exports: [BomService],
})
export class BomModule {}

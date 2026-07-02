import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PriceTypeController } from './price-type.controller.js';
import { PriceTypeService } from './price-type.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PriceTypeController],
  providers: [PriceTypeService],
  exports: [PriceTypeService],
})
export class PriceTypeModule {}

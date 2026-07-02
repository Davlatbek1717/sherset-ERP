import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StockInTransitService } from './stock-in-transit.service.js';
import { StockController } from './stock.controller.js';
import { StockService } from './stock.service.js';

@Module({
  imports: [AuthModule],
  controllers: [StockController],
  providers: [StockService, StockInTransitService],
  exports: [StockService, StockInTransitService],
})
export class StockModule {}

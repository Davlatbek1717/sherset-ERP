import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StockModule } from '../stock/stock.module.js';
import { ProductAnalogService } from './product-analog.service.js';
import { ProductController } from './product.controller.js';
import { ProductRepository } from './product.repository.js';
import { ProductService } from './product.service.js';

@Module({
  imports: [AuthModule, StockModule],
  controllers: [ProductController],
  providers: [ProductService, ProductRepository, ProductAnalogService],
  exports: [ProductService],
})
export class ProductModule {}

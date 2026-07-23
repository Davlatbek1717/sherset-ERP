import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { StockModule } from '../stock/stock.module.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { ProductAnalogService } from './product-analog.service.js';
import { ProductCellMoveService } from './product-cell-move.service.js';
import { ProductCutService } from './product-cut.service.js';
import { ProductController } from './product.controller.js';
import { ProductRepository } from './product.repository.js';
import { ProductService } from './product.service.js';

@Module({
  imports: [AuthModule, StockModule, PermissionsModule, WebhookModule],
  controllers: [ProductController],
  providers: [
    ProductService,
    ProductRepository,
    ProductAnalogService,
    ProductCutService,
    ProductCellMoveService,
  ],
  exports: [ProductService],
})
export class ProductModule {}

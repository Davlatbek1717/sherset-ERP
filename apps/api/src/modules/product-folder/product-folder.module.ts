import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProductFolderController } from './product-folder.controller.js';
import { ProductFolderService } from './product-folder.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ProductFolderController],
  providers: [ProductFolderService],
  exports: [ProductFolderService],
})
export class ProductFolderModule {}

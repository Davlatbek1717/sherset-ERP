import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ImageController } from './image.controller.js';
import { ImageService } from './image.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ImageController],
  providers: [ImageService],
  exports: [ImageService],
})
export class ImageModule {}

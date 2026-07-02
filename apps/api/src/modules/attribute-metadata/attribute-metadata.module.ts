import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AttributeMetadataController } from './attribute-metadata.controller.js';
import { AttributeMetadataService } from './attribute-metadata.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AttributeMetadataController],
  providers: [AttributeMetadataService],
  exports: [AttributeMetadataService],
})
export class AttributeMetadataModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DocumentLinkController } from './document-link.controller.js';
import { DocumentLinkService } from './document-link.service.js';

@Module({
  imports: [AuthModule],
  controllers: [DocumentLinkController],
  providers: [DocumentLinkService],
  exports: [DocumentLinkService],
})
export class DocumentLinkModule {}

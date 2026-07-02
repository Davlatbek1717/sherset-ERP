import { Module } from '@nestjs/common';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { ServiceRequestController } from './service-request.controller.js';
import { ServiceRequestService } from './service-request.service.js';

@Module({
  imports: [AuthModule, AttributeMetadataModule, WebhookModule, PrintTemplateModule],
  controllers: [ServiceRequestController],
  providers: [ServiceRequestService],
  exports: [ServiceRequestService],
})
export class ServiceDeskModule {}

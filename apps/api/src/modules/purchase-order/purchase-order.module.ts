import { Module, forwardRef } from '@nestjs/common';
import { AttachmentModule } from '../attachment/attachment.module.js';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentOutModule } from '../payment-out/payment-out.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { PurchaseOrderController } from './purchase-order.controller.js';
import { PurchaseOrderService } from './purchase-order.service.js';

@Module({
  // PaymentOut is forward-imported because PaymentOutService.applyPayment
  // calls back into PurchaseOrderService.applyPayment for the cascade —
  // the two modules form a controlled mutual dependency.
  imports: [
    AuthModule,
    AttachmentModule,
    AttributeMetadataModule,
    WebhookModule,
    PrintTemplateModule,
    forwardRef(() => PaymentOutModule),
  ],
  controllers: [PurchaseOrderController],
  providers: [PurchaseOrderService],
  exports: [PurchaseOrderService],
})
export class PurchaseOrderModule {}

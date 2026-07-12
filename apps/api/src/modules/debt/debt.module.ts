import { Module } from '@nestjs/common';
import { AttachmentModule } from '../attachment/attachment.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { DebtController } from './debt.controller.js';
import { DebtService } from './debt.service.js';

/**
 * «Qarz undirish» moduli (TZ v2) — call-markaz + kassa.
 *
 * AttachmentModule — §3.7 chek screenshot'i mavjud polimorf `attachments`
 * jadvalida saqlanadi (yangi blob-store ochilmaydi).
 * PermissionsModule — §6 rol matritsasi (kassir ≠ operator) serverda kuchga kiradi.
 */
@Module({
  imports: [AuthModule, AttachmentModule, PermissionsModule, PrintTemplateModule],
  controllers: [DebtController],
  providers: [DebtService],
  exports: [DebtService],
})
export class DebtModule {}

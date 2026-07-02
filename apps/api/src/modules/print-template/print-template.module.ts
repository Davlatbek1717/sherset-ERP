import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DocPdfService } from './doc-pdf.service.js';
import { DocxRenderService } from './docx-render.service.js';
import { HtmlPdfService } from './html-pdf.service.js';
import { PdfRenderService } from './pdf-render.service.js';
import { PrintTemplateController } from './print-template.controller.js';
import { PrintTemplateService } from './print-template.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PrintTemplateController],
  providers: [
    PrintTemplateService,
    PdfRenderService,
    HtmlPdfService,
    DocPdfService,
    DocxRenderService,
  ],
  exports: [
    PrintTemplateService,
    PdfRenderService,
    HtmlPdfService,
    DocPdfService,
    DocxRenderService,
  ],
})
export class PrintTemplateModule {}

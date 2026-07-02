import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LabelPrintController, LabelTemplateController } from './label.controller.js';
import { LabelService } from './label.service.js';

@Module({
  imports: [AuthModule],
  controllers: [LabelTemplateController, LabelPrintController],
  providers: [LabelService],
  exports: [LabelService],
})
export class LabelModule {}

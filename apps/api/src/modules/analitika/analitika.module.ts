import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AnalysisController } from './analysis.controller.js';
import { AnalysisService } from './analysis.service.js';
import { CountController } from './count.controller.js';
import { CountService } from './count.service.js';
import { CycleController } from './cycle.controller.js';
import { CycleService } from './cycle.service.js';
import { ItemsController } from './items.controller.js';
import { ItemsService } from './items.service.js';
import { OrderController } from './order.controller.js';
import { OrderService } from './order.service.js';
import { ReasonCodeController } from './reason-code.controller.js';
import { ReasonCodeService } from './reason-code.service.js';
import { ReportExportService } from './report-export.service.js';
import { ReportPdfService } from './report-pdf.service.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';
import { VarianceConfigController } from './variance-config.controller.js';
import { VarianceConfigService } from './variance-config.service.js';

@Module({
  imports: [AuthModule],
  controllers: [
    ReasonCodeController,
    VarianceConfigController,
    CountController,
    OrderController,
    AnalysisController,
    ItemsController,
    StaffController,
    CycleController,
  ],
  providers: [
    ReasonCodeService,
    VarianceConfigService,
    CountService,
    OrderService,
    AnalysisService,
    ItemsService,
    StaffService,
    CycleService,
    ReportExportService,
    ReportPdfService,
  ],
  exports: [
    ReasonCodeService,
    VarianceConfigService,
    CountService,
    OrderService,
    AnalysisService,
    ItemsService,
    StaffService,
    CycleService,
    ReportExportService,
    ReportPdfService,
  ],
})
export class AnalitikaModule {}

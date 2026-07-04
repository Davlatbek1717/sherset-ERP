import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StockModule } from '../stock/stock.module.js';
import { AbcAnalysisService } from './abc-analysis.service.js';
import { AgingService } from './aging.service.js';
import { AverageBasketService } from './average-basket.service.js';
import { CashFlowService } from './cash-flow.service.js';
import { CounterpartyBalanceService } from './counterparty-balance.service.js';
import { DashboardService } from './dashboard.service.js';
import { InventoryVarianceService } from './inventory-variance.service.js';
import { PnlService } from './pnl.service.js';
import { ProfitabilityService } from './profitability.service.js';
import { PurchaseManagementService } from './purchase-management.service.js';
import { ReportController } from './report.controller.js';
import { ReportService } from './report.service.js';
import { ReturnsRatioService } from './returns-ratio.service.js';
import { SalesByChannelService } from './sales-by-channel.service.js';
import { SalesByHourService } from './sales-by-hour.service.js';
import { SlowMoversService } from './slow-movers.service.js';
import { StockBalanceService } from './stock-balance.service.js';
import { TurnoverService } from './turnover.service.js';
import { UnitEconomicsService } from './unit-economics.service.js';
import { WarehouseOpsService } from './warehouse-ops.service.js';

@Module({
  imports: [AuthModule, StockModule],
  controllers: [ReportController],
  providers: [
    ReportService,
    CashFlowService,
    StockBalanceService,
    TurnoverService,
    CounterpartyBalanceService,
    PnlService,
    DashboardService,
    AbcAnalysisService,
    AgingService,
    ReturnsRatioService,
    SlowMoversService,
    SalesByChannelService,
    InventoryVarianceService,
    SalesByHourService,
    AverageBasketService,
    ProfitabilityService,
    PurchaseManagementService,
    UnitEconomicsService,
    WarehouseOpsService,
  ],
  exports: [
    ReportService,
    CashFlowService,
    StockBalanceService,
    TurnoverService,
    CounterpartyBalanceService,
    PnlService,
    DashboardService,
    AbcAnalysisService,
    AgingService,
    ReturnsRatioService,
    SlowMoversService,
    SalesByChannelService,
    InventoryVarianceService,
    SalesByHourService,
    AverageBasketService,
    ProfitabilityService,
    PurchaseManagementService,
    UnitEconomicsService,
    WarehouseOpsService,
  ],
})
export class ReportModule {}

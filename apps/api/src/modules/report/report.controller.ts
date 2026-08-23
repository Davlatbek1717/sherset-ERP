import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { AbcAnalysisService } from './abc-analysis.service.js';
import { AgingService } from './aging.service.js';
import { AverageBasketService } from './average-basket.service.js';
import { CashFlowService } from './cash-flow.service.js';
import { CounterpartyActService } from './counterparty-act.service.js';
import { CounterpartyBalanceService } from './counterparty-balance.service.js';
import { DashboardService } from './dashboard.service.js';
import { InventoryVarianceService } from './inventory-variance.service.js';
import { PnlService } from './pnl.service.js';
import { ProfitabilityService } from './profitability.service.js';
import { PurchaseManagementService } from './purchase-management.service.js';
import { ReportService } from './report.service.js';
import { ReturnsRatioService } from './returns-ratio.service.js';
import { SalesByChannelService } from './sales-by-channel.service.js';
import { SalesByHourService } from './sales-by-hour.service.js';
import { SlowMoversService } from './slow-movers.service.js';
import { StockBalanceService } from './stock-balance.service.js';
import { TurnoverService } from './turnover.service.js';
import { UnitEconomicsService } from './unit-economics.service.js';
import { WarehouseOpsService } from './warehouse-ops.service.js';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportController {
  constructor(
    @Inject(ReportService) private readonly sales: ReportService,
    @Inject(CashFlowService) private readonly cashFlow: CashFlowService,
    @Inject(StockBalanceService) private readonly stockBalance: StockBalanceService,
    @Inject(TurnoverService) private readonly turnover: TurnoverService,
    @Inject(CounterpartyBalanceService) private readonly cpBalance: CounterpartyBalanceService,
    @Inject(CounterpartyActService) private readonly cpAct: CounterpartyActService,
    @Inject(PnlService) private readonly pnl: PnlService,
    @Inject(DashboardService) private readonly dashboard: DashboardService,
    @Inject(AbcAnalysisService) private readonly abc: AbcAnalysisService,
    @Inject(AgingService) private readonly aging: AgingService,
    @Inject(ReturnsRatioService) private readonly returns: ReturnsRatioService,
    @Inject(SlowMoversService) private readonly slowMovers: SlowMoversService,
    @Inject(SalesByChannelService) private readonly salesByChannel: SalesByChannelService,
    @Inject(InventoryVarianceService) private readonly variance: InventoryVarianceService,
    @Inject(SalesByHourService) private readonly salesByHour: SalesByHourService,
    @Inject(AverageBasketService) private readonly avgBasket: AverageBasketService,
    @Inject(ProfitabilityService) private readonly profitability: ProfitabilityService,
    @Inject(PurchaseManagementService)
    private readonly purchaseMgmt: PurchaseManagementService,
    @Inject(UnitEconomicsService)
    private readonly unitEcon: UnitEconomicsService,
    @Inject(WarehouseOpsService)
    private readonly warehouseOps: WarehouseOpsService,
  ) {}

  /** Sherset /sotuv zanjiri — qabul→joylashtirish→yig'ish paneli. */
  @Get('warehouse-ops')
  @RequirePermission({ entity: 'report', action: 'view' })
  async warehouseOpsReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.warehouseOps.report(user.accountId, query);
  }

  @Get('unit-economics')
  @RequirePermission({ entity: 'report', action: 'view' })
  async unitEconomicsReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.unitEcon.report(user.accountId, query);
  }

  @Get('profitability')
  @RequirePermission({ entity: 'report', action: 'view' })
  async profitabilityReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.profitability.report(user.accountId, query);
  }

  @Get('purchase-management')
  @RequirePermission({ entity: 'report', action: 'view' })
  async purchaseManagementReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.purchaseMgmt.report(user.accountId, query);
  }

  @Get('sales')
  @RequirePermission({ entity: 'report', action: 'view' })
  async salesReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.sales.salesReport(user.accountId, query);
  }

  /** products/[id] «История» widget — purchases + sales feed for one product. */
  @Get('product-movement')
  @RequirePermission({ entity: 'report', action: 'view' })
  async productMovement(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.sales.productMovement(user.accountId, query);
  }

  @Get('cash-flow')
  @RequirePermission({ entity: 'report', action: 'view' })
  async cashFlowReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.cashFlow.cashFlowReport(user.accountId, query);
  }

  @Get('stock-balance')
  @RequirePermission({ entity: 'report', action: 'view' })
  async stockBalanceReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.stockBalance.stockBalanceReport(user.accountId, query);
  }

  /** F1 — tovar kartasi «Qoldiqlar» tabi: ombor ostida yacheykalar kesimi
   * (prefiks bo'yicha guruhlangan) + «biriktirilmagan» qoldiq. */
  @Get('stock-balance/cells')
  @RequirePermission({ entity: 'report', action: 'view' })
  async stockBalanceCells(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.stockBalance.productCells(user.accountId, query);
  }

  /** Склад → Обороты — stock turnover (opening → income → outcome → closing). */
  @Get('turnover')
  @RequirePermission({ entity: 'report', action: 'view' })
  async turnoverReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.turnover.turnoverReport(user.accountId, query);
  }

  @Get('counterparty-balance')
  @RequirePermission({ entity: 'report', action: 'view' })
  async counterpartyBalanceReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.cpBalance.counterpartyBalanceReport(user.accountId, query);
  }

  /** «Акт сверки взаимных расчётов» — the printable reconciliation act for one
   * organization × counterparty over a period (opening + movements + closing). */
  @Get('counterparty-act')
  @RequirePermission({ entity: 'report', action: 'view' })
  async counterpartyAct(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.cpAct.counterpartyAct(user.accountId, query);
  }

  @Get('pnl')
  @RequirePermission({ entity: 'report', action: 'view' })
  async pnlReport(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.pnl.pnlReport(user.accountId, query);
  }

  @Get('dashboard')
  @RequirePermission({ entity: 'report', action: 'view' })
  async dashboardReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.dashboard.dashboard(user.accountId, user.sub, query);
  }

  /** Sprint 18 — ABC analysis (Pareto by revenue). */
  @Get('abc-analysis')
  @RequirePermission({ entity: 'report', action: 'view' })
  async abcAnalysis(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.abc.report(user.accountId, query);
  }

  /** Sprint 18 — receivables/payables aging by 30/60/90 buckets. */
  @Get('aging')
  @RequirePermission({ entity: 'report', action: 'view' })
  async agingReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.aging.report(user.accountId, query);
  }

  /** Sprint 18 — returns ratio by product or counterparty. */
  @Get('returns-ratio')
  @RequirePermission({ entity: 'report', action: 'view' })
  async returnsRatio(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.returns.report(user.accountId, query);
  }

  /** Sprint 18 — slow-moving inventory (no sale in N days). */
  @Get('slow-movers')
  @RequirePermission({ entity: 'report', action: 'view' })
  async slowMoversReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.slowMovers.report(user.accountId, query);
  }

  /** Sprint 18 — sales by sales-channel breakdown. */
  @Get('sales-by-channel')
  @RequirePermission({ entity: 'report', action: 'view' })
  async salesByChannelReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.salesByChannel.report(user.accountId, query);
  }

  /** Sprint 18 — inventory variance (count gap detection). */
  @Get('inventory-variance')
  @RequirePermission({ entity: 'report', action: 'view' })
  async inventoryVarianceReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.variance.report(user.accountId, query);
  }

  /** Sprint 18 — hour-of-day sales heatmap (24 bins). */
  @Get('sales-by-hour')
  @RequirePermission({ entity: 'report', action: 'view' })
  async salesByHourReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.salesByHour.report(user.accountId, query);
  }

  /** Sprint 18 — average basket size + items-per-order trend. */
  @Get('average-basket')
  @RequirePermission({ entity: 'report', action: 'view' })
  async averageBasketReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.avgBasket.report(user.accountId, query);
  }
}

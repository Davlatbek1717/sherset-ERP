import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health.controller.js';
import { AnalitikaModule } from './modules/analitika/analitika.module.js';
import { AppInstallModule } from './modules/app-install/app-install.module.js';
import { AttachmentModule } from './modules/attachment/attachment.module.js';
import { AttributeMetadataModule } from './modules/attribute-metadata/attribute-metadata.module.js';
import { AuditLogModule } from './modules/audit-log/audit-log.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BankImportModule } from './modules/bank-import/bank-import.module.js';
import { BomModule } from './modules/bom/bom.module.js';
import { BundleModule } from './modules/bundle/bundle.module.js';
import { CallModule } from './modules/call/call.module.js';
import { CashDeskModule } from './modules/cash-desk/cash-desk.module.js';
import { CashInModule } from './modules/cash-in/cash-in.module.js';
import { CashOutModule } from './modules/cash-out/cash-out.module.js';
import { CashierSessionModule } from './modules/cashier-session/cashier-session.module.js';
import { CharacteristicModule } from './modules/characteristic/characteristic.module.js';
import { CommissionReportModule } from './modules/commission-report/commission-report.module.js';
import { CompanySettingsModule } from './modules/company-settings/company-settings.module.js';
import { ConsignmentModule } from './modules/consignment/consignment.module.js';
import { ContactPersonModule } from './modules/contact-person/contact-person.module.js';
import { ContractModule } from './modules/contract/contract.module.js';
import { CounterpartyAdjustmentModule } from './modules/counterparty-adjustment/counterparty-adjustment.module.js';
import { CounterpartyBalanceModule } from './modules/counterparty-balance/counterparty-balance.module.js';
import { CounterpartyDebtNotifyModule } from './modules/counterparty-debt-notify/counterparty-debt-notify.module.js';
import { CounterpartyGroupModule } from './modules/counterparty-group/counterparty-group.module.js';
import { CounterpartyNoteModule } from './modules/counterparty-note/counterparty-note.module.js';
import { CounterpartyStatementModule } from './modules/counterparty-statement/counterparty-statement.module.js';
import { CounterpartyModule } from './modules/counterparty/counterparty.module.js';
import { CountryModule } from './modules/country/country.module.js';
import { CurrencyModule } from './modules/currency/currency.module.js';
import { CustomEntityModule } from './modules/custom-entity/custom-entity.module.js';
import { CustomerOrderModule } from './modules/customer-order/customer-order.module.js';
import { DemandModule } from './modules/demand/demand.module.js';
import { DiscountModule } from './modules/discount/discount.module.js';
import { DocumentLinkModule } from './modules/document-link/document-link.module.js';
import { EdoModule } from './modules/edo/edo.module.js';
import { EmailModule } from './modules/email/email.module.js';
import { EnterModule } from './modules/enter/enter.module.js';
import { ExchangeRateModule } from './modules/exchange-rate/exchange-rate.module.js';
import { ExpenseItemModule } from './modules/expense-item/expense-item.module.js';
import { FactureInModule } from './modules/facture-in/facture-in.module.js';
import { FactureOutModule } from './modules/facture-out/facture-out.module.js';
import { GroupModule } from './modules/group/group.module.js';
import { HelpModule } from './modules/help/help.module.js';
import { HrModule } from './modules/hr/hr.module.js';
import { ImageModule } from './modules/image/image.module.js';
import { BankIntegrationModule } from './modules/integrations/bank/bank.module.js';
import { MarketplaceIntegrationModule } from './modules/integrations/marketplace/marketplace.module.js';
import { OneCSyncModule } from './modules/integrations/onec/onec.module.js';
import { InternalOrderModule } from './modules/internal-order/internal-order.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { InvoiceInModule } from './modules/invoice-in/invoice-in.module.js';
import { InvoiceOutModule } from './modules/invoice-out/invoice-out.module.js';
import { KorzinaModule } from './modules/korzina/korzina.module.js';
import { LabelModule } from './modules/label/label.module.js';
import { LossModule } from './modules/loss/loss.module.js';
import { LoyaltyModule } from './modules/loyalty/loyalty.module.js';
// Menejer bo'limi (4-bo'lim TZ kengaytmasi) — kunlik xodim KPI o'lchov yadrosi.
import { ManagerModule } from './modules/manager/manager.module.js';
import { MarkingModule } from './modules/marking/marking.module.js';
import { MoneyModule } from './modules/money/money.module.js';
import { MoveModule } from './modules/move/move.module.js';
import { MoyskladCompatModule } from './modules/moysklad-compat/moysklad-compat.module.js';
import { MxikModule } from './modules/mxik/mxik.module.js';
import { NotificationModule } from './modules/notification/notification.module.js';
import { OnboardingModule } from './modules/onboarding/onboarding.module.js';
import { OnlineOrderModule } from './modules/online-order/online-order.module.js';
import { OpportunityModule } from './modules/opportunity/opportunity.module.js';
import { OrganizationAccountModule } from './modules/organization-account/organization-account.module.js';
import { OrganizationModule } from './modules/organization/organization.module.js';
import { PaymentGatewayModule } from './modules/payment-gateway/payment-gateway.module.js';
import { PaymentInModule } from './modules/payment-in/payment-in.module.js';
import { PaymentOutModule } from './modules/payment-out/payment-out.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { PayrollModule } from './modules/payroll/payroll.module.js';
import { PermissionsModule } from './modules/permissions/permissions.module.js';
import { PickListModule } from './modules/pick-list/pick-list.module.js';
import { PipelineModule } from './modules/pipeline/pipeline.module.js';
import { PrepaymentReturnModule } from './modules/prepayment-return/prepayment-return.module.js';
import { PrepaymentModule } from './modules/prepayment/prepayment.module.js';
import { PresenceModule } from './modules/presence/presence.module.js';
import { PriceListModule } from './modules/price-list/price-list.module.js';
import { PriceTypeModule } from './modules/price-type/price-type.module.js';
import { PrintTemplateModule } from './modules/print-template/print-template.module.js';
import { ProcessingOrderModule } from './modules/processing-order/processing-order.module.js';
import { ProcessingProcessModule } from './modules/processing-process/processing-process.module.js';
import { ProcessingStageModule } from './modules/processing-stage/processing-stage.module.js';
import { ProcessingModule } from './modules/processing/processing.module.js';
import { ProductFolderModule } from './modules/product-folder/product-folder.module.js';
import { ProductModule } from './modules/product/product.module.js';
import { ProductionModule } from './modules/production/production.module.js';
import { ProjectModule } from './modules/project/project.module.js';
import { PublicationModule } from './modules/publication/publication.module.js';
import { PurchaseOrderModule } from './modules/purchase-order/purchase-order.module.js';
import { PurchaseReturnModule } from './modules/purchase-return/purchase-return.module.js';
import { ReferenceModule } from './modules/reference/reference.module.js';
import { RegionModule } from './modules/region/region.module.js';
import { ReportModule } from './modules/report/report.module.js';
import { RestockTaskModule } from './modules/restock-task/restock-task.module.js';
import { RetailSaleModule } from './modules/retail-sale/retail-sale.module.js';
import { SalesChannelModule } from './modules/sales-channel/sales-channel.module.js';
import { SalesReturnModule } from './modules/sales-return/sales-return.module.js';
import { SavedFilterModule } from './modules/saved-filter/saved-filter.module.js';
import { SerialNumberModule } from './modules/serial-number/serial-number.module.js';
import { ServiceDeskModule } from './modules/service-desk/service-desk.module.js';
import { ShiftScheduleModule } from './modules/shift-schedule/shift-schedule.module.js';
import { SkladKeeperModule } from './modules/sklad-keeper/sklad-keeper.module.js';
import { SmenaModule } from './modules/smena/smena.module.js';
import { SmsModule } from './modules/sms/sms.module.js';
import { StateModule } from './modules/state/state.module.js';
import { StockModule } from './modules/stock/stock.module.js';
import { StoreModule as StoreAdminModule } from './modules/store/store.module.js';
import { SupplyApprovalModule } from './modules/supply-approval/supply-approval.module.js';
import { SupplyModule } from './modules/supply/supply.module.js';
import { TaskTypeModule } from './modules/task-type/task-type.module.js';
import { TaskModule } from './modules/task/task.module.js';
import { TaxRateModule } from './modules/tax-rate/tax-rate.module.js';
import { TelegramModule } from './modules/telegram/telegram.module.js';
import { TrackingCodeModule } from './modules/tracking-code/tracking-code.module.js';
import { UomModule } from './modules/uom/uom.module.js';
import { UserSettingsModule } from './modules/user-settings/user-settings.module.js';
import { VariantModule } from './modules/variant/variant.module.js';
import { WebhookModule } from './modules/webhook/webhook.module.js';
import { WorkOrderModule } from './modules/work-order/work-order.module.js';
import { makePinoModule } from './observability.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),
    makePinoModule(),
    PrismaModule,
    AuthModule,
    PermissionsModule,
    ProductModule,
    ProductFolderModule,
    CounterpartyModule,
    CounterpartyGroupModule,
    GroupModule,
    PresenceModule,
    CustomerOrderModule,
    StockModule,
    DemandModule,
    InvoiceOutModule,
    PaymentInModule,
    PaymentsModule,
    SupplyApprovalModule,
    SupplyModule,
    PurchaseOrderModule,
    InvoiceInModule,
    PaymentOutModule,
    SalesReturnModule,
    PurchaseReturnModule,
    FactureOutModule,
    FactureInModule,
    CommissionReportModule,
    ConsignmentModule,
    MoveModule,
    LossModule,
    EnterModule,
    InventoryModule,
    AuditLogModule,
    MoneyModule,
    CounterpartyBalanceModule,
    CounterpartyStatementModule,
    CounterpartyDebtNotifyModule,
    CounterpartyAdjustmentModule,
    PrepaymentModule,
    PrepaymentReturnModule,
    InternalOrderModule,
    PriceListModule,
    CashInModule,
    CashOutModule,
    BankImportModule,
    PriceTypeModule,
    CharacteristicModule,
    UserSettingsModule,
    VariantModule,
    BundleModule,
    ImageModule,
    ContactPersonModule,
    CallModule,
    CounterpartyNoteModule,
    PipelineModule,
    OpportunityModule,
    TaskModule,
    TaskTypeModule,
    NotificationModule,
    BomModule,
    WorkOrderModule,
    ProcessingOrderModule,
    ProcessingModule,
    ProcessingProcessModule,
    ProcessingStageModule,
    PayrollModule,
    PublicationModule,
    LabelModule,
    PickListModule,
    CashierSessionModule,
    RetailSaleModule,
    SalesChannelModule,
    StateModule,
    ProjectModule,
    ContractModule,
    CountryModule,
    // Smena (POS navbat) — /sotuv sahifasi uchun; climart adoption o'chirgan edi.
    SmenaModule,
    RestockTaskModule,
    SkladKeeperModule,
    ShiftScheduleModule,
    CompanySettingsModule,
    UomModule,
    TaxRateModule,
    ExpenseItemModule,
    CustomEntityModule,
    RegionModule,
    TrackingCodeModule,
    DiscountModule,
    SavedFilterModule,
    SerialNumberModule,
    OnlineOrderModule,
    AppInstallModule,
    AnalitikaModule,
    ExchangeRateModule,
    CurrencyModule,
    MxikModule,
    MoyskladCompatModule,
    AttachmentModule,
    DocumentLinkModule,
    AttributeMetadataModule,
    EmailModule,
    ReportModule,
    OrganizationModule,
    StoreAdminModule,
    CashDeskModule,
    OrganizationAccountModule,
    ReferenceModule,
    WebhookModule,
    ProductionModule,
    ServiceDeskModule,
    PrintTemplateModule,
    HelpModule,
    HrModule,
    ManagerModule,
    OnboardingModule,
    SmsModule,
    EdoModule,
    LoyaltyModule,
    MarkingModule,
    TelegramModule,
    PaymentGatewayModule,
    BankIntegrationModule,
    OneCSyncModule,
    MarketplaceIntegrationModule,
    KorzinaModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

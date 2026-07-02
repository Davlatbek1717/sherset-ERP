/**
 * DB tozalash — admin foydalanuvchi, org, rollar, kassa/ombor sozlamalari qoladi.
 * Barcha sotuvlar, mahsulotlar, kontragentlar, stok, smena tarixi o'chadi.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 DB tozalanmoqda...\n');

  // 1. Retail / POS
  await del('RetailSalePosition');
  await del('RetailSale');
  await del('RetailDrawerCashIn');
  await del('RetailDrawerCashOut');
  await del('CashierSession');

  // 2. Savdo hujjatlari
  await del('DemandPosition');
  await del('Demand');
  await del('SalesReturnPosition');
  await del('SalesReturn');
  await del('CustomerOrderPosition');
  await del('CustomerOrder');
  await del('InvoiceOut', 'invoices_out');
  await del('InvoiceIn', 'invoices_in');
  await del('PrepaymentReturn');
  await del('Prepayment');
  await del('FactureOut');
  await del('FactureIn');

  // 3. Xarid hujjatlari
  await del('SupplyPosition');
  await del('Supply');
  await del('PurchaseOrderPosition');
  await del('PurchaseOrder');
  await del('PurchaseReturnPosition');
  await del('PurchaseReturn');
  await del('EnterPosition');
  await del('Enter');

  // 4. Pul hujjatlari
  await del('CashInOperation');
  await del('CashIn');
  await del('CashOutOperation');
  await del('CashOut');
  await del('PaymentInOperation');
  await del('PaymentIn');
  await del('PaymentOutOperation');
  await del('PaymentOut');
  await del('PaymentGatewayTx');
  await del('BankStatement');
  await del('BankStatementRow');
  await del('CommissionReportIn');
  await del('CommissionReportOut');

  // 5. Ombor
  await del('StockOperation');
  await del('StockReservation');
  await del('Stock');
  await del('RestockTaskLine');
  await del('RestockTask');
  await del('AnalitikaCount');
  await del('AnalitikaOrder');
  await del('AnalitikaOrderLine');

  // 6. Ishlab chiqarish
  await del('ProcessingProduct');
  await del('ProcessingMaterial');
  await del('Processing');
  await del('ProcessingOrder');
  await del('WorkOrder');
  await del('Production');
  await del('BomComponent');
  await del('BillOfMaterials');

  // 7. Kontragentlar (qarzlar, balanslar)
  await del('CounterpartyBalance');
  await del('CounterpartyAdjustment');
  await del('CounterpartyNote');
  await del('CounterpartyAccount');
  await del('ContactPerson');
  await del('Contract');
  await del('BonusOperation');
  await del('Counterparty');
  await del('CounterpartyGroup');

  // 8. Mahsulotlar
  await del('ProductAnalog');
  await del('ProductImage');
  await del('ProductPack');
  await del('Characteristic');
  await del('Variant');
  await del('Consignment');
  await del('TrackingCode');
  await del('Product');
  await del('ProductFolder');

  // 9. HR / xodimlar tarixi (xodimning o'zi qoladi, loglar o'chadi)
  await del('HrActivityLog');
  await del('HrAttendance');
  await del('HrBonusFineLog');
  await del('HrKpiDailyLog');
  await del('HrKpiMonthlyScore');
  await del('HrTaskLog');
  await del('PayrollLine');
  await del('Payroll');

  // 10. Boshqalar
  await del('AuditLog');
  await del('Attachment');
  await del('SavedFilter');
  await del('Task');
  await del('Call');
  await del('DocumentSequence');
  await del('BonusProgram');
  await del('Discount');
  await del('PriceList');
  await del('RetailSalesReturn');
  await del('WebhookDelivery');
  await del('RefreshToken');
  await del('SmsLog');
  await del('EmailLog');
  await del('TelegramOutbox');
  await del('ServiceRequest');
  await del('Opportunity', 'opportunities');

  console.log('\n✅ Tozalash tugadi!');
  console.log('   Qolganlar: Account, Employee (admin), Organization, Smena, Store, CashDesk, Role, PriceType, Uom, Currency');
}

async function del(model: string, _hint?: string) {
  try {
    // @ts-ignore — dynamic model access
    const count = await (prisma[model[0].toLowerCase() + model.slice(1)] as any).deleteMany({});
    console.log(`  ✓ ${model}: ${count.count} ta o'chirildi`);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (msg.includes('does not exist') || msg.includes('Unknown arg')) {
      console.log(`  - ${model}: yo'q (skip)`);
    } else {
      console.log(`  ⚠ ${model}: ${msg.slice(0, 80)}`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

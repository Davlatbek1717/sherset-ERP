/**
 * seed-warehouse-role.ts — «Ombor nazoratchisi» (warehouse supervisor) rolini qo'shadi.
 *
 * Ishga tushirish:
 *   pnpm --filter @moysklad/db exec tsx prisma/seed-warehouse-role.ts
 *
 * Ruxsat siyosati:
 *  - HAMMA entity: view = ALL, print = ALL (ombor nazoratchisi hammasini ko'radi/chop etadi)
 *  - Ombor entity'lari: create/update/approve = ALL (qabul, ko'chirish, inventarizatsiya,
 *    yo'qotish, ichki buyurtma, otgruzka, qaytarish va katalog boshqaruvi)
 *  - delete = NO (nazoratchi o'chirmaydi — hujjatni bekor qiladi = update/approve orqali)
 *  - Qolgan entity'lar (pul, CRM, sozlama, rol, xodim): create/update/delete/approve = NO
 *
 * Idempotent: rol + permission'lar upsert qilinadi, qayta yugurtirsa xavfsiz.
 */
import { PrismaClient } from '../src/generated';

const prisma = new PrismaClient();

// Entity universe — packages/db/prisma/seed.ts dagi ro'yxat bilan bir xil bo'lishi shart.
const entities = [
  'product', 'productfolder', 'variant', 'bundle', 'service', 'pricetype', 'counterparty',
  'contactperson', 'organization', 'store', 'cashdesk', 'bankaccount', 'employee', 'role',
  'mxik', 'exchangerate', 'project', 'contract', 'uom', 'taxrate', 'expenseitem', 'customentity',
  'region', 'country', 'trackingcode', 'discount',
  'customerorder', 'demand', 'invoiceout', 'salesreturn', 'factureout', 'commissionreport',
  'consignment', 'purchaseorder', 'supply', 'invoicein', 'purchasereturn', 'facturein',
  'paymentin', 'paymentout', 'cashin', 'cashout', 'bankimport', 'counterpartyadjustment',
  'prepayment', 'prepaymentreturn', 'move', 'loss', 'enter', 'inventory', 'internalorder',
  'pricelist', 'bom', 'workorder', 'processingorder', 'processing', 'payroll', 'cashiersession',
  'retailsale', 'saleschannel', 'onlineorder', 'pipeline', 'opportunity', 'call', 'task',
  'tasktype', 'attachment', 'auditlog', 'report', 'publication', 'label', 'settings',
];
const actions = ['view', 'create', 'update', 'delete', 'approve', 'print'];

// Ombor nazoratchisi to'liq boshqaradigan entity'lar (katalog + ombor hujjatlari).
const warehouseEntities = new Set([
  // Katalog / master data
  'product', 'productfolder', 'variant', 'bundle', 'service', 'uom', 'pricetype',
  'trackingcode', 'pricelist', 'label', 'store',
  // Ombor hujjatlari
  'enter',          // Оприходование — qabul/kirim
  'supply',         // Приёмка — yetkazib beruvchidan qabul
  'purchasereturn', // Возврат поставщику
  'demand',         // Отгрузка — chiqim
  'salesreturn',    // Возврат покупателя
  'move',           // Перемещение — omborlar aro ko'chirish
  'loss',           // Списание — yo'qotish/hisobdan chiqarish
  'inventory',      // Инвентаризация — sanab chiqish
  'internalorder',  // Внутренний заказ
  'consignment',    // Партии — partiyalar
]);

function scopeFor(entity: string, action: string): string {
  if (action === 'view' || action === 'print') return 'ALL';
  if (action === 'delete') return 'NO'; // nazoratchi o'chirmaydi
  // create / update / approve:
  return warehouseEntities.has(entity) ? 'ALL' : 'NO';
}

async function main() {
  const account =
    (await prisma.account.findFirst({ where: { name: 'Demo Organization' } })) ??
    (await prisma.account.findFirst());
  if (!account) throw new Error('Account topilmadi.');

  const ROLE_NAME = 'Ombor nazoratchisi';
  const role = await prisma.role.upsert({
    where: { accountId_name: { accountId: account.id, name: ROLE_NAME } },
    update: { description: 'Ombor nazoratchisi — qabul, ko‘chirish, inventarizatsiya, chiqim' },
    create: {
      accountId: account.id,
      name: ROLE_NAME,
      description: 'Ombor nazoratchisi — qabul, ko‘chirish, inventarizatsiya, chiqim',
      isSystem: false,
    },
  });
  console.log(`  ✓ Rol: ${role.name} (${role.id})`);

  let granted = 0;
  for (const entity of entities) {
    for (const action of actions) {
      const scope = scopeFor(entity, action);
      await prisma.rolePermission.upsert({
        where: { roleId_entity_action: { roleId: role.id, entity, action } },
        update: { scope },
        create: { roleId: role.id, entity, action, scope },
      });
      granted++;
    }
  }
  console.log(`  ✓ ${granted} ta permission yozildi (${entities.length} entity × ${actions.length} action).`);

  // Tekshiruv: ombor hujjatlariga create/approve ruxsati borligini ko'rsatish.
  const sample = await prisma.rolePermission.findMany({
    where: { roleId: role.id, entity: { in: ['enter', 'move', 'inventory', 'demand', 'paymentin'] }, action: { in: ['view', 'create', 'approve'] } },
    orderBy: [{ entity: 'asc' }, { action: 'asc' }],
  });
  console.log('  Namuna ruxsatlar:');
  for (const p of sample) console.log(`    ${p.entity}.${p.action} = ${p.scope}`);

  console.log('🎉 «Ombor nazoratchisi» roli tayyor.');
}

main()
  .catch((e) => {
    console.error('❌ Xato:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * Development seed script. Creates:
 *  - 1 Account (Demo org)
 *  - 1 Employee (admin user)
 *  - 1 Organization
 *  - 1 Store
 *  - 1 ProductFolder
 *  - 3 sample Products
 *  - 2 sample Counterparties
 */

import * as argon2 from 'argon2';
import { PrismaClient } from '../src/generated/index.js';
import { seedCountries } from './country-seed.js';
import { seedHelpArticles } from './help-seed.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Seeding development data...');
  const devPasswordHash = await argon2.hash('admin123', { type: argon2.argon2id });

  const account = await prisma.account.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Demo Organization',
      country: 'UZ',
      currency: 'UZS',
      locale: 'uz-Latn',
      plan: 'trial',
    },
  });
  console.log('  ✓ Account:', account.name);

  const admin = await prisma.employee.upsert({
    where: { accountId_email: { accountId: account.id, email: 'admin@demo.local' } },
    update: { passwordHash: devPasswordHash },
    create: {
      accountId: account.id,
      email: 'admin@demo.local',
      passwordHash: devPasswordHash,
      name: 'Admin User',
      firstName: 'Admin',
      lastName: 'User',
      position: 'Administrator',
    },
  });
  console.log('  ✓ Employee:', admin.name, '(parol: admin123)');

  // Seed system roles + assign Administrator to admin.
  //
  // Entity universe — must mirror PermissionEntity in
  // apps/api/src/modules/permissions/permissions.types.ts. Adding a new
  // entity? Append it here, re-run `pnpm --filter @moysklad/db seed`,
  // and existing tenants will automatically gain the new permission rows
  // (the upsert below is idempotent at the row level).
  const entities = [
    // Master data
    'product',
    'productfolder',
    'variant',
    'bundle',
    'service',
    'pricetype',
    'counterparty',
    'contactperson',
    'organization',
    'branch',
    'store',
    'cashdesk',
    'bankaccount',
    'employee',
    'role',
    'mxik',
    'exchangerate',
    'currency',
    'project',
    'contract',
    'uom',
    'taxrate',
    'expenseitem',
    'customentity',
    'region',
    'country',
    'trackingcode',
    'discount',
    // Sales / Purchase / Money / Warehouse documents
    'customerorder',
    'demand',
    'invoiceout',
    'salesreturn',
    'factureout',
    'commissionreport',
    'consignment',
    'purchaseorder',
    'supply',
    'invoicein',
    'purchasereturn',
    'facturein',
    'paymentin',
    'paymentout',
    'cashin',
    'cashout',
    'bankimport',
    'counterpartyadjustment',
    'prepayment',
    'prepaymentreturn',
    'move',
    'loss',
    'enter',
    'inventory',
    'internalorder',
    'pricelist',
    // Production / Retail / E-com
    'bom',
    'workorder',
    'processingorder',
    'processing',
    'processingprocess',
    'processingstage',
    'payroll',
    'cashiersession',
    'retailsale',
    'saleschannel',
    'onlineorder',
    // CRM
    'pipeline',
    'opportunity',
    'call',
    'task',
    'tasktype',
    // Cross-cutting
    'attachment',
    'auditlog',
    'report',
    'analitika',
    'publication',
    'label',
    'settings',
    // Debts (Sherset KEEP — B3). MASTER-TODO #19: bular PermissionEntity
    // union'ida bor edi, lekin uchala seed-ro'yxatidan tushib qolgan —
    // natijada YANGI seed qilingan DB'da Qarz bo'limi har foydalanuvchiga
    // 403 qaytarardi (`permissions-seed-sync.test.ts` shu drift-klassni tutadi).
    'debt',
    'debtpayment',
    'debtcardpayment',
    'debtreport',
  ];
  const actions = ['view', 'create', 'update', 'delete', 'approve', 'print'];
  const systemRoles = [
    {
      name: 'Administrator',
      desc: "To'liq kirish",
      defaults: {
        view: 'ALL',
        create: 'ALL',
        update: 'ALL',
        delete: 'ALL',
        approve: 'ALL',
        print: 'ALL',
      },
    },
    {
      name: 'Manager',
      desc: 'Menejer',
      defaults: {
        view: 'ALL',
        create: 'ALL',
        update: 'OWN_GROUP',
        delete: 'OWN_GROUP',
        approve: 'OWN_GROUP',
        print: 'ALL',
      },
    },
    {
      name: 'Employee',
      desc: 'Xodim',
      defaults: {
        view: 'OWN_GROUP',
        create: 'ALL',
        update: 'OWN',
        delete: 'NO',
        approve: 'OWN',
        print: 'OWN_GROUP',
      },
    },
    {
      name: 'ReadOnly',
      desc: "Faqat ko'rish",
      defaults: {
        view: 'ALL',
        create: 'NO',
        update: 'NO',
        delete: 'NO',
        approve: 'NO',
        print: 'ALL',
      },
    },
  ];
  for (const r of systemRoles) {
    const role = await prisma.role.upsert({
      where: { accountId_name: { accountId: account.id, name: r.name } },
      update: { description: r.desc, isSystem: true },
      create: { accountId: account.id, name: r.name, description: r.desc, isSystem: true },
    });
    for (const entity of entities) {
      for (const action of actions) {
        const scope = (r.defaults as Record<string, string>)[action] ?? 'NO';
        await prisma.rolePermission.upsert({
          where: { roleId_entity_action: { roleId: role.id, entity, action } },
          update: { scope },
          create: { roleId: role.id, entity, action, scope },
        });
      }
    }
    if (r.name === 'Administrator') {
      await prisma.employeeRole.upsert({
        where: { employeeId_roleId: { employeeId: admin.id, roleId: role.id } },
        update: {},
        create: { employeeId: admin.id, roleId: role.id },
      });
    }
    console.log('  ✓ Role:', r.name);
  }

  const org = await prisma.organization.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      accountId: account.id,
      name: 'MCHJ Demo',
      legalTitle: 'Mas\'uliyati cheklangan jamiyat "Demo"',
      companyType: 'legalUZ',
      email: 'demo@example.uz',
      director: 'Admin User',
      directorPosition: 'Tashkilot rahbari',
      payerVat: true,
      uzRequisites: { inn: '301234567' },
    },
  });
  console.log('  ✓ Organization:', org.name);

  // Organization bank account («расчётный счёт») — moysklad shows the org's
  // default account in the sub-row under «Организация» (e.g. «Сум»). Without one
  // that dropdown is empty; this default UZS account mirrors a real org. Fixed
  // id → idempotent. Backfilled onto the org's customer orders below.
  const orgAccount = await prisma.organizationAccount.upsert({
    where: { id: '00000000-0000-0000-0000-0000000000a1' },
    update: { name: 'Сум', isDefault: true, currency: 'UZS' },
    create: {
      id: '00000000-0000-0000-0000-0000000000a1',
      accountId: account.id,
      organizationId: org.id,
      name: 'Сум',
      isDefault: true,
      currency: 'UZS',
    },
  });
  console.log('  ✓ Organization account:', orgAccount.name);
  // Show it on the org's existing customer orders that have none (moysklad parity:
  // an order carries its organization's account). Scoped + idempotent.
  const backfilled = await prisma.customerOrder.updateMany({
    where: { accountId: account.id, organizationId: org.id, organizationAccountId: null },
    data: { organizationAccountId: orgAccount.id },
  });
  if (backfilled.count > 0) console.log('  ✓ CO org-account backfill:', backfilled.count);

  // Departments («Отдел» / Bo'lim) — the owner-group picklist behind every
  // document's «Доступ» widget (the department field reads `/groups`). Without
  // any Group rows the picker is empty; these mirror the climart account's
  // departments so it's populated out of the box. Fixed ids → idempotent.
  const departments = [
    { id: '00000000-0000-0000-0000-0000000000d1', name: 'Основной' },
    { id: '00000000-0000-0000-0000-0000000000d2', name: 'Сотув булими' },
    { id: '00000000-0000-0000-0000-0000000000d3', name: 'Омборхона булими' },
    { id: '00000000-0000-0000-0000-0000000000d4', name: 'Фаррухбек Касса' },
    { id: '00000000-0000-0000-0000-0000000000d5', name: 'Молия булими' },
  ];
  for (const [i, d] of departments.entries()) {
    await prisma.group.upsert({
      where: { id: d.id },
      update: { name: d.name },
      create: { id: d.id, accountId: account.id, name: d.name, index: i },
    });
  }
  console.log('  ✓ Departments:', departments.length);

  // The admin belongs to «Основной» (moysklad's default department) so create forms
  // pre-fill «Доступ» → Отдел with it (mirrors moysklad: every user is in a department).
  // Set here — the admin is upserted earlier, before any Group row exists, so the FK
  // can't be assigned at that point. Idempotent.
  await prisma.employee.update({
    where: { id: admin.id },
    data: { groupId: '00000000-0000-0000-0000-0000000000d1' },
  });
  console.log('  ✓ Admin assigned to «Основной»');

  const store = await prisma.store.upsert({
    where: { accountId_code: { accountId: account.id, code: 'MAIN' } },
    update: {},
    create: {
      accountId: account.id,
      name: 'Asosiy ombor',
      code: 'MAIN',
      address: "Tashkent, Amir Temur ko'chasi, 10",
    },
  });
  console.log('  ✓ Store:', store.name);

  const folder = await prisma.productFolder.upsert({
    where: { accountId_code: { accountId: account.id, code: 'PHONES' } },
    update: {},
    create: {
      accountId: account.id,
      name: 'Telefonlar',
      code: 'PHONES',
      pathName: 'Telefonlar',
      vat: 12,
      vatEnabled: true,
    },
  });
  console.log('  ✓ ProductFolder:', folder.name);

  // Account price types — moysklad seeds «Розничная цена» (default) + «Оптовая
  // цена» (wholesale). Products reference these by real PriceType id (not the
  // legacy 'default' sentinel).
  const retailType = await prisma.priceType.upsert({
    where: { accountId_name: { accountId: account.id, name: 'Розничная цена' } },
    update: {},
    create: {
      accountId: account.id,
      name: 'Розничная цена',
      currency: 'UZS',
      isDefault: true,
      position: 0,
    },
  });
  await prisma.priceType.upsert({
    where: { accountId_name: { accountId: account.id, name: 'Оптовая цена' } },
    update: {},
    create: {
      accountId: account.id,
      name: 'Оптовая цена',
      currency: 'UZS',
      isDefault: false,
      position: 1,
    },
  });
  console.log('  ✓ PriceType: Розничная цена (default) + Оптовая цена');

  const products = [
    {
      name: 'iPhone 15 Pro Max 256GB',
      code: 'IPH15PM256',
      buyPrice: 1200000000n,
      salePrice: 1500000000n,
    },
    {
      name: 'Samsung Galaxy S24 Ultra',
      code: 'GALS24U',
      buyPrice: 1100000000n,
      salePrice: 1400000000n,
    },
    { name: 'AirPods Pro 2', code: 'APPRO2', buyPrice: 250000000n, salePrice: 350000000n },
  ];

  // Capture product IDs by code so the downstream document seeds (Consignment,
  // FactureOut.position-derived totals later) can reference real rows without
  // hard-coding UUIDs that change per environment.
  const productByCode = new Map<string, string>();
  for (const p of products) {
    const prod = await prisma.product.upsert({
      where: { accountId_code: { accountId: account.id, code: p.code } },
      update: {},
      create: {
        accountId: account.id,
        ownerId: admin.id,
        productFolderId: folder.id,
        name: p.name,
        code: p.code,
        kind: 'product',
        buyPrice: p.buyPrice,
        salePrices: [{ priceTypeId: retailType.id, value: p.salePrice.toString() }],
        vat: 12,
        vatEnabled: true,
        useParentVat: false,
        uom: 'шт',
      },
    });
    productByCode.set(p.code, prod.id);
    console.log('  ✓ Product:', prod.name);
  }

  const cps = [
    {
      id: '00000000-0000-0000-0001-000000000001',
      name: 'ABC MCHJ',
      type: 'legalUZ',
      inn: '302345678',
    },
    {
      id: '00000000-0000-0000-0001-000000000002',
      name: 'XYZ YaTTT',
      type: 'entrepreneurUZ',
      inn: '00123456789012',
    },
  ];
  for (const c of cps) {
    const cp = await prisma.counterparty.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        accountId: account.id,
        ownerId: admin.id,
        name: c.name,
        legalTitle: c.name,
        companyType: c.type,
        uzRequisites: { inn: c.inn },
      },
    });
    console.log('  ✓ Counterparty:', cp.name);
  }

  // ────────────────────────────────────────────────────────────────────
  // Sample documents for the read-only sub-nav modules (Sprints 5-8).
  // Fixed UUIDs so the upserts are idempotent across re-runs and the
  // page screenshots stay stable. Money values use BigInt to mirror the
  // production write path; sumMinor is in the smallest currency unit
  // (UZS tiyin → 1 UZS = 100 minor).
  // ────────────────────────────────────────────────────────────────────

  // FactureOut — issued tax invoices (Sprint 5)
  const facturesOut = [
    {
      id: '00000000-0000-0000-0002-000000000001',
      name: 'СФ-00001',
      agentId: '00000000-0000-0000-0001-000000000001', // ABC MCHJ
      sumMinor: 168_000_000n, // 1.68M UZS
      vatSumMinor: 18_000_000n, // 12% VAT
      state: 'posted',
      printed: true,
      published: false,
      applicable: true,
      moment: new Date('2026-04-01T10:00:00Z'),
    },
    {
      id: '00000000-0000-0000-0002-000000000002',
      name: 'СФ-00002',
      agentId: '00000000-0000-0000-0001-000000000002', // XYZ YaTTT
      sumMinor: 56_000_000n,
      vatSumMinor: 6_000_000n,
      state: 'draft',
      printed: false,
      published: false,
      applicable: false,
      moment: new Date('2026-04-15T14:30:00Z'),
    },
  ];
  for (const f of facturesOut) {
    const fo = await prisma.factureOut.upsert({
      where: { id: f.id },
      update: {},
      create: {
        id: f.id,
        accountId: account.id,
        ownerId: admin.id,
        organizationId: org.id,
        agentId: f.agentId,
        name: f.name,
        moment: f.moment,
        state: f.state,
        applicable: f.applicable,
        printed: f.printed,
        published: f.published,
        sumMinor: f.sumMinor,
        vatSumMinor: f.vatSumMinor,
        vatEnabled: true,
        currency: 'UZS',
      },
    });
    console.log('  ✓ FactureOut:', fo.name);
  }

  // FactureIn — received tax invoices (Sprint 6)
  const facturesIn = [
    {
      id: '00000000-0000-0000-0003-000000000001',
      name: 'СФ-вх-00001',
      agentId: '00000000-0000-0000-0001-000000000001',
      incomingNumber: 'AB-2026/0142',
      incomingDate: new Date('2026-03-28'),
      sumMinor: 1_344_000_000n,
      vatSumMinor: 144_000_000n,
      state: 'posted',
      printed: true,
      applicable: true,
      moment: new Date('2026-04-02T09:15:00Z'),
    },
    {
      id: '00000000-0000-0000-0003-000000000002',
      name: 'СФ-вх-00002',
      agentId: '00000000-0000-0000-0001-000000000002',
      incomingNumber: 'YA-0089',
      incomingDate: new Date('2026-04-10'),
      sumMinor: 280_000_000n,
      vatSumMinor: 30_000_000n,
      state: 'draft',
      printed: false,
      applicable: false,
      moment: new Date('2026-04-12T11:00:00Z'),
    },
  ];
  for (const f of facturesIn) {
    const fi = await prisma.factureIn.upsert({
      where: { id: f.id },
      update: {},
      create: {
        id: f.id,
        accountId: account.id,
        ownerId: admin.id,
        organizationId: org.id,
        agentId: f.agentId,
        name: f.name,
        moment: f.moment,
        incomingNumber: f.incomingNumber,
        incomingDate: f.incomingDate,
        state: f.state,
        applicable: f.applicable,
        printed: f.printed,
        sumMinor: f.sumMinor,
        vatSumMinor: f.vatSumMinor,
        vatEnabled: true,
        currency: 'UZS',
      },
    });
    console.log('  ✓ FactureIn:', fi.name);
  }

  // CommissionReportOut — settlement to the consigner (Sprint 7)
  const commissionReports = [
    {
      id: '00000000-0000-0000-0004-000000000001',
      name: 'Отчёт-00001',
      agentId: '00000000-0000-0000-0001-000000000001',
      sumMinor: 5_000_000_000n, // 50M UZS gross
      vatSumMinor: 535_714_000n, // 12% VAT-incl extracted
      rewardSumMinor: 500_000_000n, // 10% commission
      payedSumMinor: 5_000_000_000n, // fully settled
      state: 'posted',
      moment: new Date('2026-04-05T16:00:00Z'),
    },
    {
      id: '00000000-0000-0000-0004-000000000002',
      name: 'Отчёт-00002',
      agentId: '00000000-0000-0000-0001-000000000002',
      sumMinor: 1_200_000_000n,
      vatSumMinor: 128_571_000n,
      rewardSumMinor: 96_000_000n, // 8%
      payedSumMinor: 600_000_000n, // half-paid
      state: 'posted',
      moment: new Date('2026-04-20T12:00:00Z'),
    },
  ];
  for (const r of commissionReports) {
    const cr = await prisma.commissionReportOut.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        accountId: account.id,
        ownerId: admin.id,
        organizationId: org.id,
        agentId: r.agentId,
        name: r.name,
        moment: r.moment,
        state: r.state,
        applicable: true,
        sumMinor: r.sumMinor,
        vatSumMinor: r.vatSumMinor,
        rewardSumMinor: r.rewardSumMinor,
        payedSumMinor: r.payedSumMinor,
        vatEnabled: true,
        currency: 'UZS',
      },
    });
    console.log('  ✓ CommissionReportOut:', cr.name);
  }

  // Consignment — product batches with FEFO sort (Sprint 8). The expiry
  // dates intentionally span «expired», «expires within 30 days», and
  // «long shelf life» so the page's color-tone column has visible
  // examples without anyone needing to hand-craft a demo dataset.
  const iphoneId = productByCode.get('IPH15PM256');
  const galaxyId = productByCode.get('GALS24U');
  const airpodsId = productByCode.get('APPRO2');
  if (iphoneId && galaxyId && airpodsId) {
    const today = new Date();
    const daysFromNow = (n: number): Date => {
      const d = new Date(today);
      d.setDate(d.getDate() + n);
      return d;
    };
    const consignments = [
      {
        id: '00000000-0000-0000-0005-000000000001',
        productId: iphoneId,
        label: 'BATCH-2026-001',
        name: 'iPhone 15 Pro Max 256GB / batch BATCH-2026-001',
        expiryDate: daysFromNow(365), // long shelf life — 1 year out
        barcodes: ['4006381333931', '4006381333948'],
      },
      {
        id: '00000000-0000-0000-0005-000000000002',
        productId: galaxyId,
        label: 'BATCH-2026-002',
        name: 'Samsung Galaxy S24 Ultra / batch BATCH-2026-002',
        expiryDate: daysFromNow(15), // ⚠ expires within 30 days
        barcodes: ['8806094820102'],
      },
      {
        id: '00000000-0000-0000-0005-000000000003',
        productId: airpodsId,
        label: 'BATCH-2025-018',
        name: 'AirPods Pro 2 / batch BATCH-2025-018',
        expiryDate: daysFromNow(-7), // ❌ already expired
        barcodes: ['0194253397373'],
      },
    ];
    for (const c of consignments) {
      const cons = await prisma.consignment.upsert({
        where: { id: c.id },
        update: {},
        create: {
          id: c.id,
          accountId: account.id,
          productId: c.productId,
          label: c.label,
          name: c.name,
          expiryDate: c.expiryDate,
          barcodes: c.barcodes,
        },
      });
      console.log('  ✓ Consignment:', cons.label);
    }
  }

  await seedHelpArticles(prisma, account.id);
  await seedCountries(prisma, account.id);
  console.log('  ✓ Countries: ISO 3166-1 list seeded');

  console.log('\n🎉 Seed complete. Ready for development.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

#!/usr/bin/env tsx
/**
 * Sample data seeder for live Moysklad API.
 *
 * Creates 1 sample record per entity type so that list endpoint
 * returns a row — which we can then use to verify schema field names.
 *
 * Only seeds if no records exist. Idempotent.
 *
 * Dependencies (seeded in this order):
 *   1. Counterparty (supplier + customer)  — standalone
 *   2. Product                              — standalone
 *   3. Store                                — usually already exists
 *   4. Supply (stock IN)                    — needs counterparty + product + store
 *   5. PurchaseOrder                        — needs counterparty + product
 *   6. CustomerOrder                        — needs counterparty + product
 *   7. Demand (stock OUT)                   — needs counterparty + product + store (with stock!)
 *   8. PaymentIn, PaymentOut, etc.          — after orders
 *   ... and so on
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = 'https://api.moysklad.ru/api/remap/1.2';

const HEADERS = {
  Accept: 'application/json;charset=utf-8',
  'Content-Type': 'application/json;charset=utf-8',
} as const;

async function main(): Promise<void> {
  const token = process.env.MOYSKLAD_API_TOKEN;
  if (!token) {
    console.error('MOYSKLAD_API_TOKEN not set');
    process.exit(1);
  }

  const auth = { Authorization: `Bearer ${token}` };
  const headers = { ...HEADERS, ...auth };

  // Helpers
  const api = {
    async get<T>(path: string): Promise<T> {
      const r = await fetch(`${API_BASE}${path}`, { headers });
      if (!r.ok) throw new Error(`GET ${path}: ${r.status} ${await r.text()}`);
      return (await r.json()) as T;
    },
    async post<T>(path: string, body: unknown): Promise<T> {
      const r = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const text = await r.text();
      if (!r.ok) throw new Error(`POST ${path}: ${r.status} ${text.slice(0, 300)}`);
      return JSON.parse(text) as T;
    },
  };

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  console.log('=== Seeding sample data to Moysklad ===\n');

  // 1. Get existing Organization + Store + Employee (needed as meta refs)
  console.log('1. Getting org / store / employee...');
  const orgs = await api.get<{ rows: { meta: { href: string } }[] }>(
    '/entity/organization/?limit=1',
  );
  const organization = orgs.rows[0]!;
  console.log(`   org: ${organization.meta.href}`);

  const stores = await api.get<{ rows: { meta: { href: string } }[] }>('/entity/store/?limit=1');
  const store = stores.rows[0]!;
  console.log(`   store: ${store.meta.href}`);

  // 2. Create supplier counterparty (if not exists)
  console.log('\n2. Supplier counterparty...');
  let supplier: { meta: { href: string } };
  const existingSup = await api.get<{ rows: { meta: { href: string }; name: string }[] }>(
    '/entity/counterparty/?search=Тест поставщик&limit=1',
  );
  if (existingSup.rows.length && existingSup.rows[0]!.name === 'Тест поставщик') {
    supplier = existingSup.rows[0]!;
    console.log('   already exists');
  } else {
    supplier = await api.post('/entity/counterparty/', {
      name: 'Тест поставщик',
      companyType: 'legalUZ',
      legalTitle: 'MCHJ "Тест Поставщик"',
      legalAddress: "Тошкент, Нукус ко'часи, 1-уй",
      mod__requisites__uz: { inn: '301234567' },
    });
    console.log(`   created: ${supplier.meta.href}`);
  }
  await sleep(200);

  // 3. Customer counterparty
  console.log('\n3. Customer counterparty...');
  let customer: { meta: { href: string } };
  const existingCust = await api.get<{ rows: { meta: { href: string }; name: string }[] }>(
    '/entity/counterparty/?search=Тест покупатель&limit=1',
  );
  if (existingCust.rows.length && existingCust.rows[0]!.name === 'Тест покупатель') {
    customer = existingCust.rows[0]!;
    console.log('   already exists');
  } else {
    customer = await api.post('/entity/counterparty/', {
      name: 'Тест покупатель',
      companyType: 'legalUZ',
      legalTitle: 'MCHJ "Тест Покупатель"',
      mod__requisites__uz: { inn: '302345678' },
    });
    console.log(`   created: ${customer.meta.href}`);
  }
  await sleep(200);

  // 4. Product group (productfolder)
  console.log('\n4. Product folder...');
  let folder: { meta: { href: string } };
  const existingFolders = await api.get<{ rows: { meta: { href: string }; name: string }[] }>(
    '/entity/productfolder/?search=Тест группа&limit=1',
  );
  if (existingFolders.rows.length) {
    folder = existingFolders.rows[0]!;
    console.log('   already exists');
  } else {
    folder = await api.post('/entity/productfolder/', { name: 'Тест группа' });
    console.log(`   created: ${folder.meta.href}`);
  }
  await sleep(200);

  // 5. Product
  console.log('\n5. Product...');
  let product: { meta: { href: string } };
  const existingProd = await api.get<{ rows: { meta: { href: string }; name: string }[] }>(
    '/entity/product/?search=Тест товар&limit=1',
  );
  if (existingProd.rows.length) {
    product = existingProd.rows[0]!;
    console.log('   already exists');
  } else {
    product = await api.post('/entity/product/', {
      name: 'Тест товар',
      code: 'TEST-001',
      productFolder: { meta: folder.meta },
      salePrices: [],
    });
    console.log(`   created: ${product.meta.href}`);
  }
  await sleep(200);

  // 6. Service
  console.log('\n6. Service...');
  const existingSvc = await api.get<{ rows: { name: string }[] }>(
    '/entity/service/?search=Тест услуга&limit=1',
  );
  if (existingSvc.rows.length) {
    console.log('   already exists');
  } else {
    await api.post('/entity/service/', {
      name: 'Тест услуга',
      code: 'SVC-001',
    });
    console.log('   created');
  }
  await sleep(200);

  // 7. Project
  console.log('\n7. Project...');
  const existingProj = await api.get<{ rows: { name: string }[] }>(
    '/entity/project/?search=Тест проект&limit=1',
  );
  if (existingProj.rows.length) {
    console.log('   already exists');
  } else {
    await api.post('/entity/project/', { name: 'Тест проект' });
    console.log('   created');
  }
  await sleep(200);

  // 8. Supply (stock IN, enables Demand later)
  console.log('\n8. Supply...');
  const existingSupply = await api.get<{ rows: { name: string }[] }>('/entity/supply/?limit=1');
  if (existingSupply.rows.length) {
    console.log('   already exists');
  } else {
    await api.post('/entity/supply/', {
      agent: { meta: supplier.meta },
      organization: { meta: organization.meta },
      store: { meta: store.meta },
      positions: [
        {
          assortment: { meta: { ...product.meta, type: 'product' } },
          quantity: 10,
          price: 500000, // 50,000 UZS (in tiyin? — depends on Moysklad precision; test)
          vat: 12,
        },
      ],
    });
    console.log('   created (with 1 position, qty 10)');
  }
  await sleep(200);

  // 9. CustomerOrder
  console.log('\n9. CustomerOrder...');
  const existingCO = await api.get<{ rows: { name: string }[] }>('/entity/customerorder/?limit=1');
  if (existingCO.rows.length) {
    console.log('   already exists');
  } else {
    await api.post('/entity/customerorder/', {
      agent: { meta: customer.meta },
      organization: { meta: organization.meta },
      store: { meta: store.meta },
      positions: [
        {
          assortment: { meta: { ...product.meta, type: 'product' } },
          quantity: 2,
          price: 600000,
          vat: 12,
        },
      ],
    });
    console.log('   created');
  }
  await sleep(200);

  // 10. PurchaseOrder
  console.log('\n10. PurchaseOrder...');
  const existingPO = await api.get<{ rows: { name: string }[] }>('/entity/purchaseorder/?limit=1');
  if (existingPO.rows.length) {
    console.log('   already exists');
  } else {
    await api.post('/entity/purchaseorder/', {
      agent: { meta: supplier.meta },
      organization: { meta: organization.meta },
      store: { meta: store.meta },
      positions: [
        {
          assortment: { meta: { ...product.meta, type: 'product' } },
          quantity: 5,
          price: 450000,
          vat: 12,
        },
      ],
    });
    console.log('   created');
  }
  await sleep(200);

  // 11. InvoiceOut
  console.log('\n11. InvoiceOut...');
  const existingIO = await api.get<{ rows: { name: string }[] }>('/entity/invoiceout/?limit=1');
  if (existingIO.rows.length) {
    console.log('   already exists');
  } else {
    await api.post('/entity/invoiceout/', {
      agent: { meta: customer.meta },
      organization: { meta: organization.meta },
      positions: [
        {
          assortment: { meta: { ...product.meta, type: 'product' } },
          quantity: 1,
          price: 700000,
          vat: 12,
        },
      ],
    });
    console.log('   created');
  }
  await sleep(200);

  // 12. InvoiceIn
  console.log('\n12. InvoiceIn...');
  const existingII = await api.get<{ rows: { name: string }[] }>('/entity/invoicein/?limit=1');
  if (existingII.rows.length) {
    console.log('   already exists');
  } else {
    await api.post('/entity/invoicein/', {
      agent: { meta: supplier.meta },
      organization: { meta: organization.meta },
      positions: [
        {
          assortment: { meta: { ...product.meta, type: 'product' } },
          quantity: 10,
          price: 500000,
          vat: 12,
        },
      ],
    });
    console.log('   created');
  }
  await sleep(200);

  // 13. PaymentIn
  console.log('\n13. PaymentIn...');
  const existingPI = await api.get<{ rows: { name: string }[] }>('/entity/paymentin/?limit=1');
  if (existingPI.rows.length) {
    console.log('   already exists');
  } else {
    await api.post('/entity/paymentin/', {
      agent: { meta: customer.meta },
      organization: { meta: organization.meta },
      sum: 700000,
      paymentPurpose: 'Оплата тест',
    });
    console.log('   created');
  }
  await sleep(200);

  // 14. CashIn
  console.log('\n14. CashIn...');
  const existingCI = await api.get<{ rows: { name: string }[] }>('/entity/cashin/?limit=1');
  if (existingCI.rows.length) {
    console.log('   already exists');
  } else {
    try {
      await api.post('/entity/cashin/', {
        agent: { meta: customer.meta },
        organization: { meta: organization.meta },
        sum: 100000,
        paymentPurpose: 'Тест ПКО',
      });
      console.log('   created');
    } catch (e) {
      console.log(`   failed: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  await sleep(200);

  // 15. Retail shift (open)
  console.log('\n15. RetailShift...');
  const retailStores = await api.get<{ rows: { meta: { href: string } }[] }>(
    '/entity/retailstore/?limit=1',
  );
  if (!retailStores.rows.length) {
    console.log('   no retail store; skipping');
  } else {
    const existingShift = await api.get<{ rows: { name: string }[] }>(
      '/entity/retailshift/?limit=1',
    );
    if (existingShift.rows.length) {
      console.log('   already exists (not creating new)');
    } else {
      try {
        await api.post('/entity/retailshift/', {
          retailStore: { meta: retailStores.rows[0]!.meta },
        });
        console.log('   created');
      } catch (e) {
        console.log(`   failed: ${(e as Error).message.slice(0, 100)}`);
      }
    }
  }

  console.log('\n✅ Seeding complete. Now re-run verify-api to get full field data.');
}

main().catch((e) => {
  console.error('\nSEEDER FAILED:', e);
  process.exit(1);
});

#!/usr/bin/env tsx

const API_BASE = 'https://api.moysklad.ru/api/remap/1.2';
const HEADERS = {
  Accept: 'application/json;charset=utf-8',
  'Content-Type': 'application/json;charset=utf-8',
} as const;

async function main(): Promise<void> {
  const token = process.env.MOYSKLAD_API_TOKEN;
  if (!token) {
    console.error('No token');
    process.exit(1);
  }

  const auth = { Authorization: `Bearer ${token}` };
  const headers = { ...HEADERS, ...auth };

  const api = {
    async get<T>(p: string): Promise<T> {
      const r = await fetch(`${API_BASE}${p}`, { headers });
      if (!r.ok) throw new Error(`GET ${p}: ${r.status} ${await r.text()}`);
      return (await r.json()) as T;
    },
    async put<T>(p: string, body: unknown): Promise<T> {
      const r = await fetch(`${API_BASE}${p}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`PUT ${p}: ${r.status} ${await r.text()}`);
      return (await r.json()) as T;
    },
    async post<T>(p: string, body: unknown): Promise<T> {
      const r = await fetch(`${API_BASE}${p}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const text = await r.text();
      if (!r.ok) throw new Error(`POST ${p}: ${r.status} ${text.slice(0, 300)}`);
      return JSON.parse(text) as T;
    },
  };

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  console.log('=== Seeding more entities ===\n');

  // Get existing refs
  const [orgs, stores, sup, cust, prods] = await Promise.all([
    api.get<{ rows: { meta: { href: string } }[] }>('/entity/organization/?limit=1'),
    api.get<{ rows: { meta: { href: string } }[] }>('/entity/store/?limit=1'),
    api.get<{ rows: { meta: { href: string } }[] }>(
      '/entity/counterparty/?search=поставщик&limit=1',
    ),
    api.get<{ rows: { meta: { href: string } }[] }>(
      '/entity/counterparty/?search=покупатель&limit=1',
    ),
    api.get<{ rows: { meta: { href: string } }[] }>('/entity/product/?limit=1'),
  ]);
  const org = orgs.rows[0]!.meta;
  const store = stores.rows[0]!.meta;
  const supplier = sup.rows[0]!.meta;
  const customer = cust.rows[0]!.meta;
  const product = prods.rows[0]!.meta;
  console.log('Refs loaded');

  // Post Supply (previously drafted) so stock exists for Demand
  console.log('\n1. Post draft Supply (applicable=true)...');
  const supplies = await api.get<{
    rows: { id: string; applicable: boolean; meta: { href: string } }[];
  }>('/entity/supply/?limit=1');
  if (supplies.rows.length && !supplies.rows[0]!.applicable) {
    const id = supplies.rows[0]!.id;
    try {
      await api.put(`/entity/supply/${id}`, { applicable: true });
      console.log('   posted');
    } catch (e) {
      console.log(`   skip: ${(e as Error).message.slice(0, 80)}`);
    }
  } else {
    console.log('   already posted or none');
  }
  await sleep(300);

  // Expense item (needed for cashout, paymentout)
  console.log('\n2. ExpenseItem...');
  const expenseItems = await api.get<{ rows: { meta: { href: string } }[] }>(
    '/entity/expenseitem/?limit=1',
  );
  let expenseItemMeta: { href: string };
  if (expenseItems.rows.length) {
    expenseItemMeta = expenseItems.rows[0]!.meta;
    console.log('   found existing');
  } else {
    const ei = await api.post<{ meta: { href: string } }>('/entity/expenseitem/', {
      name: 'Тест расход',
    });
    expenseItemMeta = ei.meta;
    console.log('   created');
  }
  await sleep(200);

  // Demand (stock out)
  console.log('\n3. Demand...');
  const existingD = await api.get<{ rows: unknown[] }>('/entity/demand/?limit=1');
  if (existingD.rows.length) {
    console.log('   already exists');
  } else {
    try {
      await api.post('/entity/demand/', {
        agent: { meta: customer },
        organization: { meta: org },
        store: { meta: store },
        positions: [
          {
            assortment: { meta: { ...product, type: 'product' } },
            quantity: 2,
            price: 600000,
            vat: 12,
          },
        ],
      });
      console.log('   created');
    } catch (e) {
      console.log(`   failed: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  await sleep(200);

  // Move (between 2 stores — need 2nd store)
  console.log('\n4. Move (2 stores required)...');
  const allStores = await api.get<{ rows: { meta: { href: string }; name: string }[] }>(
    '/entity/store/',
  );
  let targetStore = allStores.rows[1]?.meta;
  if (!targetStore) {
    const newStore = await api.post<{ meta: { href: string } }>('/entity/store/', {
      name: 'Тест склад 2',
    });
    targetStore = newStore.meta;
    console.log('   created 2nd store');
  }
  const existingMove = await api.get<{ rows: unknown[] }>('/entity/move/?limit=1');
  if (existingMove.rows.length) {
    console.log('   already exists');
  } else {
    try {
      await api.post('/entity/move/', {
        organization: { meta: org },
        sourceStore: { meta: store },
        targetStore: { meta: targetStore! },
        positions: [
          {
            assortment: { meta: { ...product, type: 'product' } },
            quantity: 1,
          },
        ],
      });
      console.log('   created');
    } catch (e) {
      console.log(`   failed: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  await sleep(200);

  // Enter (stock find)
  console.log('\n5. Enter...');
  const existingE = await api.get<{ rows: unknown[] }>('/entity/enter/?limit=1');
  if (existingE.rows.length) {
    console.log('   already exists');
  } else {
    try {
      await api.post('/entity/enter/', {
        organization: { meta: org },
        store: { meta: store },
        positions: [
          {
            assortment: { meta: { ...product, type: 'product' } },
            quantity: 3,
            price: 400000,
          },
        ],
      });
      console.log('   created');
    } catch (e) {
      console.log(`   failed: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  await sleep(200);

  // Loss
  console.log('\n6. Loss...');
  const existingL = await api.get<{ rows: unknown[] }>('/entity/loss/?limit=1');
  if (existingL.rows.length) {
    console.log('   already exists');
  } else {
    try {
      await api.post('/entity/loss/', {
        organization: { meta: org },
        store: { meta: store },
        positions: [
          {
            assortment: { meta: { ...product, type: 'product' } },
            quantity: 1,
          },
        ],
      });
      console.log('   created');
    } catch (e) {
      console.log(`   failed: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  await sleep(200);

  // Inventory
  console.log('\n7. Inventory...');
  const existingInv = await api.get<{ rows: unknown[] }>('/entity/inventory/?limit=1');
  if (existingInv.rows.length) {
    console.log('   already exists');
  } else {
    try {
      await api.post('/entity/inventory/', {
        organization: { meta: org },
        store: { meta: store },
      });
      console.log('   created');
    } catch (e) {
      console.log(`   failed: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  await sleep(200);

  // PaymentOut
  console.log('\n8. PaymentOut...');
  const existingPO = await api.get<{ rows: unknown[] }>('/entity/paymentout/?limit=1');
  if (existingPO.rows.length) {
    console.log('   already exists');
  } else {
    try {
      await api.post('/entity/paymentout/', {
        agent: { meta: supplier },
        organization: { meta: org },
        sum: 200000,
        expenseItem: { meta: expenseItemMeta },
        paymentPurpose: 'Тест исходящий платёж',
      });
      console.log('   created');
    } catch (e) {
      console.log(`   failed: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  await sleep(200);

  // CashOut
  console.log('\n9. CashOut...');
  const existingCO = await api.get<{ rows: unknown[] }>('/entity/cashout/?limit=1');
  if (existingCO.rows.length) {
    console.log('   already exists');
  } else {
    try {
      await api.post('/entity/cashout/', {
        agent: { meta: supplier },
        organization: { meta: org },
        sum: 50000,
        expenseItem: { meta: expenseItemMeta },
      });
      console.log('   created');
    } catch (e) {
      console.log(`   failed: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  await sleep(200);

  // Prepayment
  console.log('\n10. Prepayment...');
  const existingPP = await api.get<{ rows: unknown[] }>('/entity/prepayment/?limit=1');
  if (existingPP.rows.length) {
    console.log('   already exists');
  } else {
    try {
      await api.post('/entity/prepayment/', {
        agent: { meta: customer },
        organization: { meta: org },
        sum: 100000,
      });
      console.log('   created');
    } catch (e) {
      console.log(`   failed: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  await sleep(200);

  // SalesReturn (needs a posted Demand first, which requires stock)
  console.log('\n11. SalesReturn...');
  const existingSR = await api.get<{ rows: unknown[] }>('/entity/salesreturn/?limit=1');
  if (existingSR.rows.length) {
    console.log('   already exists');
  } else {
    try {
      await api.post('/entity/salesreturn/', {
        agent: { meta: customer },
        organization: { meta: org },
        store: { meta: store },
      });
      console.log('   created');
    } catch (e) {
      console.log(`   failed: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  await sleep(200);

  // PurchaseReturn
  console.log('\n12. PurchaseReturn...');
  const existingPR = await api.get<{ rows: unknown[] }>('/entity/purchasereturn/?limit=1');
  if (existingPR.rows.length) {
    console.log('   already exists');
  } else {
    try {
      await api.post('/entity/purchasereturn/', {
        agent: { meta: supplier },
        organization: { meta: org },
        store: { meta: store },
      });
      console.log('   created');
    } catch (e) {
      console.log(`   failed: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  await sleep(200);

  // CounterpartyAdjustment
  console.log('\n13. CounterpartyAdjustment...');
  const existingCA = await api.get<{ rows: unknown[] }>('/entity/counterpartyadjustment/?limit=1');
  if (existingCA.rows.length) {
    console.log('   already exists');
  } else {
    try {
      await api.post('/entity/counterpartyadjustment/', {
        agent: { meta: customer },
        organization: { meta: org },
        sum: 10000,
      });
      console.log('   created');
    } catch (e) {
      console.log(`   failed: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  await sleep(200);

  // PriceList
  console.log('\n14. PriceList...');
  const existingPL = await api.get<{ rows: unknown[] }>('/entity/pricelist/?limit=1');
  if (existingPL.rows.length) {
    console.log('   already exists');
  } else {
    try {
      await api.post('/entity/pricelist/', {
        organization: { meta: org },
      });
      console.log('   created');
    } catch (e) {
      console.log(`   failed: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  await sleep(200);

  // InternalOrder
  console.log('\n15. InternalOrder...');
  const existingIO = await api.get<{ rows: unknown[] }>('/entity/internalorder/?limit=1');
  if (existingIO.rows.length) {
    console.log('   already exists');
  } else {
    try {
      await api.post('/entity/internalorder/', {
        organization: { meta: org },
        store: { meta: store },
      });
      console.log('   created');
    } catch (e) {
      console.log(`   failed: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  await sleep(200);

  // FactureOut (needs posted Demand)
  console.log('\n16. FactureOut...');
  const existingFO = await api.get<{ rows: unknown[] }>('/entity/factureout/?limit=1');
  if (existingFO.rows.length) {
    console.log('   already exists');
  } else {
    try {
      // Find a demand to link
      const demands = await api.get<{ rows: { meta: { href: string } }[] }>(
        '/entity/demand/?limit=1',
      );
      if (demands.rows.length) {
        await api.post('/entity/factureout/', {
          agent: { meta: customer },
          organization: { meta: org },
          demands: [{ meta: demands.rows[0]!.meta }],
        });
        console.log('   created');
      } else {
        console.log('   no demand to link');
      }
    } catch (e) {
      console.log(`   failed: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  await sleep(200);

  console.log('\n✅ More seeding complete.');
}

main().catch((e) => {
  console.error('\nFAILED:', e.message);
  process.exit(1);
});

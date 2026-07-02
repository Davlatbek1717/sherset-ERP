/**
 * Live real-DB smoke for the «Аналоги» (product analog list) surface.
 * Unit tests cover the Zod schema + the FE wiring; this drives the REAL
 * ProductAnalogService through the production DI graph against real Postgres,
 * focusing on the behaviour the Аналоги tab relies on:
 *
 *   add(self) REJECTED → add(missing) 404 → add(B) OK (freeStock = qty−reserved)
 *   → list shows B → duplicate add 409 (→ «Такой аналог уже добавлен») → add(C)
 *   → list ordered [B, C] by position → remove(B) → list [C] → tenant isolation
 *   (cross-account list/add 404) → soft-deleted analog drops out of list →
 *   hard-delete of the owner product cascades the join rows away.
 *
 * Run (from apps/api):
 *   node --env-file=.env --import tsx scripts/verify-product-analogs-smoke.ts
 *
 * Safe: one throwaway Account (random UUID), cascade-deleted in finally.
 */
import { prisma } from '@moysklad/db';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { ProductAnalogService } from '../src/modules/product/product-analog.service.js';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  if (String(actual) === String(expected)) {
    pass++;
    console.log(`  OK  ${label}: ${actual}`);
  } else {
    fail++;
    console.error(`  XX  ${label}: got ${actual}, expected ${expected}`);
  }
}

async function expectThrow(
  label: string,
  fn: () => Promise<unknown>,
  ctor: unknown,
): Promise<void> {
  try {
    await fn();
    fail++;
    console.error(`  XX  ${label}: expected throw, got success`);
  } catch (e) {
    if (e instanceof (ctor as new () => Error)) {
      pass++;
      console.log(`  OK  ${label}: threw ${(e as Error).constructor.name}`);
    } else {
      fail++;
      console.error(`  XX  ${label}: threw ${(e as Error).constructor.name}`);
    }
  }
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const svc = app.get(ProductAnalogService);
  const accountId = crypto.randomUUID();

  try {
    await prisma.account.create({ data: { id: accountId, name: 'ANALOGS-SMOKE-THROWAWAY' } });
    const mk = (name: string, code: string) =>
      prisma.product.create({ data: { accountId, name, code } });
    const A = await mk('Product A', 'A-1');
    const B = await mk('Product B', 'B-1');
    const C = await mk('Product C', 'C-1');

    // «Свободный остаток» fixture: B has 10 on-hand, 3 reserved → free = 7.
    const store = await prisma.store.create({ data: { accountId, name: 'Smoke store' } });
    await prisma.stock.create({
      data: {
        accountId,
        storeId: store.id,
        assortmentKind: 'product',
        assortmentId: B.id,
        qty: '10',
        reservedQty: '3',
      },
    });

    console.log('\n[1] add rejects self + missing analog:');
    await expectThrow(
      'self-analog rejected',
      () => svc.add(accountId, A.id, A.id),
      BadRequestException,
    );
    await expectThrow(
      'missing analog 404',
      () => svc.add(accountId, A.id, crypto.randomUUID()),
      NotFoundException,
    );
    await expectThrow(
      'missing OWNER product 404',
      () => svc.add(accountId, crypto.randomUUID(), B.id),
      NotFoundException,
    );

    console.log('\n[2] add(A→B) returns the analog with freeStock = qty − reserved:');
    const addedB = await svc.add(accountId, A.id, B.id);
    check('added analog name', addedB.name, 'Product B');
    check('added analog freeStock (10 − 3)', addedB.freeStock, '7');
    const list1 = await svc.list(accountId, A.id);
    check('list has 1 analog', list1.items.length, 1);
    check('list[0] is B', list1.items[0]?.analogId, B.id);
    check('list[0] freeStock', list1.items[0]?.freeStock, '7');

    console.log('\n[3] duplicate add is rejected (→ «Такой аналог уже добавлен»):');
    await expectThrow('duplicate add 409', () => svc.add(accountId, A.id, B.id), ConflictException);

    console.log('\n[4] add(A→C) appends; list is ordered by position [B, C]:');
    const addedC = await svc.add(accountId, A.id, C.id);
    check('added C freeStock (no stock rows)', addedC.freeStock, '0');
    const list2 = await svc.list(accountId, A.id);
    check('list has 2 analogs', list2.items.length, 2);
    check('order[0] = B', list2.items[0]?.analogId, B.id);
    check('order[1] = C', list2.items[1]?.analogId, C.id);

    console.log('\n[5] remove(A→B) leaves [C]:');
    await svc.remove(accountId, A.id, B.id);
    const list3 = await svc.list(accountId, A.id);
    check('list has 1 analog', list3.items.length, 1);
    check('remaining is C', list3.items[0]?.analogId, C.id);

    console.log('\n[6] tenant isolation (other account cannot list/add this product):');
    const other = crypto.randomUUID();
    await prisma.account.create({ data: { id: other, name: 'OTHER-ANALOGS-SMOKE' } });
    try {
      await expectThrow('cross-tenant list 404', () => svc.list(other, A.id), NotFoundException);
      await expectThrow(
        'cross-tenant add 404',
        () => svc.add(other, A.id, C.id),
        NotFoundException,
      );
    } finally {
      await prisma.account.delete({ where: { id: other } });
    }

    console.log('\n[7] a soft-deleted analog drops out of the list:');
    await prisma.product.update({ where: { id: C.id }, data: { deletedAt: new Date() } });
    const list4 = await svc.list(accountId, A.id);
    check('soft-deleted analog hidden', list4.items.length, 0);

    console.log('\n[8] hard-delete of the owner product cascades the join rows:');
    // Re-link a fresh live analog, then hard-delete the owner → rows gone. NB:
    // C's join row LINGERS (soft-delete keeps it, only hidden from list), so A
    // now has 2 join rows (the hidden C + the live D) — both must cascade away.
    const D = await mk('Product D', 'D-1');
    await svc.add(accountId, A.id, D.id);
    check(
      'join rows exist before delete (hidden C + live D)',
      await prisma.productAnalog.count({ where: { accountId, productId: A.id } }),
      2,
    );
    await prisma.product.delete({ where: { id: A.id } });
    check(
      'join rows cascaded after owner hard-delete',
      await prisma.productAnalog.count({ where: { accountId, productId: A.id } }),
      0,
    );
  } finally {
    await prisma.account.delete({ where: { id: accountId } }).catch(() => undefined);
    await app.close();
  }

  console.log(`\n${'='.repeat(48)}\nRESULT: ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

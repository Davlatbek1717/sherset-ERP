/**
 * Live real-DB smoke for the Валюты (Currency) bulk «Изменить» surface.
 * Unit tests cover the Zod schemas + the web dropdown; this drives the REAL
 * CurrencyService + PermissionsService through the production DI graph against
 * real Postgres, focusing on the behaviour the new bulk UI relies on:
 *
 *   seed default → create USD/EUR → bulk-archive over a mixed selection
 *   (base валюта учёта is REJECTED, others succeed → partial result) →
 *   bulk-restore → bulk-delete over a mixed selection (base+system REJECTED,
 *   others succeed → partial) → direct delete of a plain currency → tenant
 *   isolation → permission resolution (currency create/delete = ALL for admin).
 *
 * Run (from apps/api):
 *   node --env-file=.env --env-file=../../.env.local --import tsx scripts/verify-currencies-smoke.ts
 *
 * Safe: one throwaway Account (random UUID), cascade-deleted in finally.
 */
import { prisma } from '@moysklad/db';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { CurrencyService } from '../src/modules/currency/currency.service.js';
import { PermissionsService } from '../src/modules/permissions/permissions.service.js';
import { runBulk } from '../src/modules/shared/bulk.js';

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
  const svc = app.get(CurrencyService);
  const perms = app.get(PermissionsService);
  const accountId = crypto.randomUUID();

  try {
    await prisma.account.create({ data: { id: accountId, name: 'CURRENCIES-SMOKE-THROWAWAY' } });
    const admin = await prisma.employee.create({
      data: { accountId, name: 'Admin', email: `admin-${accountId}@smoke.local` },
    });

    console.log('\n[1] seed default (UZS = валюта учёта + system):');
    await svc.seedDefaultsIfEmpty(accountId);
    const seeded = await svc.list(accountId, {});
    check('seed creates exactly 1 currency', seeded.total, 1);
    const uzs = seeded.items[0] as { id: string; default: boolean; system: boolean };
    check('seeded UZS is default', uzs.default, true);
    check('seeded UZS is system', uzs.system, true);

    console.log('\n[2] create plain non-default currencies (USD, EUR):');
    const usd = await svc.create(accountId, {
      // code = ISO NUMERIC, isoCode = ISO ALPHA (moysklad model).
      code: '840',
      isoCode: 'USD',
      name: 'dollar',
      rate: '12500',
      rateUpdateType: 'MANUAL',
    });
    const eur = await svc.create(accountId, {
      code: '978',
      isoCode: 'EUR',
      name: 'evro',
      rate: '13000',
      rateUpdateType: 'MANUAL',
    });
    check('USD created non-default', usd?.default, false);
    check('USD created non-system', usd?.system, false);
    check('list now 3', (await svc.list(accountId, {})).total, 3);

    console.log('\n[3] bulk-archive mixed [UZS(default), USD] — base REJECTED, USD OK (partial):');
    const arch = await runBulk([uzs.id, usd.id], (id) => svc.archive(accountId, id));
    check('archive total', arch.total, 2);
    check('archive succeeded (USD only)', arch.succeeded.length, 1);
    check('archive failed (base валюта учёта)', arch.failed.length, 1);
    check(
      'base currency stays unarchived',
      (await svc.findById(accountId, uzs.id)).archived,
      false,
    );
    check('USD archived', (await svc.findById(accountId, usd.id)).archived, true);
    await expectThrow(
      'direct archive of base currency rejected',
      () => svc.archive(accountId, uzs.id),
      BadRequestException,
    );

    console.log('\n[4] bulk-restore [USD]:');
    const rest = await runBulk([usd.id], (id) => svc.restore(accountId, id));
    check('restore succeeded', rest.succeeded.length, 1);
    check('USD restored', (await svc.findById(accountId, usd.id)).archived, false);

    console.log('\n[5] bulk-delete mixed [UZS(default+system), USD] — base REJECTED, USD OK:');
    const del = await runBulk([uzs.id, usd.id], (id) => svc.delete(accountId, id));
    check('delete total', del.total, 2);
    check('delete succeeded (USD only)', del.succeeded.length, 1);
    check('delete failed (base default+system)', del.failed.length, 1);
    check('base currency still present', (await svc.findById(accountId, uzs.id)).id, uzs.id);
    await expectThrow(
      'deleted USD → findById 404',
      () => svc.findById(accountId, usd.id),
      NotFoundException,
    );

    console.log('\n[6] direct delete of a plain currency (EUR) works:');
    const eurDel = await svc.delete(accountId, eur.id);
    check('EUR delete ok', eurDel?.ok, true);
    check('list back to 1 (base only)', (await svc.list(accountId, {})).total, 1);

    console.log('\n[7] tenant isolation:');
    const otherAccount = crypto.randomUUID();
    await prisma.account.create({ data: { id: otherAccount, name: 'OTHER-SMOKE' } });
    try {
      await expectThrow(
        'cross-tenant findById 404',
        () => svc.findById(otherAccount, uzs.id),
        NotFoundException,
      );
    } finally {
      await prisma.account.delete({ where: { id: otherAccount } });
    }

    console.log('\n[8] permission resolution (currency create/delete = ALL for admin):');
    await perms.seedSystemRoles(accountId, admin.id);
    check(
      'throwaway admin currency:create',
      await perms.resolveScope(admin.id, 'currency', 'create'),
      'ALL',
    );
    check(
      'throwaway admin currency:delete',
      await perms.resolveScope(admin.id, 'currency', 'delete'),
      'ALL',
    );

    const devAdmin = await prisma.employee.findFirst({ where: { email: 'admin@demo.local' } });
    if (devAdmin) {
      const deleteScope = await perms.resolveScope(devAdmin.id, 'currency', 'delete');
      check('DEV admin currency:delete not NO (no 403)', deleteScope !== 'NO', true);
      console.log(`      (dev admin currency:delete=${deleteScope})`);
    } else {
      console.log('      (no admin@demo.local employee found — skipped dev-account check)');
    }
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

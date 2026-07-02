/**
 * Live real-DB smoke for the Единицы измерения (UOM) bulk-delete surface.
 * Unit tests cover the Zod schemas + the web dropdown; this drives the REAL
 * UomService + PermissionsService through the production DI graph against real
 * Postgres:
 *
 *   create → list(search/sort) → null-clear update → delete→404 → bulk-delete
 *   via runBulk (the exact controller path: partial result with a ghost id) →
 *   delete a "system" (shared) row is allowed (moysklad enables «Удалить» for
 *   system uoms) → seedDefaultsIfEmpty re-seeds an emptied account → tenant
 *   isolation → permission resolution (uom create/delete = ALL for admin).
 *
 * Run (from apps/api):
 *   node --env-file=../../.env.local --import tsx scripts/verify-uoms-smoke.ts
 *
 * Safe: one throwaway Account (random UUID), cascade-deleted in finally.
 * Touches the real dev account ONLY for a read-only resolveScope check.
 */
import { prisma } from '@moysklad/db';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { PermissionsService } from '../src/modules/permissions/permissions.service.js';
import { runBulk } from '../src/modules/shared/bulk.js';
import { UomService } from '../src/modules/uom/uom.service.js';

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
    const ok = e instanceof (ctor as new () => Error);
    if (ok) {
      pass++;
      console.log(`  OK  ${label}: threw ${(e as Error).constructor.name}`);
    } else {
      fail++;
      console.error(
        `  XX  ${label}: threw ${(e as Error).constructor.name}, expected ${(ctor as { name: string }).name}`,
      );
    }
  }
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const svc = app.get(UomService);
  const perms = app.get(PermissionsService);
  const accountId = crypto.randomUUID();

  try {
    await prisma.account.create({ data: { id: accountId, name: 'UOMS-SMOKE-THROWAWAY' } });
    const admin = await prisma.employee.create({
      data: { accountId, name: 'Admin', email: `admin-${accountId}@smoke.local` },
    });

    console.log('\n[1] create + unique-code conflict:');
    const u1 = await svc.create(accountId, { name: 'рулон', code: 'RLN', description: 'roll' });
    check('create returns name', u1?.name, 'рулон');
    check('shared defaults true', u1?.shared, true);
    const u2 = await svc.create(accountId, { name: 'упаковка', code: 'PKG' });
    check('second create ok', u2?.name, 'упаковка');
    await expectThrow(
      'duplicate code rejected',
      () => svc.create(accountId, { name: 'dup', code: 'RLN' }),
      ConflictException,
    );

    console.log('\n[2] list (search / sort) — total = items.length:');
    const all = await svc.list(accountId, {});
    check('list total', all.total, 2);
    const searched = await svc.list(accountId, { search: 'рул' });
    check('search by name (insensitive)', searched.items.length, 1);
    check('search hit name', searched.items[0]?.name, 'рулон');

    console.log('\n[3] update — null-clear of optionals (the exact edit-form payload):');
    const upd = await svc.update(accountId, u1.id, {
      name: 'рулон v2',
      code: null,
      externalCode: null,
      description: null,
    });
    check('update name', upd?.name, 'рулон v2');
    check('null clears code (was RLN)', upd?.code, 'null');
    check('null clears description (was "roll")', upd?.description, 'null');

    console.log('\n[4] delete one → findById 404:');
    await svc.delete(accountId, u2.id);
    await expectThrow(
      'deleted uom → findById 404',
      () => svc.findById(accountId, u2.id),
      NotFoundException,
    );

    console.log('\n[5] bulk-delete via runBulk (the controller path: partial w/ ghost id):');
    const u3 = await svc.create(accountId, { name: 'ящик', code: 'BOX' });
    const u4 = await svc.create(accountId, { name: 'тонна', code: 'TON' });
    const ghost = crypto.randomUUID();
    const bulkRes = await runBulk([u3.id, u4.id, ghost], (id) => svc.delete(accountId, id));
    check('bulk total', bulkRes.total, 3);
    check('bulk succeeded', bulkRes.succeeded.length, 2);
    check('bulk failed (ghost)', bulkRes.failed.length, 1);

    console.log('\n[6] deleting a system/shared uom is allowed (moysklad parity):');
    const sysUom = await svc.create(accountId, { name: 'системная', code: 'SYS', shared: true });
    check('created shared (system) uom', sysUom?.shared, true);
    const delRes = await svc.delete(accountId, sysUom.id);
    check('shared uom delete ok (no system guard, matches moysklad)', delRes?.ok, true);

    console.log('\n[7] empty an account → seedDefaultsIfEmpty re-seeds the UZ subset:');
    const seedAccount = crypto.randomUUID();
    await prisma.account.create({ data: { id: seedAccount, name: 'UOM-SEED-THROWAWAY' } });
    try {
      const before = await svc.list(seedAccount, {});
      check('fresh account has 0 uoms', before.total, 0);
      await svc.seedDefaultsIfEmpty(seedAccount);
      const after = await svc.list(seedAccount, {});
      check('seedDefaultsIfEmpty seeds 8 UZ defaults', after.total, 8);
    } finally {
      await prisma.account.delete({ where: { id: seedAccount } });
    }

    console.log('\n[8] tenant isolation:');
    const otherAccount = crypto.randomUUID();
    await prisma.account.create({ data: { id: otherAccount, name: 'OTHER-SMOKE' } });
    try {
      await expectThrow(
        'cross-tenant findById 404',
        () => svc.findById(otherAccount, u1.id),
        NotFoundException,
      );
    } finally {
      await prisma.account.delete({ where: { id: otherAccount } });
    }

    console.log('\n[9] permission resolution (uom create/delete = ALL for admin):');
    await perms.seedSystemRoles(accountId, admin.id);
    check('throwaway admin uom:create', await perms.resolveScope(admin.id, 'uom', 'create'), 'ALL');
    check('throwaway admin uom:delete', await perms.resolveScope(admin.id, 'uom', 'delete'), 'ALL');

    const devAdmin = await prisma.employee.findFirst({ where: { email: 'admin@demo.local' } });
    if (devAdmin) {
      const deleteScope = await perms.resolveScope(devAdmin.id, 'uom', 'delete');
      check('DEV admin uom:delete not NO (no 403)', deleteScope !== 'NO', true);
      console.log(`      (dev admin uom:delete=${deleteScope})`);
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

/**
 * Live real-DB smoke for the new Проекты (Projects) catalog write path.
 * Unit tests cover the Zod schemas; this drives the REAL ProjectService +
 * PermissionsService through the production DI graph against real Postgres:
 *
 *   create → list(search/archived/sort) → update → unique-code conflict →
 *   archive/restore → mass-edit (owner+description) → bulk (runBulk partial)
 *   → FK SetNull on hard-delete → permission resolution (throwaway + the
 *   real dev admin, the analitika-style "new action 403" guard).
 *
 * Run (from apps/api):
 *   node --env-file=../../.env.local --import tsx scripts/verify-projects-smoke.ts
 *
 * Safe: one throwaway Account (random UUID), cascade-deleted in finally.
 * Touches the real dev account ONLY for a read-only resolveScope check.
 */
import { prisma } from '@moysklad/db';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { PermissionsService } from '../src/modules/permissions/permissions.service.js';
import { ProjectService } from '../src/modules/project/project.service.js';
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
  const svc = app.get(ProjectService);
  const perms = app.get(PermissionsService);
  const accountId = crypto.randomUUID();

  try {
    await prisma.account.create({ data: { id: accountId, name: 'PROJECTS-SMOKE-THROWAWAY' } });
    const admin = await prisma.employee.create({
      data: { accountId, name: 'Admin', email: `admin-${accountId}@smoke.local` },
    });
    const org = await prisma.organization.create({ data: { accountId, name: 'Org' } });
    const store = await prisma.store.create({ data: { accountId, name: 'Ombor' } });
    const customer = await prisma.counterparty.create({ data: { accountId, name: 'Customer' } });

    console.log('\n[1] create + ownerId default + unique-code conflict:');
    const p1 = await svc.create(accountId, admin.id, {
      name: 'Aggregator',
      code: 'PRJ-1',
      description: 'first',
    });
    check('create returns name', p1?.name, 'Aggregator');
    check('ownerId defaults to creator', p1?.ownerId, admin.id);
    check('archived defaults false', p1?.archived, false);
    const p2 = await svc.create(accountId, admin.id, { name: 'Plan', code: 'PRJ-2' });
    check('second create ok', p2?.name, 'Plan');
    await expectThrow(
      'duplicate code rejected',
      () => svc.create(accountId, admin.id, { name: 'Dup', code: 'PRJ-1' }),
      ConflictException,
    );

    console.log('\n[2] list (total opt-in / search / archived / sort):');
    const active = await svc.list(accountId, { archived: 'false', withTotal: 'true' });
    check('active total (withTotal)', active.total, 2);
    const picker = await svc.list(accountId, { search: 'aggreg' });
    check('search by name (insensitive)', picker.items.length, 1);
    check('picker path omits COUNT (total undefined)', picker.total, 'undefined');
    const searchedDesc = await svc.list(accountId, { search: 'first' });
    check('search by description', searchedDesc.items[0]?.name, 'Aggregator');

    console.log('\n[3] update — incl. null-clear of optionals (the exact edit-form payload):');
    const upd = await svc.update(accountId, p1.id, {
      name: 'Aggregator v2',
      code: null,
      externalCode: null,
      description: null,
    });
    check('update name', upd?.name, 'Aggregator v2');
    check('null clears code (was PRJ-1)', upd?.code, 'null');
    check('null clears description (was "first")', upd?.description, 'null');

    console.log('\n[4] archive / restore + archived view:');
    await svc.archive(accountId, p1.id);
    const afterArchive = await svc.list(accountId, { archived: 'false', withTotal: 'true' });
    check('active list hides archived', afterArchive.total, 1);
    const archivedList = await svc.list(accountId, { archived: 'true', withTotal: 'true' });
    check('archived view shows it', archivedList.total, 1);
    await svc.restore(accountId, p1.id);
    const afterRestore = await svc.findById(accountId, p1.id);
    check('restore clears archived', afterRestore.archived, false);

    console.log('\n[5] mass-edit (owner clear + description):');
    await svc.massEditApply(accountId, p1.id, { ownerId: null, description: 'mass-edited' });
    const afterMass = await svc.findById(accountId, p1.id);
    check('mass-edit set description', afterMass.description, 'mass-edited');
    check('mass-edit cleared owner', afterMass.ownerId, 'null');

    console.log('\n[6] bulk via runBulk (partial result with a ghost id):');
    const ghost = crypto.randomUUID();
    const bulkRes = await runBulk([p1.id, p2.id, ghost], (id) => svc.archive(accountId, id));
    check('bulk total', bulkRes.total, 3);
    check('bulk succeeded', bulkRes.succeeded.length, 2);
    check('bulk failed (ghost)', bulkRes.failed.length, 1);
    // restore for the FK test below
    await svc.restore(accountId, p1.id);

    console.log('\n[7] FK SetNull on hard-delete (document projectId → null):');
    const demand = await prisma.demand.create({
      data: {
        accountId,
        name: 'D-FK',
        agentId: customer.id,
        organizationId: org.id,
        storeId: store.id,
        projectId: p1.id,
        currency: 'UZS',
        rateValue: 100_000_000n,
        state: 'draft',
        sumMinor: 0n,
      },
    });
    await svc.delete(accountId, p1.id);
    await expectThrow(
      'deleted project → findById 404',
      () => svc.findById(accountId, p1.id),
      NotFoundException,
    );
    const orphan = await prisma.demand.findUnique({
      where: { id: demand.id },
      select: { projectId: true },
    });
    check('referencing demand projectId set to null (not blocked)', orphan?.projectId, 'null');

    console.log('\n[8] tenant isolation:');
    const otherAccount = crypto.randomUUID();
    await prisma.account.create({ data: { id: otherAccount, name: 'OTHER-SMOKE' } });
    try {
      await expectThrow(
        'cross-tenant findById 404',
        () => svc.findById(otherAccount, p2.id),
        NotFoundException,
      );
    } finally {
      await prisma.account.delete({ where: { id: otherAccount } });
    }

    console.log('\n[9] permission resolution (project create/update/delete = ALL for admin):');
    await perms.seedSystemRoles(accountId, admin.id);
    check(
      'throwaway admin project:create',
      await perms.resolveScope(admin.id, 'project', 'create'),
      'ALL',
    );
    check(
      'throwaway admin project:update',
      await perms.resolveScope(admin.id, 'project', 'update'),
      'ALL',
    );
    check(
      'throwaway admin project:delete',
      await perms.resolveScope(admin.id, 'project', 'delete'),
      'ALL',
    );

    const devAdmin = await prisma.employee.findFirst({ where: { email: 'admin@demo.local' } });
    if (devAdmin) {
      const createScope = await perms.resolveScope(devAdmin.id, 'project', 'create');
      const deleteScope = await perms.resolveScope(devAdmin.id, 'project', 'delete');
      check('DEV admin project:create not NO (no 403)', createScope !== 'NO', true);
      check('DEV admin project:delete not NO (no 403)', deleteScope !== 'NO', true);
      console.log(`      (dev admin create=${createScope}, delete=${deleteScope})`);
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

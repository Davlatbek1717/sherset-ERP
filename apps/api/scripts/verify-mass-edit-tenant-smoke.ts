/**
 * Live real-DB smoke for the mass-edit tenant-FK guard (backlog #12).
 *
 * The MassEditSchema validates only the UUID *format* of ownerId/projectId,
 * so before this fix a hand-crafted `POST /<doc>/mass-edit` could point a
 * document's owner/project at a row from ANOTHER account ("dangling FK"
 * inside the caller's own account). The shared `assertMassEditRefsInTenant`
 * helper now guards every massEditApply. This drives the REAL services
 * through the production DI graph against real Postgres to prove:
 *
 *   - cross-tenant ownerId  → BadRequest (rejected)
 *   - cross-tenant projectId → BadRequest (rejected)
 *   - mixed (valid owner + cross-tenant project) → BadRequest (per-field)
 *   - same-tenant owner+project → success
 *   - null owner/project (clear) → success
 *
 * Covered service shapes: demand (ownerId+projectId) and project (ownerId
 * only) — the two wiring variants. work-order (previously guarded inline)
 * now routes through the same helper; the demand+project pair exercises
 * both branches of the shared helper.
 *
 * Run (from apps/api):
 *   node --env-file=../../.env.local --import tsx scripts/verify-mass-edit-tenant-smoke.ts
 *
 * Safe: two throwaway Accounts (random UUIDs), cascade-deleted in finally.
 */
import { prisma } from '@moysklad/db';
import { BadRequestException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { DemandService } from '../src/modules/demand/demand.service.js';
import { ProjectService } from '../src/modules/project/project.service.js';

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
  ctor: new (...a: never[]) => Error,
): Promise<void> {
  try {
    await fn();
    fail++;
    console.error(`  XX  ${label}: expected throw, got success`);
  } catch (e) {
    if (e instanceof ctor) {
      pass++;
      console.log(`  OK  ${label}: threw ${(e as Error).constructor.name}`);
    } else {
      fail++;
      console.error(
        `  XX  ${label}: threw ${(e as Error).constructor.name}, expected ${ctor.name}`,
      );
    }
  }
}

async function seedAccount(name: string) {
  const accountId = crypto.randomUUID();
  await prisma.account.create({ data: { id: accountId, name } });
  const owner = await prisma.employee.create({
    data: { accountId, name: 'Owner', email: `owner-${accountId}@smoke.local` },
  });
  const project = await prisma.project.create({ data: { accountId, name: `Proj-${name}` } });
  return { accountId, owner, project };
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const demandSvc = app.get(DemandService);
  const projectSvc = app.get(ProjectService);

  const A = await seedAccount('MASS-EDIT-TENANT-A');
  const B = await seedAccount('MASS-EDIT-TENANT-B');

  try {
    // Account B gets a demand to mass-edit (ownerId + projectId variant).
    const org = await prisma.organization.create({ data: { accountId: B.accountId, name: 'Org' } });
    const store = await prisma.store.create({ data: { accountId: B.accountId, name: 'Ombor' } });
    const agent = await prisma.counterparty.create({
      data: { accountId: B.accountId, name: 'Customer' },
    });
    const demandB = await prisma.demand.create({
      data: {
        accountId: B.accountId,
        name: 'D-1',
        agentId: agent.id,
        organizationId: org.id,
        storeId: store.id,
        currency: 'UZS',
        rateValue: 100_000_000n,
        state: 'draft',
        sumMinor: 0n,
      },
    });

    console.log('\n[1] demand mass-edit — cross-tenant FK rejected (the bug):');
    await expectThrow(
      'cross-tenant ownerId (A employee on B demand)',
      () => demandSvc.massEditApply(B.accountId, B.owner.id, demandB.id, { ownerId: A.owner.id }),
      BadRequestException,
    );
    await expectThrow(
      'cross-tenant projectId (A project on B demand)',
      () =>
        demandSvc.massEditApply(B.accountId, B.owner.id, demandB.id, { projectId: A.project.id }),
      BadRequestException,
    );
    await expectThrow(
      'mixed: valid owner + cross-tenant project (per-field check)',
      () =>
        demandSvc.massEditApply(B.accountId, B.owner.id, demandB.id, {
          ownerId: B.owner.id,
          projectId: A.project.id,
        }),
      BadRequestException,
    );

    console.log('\n[2] demand mass-edit — same-tenant + null still work:');
    await demandSvc.massEditApply(B.accountId, B.owner.id, demandB.id, {
      ownerId: B.owner.id,
      projectId: B.project.id,
    });
    const afterValid = await prisma.demand.findUnique({
      where: { id: demandB.id },
      select: { ownerId: true, projectId: true },
    });
    check('same-tenant owner applied', afterValid?.ownerId, B.owner.id);
    check('same-tenant project applied', afterValid?.projectId, B.project.id);
    await demandSvc.massEditApply(B.accountId, B.owner.id, demandB.id, {
      ownerId: null,
      projectId: null,
      description: 'cleared',
    });
    const afterClear = await prisma.demand.findUnique({
      where: { id: demandB.id },
      select: { ownerId: true, projectId: true, description: true },
    });
    check('null cleared owner', afterClear?.ownerId, 'null');
    check('null cleared project', afterClear?.projectId, 'null');
    check('description still applied alongside null FKs', afterClear?.description, 'cleared');

    console.log('\n[3] project mass-edit (owner-only service) — same guard:');
    await expectThrow(
      'cross-tenant ownerId on B project',
      () => projectSvc.massEditApply(B.accountId, B.project.id, { ownerId: A.owner.id }),
      BadRequestException,
    );
    await projectSvc.massEditApply(B.accountId, B.project.id, {
      ownerId: B.owner.id,
      description: 'ok',
    });
    const projAfter = await prisma.project.findUnique({
      where: { id: B.project.id },
      select: { ownerId: true, description: true },
    });
    check('project same-tenant owner applied', projAfter?.ownerId, B.owner.id);
    check('project description applied', projAfter?.description, 'ok');
  } finally {
    await prisma.account.delete({ where: { id: A.accountId } }).catch(() => undefined);
    await prisma.account.delete({ where: { id: B.accountId } }).catch(() => undefined);
    await app.close();
  }

  console.log(`\n${'='.repeat(48)}\nRESULT: ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

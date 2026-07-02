#!/usr/bin/env tsx
/**
 * Idempotent bulk-import of counterparties from
 * `tools/old-counterparties.json` (produced by
 * `tools/import-old-counterparties.py`) into the moysklad_db.
 *
 * Strategy:
 *   1. Resolve the target Account by id (default: the seed Demo Org
 *      00000000-0000-0000-0000-000000000001 — overridable via
 *      `IMPORT_ACCOUNT_ID` env var so the same script works on any
 *      tenant).
 *   2. Stream the JSON, batch-upsert by `(accountId, externalCode)`.
 *      `externalCode` carries the legacy moysklad UUID, so a re-run
 *      is a no-op and a future re-sync against the real moysklad
 *      API can match the same counterparties.
 *   3. Telegram fields move into `Counterparty.attributes.telegram`
 *      (the existing custom-attribute slot) — no schema change
 *      needed. Tags survive as `String[]` on `tags`.
 *
 * Run:
 *   pnpm --filter @moysklad/api exec tsx \\
 *     src/scripts/import-counterparties.ts
 *
 * Env:
 *   DATABASE_URL          — Postgres URL (loaded via .env)
 *   IMPORT_ACCOUNT_ID     — target tenant; default seed Demo
 *   IMPORT_BATCH_SIZE     — default 100
 *   IMPORT_DRY_RUN=1      — print stats + exit, no writes
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@moysklad/db';

const DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const BATCH_SIZE = Number(process.env.IMPORT_BATCH_SIZE ?? 100);
const DRY_RUN = process.env.IMPORT_DRY_RUN === '1';

interface LegacyRow {
  name: string;
  phone: string | null;
  email: string | null;
  externalCode: string;
  tags: string[];
  telegram: {
    username?: string;
    phone?: string;
    chatId?: string;
    ustaPhone?: string;
    linked?: boolean;
    notificationsEnabled?: boolean;
  };
  balanceFloat: number;
  createdAt: string | null;
}

async function main(): Promise<void> {
  const accountId = process.env.IMPORT_ACCOUNT_ID ?? DEFAULT_ACCOUNT_ID;
  const jsonPath = resolve(
    process.cwd(),
    process.argv[2] ?? '../../tools/old-counterparties.json',
  );

  console.log('=== counterparty import ===');
  console.log('  Account:    ', accountId);
  console.log('  Source:     ', jsonPath);
  console.log('  Batch size: ', BATCH_SIZE);
  console.log('  Dry run:    ', DRY_RUN);
  console.log();

  const raw = await readFile(jsonPath, 'utf8');
  const rows: LegacyRow[] = JSON.parse(raw);
  console.log(`Loaded ${rows.length.toLocaleString()} legacy rows.`);

  // Skip rows missing a name — Prisma model requires non-empty.
  const cleaned = rows.filter((r) => r.name && r.name.trim().length > 0);
  console.log(
    `  ${cleaned.length.toLocaleString()} have a name; ${(rows.length - cleaned.length).toLocaleString()} skipped.`,
  );

  if (DRY_RUN) {
    console.log('\nDry run — no writes. Exiting.');
    return;
  }

  const prisma = new PrismaClient();
  await prisma.$connect();

  // Sanity: account must exist before we upsert children.
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    console.error(
      `!! Account ${accountId} does not exist. Run pnpm seed first or pass IMPORT_ACCOUNT_ID.`,
    );
    process.exit(1);
  }

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  const startedAt = Date.now();

  for (let i = 0; i < cleaned.length; i += BATCH_SIZE) {
    const batch = cleaned.slice(i, i + BATCH_SIZE);
    // Upsert in parallel within each batch — Prisma handles connection
    // pool reuse. `(accountId, externalCode)` is the natural unique key
    // here even though the schema's @@unique covers `[accountId, name]`,
    // so we route updates by externalCode lookup first.
    const results = await Promise.allSettled(
      batch.map((r) => upsertOne(prisma, accountId, r)),
    );
    for (const res of results) {
      if (res.status === 'fulfilled') {
        if (res.value === 'inserted') inserted++;
        else updated++;
      } else {
        failed++;
        console.error('  fail:', (res.reason as Error).message);
      }
    }
    process.stdout.write(
      `\r  progress: ${(i + batch.length).toLocaleString()} / ${cleaned.length.toLocaleString()} ` +
        `(${inserted} new, ${updated} updated, ${failed} failed)`,
    );
  }

  const totalMs = Date.now() - startedAt;
  console.log();
  console.log();
  console.log('=== done ===');
  console.log('  Inserted:  ', inserted);
  console.log('  Updated:   ', updated);
  console.log('  Failed:    ', failed);
  console.log('  Total time:', `${(totalMs / 1000).toFixed(1)}s`);

  await prisma.$disconnect();
}

async function upsertOne(
  prisma: PrismaClient,
  accountId: string,
  r: LegacyRow,
): Promise<'inserted' | 'updated'> {
  // Build the attributes JSON — currently only `telegram` lives there,
  // but other custom fields can join later without a migration.
  const attributes: Record<string, unknown> = {};
  if (Object.keys(r.telegram).length > 0) {
    attributes.telegram = r.telegram;
  }
  if (r.balanceFloat !== 0) {
    // Surface the legacy float balance as informational metadata —
    // the new ledger drives real balances, but having the historical
    // figure available aids reconciliation.
    attributes.legacyBalance = r.balanceFloat;
  }

  const existing = await prisma.counterparty.findFirst({
    where: { accountId, externalCode: r.externalCode },
    select: { id: true },
  });

  if (existing) {
    await prisma.counterparty.update({
      where: { id: existing.id },
      data: {
        name: r.name.trim().slice(0, 255),
        phone: r.phone?.slice(0, 20) ?? null,
        email: r.email?.slice(0, 255) ?? null,
        tags: r.tags,
        attributes: attributes as never,
      },
    });
    return 'updated';
  }

  await prisma.counterparty.create({
    data: {
      accountId,
      name: r.name.trim().slice(0, 255),
      phone: r.phone?.slice(0, 20) ?? null,
      email: r.email?.slice(0, 255) ?? null,
      externalCode: r.externalCode,
      tags: r.tags,
      attributes: attributes as never,
      // Other defaults are fine: companyType=legalUZ, archived=false,
      // bonusPoints=0, salesAmount=0n, shared=false.
    },
  });
  return 'inserted';
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

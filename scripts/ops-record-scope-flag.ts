/**
 * MK39 — OPS: `Account.recordScopeEnforced` bayrog'ini yoqish/o'chirish.
 *
 * Nega skript, nega qo'lda `UPDATE` emas: yoqish DARVOZADAN o'tishi kerak.
 * Qamrovda teshik borligicha bayroqni yoqish — «yarim yoqilgan» holat: ruxsat
 * berildi deb o'ylanadi, ulanmagan modullarda ro'yxat to'liq ochiq qoladi.
 * Qaror mantiqi `planFlagChange` da va u testda qulflangan (asimmetrik:
 * o'chirish HAR DOIM ishlaydi — bayroq qaytariladigan bo'lishi shart).
 *
 * Ishlatish:
 *   node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/ops-record-scope-flag.ts --list
 *   node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/ops-record-scope-flag.ts --account=<id> --on
 *   node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/ops-record-scope-flag.ts --account=<id> --off
 *
 * DATABASE_URL `apps/api/.env` dan o'qiladi (boshqa cert skriptlar bilan bir xil).
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  RECORD_SCOPE_REGISTRY,
  buildCoverage,
  canEnableRecordScope,
  planFlagChange,
  repoRoot,
} from '../apps/api/src/modules/permissions/record-scope-coverage.js';

const ROOT = repoRoot();

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const accountId = argv.find((a) => a.startsWith('--account='))?.slice('--account='.length);

/** @returns process exit kodi */
async function main(): Promise<number> {
  if (!has('--list') && !has('--on') && !has('--off')) {
    console.error('Ishlatish: --list | --account=<id> --on | --account=<id> --off');
    return 2;
  }

  // DATABASE_URL — apps/api/.env dan (repo cert skriptlari naqshi).
  if (!process.env.DATABASE_URL) {
    const envText = readFileSync(join(ROOT, 'apps/api/.env'), 'utf8').replace(/^﻿/, '');
    for (const line of envText.split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
      if (m) {
        process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, '');
        break;
      }
    }
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL topilmadi (apps/api/.env)');

  // Darvozani DB'ga ulanishdan OLDIN tekshiramiz — rad javobi uchun DB kerak emas.
  if (!has('--list')) {
    if (!accountId) {
      console.error('--account=<id> kerak');
      return 2;
    }
    const rows = buildCoverage(RECORD_SCOPE_REGISTRY, (file) => {
      try {
        return readFileSync(join(ROOT, file), 'utf8');
      } catch {
        return null;
      }
    });
    const gate = canEnableRecordScope(rows);
    const plan = planFlagChange({ target: has('--on') ? 'on' : 'off', gateOk: gate.ok });
    if (plan.action === 'refuse') {
      console.error(plan.message);
      console.error(`Blokerlar: ${gate.blockers.length} ta. Birinchi 10:`);
      for (const b of gate.blockers.slice(0, 10)) console.error(`  ✗ ${b}`);
      return 1;
    }
    return await applyFlag(accountId, plan.action === 'enable', plan.message);
  }

  const prisma = newPrisma();
  try {
    const accounts = await prisma.account.findMany({
      select: { id: true, name: true, recordScopeEnforced: true },
      orderBy: { name: 'asc' },
    });
    console.log('— AKKAUNTLAR —');
    for (const a of accounts) {
      console.log(`  ${a.recordScopeEnforced ? '🔒 ON ' : '🔓 OFF'}  ${a.id}  ${a.name}`);
    }
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Prisma client'ni HOSILA yo'lidan oladi: repo ildizida `@moysklad/db`
 * bog'liqligi yo'q (u workspace paketlari ichida), shu sababli boshqa
 * `scripts/verify-*` fayllari kabi to'g'ridan-to'g'ri generated client'ga
 * murojaat qilamiz.
 */
function newPrisma() {
  const req = createRequire(join(ROOT, 'scripts/'));
  const { PrismaClient } = req(join(ROOT, 'packages/db/src/generated/index.js'));
  return new PrismaClient();
}

async function applyFlag(id: string, next: boolean, message: string): Promise<number> {
  const prisma = newPrisma();
  try {
    const account = await prisma.account.findUnique({
      where: { id },
      select: { id: true, name: true, recordScopeEnforced: true },
    });
    if (!account) {
      console.error(`Akkaunt topilmadi: ${id}`);
      return 1;
    }
    if (account.recordScopeEnforced === next) {
      console.log(`O'zgarishsiz: ${account.name} allaqachon ${next ? 'ON' : 'OFF'}.`);
      return 0;
    }
    await prisma.account.update({ where: { id }, data: { recordScopeEnforced: next } });
    console.log(message);
    console.log(`${account.name}: recordScopeEnforced ${account.recordScopeEnforced} → ${next}`);
    console.log(
      next
        ? "Qaytarish: ushbu skriptni --off bilan yugurtiring (darvoza to'smaydi)."
        : 'Eski xulq qaytdi.',
    );
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);

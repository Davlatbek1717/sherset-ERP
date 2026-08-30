#!/usr/bin/env tsx
/**
 * BIR MARTALIK (2026-08-30): $queryRaw→void regressiyasi (b43a7e27, af80a706
 * da tuzatilgan) davrida yuborilmay qolgan mijoz qarz-xabarlarini qayta
 * yuborish.
 *
 * Oyna: 2026-08-29 19:00 .. 2026-08-30 07:26 (server vaqti, CEST) — shu
 * oraliqdagi retailsale/debtpayment/debt jurnal yozuvlaridan outbox'da qatori
 * YO'Q hujjatlar uchun notifier'ning O'ZI chaqiriladi — matn, telefon-qulf,
 * «tanish kontakt» siyosati, dedup hammasi asl mantiqdan o'tadi.
 *
 * · `--yes`siz faqat REJA chiqaradi, hech nima yubormaydi.
 * · Har hujjat orasida 31s pauza — DEBT_NOTIFY_MAX_PER_MINUTE=3 qulfi
 *   «ommaviy portlash» deb tashlab yubormasligi uchun.
 * · Idempotent: outbox'da qatori bor hujjat qayta yuborilmaydi (skript ham
 *   tekshiradi, notifier'ning enqueueOnce'i ham).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// apps/api/.env ni import'lardan OLDIN yuklaymiz (DATABASE_URL, DEBT_NOTIFY_*).
const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const { PrismaService } = await import('../prisma/prisma.service.js');
const { CounterpartyDebtNotifier } = await import(
  '../modules/counterparty-debt-notify/counterparty-debt-notifier.service.js'
);

const WINDOW_START = new Date('2026-08-29T19:00:00+02:00');
const WINDOW_END = new Date('2026-08-30T07:26:00+02:00');
const SOURCES = ['retailsale', 'debtpayment', 'debt'];
const EVENT = 'debt.counterparty_notify';
const PAUSE_MS = 31_000;

const fmt = (n: bigint) => (Number(n) / 100).toLocaleString('ru-RU');

async function main() {
  const yes = process.argv.includes('--yes');
  const prismaService = new PrismaService();
  const prisma = prismaService.client;
  const notifier = new CounterpartyDebtNotifier(prismaService);

  const entries = await prisma.counterpartyBalanceEntry.findMany({
    where: {
      createdAt: { gte: WINDOW_START, lte: WINDOW_END },
      docType: { in: SOURCES },
      docId: { not: null },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Hujjat bo'yicha guruhlash — bitta to'lov jurnalda 2 qator bo'lishi mumkin.
  const byDoc = new Map<string, typeof entries>();
  for (const e of entries) {
    const k = `${e.docType}|${e.docId}`;
    const g = byDoc.get(k);
    if (g) g.push(e);
    else byDoc.set(k, [e]);
  }

  console.log(`Oyna: ${WINDOW_START.toISOString()} .. ${WINDOW_END.toISOString()}`);
  console.log(`Jurnal yozuvi: ${entries.length} · hujjat: ${byDoc.size}\n`);

  type Plan = {
    docType: string;
    docId: string;
    accountId: string;
    counterpartyId: string;
    currency: string;
    deltaMinor: bigint;
    balanceMinor: bigint;
    cpName: string;
    cpPhone: string | null;
    already: string | null;
  };
  const plan: Plan[] = [];
  for (const group of byDoc.values()) {
    const first = group[0];
    const docId = first.docId as string;
    const deltaMinor = group.reduce((s, g) => s + g.deltaMinor, 0n);
    const existing = await prisma.hrTelegramOutbox.findFirst({
      where: { accountId: first.accountId, sourceEventType: EVENT, sourceDocId: docId },
      select: { status: true },
    });
    const cp = await prisma.counterparty.findFirst({
      where: { id: first.counterpartyId, accountId: first.accountId },
      select: { name: true, phone: true },
    });
    const bal = await prisma.counterpartyBalance.findFirst({
      where: { counterpartyId: first.counterpartyId, currency: first.currency },
      select: { balanceMinor: true },
    });
    plan.push({
      docType: first.docType,
      docId,
      accountId: first.accountId,
      counterpartyId: first.counterpartyId,
      currency: first.currency,
      deltaMinor,
      balanceMinor: bal?.balanceMinor ?? 0n,
      cpName: cp?.name ?? '(topilmadi)',
      cpPhone: cp?.phone ?? null,
      already: existing?.status ?? null,
    });
  }

  for (const p of plan) {
    console.log(
      `${p.already ? `SKIP(outbox:${p.already})` : p.cpPhone ? 'YUBORILADI    ' : 'TEL YOQ (skip)'} ` +
        `${p.docType.padEnd(12)} ${p.cpName.slice(0, 28).padEnd(29)} ` +
        `delta=${fmt(p.deltaMinor)} joriy qarz=${fmt(p.balanceMinor)} tel=${p.cpPhone ?? '-'}`,
    );
  }

  if (!yes) {
    console.log(`\nREJA rejimi — yuborish uchun --yes bilan qayta ishga tushiring.`);
    await prisma.$disconnect();
    return;
  }

  let i = 0;
  for (const p of plan) {
    if (p.already) continue;
    i += 1;
    console.log(`\n[${i}] ${p.cpName} (${p.docType} ${p.docId}) ...`);
    await notifier.onBalanceChanged({
      accountId: p.accountId,
      counterpartyId: p.counterpartyId,
      currency: p.currency,
      deltaMinor: p.deltaMinor,
      newBalanceMinor: p.balanceMinor,
      // biome-ignore lint/suspicious/noExplicitAny: union runtime'da tekshirilmaydi, qiymatlar jurnal doc_type'idan
      source: p.docType as any,
      docType: p.docType,
      docId: p.docId,
    });
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  console.log('\n=== YAKUNIY OUTBOX HOLATI ===');
  const rows = await prisma.hrTelegramOutbox.findMany({
    where: { sourceEventType: EVENT, sourceDocId: { in: plan.map((p) => p.docId) } },
    select: { sourceDocId: true, status: true, toPhone: true, failReason: true },
  });
  for (const p of plan) {
    const r = rows.find((x) => x.sourceDocId === p.docId);
    console.log(
      `${p.cpName.slice(0, 28).padEnd(29)} ${r ? `${r.status} ${r.toPhone ?? ''} ${r.failReason ?? ''}` : 'QATOR YOQ (tel yoq yoki qulf)'}`,
    );
  }
  await prisma.$disconnect();
}

await main();

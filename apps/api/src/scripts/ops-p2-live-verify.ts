#!/usr/bin/env tsx
/**
 * P2 JONLI VERIFY — «mijoz kartasi bitta halol raqam + tarix» (2026-08-12).
 *
 * Nima qiladi: ishlab turgan API orqali (HTTP ⇒ real controller + guard +
 * servis) IKKI xil kontragent uchun kartaning ikkala shartnomasini o'lchaydi:
 *
 *   1. **IMPORTLI** — balansi bor, tarixiy import qoldig'i bilan. Kutilgan:
 *      `summary.payableMinor == balans` · `history.openingMinor == opening
 *      qatorlari yig'indisi` · `opening` HARAKAT ro'yxatida YO'Q.
 *   2. **YANGI** — balans qatori umuman yo'q. Kutilgan: `balanceMinor: null`
 *      (o'lchanmagan, «0» emas) · `history.openingMinor: null` · tarix bo'sh.
 *
 * Va butun bazada BOSH INVARIANT: `Σ(jurnal) == CounterpartyBalance`, ya'ni
 * kartadagi raqam va uning tarixi BIR daftardan chiqadi.
 *
 * 🔴 TO'LIQ READ-ONLY. P2 da prodga yozadigan yagona amal — backfill skripti
 * (u alohida, o'z manifesti va rollback SQL'i bilan). Bu skript hech narsa
 * yozmaydi, shuning uchun istalgan paytda qayta yugurtiriladi (regressiya
 * tekshiruvi sifatida ham).
 *
 * 🔴 NEGA HTTP, Nest konteksti EMAS (P1 dan meros): `createApplicationContext`
 * prodda ikkinchi jarayonda barcha `@Cron`larni ro'yxatdan o'tkazadi.
 *
 * Ishga tushirish (box):
 *   cd /var/www/sherset-v2/apps/api && set -a && . ./.env && set +a && \
 *   ./node_modules/.bin/tsx src/scripts/ops-p2-live-verify.ts
 */
import { PrismaClient } from '@moysklad/db';
import { JwtService } from '@nestjs/jwt';

const API = process.env.P2_API_BASE ?? 'http://localhost:4001/api/v1';
const OPENING = 'opening';

const prisma = new PrismaClient();
const som = (m: bigint | string | null | undefined) =>
  m == null ? 'null' : `${(BigInt(m) / 100n).toLocaleString('ru-RU')} so'm`;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  failures += ok ? 0 : 1;
  console.log(`${ok ? '✅' : '🔴'} ${label} — ${detail}`);
}

async function call(token: string, path: string) {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const acc = await prisma.account.findFirstOrThrow({ select: { id: true } });
  const accountId = acc.id;

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET topilmadi (apps/api/.env ni source qiling)');
  const emp = await prisma.employee.findFirstOrThrow({
    where: { accountId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      accountId: true,
      email: true,
      name: true,
      username: true,
      hrRoles: true,
      isChecker: true,
    },
  });
  const token = new JwtService({ secret }).sign(
    {
      sub: emp.id,
      accountId: emp.accountId,
      email: emp.email,
      name: emp.name,
      username: emp.username,
      hrRoles: emp.hrRoles,
      isChecker: emp.isChecker,
      uiMode: 'full',
      hrPermissions: [],
    },
    { expiresIn: '15m' },
  );

  // ── 1. BOSH INVARIANT: Σ(jurnal) == materiallashgan balans ───────────────
  const [balances, journal] = await Promise.all([
    prisma.counterpartyBalance.findMany({
      select: { accountId: true, counterpartyId: true, currency: true, balanceMinor: true },
    }),
    prisma.counterpartyBalanceEntry.groupBy({
      by: ['accountId', 'counterpartyId', 'currency'],
      _sum: { deltaMinor: true },
    }),
  ]);
  const key = (r: { accountId: string; counterpartyId: string; currency: string }) =>
    `${r.accountId}|${r.counterpartyId}|${r.currency}`;
  const sums = new Map(journal.map((r) => [key(r), r._sum.deltaMinor ?? 0n]));
  const mismatched = balances.filter((b) => (sums.get(key(b)) ?? 0n) !== b.balanceMinor);
  check(
    'INVARIANT Σ(jurnal) == balans',
    mismatched.length === 0,
    `${balances.length - mismatched.length}/${balances.length} kalit mos`,
  );

  const entryCount = await prisma.counterpartyBalanceEntry.count();
  const openingCount = await prisma.counterpartyBalanceEntry.count({
    where: { docType: OPENING },
  });
  console.log(`   jurnal: ${entryCount} qator (shundan opening: ${openingCount})`);

  // ── 2. IMPORTLI kontragent (eng katta musbat qoldiq) ─────────────────────
  const top = await prisma.counterpartyBalance.findFirstOrThrow({
    where: { accountId, currency: 'UZS', balanceMinor: { gt: 0n } },
    orderBy: { balanceMinor: 'desc' },
    select: { counterpartyId: true, balanceMinor: true },
  });
  const topCp = await prisma.counterparty.findFirstOrThrow({
    where: { id: top.counterpartyId },
    select: { name: true },
  });
  console.log(`\n── IMPORTLI: «${topCp.name}» · balans ${som(top.balanceMinor)}`);

  const sum1 = await call(token, `/debts/pos/summary/${top.counterpartyId}?currency=UZS`);
  check(
    'karta asosiy raqami = balans',
    sum1.payableMinor === top.balanceMinor.toString(),
    `payableMinor=${som(sum1.payableMinor)} · balanceMinor=${som(sum1.balanceMinor)} · reyestr=${som(sum1.outstandingMinor)}`,
  );

  const hist1 = await call(token, `/debts/pos/history/${top.counterpartyId}?currency=UZS`);
  const openingSum = await prisma.counterpartyBalanceEntry.aggregate({
    where: { accountId, counterpartyId: top.counterpartyId, currency: 'UZS', docType: OPENING },
    _sum: { deltaMinor: true },
  });
  check(
    'boshlang`ich qoldiq jurnaldan',
    hist1.openingMinor === (openingSum._sum.deltaMinor?.toString() ?? null),
    `openingMinor=${som(hist1.openingMinor)}`,
  );
  check(
    '🔴 `opening` HARAKAT ro`yxatida YO`Q',
    !hist1.entries.some((e: { docType: string }) => e.docType === OPENING),
    `${hist1.entries.length} harakat qatori · totalCount=${hist1.totalCount}`,
  );
  // Tarix to'liqligi: opening + BARCHA harakatlar == balans (sahifadan emas,
  // bazadan — ekran kesib ko'rsatsa ham daftar butun bo'lishi shart).
  const allSum = sums.get(key({ accountId, counterpartyId: top.counterpartyId, currency: 'UZS' }));
  check(
    'tarix + boshlang`ich qoldiq = balans',
    allSum === top.balanceMinor,
    `Σ(jurnal)=${som(allSum ?? null)}`,
  );
  for (const e of hist1.entries.slice(0, 5)) {
    console.log(
      `   · ${String(e.at).slice(0, 10)} ${e.number ?? e.docType} ${e.increase ? '+' : '−'}${som(String(e.deltaMinor).replace('-', ''))}`,
    );
  }

  // ── 3. YANGI kontragent (balans qatori umuman yo'q) ──────────────────────
  const withBalance = new Set(balances.map((b) => b.counterpartyId));
  const fresh = await prisma.counterparty.findMany({
    where: { accountId, id: { notIn: [...withBalance] } },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { id: true, name: true, createdAt: true },
  });
  const newCp = fresh[0];
  if (!newCp) {
    check('YANGI kontragent topildi', false, 'balanssiz kontragent yo`q — tekshirib bo`lmadi');
  } else {
    console.log(`\n── YANGI: «${newCp.name}» (balans qatori yo'q)`);
    const sum2 = await call(token, `/debts/pos/summary/${newCp.id}?currency=UZS`);
    check(
      '🔴 NULL ≠ 0 — balans o`lchanmagan',
      sum2.balanceMinor === null,
      `balanceMinor=${sum2.balanceMinor} · payableMinor=${som(sum2.payableMinor)}`,
    );
    const hist2 = await call(token, `/debts/pos/history/${newCp.id}?currency=UZS`);
    check(
      '🔴 boshlang`ich qoldiq qatori YO`Q (null)',
      hist2.openingMinor === null,
      `openingMinor=${hist2.openingMinor}`,
    );
    check(
      'tarix bo`sh va shunday deb qaytadi',
      hist2.entries.length === 0 && hist2.totalCount === 0 && hist2.hasMore === false,
      `entries=${hist2.entries.length} · totalCount=${hist2.totalCount} · hasMore=${hist2.hasMore}`,
    );
  }

  console.log(`\n${failures === 0 ? '✅ HAMMASI OK' : `🔴 ${failures} ta tekshiruv YIQILDI`}`);
  await prisma.$disconnect();
  if (failures > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

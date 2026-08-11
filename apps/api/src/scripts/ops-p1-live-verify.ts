#!/usr/bin/env tsx
/**
 * P1 JONLI VERIFY — «POS to'lovi BALANS bo'yicha ishlaydi» (2026-08-11).
 *
 * Nima qiladi: haqiqiy kontragentga 1 000 so'mlik SINOV to'lovini **ishlab
 * turgan API orqali** (HTTP, real controller + guard + servis) yozadi, barcha
 * daftarni o'lchaydi, keyin STORNO qiladi va hamma raqam boshlang'ich holatga
 * qaytganini tasdiqlaydi.
 *
 * 🔴 NEGA HTTP, Nest konteksti EMAS: `NestFactory.createApplicationContext`
 * prodda IKKINCHI jarayonda barcha `@Cron`larni ro'yxatdan o'tkazadi — rejalangan
 * ishlar ikki marta ketishi mumkin edi. HTTP yo'li esa hech nima ko'tarmaydi va
 * ustiga-ustak guard/DTO qatlamini ham o'lchaydi.
 *
 * 🔴 PROD EHTIYOTKORLIGI (reja §0.7): argumentsiz — **DRY** (faqat o'qiydi).
 * Yozish uchun `--live`. Sinov summasi 1 000 so'm va darhol storno qilinadi.
 *
 * Ishga tushirish (box):
 *   cd /var/www/sherset-v2/apps/api && set -a && . ./.env && set +a && \
 *   ./node_modules/.bin/tsx src/scripts/ops-p1-live-verify.ts [--live]
 */
import { PrismaClient } from '@moysklad/db';
// `jsonwebtoken` to'g'ridan-to'g'ri bog'liqlik EMAS (u `@nestjs/jwt` ichida).
// `JwtService` ni oddiy `new` bilan yaratish mumkin — Nest konteksti kerak emas.
import { JwtService } from '@nestjs/jwt';

const LIVE = process.argv.includes('--live');
/** Sinov summasi — 1 000 so'm (100 000 tiyin). */
const TEST_MINOR = 100_000n;
const API = process.env.P1_API_BASE ?? 'http://localhost:4001/api/v1';

const prisma = new PrismaClient();
const som = (m: bigint | null | undefined) =>
  m == null ? 'null' : `${(m / 100n).toLocaleString('ru-RU')} so'm`;

async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const acc = await prisma.account.findFirstOrThrow({ select: { id: true, name: true } });
  const accountId = acc.id;

  // ── 0. Token — auth.service dagi payload bilan BIR XIL shakl ─────────────
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

  // ── 1. Sinov kontragenti: MUSBAT UZS balansi ─────────────────────────────
  const cand = await prisma.counterpartyBalance.findFirst({
    where: { accountId, currency: 'UZS', balanceMinor: { gt: TEST_MINOR } },
    orderBy: { balanceMinor: 'desc' },
    select: { counterpartyId: true },
  });
  if (!cand) throw new Error('Musbat balansli kontragent topilmadi');
  const cp = await prisma.counterparty.findFirstOrThrow({
    where: { id: cand.counterpartyId },
    select: { id: true, name: true },
  });

  // ── 2. Ochiq smena + kassa ───────────────────────────────────────────────
  const openShifts = await prisma.cashierSession.findMany({
    where: { accountId, state: 'open' },
    orderBy: { openedAt: 'desc' },
    select: { id: true, cashDeskId: true, openedAt: true },
  });
  const shift = openShifts.find((s) => s.cashDeskId != null);
  if (!shift?.cashDeskId) throw new Error('Ochiq smena (kassali) topilmadi');
  const cashDeskId = shift.cashDeskId;

  const snap = async () => {
    const [bal, desk, shiftPays, journal] = await Promise.all([
      prisma.counterpartyBalance.findFirst({
        where: { accountId, counterpartyId: cp.id, currency: 'UZS' },
        select: { balanceMinor: true },
      }),
      prisma.cashDesk.findFirst({
        where: { id: cashDeskId },
        select: { balanceMinor: true, name: true },
      }),
      prisma.debtPayment.aggregate({
        where: { accountId, retailShiftId: shift.id, reversedAt: null },
        _sum: { amountMinor: true },
      }),
      prisma.counterpartyBalanceEntry.count({ where: { accountId, counterpartyId: cp.id } }),
    ]);
    return {
      balance: bal?.balanceMinor ?? null,
      desk: desk?.balanceMinor ?? null,
      deskName: desk?.name ?? null,
      shiftDebtCash: shiftPays._sum.amountMinor ?? 0n,
      journalRows: journal,
    };
  };

  const before = await snap();
  const summaryBefore = await call(token, 'GET', `/debts/pos/summary/${cp.id}?currency=UZS`);

  console.log('════════ P1 JONLI VERIFY ════════');
  console.log(`Rejim:        ${LIVE ? '🔴 LIVE (yozadi)' : 'DRY (hech nima yozmaydi)'}`);
  console.log(`API:          ${API}`);
  console.log(`Akkaunt:      ${acc.name} · token: ${emp.name}`);
  console.log(`Kontragent:   ${cp.name} (${cp.id})`);
  console.log(`Smena:        ${shift.id} · kassa «${before.deskName}»`);
  console.log(`Sinov summa:  ${som(TEST_MINOR)}`);
  console.log('\n── OLDIN ──');
  console.log(`  balans:            ${som(before.balance)}`);
  console.log(`  kassa qoldig'i:    ${som(before.desk)}`);
  console.log(`  smena qarz-naqdi:  ${som(before.shiftDebtCash)}`);
  console.log(`  jurnal qatorlari:  ${before.journalRows}`);
  console.log(`  summary.payable:   ${som(BigInt(summaryBefore.payableMinor))}`);
  console.log(`  summary.reyestr:   ${som(BigInt(summaryBefore.outstandingMinor))}`);
  console.log(`  summary.adoptable: ${som(BigInt(summaryBefore.adoptableMinor))}`);

  if (!LIVE) {
    console.log('\nDRY — `--live` berilmadi, hech nima yozilmadi.');
    await prisma.$disconnect();
    return;
  }

  // ── 3. TO'LOV (HTTP) ─────────────────────────────────────────────────────
  const paid = await call(token, 'POST', '/debts/pos/pay', {
    counterpartyId: cp.id,
    amountMinor: TEST_MINOR.toString(),
    currency: 'UZS',
    method: 'cash',
    cashDeskId,
    retailShiftId: shift.id,
    comment: 'P1 jonli verify — SINOV to`lovi, darhol storno qilinadi',
  });
  const after = await snap();
  const rows = await prisma.debtPayment.findMany({
    where: { accountId, batchId: paid.batchId },
    select: { id: true, debtId: true, amountMinor: true, debt: { select: { name: true } } },
  });
  const adopted = await prisma.debt.findMany({
    where: { id: { in: rows.map((r) => r.debtId) } },
    select: {
      name: true,
      totalMinor: true,
      paidMinor: true,
      status: true,
      balanceAdopted: true,
      closedAt: true,
    },
  });

  console.log('\n── TO`LOVDAN KEYIN ──');
  console.log(`  batchId:           ${paid.batchId}`);
  console.log(`  chek.paidMinor:    ${paid.receipt.paidMinor}`);
  for (const d of adopted) {
    console.log(
      `  qarz ${d.name}: total=${d.totalMinor} paid=${d.paidMinor} ${d.status} adopted=${d.balanceAdopted} closedAt=${d.closedAt ? 'bor' : 'yo`q'}`,
    );
  }
  const dBal = (after.balance ?? 0n) - (before.balance ?? 0n);
  const dDesk = (after.desk ?? 0n) - (before.desk ?? 0n);
  console.log(`  balans:            ${som(after.balance)}  (Δ ${som(dBal)})`);
  console.log(`  kassa qoldig'i:    ${som(after.desk)}  (Δ ${som(dDesk)})`);
  console.log(
    `  smena qarz-naqdi:  ${som(after.shiftDebtCash)}  (Δ ${som(after.shiftDebtCash - before.shiftDebtCash)})`,
  );
  console.log(
    `  jurnal qatorlari:  ${after.journalRows}  (+${after.journalRows - before.journalRows})`,
  );

  // ── 4. STORNO (HTTP) ─────────────────────────────────────────────────────
  for (const r of rows) {
    await call(token, 'POST', `/debts/${r.debtId}/payments/${r.id}/reverse`, {
      reason: 'P1 jonli verify — sinov to`lovi qaytarildi',
    });
  }
  const back = await snap();
  console.log('\n── STORNODAN KEYIN ──');
  console.log(`  balans:            ${som(back.balance)}`);
  console.log(`  kassa qoldig'i:    ${som(back.desk)}`);
  console.log(`  smena qarz-naqdi:  ${som(back.shiftDebtCash)}`);
  console.log(`  jurnal qatorlari:  ${back.journalRows}`);

  // ── 5. HUKM ──────────────────────────────────────────────────────────────
  const checks: Array<[string, boolean]> = [
    ['to`lov qabul qilindi (chek qatori bor)', rows.length > 0],
    ['adopsiya qatori belgilandi', adopted.some((d) => d.balanceAdopted)],
    ['adopsiya qatori yopildi', adopted.every((d) => d.status === 'paid' && d.closedAt !== null)],
    ['balans AYNAN sinov summasiga kamaydi', dBal === -TEST_MINOR],
    ['kassa qoldig`i sinov summasiga o`sdi', dDesk === TEST_MINOR],
    ['smena qarz-naqdi o`sdi', after.shiftDebtCash === before.shiftDebtCash + TEST_MINOR],
    ['jurnalga yozuv tushdi', after.journalRows > before.journalRows],
    ['storno balansni qaytardi', back.balance === before.balance],
    ['storno kassani qaytardi', back.desk === before.desk],
    ['storno smena naqdini qaytardi', back.shiftDebtCash === before.shiftDebtCash],
  ];
  console.log('\n── HUKM ──');
  let ok = true;
  for (const [name, pass] of checks) {
    console.log(`  ${pass ? 'OK ' : 'XATO'} ${name}`);
    if (!pass) ok = false;
  }
  console.log(`\n${ok ? 'P1 JONLI VERIFY O`TDI' : 'P1 JONLI VERIFY YIQILDI'}`);

  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error('XATO:', e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});

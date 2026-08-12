#!/usr/bin/env tsx
/**
 * P5 — R1 QAYTA PROBE + sinov smenasini tozalash (2026-08-12).
 *
 * `ops-p5-live-verify.ts --live` matritsani yugurtirdi va R1 da TESHIKNI
 * ko'rsatdi: 100% KARTA cheki NAQD qaytarilib **201** oldi, kassa qoldig'i
 * 200 so'mga tushdi. Teshik `ab574787` da yopildi (`cashMaxMinor` cap'i).
 *
 * Bu skript deploy'dan KEYIN yuguradi va ikki ish qiladi:
 *   R1'  o'sha hujum TERMINAL chekida QAYTALANADI — endi **400** kutiladi
 *        (kassa qoldig'i QIMIRLAMASLIGI ham o'lchanadi)
 *   C    qolgan sinov cheklari HAR BIRI O'Z KANALIDA qaytariladi va
 *        sinov smenasi farqsiz yopiladi
 *
 * 🔴 DRY sukut bo'yicha. `--live` da prodga yoziladi (faqat P5 sinov
 *    smenasidagi cheklarga tegadi — smena id argument bilan beriladi).
 *
 * Ishga tushirish (box):
 *   cd /var/www/sherset-v2/apps/api && set -a && . ./.env && set +a && \
 *   ./node_modules/.bin/tsx src/scripts/ops-p5-r1-recheck.ts <sessionId> [--live]
 */
import { PrismaClient } from '@moysklad/db';
import { JwtService } from '@nestjs/jwt';

const API = process.env.P5_API_BASE ?? 'http://localhost:4001/api/v1';
const LIVE = process.argv.includes('--live');
const SESSION_ID = process.argv[2];
const prisma = new PrismaClient();

const som = (m: bigint | string | null | undefined) =>
  m == null ? 'null' : `${(Number(BigInt(m)) / 100).toLocaleString('ru-RU')} so'm`;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  failures += ok ? 0 : 1;
  console.log(`${ok ? '✅' : '🔴'} ${label} — ${detail}`);
}

async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

async function tokenFor(secret: string, name: string) {
  const emp = await prisma.employee.findFirstOrThrow({
    where: { name },
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
  const roles = await prisma.employeeRole.findMany({
    where: { employeeId: emp.id },
    select: { role: { select: { uiMode: true } } },
  });
  return {
    token: new JwtService({ secret }).sign(
      {
        sub: emp.id,
        accountId: emp.accountId,
        email: emp.email,
        name: emp.name,
        username: emp.username,
        hrRoles: emp.hrRoles,
        isChecker: emp.isChecker,
        uiMode: roles[0]?.role.uiMode ?? 'full',
        hrPermissions: [],
      },
      { expiresIn: '60m' },
    ),
    emp,
  };
}

/** Serverning `computeRefundSettlementCaps` bilan AYNI formulalar. */
function tenderSplit(sale: {
  sumMinor: bigint;
  debtMinor: bigint;
  cashLikeMinor: bigint | null;
}): { cash: bigint; card: bigint } {
  const money = sale.sumMinor - sale.debtMinor;
  if (sale.cashLikeMinor == null) return { cash: money, card: 0n };
  const cashLike = sale.cashLikeMinor > money ? money : sale.cashLikeMinor;
  return { cash: cashLike, card: money - cashLike };
}

async function main() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET topilmadi');
  if (!SESSION_ID) throw new Error('sessionId argument sifatida berilsin');

  console.log(`\n— P5 R1 QAYTA PROBE — ${LIVE ? '🔴 LIVE' : 'DRY'} —\n`);
  const admin = await tokenFor(secret, 'Admin User');
  const cashier = await tokenFor(secret, 'Kassir 1');
  const accountId = admin.emp.accountId;

  const session = await prisma.cashierSession.findUniqueOrThrow({
    where: { id: SESSION_ID },
    select: { state: true, cashDeskId: true },
  });
  const deskBalance = async () =>
    (
      await prisma.cashDesk.findUniqueOrThrow({
        where: { id: session.cashDeskId },
        select: { balanceMinor: true },
      })
    ).balanceMinor;

  const sales = await prisma.retailSale.findMany({
    where: { accountId, sessionId: SESSION_ID, state: 'posted', refundedFromId: null },
    select: {
      id: true,
      name: true,
      sumMinor: true,
      payments: { select: { method: true, amountBaseMinor: true } },
      positions: { select: { productId: true, quantity: true } },
    },
    orderBy: { name: 'asc' },
  });

  const rows = sales.map((s) => {
    const debtMinor = s.payments
      .filter((p) => p.method === 'DEBT')
      .reduce((a, p) => a + p.amountBaseMinor, 0n);
    const cashLikeMinor =
      s.payments.length === 0
        ? null
        : s.payments
            .filter((p) => p.method === 'CASH_UZS' || p.method === 'CASH_USD')
            .reduce((a, p) => a + p.amountBaseMinor, 0n);
    return { ...s, debtMinor, cashLikeMinor, ...tenderSplit({ ...s, debtMinor, cashLikeMinor }) };
  });

  console.log(
    `Smena ${SESSION_ID.slice(0, 8)} (${session.state}) — qaytarilmagan ${rows.length} chek:`,
  );
  for (const r of rows) {
    console.log(
      `   ${r.name}  ${som(r.sumMinor)}  [${r.payments.map((p) => p.method).join('+') || 'to`lov qatori yo`q'}]` +
        `  ⇒ naqd ${som(r.cash)} · karta ${som(r.card)}`,
    );
  }

  const terminalSale = rows.find((r) => r.payments.some((p) => p.method === 'TERMINAL'));
  if (!terminalSale) console.log('\n⚠️ TERMINAL cheki topilmadi — R1 qayta probe o`tkazilmaydi');

  if (!LIVE) {
    console.log('\nDRY: R1 probe (terminal chekiga naqd qaytarish) + tozalash qilinardi.\n');
    return;
  }

  // ── R1' — o'sha hujum, endi 400 kutiladi ──────────────────────────────────
  if (terminalSale) {
    const before = await deskBalance();
    const probe = await call(admin.token, 'POST', `/retail-sales/${terminalSale.id}/refund`, {
      positions: terminalSale.positions.map((p) => ({
        productId: p.productId,
        quantity: String(p.quantity),
      })),
      cashAmountMinor: terminalSale.sumMinor.toString(),
      cardAmountMinor: '0',
      description: 'P5 SINOV: R1 qayta probe (tuzatishdan keyin)',
    });
    const after = await deskBalance();
    const msg = JSON.stringify((probe.body as { message?: string })?.message ?? probe.body);
    check(
      "R1'. 🔴 TERMINAL cheki NAQD qaytarilishi RAD ETILADI",
      probe.status === 400,
      `${probe.status}: ${msg.slice(0, 240)}`,
    );
    check("R1''. kassa qoldig'i QIMIRLAMADI", after === before, `${som(before)} → ${som(after)}`);
  }

  // ── C — tozalash: har chek O'Z kanalida ───────────────────────────────────
  console.log('\n— TOZALASH —');
  for (const r of rows) {
    const res = await call(admin.token, 'POST', `/retail-sales/${r.id}/refund`, {
      positions: r.positions.map((p) => ({
        productId: p.productId,
        quantity: String(p.quantity),
      })),
      cashAmountMinor: r.cash.toString(),
      cardAmountMinor: r.card.toString(),
      description: 'P5 SINOV tozalash',
    });
    check(
      `C. ${r.name} qaytarildi (naqd ${som(r.cash)} · karta ${som(r.card)})`,
      res.status === 201 || res.status === 200,
      `${res.status}${res.status >= 400 ? ` ${JSON.stringify(res.body).slice(0, 200)}` : ''}`,
    );
  }

  // ── Smenani farqsiz yopish ────────────────────────────────────────────────
  const z = (await (
    await fetch(`${API}/cashier-sessions/${SESSION_ID}/z-report`, {
      headers: { authorization: `Bearer ${cashier.token}` },
    })
  ).json()) as Record<string, unknown>;
  const expected = BigInt(String(z.expectedCashMinor));
  const expectedUsd = BigInt(String(z.expectedUsdCashMinor));
  console.log(
    `\nZ-hisobot: kutilgan naqd ${som(expected)} · kutilgan dollar ${Number(expectedUsd) / 100} $`,
  );
  console.log(
    `   to'lov turlari: ${(
      z.revenueByMethod as Array<{ method: string; currency: string; sumMinor: string }>
    )
      .map((m) => `${m.method}/${m.currency}=${m.sumMinor}`)
      .join(' · ')}`,
  );
  const closed = await call(cashier.token, 'POST', `/cashier-sessions/${SESSION_ID}/close`, {
    closingCashMinor: expected.toString(),
    closingCashUsdMinor: expectedUsd.toString(),
    varianceNote: 'P5 SINOV smenasi — farqsiz yopildi (2026-08-12)',
  });
  check(
    'C1. sinov smenasi FARQSIZ yopildi',
    closed.status === 201 || closed.status === 200,
    `${closed.status} · sanoq = kutilgan`,
  );
  console.log(`\nKassa qoldig'i (yakuniy): ${som(await deskBalance())}`);
  console.log(
    `\n— YAKUN: ${failures === 0 ? '✅ hammasi o`tdi' : `🔴 ${failures} ta yiqilish`} —\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error('🔴 SKRIPT XATOSI:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

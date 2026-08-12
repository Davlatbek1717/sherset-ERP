#!/usr/bin/env tsx
/**
 * P5 JONLI VERIFY — TO'LOV TURLARI MATRITSASI (2026-08-12).
 *
 * Reja: `docs/REJA-KASSA-PROD-2026-08.md` → «FAZA P5». Har katak HAQIQIY HTTP
 * orqali, HAQIQIY tokenlar bilan (⇒ controller + kiosk-policy + guard + servis),
 * har qadamda baza va Z-hisobot O'LCHANADI.
 *
 * MATRITSA (har biri bitta chek, eng arzon tovar):
 *   1 NAQD          cash = jami
 *   2 NAQD+QAYTIM   cash > jami ⇒ `changeMinor` > 0, yashiqqa `cash − change`
 *   3 KARTA         card = jami
 *   4 TERMINAL      terminal = jami
 *   5 ARALASH       cash + card
 *   6 QARZ          cash < jami, qolgani `debtAmountMinor` (mijoz majburiy)
 *   7 USD           `cashUsdAmountMinor` (sent) + kanonik ×10^8 kurs
 *
 * Har katakda tekshiriladi:
 *   · chek `posted`
 *   · `RetailSalePayment` qatorlari — method + currency + amount + base
 *   · smena «kutilgan naqd» FAQAT naqd ulushiga o'sdi (karta/terminal/USD emas)
 *   · Z-hisobotda to'lov turi kesimida qatori bor
 *
 * Keyin:
 *   H6  qarzli chek QAYTARILGANDA balans qarzi kamayadimi (jonli)
 *   R1  🔴 ADVERSARIAL: KARTA bilan to'langan chek NAQD qaytarilishi mumkinmi
 *       (kassa olmagan pulni chiqarib yuboradimi)
 *
 * 🔴 DRY sukut bo'yicha — `--live` bermaguncha hech nima yozilmaydi.
 * 🔴 `--live` da PROD'ga yoziladi: 1 sinov smenasi + 7 kichik chek (+qaytarishlar).
 *    Yakunda `--cleanup` bilan cheklar qaytariladi va smena farqsiz yopiladi.
 *
 * Ishga tushirish (box):
 *   cd /var/www/sherset-v2/apps/api && set -a && . ./.env && set +a && \
 *   ./node_modules/.bin/tsx src/scripts/ops-p5-live-verify.ts            # DRY
 *   ./node_modules/.bin/tsx src/scripts/ops-p5-live-verify.ts --live     # matritsa
 *   ./node_modules/.bin/tsx src/scripts/ops-p5-live-verify.ts --live --cleanup
 */
import { PrismaClient } from '@moysklad/db';
import { JwtService } from '@nestjs/jwt';

const API = process.env.P5_API_BASE ?? 'http://localhost:4001/api/v1';
const LIVE = process.argv.includes('--live');
const CLEANUP = process.argv.includes('--cleanup');
const prisma = new PrismaClient();

const som = (m: bigint | string | null | undefined) =>
  m == null ? 'null' : `${(Number(BigInt(m)) / 100).toLocaleString('ru-RU')} so'm`;
const usd = (c: bigint | string | null | undefined) =>
  c == null ? 'null' : `$${(Number(BigInt(c)) / 100).toFixed(2)}`;

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

async function must(token: string, method: string, path: string, body?: unknown) {
  const r = await call(token, method, path, body);
  if (r.status >= 400) {
    throw new Error(`${method} ${path} → ${r.status}: ${JSON.stringify(r.body).slice(0, 500)}`);
  }
  return r.body as Record<string, unknown>;
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
  const token = new JwtService({ secret }).sign(
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
  );
  return { token, emp };
}

interface Cell {
  key: string;
  label: string;
  /** Naqd so'm (tiyin) — mijoz UZATGAN summa. */
  cash: bigint;
  card: bigint;
  terminal: bigint;
  debt: bigint;
  /** Dollar naqd — SENTDA. */
  cashUsd: bigint;
  /** Yashiqqa (so'm) tushishi KUTILGAN summa = naqd − qaytim. */
  expectDrawer: bigint;
  /** Kutilgan `RetailSalePayment.method` ro'yxati (tartibsiz). */
  expectMethods: string[];
  /** Qarz uchun mijoz kerak. */
  needsAgent?: boolean;
}

async function main() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET topilmadi (apps/api/.env ni source qiling)');

  console.log(`\n— P5 JONLI VERIFY — ${LIVE ? '🔴 LIVE (prodga yoziladi)' : 'DRY'} —\n`);

  const cashier = await tokenFor(secret, 'Kassir 1');
  const admin = await tokenFor(secret, 'Admin User');
  const accountId = cashier.emp.accountId;

  // ── Boshlang'ich o'lchov ──────────────────────────────────────────────────
  const payRowsBefore = await prisma.retailSalePayment.groupBy({
    by: ['method', 'currency'],
    _count: { _all: true },
    _sum: { amountMinor: true },
  });
  console.log('Boshlang`ich `RetailSalePayment` holati:');
  for (const r of payRowsBefore) {
    console.log(`   ${r.method}/${r.currency} × ${r._count._all} = ${r._sum.amountMinor}`);
  }
  if (payRowsBefore.length === 0) console.log('   (bo`sh)');

  // Eng ARZON, P12 narx polini buzmaydigan tovar (P3/P4 skriptlaridagi qoida:
  // narx kartaning O'ZINIKI bo'lsin, aks holda `post` 400 bilan rad etadi).
  const candidates = await prisma.product.findMany({
    where: { accountId, archived: false, buyPrice: { not: null } },
    select: { id: true, name: true, salePrices: true, buyPrice: true },
    take: 500,
    orderBy: { createdAt: 'asc' },
  });
  const priced = candidates
    .map((p) => {
      const rows = (p.salePrices ?? []) as Array<{ value?: string | number }>;
      const values = Array.isArray(rows)
        ? rows.map((r) => BigInt(r?.value ?? 0)).filter((v) => v > 0n)
        : [];
      return { ...p, retail: values.length > 0 ? (values[0] as bigint) : null };
    })
    .filter((p) => p.retail != null && p.buyPrice != null && p.retail >= p.buyPrice)
    .sort((a, b) => Number((a.retail as bigint) - (b.retail as bigint)));
  const product = priced[0];
  if (!product?.retail) throw new Error('Sinov uchun narxi va tan narxi to`g`ri tovar topilmadi');
  const price = product.retail as bigint;
  console.log(`\nSinov tovari: ${product.name} · ${som(price)} (tan ${som(product.buyPrice)})`);

  // USD kursi — POS AYNAN shu endpointdan oladi (kiosk-policy ruxsat beradi).
  const rateRow = (await must(cashier.token, 'GET', '/exchange-rates/rate?currency=USD')) as {
    rateMinor?: string;
    rate?: string;
    date?: string;
  };
  const usdRateE8 = rateRow.rateMinor ? BigInt(rateRow.rateMinor) : null;
  check(
    'K0. USD kursi KASSIR tokeni bilan o`qildi',
    usdRateE8 != null && usdRateE8 >= 1_000_000_000n,
    `rate=${rateRow.rate} · rateMinor=${rateRow.rateMinor} · sana=${rateRow.date}`,
  );
  if (usdRateE8 == null) throw new Error('USD kursi yo`q — matritsaning USD katagi ishlamaydi');

  // Dollar katagi: kamida chek summasini qoplaydigan eng kichik SENT.
  // ⌈ price × 10^8 / rate ⌉ — kam bo'lsa `insufficient` bo'lardi.
  const usdCents = (price * 100_000_000n + usdRateE8 - 1n) / usdRateE8;
  const usdBase = (usdCents * usdRateE8) / 100_000_000n;

  const cells: Cell[] = [
    {
      key: '1',
      label: 'NAQD (CASH_UZS)',
      cash: price,
      card: 0n,
      terminal: 0n,
      debt: 0n,
      cashUsd: 0n,
      expectDrawer: price,
      expectMethods: ['CASH_UZS'],
    },
    {
      key: '2',
      label: 'NAQD + QAYTIM',
      cash: price + 50_000n, // 500 so'm ortiqcha
      card: 0n,
      terminal: 0n,
      debt: 0n,
      cashUsd: 0n,
      expectDrawer: price,
      expectMethods: ['CASH_UZS'],
    },
    {
      key: '3',
      label: 'KARTA (CARD)',
      cash: 0n,
      card: price,
      terminal: 0n,
      debt: 0n,
      cashUsd: 0n,
      expectDrawer: 0n,
      expectMethods: ['CARD'],
    },
    {
      key: '4',
      label: 'TERMINAL',
      cash: 0n,
      card: 0n,
      terminal: price,
      debt: 0n,
      cashUsd: 0n,
      expectDrawer: 0n,
      expectMethods: ['TERMINAL'],
    },
    {
      key: '5',
      label: 'ARALASH (naqd + karta)',
      cash: price / 2n,
      card: price - price / 2n,
      terminal: 0n,
      debt: 0n,
      cashUsd: 0n,
      expectDrawer: price / 2n,
      expectMethods: ['CASH_UZS', 'CARD'],
    },
    {
      key: '6',
      label: 'KAM TO`LOV → QARZ',
      cash: price / 2n,
      card: 0n,
      terminal: 0n,
      debt: price - price / 2n,
      cashUsd: 0n,
      expectDrawer: price / 2n,
      expectMethods: ['CASH_UZS', 'DEBT'],
      needsAgent: true,
    },
    {
      key: '7',
      label: 'USD NAQD (CASH_USD)',
      cash: 0n,
      card: 0n,
      terminal: 0n,
      debt: 0n,
      cashUsd: usdCents,
      // Dollardan qaytim SO'M yashig'idan chiqadi ⇒ yashiq MANFIY o'zgaradi.
      expectDrawer: -(usdBase - price),
      expectMethods: ['CASH_USD'],
    },
  ];

  const smenas = (await must(cashier.token, 'GET', '/admin/smenas/mine')) as {
    smena?: { id: string; name: string };
  };
  if (!smenas.smena) throw new Error('Kassir 1 ga smena biriktirilmagan');

  if (!LIVE) {
    console.log(`\nDRY — yugurtirilganda quyidagi 7 chek yozilardi (${som(price)} × 7):\n`);
    for (const c of cells) {
      console.log(
        `   ${c.key}. ${c.label.padEnd(24)} naqd=${c.cash} karta=${c.card} terminal=${c.terminal} ` +
          `qarz=${c.debt} usd=${c.cashUsd} ⇒ yashiq ${c.expectDrawer}`,
      );
    }
    console.log(
      `\n   USD: ${usd(usdCents)} × kurs ${rateRow.rate} = ${som(usdBase)} (chek ${som(price)}, ` +
        `qaytim ${som(usdBase - price)})`,
    );
    console.log('\n   Keyin H6 (qarzli chek qaytarish) va R1 (karta cheki NAQD qaytarish probe).');
    console.log('\nYozish uchun `--live` bering.\n');
    return;
  }

  // ── SMENA ─────────────────────────────────────────────────────────────────
  const opened = (await must(cashier.token, 'POST', '/admin/smenas/open-session', {
    smenaId: smenas.smena.id,
    openingCashMinor: '0',
    outOfShiftReason: 'P5 to`lov turlari jonli sinovi (2026-08-12)',
  })) as { id: string };
  const sessionId = opened.id;
  const session = await prisma.cashierSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { cashDeskId: true, cashDesk: { select: { name: true, currency: true } } },
  });
  console.log(
    `\nSmena ${sessionId.slice(0, 8)} ochildi · kassa «${session.cashDesk.name}» ` +
      `(${session.cashDeskId.slice(0, 8)}, ${session.cashDesk.currency})\n`,
  );

  // Qarz katagi uchun mijoz — SINOV kontragenti (balansi o'lchanadi).
  const agent = await prisma.counterparty.findFirst({
    where: { accountId, archived: false, name: { contains: 'AAAA' } },
    select: { id: true, name: true },
  });
  if (!agent) throw new Error('Qarz katagi uchun sinov kontragenti topilmadi');

  const zOf = async () =>
    (await must(cashier.token, 'GET', `/cashier-sessions/${sessionId}/z-report`)) as Record<
      string,
      unknown
    >;

  const results: Array<{ cell: Cell; saleId: string; name: string }> = [];

  for (const c of cells) {
    const zBefore = await zOf();
    const drawerBefore = BigInt(String(zBefore.expectedCashMinor));
    const usdBefore = BigInt(String(zBefore.expectedUsdCashMinor));

    const sale = (await must(cashier.token, 'POST', '/retail-sales', {
      sessionId,
      ...(c.needsAgent ? { agentId: agent.id } : {}),
      positions: [{ productId: product.id, quantity: '1', priceMinor: price.toString() }],
    })) as { id: string; sumMinor: string; name: string };

    const balBefore = c.needsAgent
      ? ((
          await prisma.counterpartyBalance.findFirst({
            where: { accountId, counterpartyId: agent.id, currency: 'UZS' },
            select: { balanceMinor: true },
          })
        )?.balanceMinor ?? 0n)
      : 0n;

    const postRes = await call(cashier.token, 'POST', `/retail-sales/${sale.id}/post`, {
      cashAmountMinor: c.cash.toString(),
      cardAmountMinor: c.card.toString(),
      terminalAmountMinor: c.terminal.toString(),
      debtAmountMinor: c.debt.toString(),
      cashUsdAmountMinor: c.cashUsd.toString(),
      ...(c.cashUsd > 0n ? { usdRateMinor: usdRateE8.toString() } : {}),
      ...(c.needsAgent ? { agentId: agent.id } : {}),
      expectedSumMinor: String(sale.sumMinor),
    });
    check(
      `${c.key}a. ${c.label} — KASSIR chekni yopdi`,
      postRes.status === 201 || postRes.status === 200,
      `${postRes.status} ${JSON.stringify(postRes.body).slice(0, 180)}`,
    );
    if (postRes.status >= 400) continue;
    results.push({ cell: c, saleId: sale.id, name: sale.name });

    const rows = await prisma.retailSalePayment.findMany({
      where: { saleId: sale.id },
      select: {
        method: true,
        currency: true,
        amountMinor: true,
        amountBaseMinor: true,
        rateMinor: true,
      },
      orderBy: { method: 'asc' },
    });
    const gotMethods = rows.map((r) => r.method).sort();
    check(
      `${c.key}b. to'lov qatorlari to'g'ri`,
      JSON.stringify(gotMethods) === JSON.stringify([...c.expectMethods].sort()),
      rows
        .map(
          (r) =>
            `${r.method}/${r.currency}=${r.amountMinor}` +
            (r.rateMinor ? ` (kurs ${r.rateMinor}, base ${r.amountBaseMinor})` : ''),
        )
        .join(' · ') || 'qator yo`q',
    );

    const saleRow = await prisma.retailSale.findUniqueOrThrow({
      where: { id: sale.id },
      select: {
        state: true,
        sumMinor: true,
        cashAmountMinor: true,
        cardAmountMinor: true,
        changeMinor: true,
        payedSumMinor: true,
      },
    });
    check(
      `${c.key}c. chek posted · payedSum = jami − qarz`,
      saleRow.state === 'posted' && saleRow.payedSumMinor === saleRow.sumMinor - c.debt,
      `state=${saleRow.state} · sum=${som(saleRow.sumMinor)} · payed=${som(saleRow.payedSumMinor)} ` +
        `· qaytim=${som(saleRow.changeMinor)} · legacy(cash=${saleRow.cashAmountMinor}, card=${saleRow.cardAmountMinor})`,
    );

    const zAfter = await zOf();
    const drawerDelta = BigInt(String(zAfter.expectedCashMinor)) - drawerBefore;
    const usdDelta = BigInt(String(zAfter.expectedUsdCashMinor)) - usdBefore;
    check(
      `${c.key}d. kutilgan NAQD faqat naqd ulushiga o'zgardi`,
      drawerDelta === c.expectDrawer,
      `Δso'm=${som(drawerDelta)} (kutilgan ${som(c.expectDrawer)}) · Δ$=${usd(usdDelta)} ` +
        `(kutilgan ${usd(c.cashUsd)})`,
    );
    if (c.cashUsd > 0n) {
      check(
        `${c.key}e. dollar yashig'i sentda o'sdi`,
        usdDelta === c.cashUsd,
        `Δ$=${usd(usdDelta)} · kutilgan ${usd(c.cashUsd)}`,
      );
    }

    const byMethod = (zAfter.revenueByMethod ?? []) as Array<{
      method: string;
      currency: string;
      sumMinor: string;
      baseMinor: string | null;
    }>;
    check(
      `${c.key}f. Z-hisobot kesimida qatori bor`,
      c.expectMethods.every((m) => byMethod.some((r) => r.method === m)),
      byMethod.map((r) => `${r.method}/${r.currency}=${r.sumMinor}`).join(' · '),
    );

    if (c.needsAgent) {
      const balAfter =
        (
          await prisma.counterpartyBalance.findFirst({
            where: { accountId, counterpartyId: agent.id, currency: 'UZS' },
            select: { balanceMinor: true },
          })
        )?.balanceMinor ?? 0n;
      check(
        `${c.key}g. qarz mijoz balansiga yozildi`,
        balAfter - balBefore === c.debt,
        `${som(balBefore)} → ${som(balAfter)} (Δ ${som(balAfter - balBefore)}, kutilgan ${som(c.debt)})`,
      );
    }
    console.log('');
  }

  // ── H6: qarzli chek QAYTARILGANDA qarz kamayadimi ─────────────────────────
  const debtCell = results.find((r) => r.cell.key === '6');
  if (debtCell) {
    const balBefore =
      (
        await prisma.counterpartyBalance.findFirst({
          where: { accountId, counterpartyId: agent.id, currency: 'UZS' },
          select: { balanceMinor: true },
        })
      )?.balanceMinor ?? 0n;
    const deskBefore = (
      await prisma.cashDesk.findUniqueOrThrow({
        where: { id: session.cashDeskId },
        select: { balanceMinor: true },
      })
    ).balanceMinor;

    // KASSIR qaytara olmasligi kerak (P3 egasi qarori) — avval shuni o'lchaymiz.
    const cashierRefund = await call(
      cashier.token,
      'POST',
      `/retail-sales/${debtCell.saleId}/refund`,
      { positions: [{ productId: product.id, quantity: '1' }] },
    );
    check(
      'H6a. KASSIR qaytara OLMAYDI (egasi qarori)',
      cashierRefund.status === 403,
      `${cashierRefund.status}: ${JSON.stringify(cashierRefund.body).slice(0, 160)}`,
    );

    // Naqd ulushi FE formulasi bilan (`refundCashShareMinor` = ⌊(sum−debt)×R/sum⌋,
    // to'liq qaytarishda R = sum ⇒ sum − debt) — POS aynan shuni yuboradi.
    const cashShare = price - debtCell.cell.debt;
    const refunded = await call(admin.token, 'POST', `/retail-sales/${debtCell.saleId}/refund`, {
      positions: [{ productId: product.id, quantity: '1' }],
      cashAmountMinor: cashShare.toString(),
      cardAmountMinor: '0',
      description: 'P5 SINOV: H6 — qarzli chek qaytarish',
    });
    check(
      'H6b. qarzli chek QAYTARILDI',
      refunded.status === 201 || refunded.status === 200,
      `${refunded.status}: ${JSON.stringify(refunded.body).slice(0, 200)}`,
    );

    const balAfter =
      (
        await prisma.counterpartyBalance.findFirst({
          where: { accountId, counterpartyId: agent.id, currency: 'UZS' },
          select: { balanceMinor: true },
        })
      )?.balanceMinor ?? 0n;
    check(
      'H6c. 🔴 QARZ BALANSDAN YECHILDI',
      balAfter - balBefore === -debtCell.cell.debt,
      `${som(balBefore)} → ${som(balAfter)} (Δ ${som(balAfter - balBefore)}, kutilgan ${som(-debtCell.cell.debt)})`,
    );
    const deskAfter = (
      await prisma.cashDesk.findUniqueOrThrow({
        where: { id: session.cashDeskId },
        select: { balanceMinor: true },
      })
    ).balanceMinor;
    check(
      'H6d. kassadan FAQAT olingan naqd chiqdi',
      deskAfter - deskBefore === -cashShare,
      `${som(deskBefore)} → ${som(deskAfter)} (Δ ${som(deskAfter - deskBefore)}, kutilgan ${som(-cashShare)})`,
    );
    const mirror = await prisma.retailSale.findFirst({
      where: { refundedFromId: debtCell.saleId },
      select: { name: true, debtReturnMinor: true, payedSumMinor: true, sumMinor: true },
    });
    console.log(
      `   oyna chek: ${mirror?.name} · debtReturn=${som(mirror?.debtReturnMinor)} · ` +
        `payed=${som(mirror?.payedSumMinor)} / ${som(mirror?.sumMinor)}\n`,
    );
  }

  // ── R1 (ADVERSARIAL): KARTA cheki NAQD qaytarilishi mumkinmi ──────────────
  const cardCell = results.find((r) => r.cell.key === '3');
  if (cardCell) {
    const deskBefore = (
      await prisma.cashDesk.findUniqueOrThrow({
        where: { id: session.cashDeskId },
        select: { balanceMinor: true },
      })
    ).balanceMinor;
    const probe = await call(admin.token, 'POST', `/retail-sales/${cardCell.saleId}/refund`, {
      positions: [{ productId: product.id, quantity: '1' }],
      cashAmountMinor: price.toString(),
      cardAmountMinor: '0',
      description: 'P5 SINOV: R1 — karta cheki NAQD qaytarish probe',
    });
    const deskAfter = (
      await prisma.cashDesk.findUniqueOrThrow({
        where: { id: session.cashDeskId },
        select: { balanceMinor: true },
      })
    ).balanceMinor;
    check(
      'R1. 🔴 KARTA bilan to`langan chek NAQD qaytarilishi RAD etiladi',
      probe.status === 400,
      `${probe.status}: ${JSON.stringify(probe.body).slice(0, 240)} · ` +
        `kassa ${som(deskBefore)} → ${som(deskAfter)} (Δ ${som(deskAfter - deskBefore)})`,
    );
  }

  // ── TOZALASH ──────────────────────────────────────────────────────────────
  if (CLEANUP) {
    console.log('\n— TOZALASH —');
    for (const r of results) {
      const already = await prisma.retailSale.findFirst({
        where: { refundedFromId: r.saleId, state: { in: ['posted', 'refunded'] } },
        select: { id: true },
      });
      if (already) continue;
      // Har chek O'Z tender ulushida qaytariladi: naqd olingan bo'lsa naqd,
      // karta/terminal/USD bo'lsa NAQD EMAS (aks holda yashiq olmagan pulni
      // chiqarardi — R1 aynan shu xavf).
      const cash = r.cell.expectDrawer > 0n ? r.cell.expectDrawer : 0n;
      const card = price - r.cell.debt - cash;
      const res = await call(admin.token, 'POST', `/retail-sales/${r.saleId}/refund`, {
        positions: [{ productId: product.id, quantity: '1' }],
        cashAmountMinor: cash.toString(),
        cardAmountMinor: (card > 0n ? card : 0n).toString(),
        description: 'P5 SINOV tozalash',
      });
      console.log(
        `   ${r.name} (${r.cell.label}) → ${res.status}` +
          (res.status >= 400 ? ` ${JSON.stringify(res.body).slice(0, 200)}` : ''),
      );
    }
    const z = await zOf();
    const expected = BigInt(String(z.expectedCashMinor));
    const expectedUsd = BigInt(String(z.expectedUsdCashMinor));
    const closed = await call(cashier.token, 'POST', `/cashier-sessions/${sessionId}/close`, {
      closingCashMinor: expected.toString(),
      closingCashUsdMinor: expectedUsd.toString(),
      varianceNote: 'P5 SINOV smenasi — farqsiz yopildi (2026-08-12)',
    });
    check(
      'C1. sinov smenasi farqsiz yopildi',
      closed.status === 201 || closed.status === 200,
      `${closed.status} · kutilgan ${som(expected)} / ${usd(expectedUsd)}`,
    );
    const desk = await prisma.cashDesk.findUniqueOrThrow({
      where: { id: session.cashDeskId },
      select: { balanceMinor: true },
    });
    console.log(`   kassa qoldig'i: ${som(desk.balanceMinor)}`);
  } else {
    console.log(
      `\n⚠️ Tozalash QILINMADI — smena ${sessionId.slice(0, 8)} OCHIQ va ${results.length} chek posted.\n` +
        '   `--live --cleanup` bilan qayta yugurtiring (yoki qo`lda yoping).',
    );
  }

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

#!/usr/bin/env tsx
/**
 * P4 JONLI VERIFY — smena hayot sikli (2026-08-12).
 *
 * Zanjir HAQIQIY HTTP orqali, HAQIQIY tokenlar bilan (⇒ controller + guard +
 * servis), har qadamda baza o'lchanadi:
 *
 *   A. OCHISH        kassir smena ochadi (POS yo'li: `/admin/smenas/open-session`)
 *   B. HIMOYA        `current` da yosh maydonlari · ikkinchi ochish urinishi
 *                    MA'LUMOTLI xato beradi (qaysi smena, qachondan beri)
 *   C. SOTUV         2 ta chek (to'g'ridan-to'g'ri sotish, eng arzon tovar)
 *   D. YOPISH        ataylab **5 000 so'm KAMOMAD** bilan
 *   E. FARQ AKTI     akt yozildi · menejer navbatiga `pending` bo'lib tushdi
 *   F. TELEGRAM      xabar TELEFONGA yozildi (`toSelf` emas) — H7
 *   G. QABUL         egasi (admin) `accept` qiladi → `accepted` + jurnal
 *   H. QOLDIQ        sinov cheklari O'LCHANADI — qaytarib bo'lmaydi (pastga qara)
 *
 * 🔴 DRY sukut bo'yicha — `--live` bermaguncha hech nima yozilmaydi.
 * 🔴 `--live` da PROD'ga yoziladi: 2 ta kichik sinov cheki (eng arzon tovar),
 *    bitta smena, bitta farq akti va bitta Telegram xabari. Xabar HAQIQATAN
 *    yuboriladi — bu H7 ning yagona haqiqiy sinovi. Matnda «sinov» so'zi
 *    bo'lishi uchun kassir izohi shunday yoziladi.
 *
 * Ishga tushirish (box):
 *   cd /var/www/sherset-v2/apps/api && set -a && . ./.env && set +a && \
 *   ./node_modules/.bin/tsx src/scripts/ops-p4-live-verify.ts          # DRY
 *   ./node_modules/.bin/tsx src/scripts/ops-p4-live-verify.ts --live   # yozadi
 */
import { PrismaClient } from '@moysklad/db';
import { JwtService } from '@nestjs/jwt';

const API = process.env.P4_API_BASE ?? 'http://localhost:4001/api/v1';
const LIVE = process.argv.includes('--live');
const prisma = new PrismaClient();

/** Ataylab kiritiladigan farq — 5 000 so'm kamomad. */
const VARIANCE_MINOR = 500_000n;
/** Ochilish naqdi: kamomad manfiy sanoqqa olib kelmasin. */
const OPENING_MINOR = 1_000_000n; // 10 000 so'm

const som = (m: bigint | string | null | undefined) =>
  m == null ? 'null' : `${(BigInt(m) / 100n).toLocaleString('ru-RU')} so'm`;

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
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function must(token: string, method: string, path: string, body?: unknown) {
  const r = await call(token, method, path, body);
  if (r.status >= 400) {
    throw new Error(`${method} ${path} → ${r.status}: ${JSON.stringify(r.body).slice(0, 400)}`);
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
    { expiresIn: '30m' },
  );
  return { token, emp };
}

async function main() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET topilmadi (apps/api/.env ni source qiling)');

  console.log(`\n— P4 JONLI VERIFY — ${LIVE ? '🔴 LIVE (prodga yoziladi)' : 'DRY'} —\n`);

  const cashier = await tokenFor(secret, 'Kassir 1');
  const admin = await tokenFor(secret, 'Admin User');
  const accountId = cashier.emp.accountId;

  // ── Boshlang'ich holat ────────────────────────────────────────────────────
  const openBefore = await prisma.cashierSession.count({ where: { state: 'open' } });
  const varBefore = await prisma.cashierSessionVariance.count();
  const outboxBefore = await prisma.hrTelegramOutbox.count({
    where: { sourceEventType: 'kassa.smena_farqi' },
  });
  console.log(
    `Boshlang'ich: ochiq smena ${openBefore} · farq akti ${varBefore} · farq-xabari ${outboxBefore}`,
  );

  // Eng ARZON tovar — P3 skriptidagi tanlash qoidasi (o'sha yerda izohi):
  // narx KARTANING O'ZINIKI bo'lishi shart, aks holda P12 narx poli chekni
  // 400 bilan rad etadi; `salePrices` JSON ustun, shuning uchun JS tomonda.
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
      return { ...p, retail: values.length > 0 ? values[0] : null };
    })
    .filter((p) => p.retail != null && p.buyPrice != null && p.retail >= p.buyPrice)
    .sort((a, b) => Number((a.retail as bigint) - (b.retail as bigint)));
  const product = priced[0];
  if (!product?.retail) throw new Error('Sinov uchun narxi va tan narxi to`g`ri tovar topilmadi');
  const priceMinor = product.retail as bigint;
  console.log(`Sinov tovari: ${product.name} · ${som(priceMinor)}`);

  const smenas = (await must(cashier.token, 'GET', '/admin/smenas/mine')) as {
    smena?: { id: string; name: string };
    withinShift?: boolean;
  };
  if (!smenas.smena) throw new Error('Kassir 1 ga smena biriktirilmagan');
  console.log(`Smena jadvali: ${smenas.smena.name} (vaqt ichida: ${smenas.withinShift})`);

  if (!LIVE) {
    console.log(
      `\nDRY: shu tovardan 2 chek sotilardi, smena ${som(OPENING_MINOR)} bilan ochilib\n` +
        `${som(VARIANCE_MINOR)} kamomad bilan yopilardi, keyin admin qabul qilardi.\n` +
        'Yozish uchun `--live` bering.\n',
    );
    return;
  }

  // ── A. OCHISH ─────────────────────────────────────────────────────────────
  const opened = (await must(cashier.token, 'POST', '/admin/smenas/open-session', {
    smenaId: smenas.smena.id,
    openingCashMinor: OPENING_MINOR.toString(),
    outOfShiftReason: 'P4 jonli sinov (2026-08-12)',
  })) as { id: string };
  const sessionId = opened.id;
  check('A. smena ochildi', !!sessionId, `id=${sessionId}`);

  // ── B. HIMOYA ─────────────────────────────────────────────────────────────
  const current = (await must(cashier.token, 'GET', '/cashier-sessions/current')) as Record<
    string,
    unknown
  >;
  check(
    'B1. `current` da yosh maydonlari bor',
    typeof current.openMinutes === 'number' && 'stale' in current,
    `openMinutes=${current.openMinutes} · staleWarnHours=${current.staleWarnHours} · stale=${current.stale}`,
  );
  check(
    'B2. yangi smena eskirgan emas',
    current.stale === false,
    `stale=${current.stale} (chegara ${current.staleWarnHours} soat)`,
  );

  const second = await call(cashier.token, 'POST', '/admin/smenas/open-session', {
    smenaId: smenas.smena.id,
    openingCashMinor: '0',
    outOfShiftReason: 'P4 ikkinchi ochish urinishi',
  });
  const secondMsg = JSON.stringify((second.body as { message?: string })?.message ?? second.body);
  check(
    'B3. ikkinchi ochish RAD etiladi va MA`LUMOTLI xabar beradi',
    second.status === 400 && /ochiq smena/i.test(secondMsg) && /yoping/i.test(secondMsg),
    `${second.status}: ${secondMsg.slice(0, 220)}`,
  );

  // ── C. SOTUV (2 chek, to'g'ridan-to'g'ri) ──────────────────────────────────
  const saleIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    const sale = (await must(cashier.token, 'POST', '/retail-sales', {
      sessionId,
      positions: [{ productId: product.id, quantity: '1', priceMinor: priceMinor.toString() }],
    })) as { id: string; sumMinor: string };
    // To'lov payload'i P3 skriptidagi bilan AYNI (naqd, kutilgan summa bilan).
    await must(cashier.token, 'POST', `/retail-sales/${sale.id}/post`, {
      cashAmountMinor: priceMinor.toString(),
      cardAmountMinor: '0',
      expectedSumMinor: String(sale.sumMinor),
    });
    saleIds.push(sale.id);
  }
  const posted = await prisma.retailSale.count({
    where: { sessionId, state: 'posted' },
  });
  check('C. 2 chek posted bo`ldi', posted === 2, `posted=${posted}`);

  // ── D. YOPISH — ataylab 5 000 kamomad ─────────────────────────────────────
  const z = (await must(cashier.token, 'GET', `/cashier-sessions/${sessionId}/z-report`)) as Record<
    string,
    unknown
  >;
  const expected = BigInt(String(z.expectedCashMinor));
  const counted = expected - VARIANCE_MINOR;
  if (counted < 0n) throw new Error(`kutilgan naqd juda kichik: ${som(expected)}`);
  console.log(
    `   kutilgan ${som(expected)} → sanoq ${som(counted)} (ataylab ${som(VARIANCE_MINOR)} kam)`,
  );

  await must(cashier.token, 'POST', `/cashier-sessions/${sessionId}/close`, {
    closingCashMinor: counted.toString(),
    varianceNote: 'P4 SINOV: farq ataylab kiritildi (2026-08-12), real kamomad emas.',
  });
  const closed = await prisma.cashierSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      state: true,
      closedAt: true,
      expectedCashMinor: true,
      closingCashMinor: true,
      discrepancyMinor: true,
      acceptanceState: true,
    },
  });
  check('D1. smena yopildi', closed.state === 'closed', `state=${closed.state}`);
  check(
    'D2. farq AYNAN kutilganicha',
    closed.discrepancyMinor === -VARIANCE_MINOR,
    `farq=${som(closed.discrepancyMinor)} (kutilgan ${som(closed.expectedCashMinor)}, sanoq ${som(closed.closingCashMinor)})`,
  );

  // ── E. FARQ AKTI + MENEJER NAVBATI ────────────────────────────────────────
  const acts = await prisma.cashierSessionVariance.findMany({
    where: { sessionId },
    select: { currency: true, varianceMinor: true, kind: true, cashierNote: true },
  });
  check(
    'E1. farq akti yozildi',
    acts.length === 1 && acts[0]?.varianceMinor === -VARIANCE_MINOR,
    acts.map((a) => `${a.currency} ${som(a.varianceMinor)} (${a.kind})`).join(' · ') || 'akt yo`q',
  );
  check(
    'E2. menejer navbatiga tushdi',
    closed.acceptanceState === 'pending',
    `acceptanceState=${closed.acceptanceState}`,
  );
  // 🔴 Javob shakli — `{ count, rows }` (`items` EMAS). Birinchi jonli
  // yugurishda skript `items` ni o'qib «navbat bo'sh» degan SOXTA signal
  // bergan edi; navbat aslida to'g'ri ishlayotgan edi.
  const queue = (await must(admin.token, 'GET', '/cashier-sessions/acceptance/queue')) as {
    count?: number;
    rows?: { id: string; acceptanceState: string }[];
  };
  check(
    'E3. navbat ekranida ko`rinadi',
    (queue.rows ?? []).some((r) => r.id === sessionId),
    `navbatda ${queue.count ?? 0} ta smena: ` +
      (queue.rows ?? []).map((r) => `${r.id.slice(0, 8)}:${r.acceptanceState}`).join(' · '),
  );

  // ── F. TELEGRAM (H7) ──────────────────────────────────────────────────────
  const msgs = await prisma.hrTelegramOutbox.findMany({
    where: { sourceDocId: sessionId, sourceEventType: 'kassa.smena_farqi' },
    select: { toSelf: true, toPhone: true, status: true, failReason: true, employeeId: true },
  });
  check(
    'F1. xabar TELEFONGA yozildi (toSelf EMAS)',
    msgs.length > 0 && msgs.every((m) => !m.toSelf && !!m.toPhone),
    msgs.map((m) => `${m.toSelf ? 'SELF' : m.toPhone} → ${m.status}`).join(' · ') || 'xabar yo`q',
  );

  // Worker navbatni ko'targuncha biroz kutamiz (jonli yetkazish — H7 ning asli).
  await new Promise((r) => setTimeout(r, 25_000));
  const after = await prisma.hrTelegramOutbox.findMany({
    where: { sourceDocId: sessionId, sourceEventType: 'kassa.smena_farqi' },
    select: { toPhone: true, status: true, failReason: true, sentAt: true, sentBySlot: true },
  });
  check(
    'F2. 🔴 xabar HAQIQATAN yuborildi',
    after.some((m) => m.status === 'sent'),
    after
      .map(
        (m) =>
          `${m.toPhone} → ${m.status}${m.sentAt ? ` @${m.sentAt.toISOString().slice(11, 19)} slot=${m.sentBySlot}` : ''}` +
          `${m.failReason ? ` (${m.failReason.slice(0, 80)})` : ''}`,
      )
      .join(' · '),
  );

  // ── G. QABUL ──────────────────────────────────────────────────────────────
  await must(admin.token, 'POST', `/cashier-sessions/acceptance/${sessionId}/transition`, {
    action: 'accept',
    comment: 'P4 sinov smenasi — farq ataylab kiritilgan, qabul qilindi.',
  });
  const accepted = await prisma.cashierSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { acceptanceState: true, acceptedById: true, acceptedAt: true },
  });
  check(
    'G1. egasi qabul qildi',
    accepted.acceptanceState === 'accepted',
    `${accepted.acceptanceState} · ${accepted.acceptedAt?.toISOString().slice(0, 16)}`,
  );
  const events = await prisma.cashierSessionAcceptanceEvent.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    select: { fromState: true, toState: true, action: true, actorType: true },
  });
  check(
    'G2. jurnal to`liq zanjirni yozdi',
    events.length >= 2,
    events.map((e) => `${e.fromState}→${e.toState} (${e.action}/${e.actorType})`).join(' · '),
  );

  // ── H. QOLDIQ — o'lchanadi, TOZALANMAYDI ──────────────────────────────────
  // 🔴 SINOV CHEKLARINI QAYTARIB BO'LMAYDI: `refund` asl chekning SMENASI
  // OCHIQ bo'lishini talab qiladi (`retail-sale.service.ts:1439` —
  // «Session is closed. Cannot refund.»), bu sinov esa smenani ataylab
  // yopadi. P3 da tozalash ishlagan edi, chunki u yerda smena ochiq qolardi.
  //
  // Shuning uchun skript tozalashga URINMAYDI — qoldiqni O'LCHAB, ochiq
  // e'lon qiladi. Jim qoldirilgan qoldiq «toza» degan yolg'on hisobotdan
  // yomonroq (`audit-findings-examples-unverified` intizomi).
  const residue = await prisma.retailSale.findMany({
    where: { sessionId, state: 'posted' },
    select: { name: true, sumMinor: true },
  });
  const stockRows = await prisma.stock.findMany({
    where: { accountId, assortmentKind: 'product', assortmentId: product.id },
    select: { qty: true, reservedQty: true },
  });
  console.log(
    "\n⚠️  QOLDIQ (qaytarib bo'lmaydi — P13 tozalashiga qoladi):\n" +
      `   cheklar: ${residue.map((r) => `${r.name} ${som(r.sumMinor)}`).join(' · ') || 'yo`q'}\n` +
      `   ombor:   ${stockRows.map((r) => `${r.qty}/rez ${r.reservedQty}`).join(', ')}`,
  );

  console.log(
    `\nYakun: ${failures === 0 ? '✅ hammasi o`tdi' : `🔴 ${failures} ta tekshiruv yiqildi`}\n` +
      `Sinov smenasi: ${sessionId}\n`,
  );
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

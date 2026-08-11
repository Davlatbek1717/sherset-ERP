#!/usr/bin/env tsx
/**
 * P3 JONLI VERIFY — «chek hayot sikli» (2026-08-12).
 *
 * Nima qiladi: ishlab turgan API orqali (HTTP ⇒ real controller + guard +
 * servis) chek zanjirining HAR bo'g'inini HAQIQIY KASSIR tokeni bilan
 * o'tkazadi va har qadamda bazani o'lchaydi:
 *
 *   A. YIG'ISH ZANJIRI:  savat → picking → ready → posted
 *      · `picking` da tovar REZERV bo'lishi (H5)
 *      · `posted` da rezerv YUTILISHI va qoldiq kamayishi
 *      · `payedSumMinor` yozilishi (H12)
 *      · smena `salesCount` oshishi (bu prodda 0 edi!)
 *   B. TO'G'RIDAN-TO'G'RI SOTUV: savat → posted (picking'siz, rezervsiz)
 *   C. BEKOR QILISH: savat → picking → cancel, rezerv BO'SHASHI
 *   D. RUXSAT CHEGARASI: kassir `refund` qila OLMASLIGI (403)
 *
 * 🔴 DRY sukut bo'yicha — `--live` bermaguncha HECH NIMA yozilmaydi (reja §0.7).
 * `--live` rejimida eng ARZON tovar bilan ishlanadi va yakunda sotilgan
 * cheklar ADMIN tokeni bilan QAYTARILADI, ya'ni kassa qoldig'i va ombor
 * boshlang'ich holatiga qaytadi (qaytarish yo'lining o'zi ham shu bilan
 * sinaladi). Qolgani hisobotda yoziladi.
 *
 * 🔴 NEGA HTTP, Nest konteksti EMAS (P1/P2 dan meros): `createApplicationContext`
 * prodda ikkinchi jarayonda barcha `@Cron`larni ro'yxatdan o'tkazadi.
 *
 * Ishga tushirish (box):
 *   cd /var/www/sherset-v2/apps/api && set -a && . ./.env && set +a && \
 *   ./node_modules/.bin/tsx src/scripts/ops-p3-live-verify.ts           # DRY
 *   ./node_modules/.bin/tsx src/scripts/ops-p3-live-verify.ts --live    # yozadi
 */
import { PrismaClient } from '@moysklad/db';
import { JwtService } from '@nestjs/jwt';

const API = process.env.P3_API_BASE ?? 'http://localhost:4001/api/v1';
const LIVE = process.argv.includes('--live');
const prisma = new PrismaClient();

const som = (m: bigint | string | null | undefined) =>
  m == null ? 'null' : `${(BigInt(m) / 100n).toLocaleString('ru-RU')} so'm`;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  failures += ok ? 0 : 1;
  console.log(`${ok ? '✅' : '🔴'} ${label} — ${detail}`);
}

interface CallResult {
  status: number;
  body: unknown;
}
async function call(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<CallResult> {
  // Fastify `content-type: application/json` bilan BO'SH tanani rad etadi
  // («Body cannot be empty…»), shuning uchun tanasiz POST ham `{}` yuboradi.
  // Bu — jonli 400 bo'lib chiqdi (2026-08-12): `send-to-picking`/`mark-ready`
  // /`cancel` endpointlari tana KUTMAYDI, lekin bo'sh ham bo'lolmaydi.
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
    select: { role: { select: { name: true, uiMode: true } } },
  });
  const uiMode = roles[0]?.role.uiMode ?? 'full';
  const token = new JwtService({ secret }).sign(
    {
      sub: emp.id,
      accountId: emp.accountId,
      email: emp.email,
      name: emp.name,
      username: emp.username,
      hrRoles: emp.hrRoles,
      isChecker: emp.isChecker,
      uiMode,
      hrPermissions: [],
    },
    { expiresIn: '20m' },
  );
  return { token, emp, uiMode, roleNames: roles.map((r) => r.role.name).join(',') };
}

async function main() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET topilmadi (apps/api/.env ni source qiling)');

  const cashier = await tokenFor(secret, 'Kassir 1');
  const admin = await tokenFor(secret, 'Admin User');
  const accountId = cashier.emp.accountId;

  const session = await prisma.cashierSession.findFirstOrThrow({
    where: { accountId, cashierId: cashier.emp.id, state: 'open' },
    select: { id: true, storeId: true, salesCount: true, salesSumMinor: true },
  });

  // Eng ARZON narxli tovar — jonli sinov summasi minimal bo'lsin.
  //
  // 🔴 Narx KARTANING O'ZINIKI bo'lishi shart: P12 poli (`min(tan narx,
  // chakana)`) buzilsa chek 400 bilan RAD etiladi, ya'ni o'zboshimchalik
  // bilan «1 so'm» qo'yib bo'lmaydi. `salePrices` — JSON ustun
  // (`[{ priceTypeId, value }]`), shuning uchun tanlash JS tomonda.
  // Tan narxi bor tovar olinadi: tan narxsizda pol NULL bo'lib, sinov P12
  // ning boshqa shoxini o'lchab qo'yardi.
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
      const retail = values.length > 0 ? values[0] : null;
      return { ...p, retail };
    })
    // Pol = min(tan narx, chakana). Chekni o'tkazish uchun narx poldan
    // PAST bo'lmasligi kerak — chakana narx tan narxdan past tovarlar
    // (import qoldig'i) chetlab o'tiladi.
    .filter((p) => p.retail != null && p.buyPrice != null && p.retail >= p.buyPrice)
    .sort((a, b) => Number((a.retail as bigint) - (b.retail as bigint)));
  const product = priced[0];
  if (!product?.retail) throw new Error('Sinov uchun narxi va tan narxi to`g`ri tovar topilmadi');

  const stockOf = async () =>
    prisma.stock.findUnique({
      where: {
        accountId_storeId_assortmentKind_assortmentId: {
          accountId,
          storeId: session.storeId,
          assortmentKind: 'product',
          assortmentId: product.id,
        },
      },
      select: { qty: true, reservedQty: true },
    });

  const before = await stockOf();
  const price = product.retail as bigint;

  console.log('════════ P3 JONLI VERIFY — chek hayot sikli ════════');
  console.log(`Rejim:      ${LIVE ? '🔴 LIVE (yozadi)' : 'DRY (hech nima yozilmaydi)'}`);
  console.log(`API:        ${API}`);
  console.log(`Kassir:     ${cashier.emp.name} (rol: ${cashier.roleNames}, ${cashier.uiMode})`);
  console.log(`Smena:      ${session.id} · salesCount = ${session.salesCount}`);
  console.log(`Tovar:      ${product.name} · narx ${som(price)}`);
  console.log(`Qoldiq:     qty ${before?.qty ?? 'yo`q'} · rezerv ${before?.reservedQty ?? 'yo`q'}`);

  if (!LIVE) {
    console.log('\nDRY — `--live` berilmadi, hech nima yozilmadi.');
    await prisma.$disconnect();
    return;
  }

  const line = { productId: product.id, quantity: '1', priceMinor: price.toString() };
  const posted: string[] = [];

  // ── A. YIG'ISH ZANJIRI: draft → picking → ready → posted ─────────────────
  console.log("\n── A. Yig'ish zanjiri (kassir tokeni) ──");
  const saleA = await must(cashier.token, 'POST', '/retail-sales', {
    sessionId: session.id,
    positions: [line],
  });
  const idA = String(saleA.id);
  check(
    'chek yaratildi',
    saleA.state === 'draft',
    `${saleA.name} · ${som(String(saleA.sumMinor))}`,
  );

  await must(cashier.token, 'POST', `/retail-sales/${idA}/send-to-picking`);
  const afterPick = await stockOf();
  const reservedDelta = Number(afterPick?.reservedQty ?? 0) - Number(before?.reservedQty ?? 0);
  check(
    'H5 — picking tovarni REZERV qildi',
    reservedDelta === 1,
    `reservedQty ${before?.reservedQty ?? 0} → ${afterPick?.reservedQty ?? 0}`,
  );
  const resRows = await prisma.stockReservation.count({
    where: { accountId, docType: 'retailsale', docId: idA },
  });
  check('rezerv jurnaliga yozildi', resRows > 0, `${resRows} qator (docType retailsale)`);

  await must(cashier.token, 'POST', `/retail-sales/${idA}/mark-ready`);
  const readyRow = await prisma.retailSale.findUniqueOrThrow({
    where: { id: idA },
    select: { state: true },
  });
  check('mark-ready o‘tdi', readyRow.state === 'ready', `holat: ${readyRow.state}`);

  const payRes = await call(cashier.token, 'POST', `/retail-sales/${idA}/post`, {
    cashAmountMinor: price.toString(),
    cardAmountMinor: '0',
    expectedSumMinor: String(saleA.sumMinor),
  });
  check(
    '🔴 KASSIR CHEKNI TO‘LADI (prodda 403 edi)',
    payRes.status < 400,
    `status ${payRes.status}`,
  );
  if (payRes.status < 400) posted.push(idA);

  const postedRow = await prisma.retailSale.findUniqueOrThrow({
    where: { id: idA },
    select: { state: true, sumMinor: true, payedSumMinor: true },
  });
  check('holat posted', postedRow.state === 'posted', `holat: ${postedRow.state}`);
  check(
    'H12 — payedSumMinor yozildi',
    postedRow.payedSumMinor === postedRow.sumMinor,
    `payed ${som(postedRow.payedSumMinor)} == sum ${som(postedRow.sumMinor)}`,
  );

  const afterPost = await stockOf();
  check(
    'rezerv YUTILDI (hold qoldiqqa aylandi)',
    Number(afterPost?.reservedQty ?? 0) === Number(before?.reservedQty ?? 0),
    `reservedQty ${afterPick?.reservedQty ?? 0} → ${afterPost?.reservedQty ?? 0}`,
  );
  check(
    'ombor qoldig‘i kamaydi',
    Number(afterPost?.qty ?? 0) === Number(before?.qty ?? 0) - 1,
    `qty ${before?.qty ?? 0} → ${afterPost?.qty ?? 0}`,
  );

  const sessAfter = await prisma.cashierSession.findUniqueOrThrow({
    where: { id: session.id },
    select: { salesCount: true, salesSumMinor: true },
  });
  check(
    '🔴 smenaga TUSHDI (prodda salesCount 0 edi)',
    sessAfter.salesCount === session.salesCount + 1,
    `salesCount ${session.salesCount} → ${sessAfter.salesCount} · ${som(sessAfter.salesSumMinor)}`,
  );

  // ── B. TO'G'RIDAN-TO'G'RI SOTUV (picking'siz) ────────────────────────────
  console.log("\n── B. To'g'ridan-to'g'ri sotuv (POS «Sotish» yo'li) ──");
  const saleB = await must(cashier.token, 'POST', '/retail-sales', {
    sessionId: session.id,
    positions: [line],
  });
  const idB = String(saleB.id);
  const payB = await call(cashier.token, 'POST', `/retail-sales/${idB}/post`, {
    cashAmountMinor: price.toString(),
    cardAmountMinor: '0',
    expectedSumMinor: String(saleB.sumMinor),
  });
  check('draft dan TO‘G‘RIDAN to‘landi (yig‘ishsiz)', payB.status < 400, `status ${payB.status}`);
  if (payB.status < 400) posted.push(idB);
  const resB = await prisma.stockReservation.count({
    where: { accountId, docType: 'retailsale', docId: idB },
  });
  check('bu yo‘lda rezerv YARATILMAYDI', resB === 0, `${resB} rezerv qatori`);

  // ── C. BEKOR QILISH rezervni bo'shatadi ─────────────────────────────────
  console.log('\n── C. Bekor qilish (kassir tokeni) ──');
  const saleC = await must(cashier.token, 'POST', '/retail-sales', {
    sessionId: session.id,
    positions: [line],
  });
  const idC = String(saleC.id);
  await must(cashier.token, 'POST', `/retail-sales/${idC}/send-to-picking`);
  const heldC = await stockOf();
  const cancelRes = await call(cashier.token, 'POST', `/retail-sales/${idC}/cancel`);
  check(
    '🔴 KASSIR CHEKNI BEKOR QILDI (prodda 403 edi)',
    cancelRes.status < 400,
    `status ${cancelRes.status}`,
  );
  const afterCancel = await stockOf();
  check(
    'bekor qilish rezervni BO‘SHATDI',
    Number(afterCancel?.reservedQty ?? 0) === Number(afterPost?.reservedQty ?? 0),
    `reservedQty ${heldC?.reservedQty ?? 0} → ${afterCancel?.reservedQty ?? 0}`,
  );

  // ── D. RUXSAT CHEGARASI: kassir qaytara olmaydi ─────────────────────────
  console.log('\n── D. Ruxsat chegarasi ──');
  const refundByCashier = await call(cashier.token, 'POST', `/retail-sales/${idA}/refund`, {
    positions: [{ productId: product.id, quantity: '1' }],
    cashAmountMinor: price.toString(),
    cardAmountMinor: '0',
  });
  check(
    'kassir QAYTARA OLMAYDI (egasi qarori)',
    refundByCashier.status === 403,
    `status ${refundByCashier.status}`,
  );

  // ── Tozalash: sinov cheklarini ADMIN qaytaradi ──────────────────────────
  console.log('\n── Tozalash: sinov cheklari qaytariladi (admin tokeni) ──');
  for (const id of posted) {
    const r = await call(admin.token, 'POST', `/retail-sales/${id}/refund`, {
      positions: [{ productId: product.id, quantity: '1' }],
      cashAmountMinor: price.toString(),
      cardAmountMinor: '0',
      description: 'P3 jonli verify — SINOV cheki qaytarildi',
    });
    check(`chek ${id.slice(0, 8)} qaytarildi (admin)`, r.status < 400, `status ${r.status}`);
  }

  const final = await stockOf();
  check(
    'ombor boshlang‘ich holatga qaytdi',
    Number(final?.qty ?? 0) === Number(before?.qty ?? 0),
    `qty ${before?.qty ?? 0} → ${final?.qty ?? 0}`,
  );
  check(
    'rezerv qoldig‘i toza',
    Number(final?.reservedQty ?? 0) === Number(before?.reservedQty ?? 0),
    `reservedQty ${before?.reservedQty ?? 0} → ${final?.reservedQty ?? 0}`,
  );

  console.log(
    `\n════════ ${failures === 0 ? '✅ HAMMASI O‘TDI' : `🔴 ${failures} ta TEKSHIRUV YIQILDI`} ════════`,
  );
  await prisma.$disconnect();
  if (failures > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

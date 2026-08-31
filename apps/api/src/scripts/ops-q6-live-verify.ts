#!/usr/bin/env tsx
/**
 * Q6 JONLI VERIFY — «kassa qarzi undirish reyestrida · avans kassada ishlaydi»
 * (2026-08-25, reja: `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md`).
 *
 * Rejaning BESH INVARIANTINI (§3) jonlida RAQAM bilan isbotlaydi:
 *   1. balansga IKKI MARTA yozilmaydi;
 *   2. simmetriya — vozvratda ikkala daftar teng harakatlanadi;
 *   3. idempotentlik — bitta chekka bitta qator;
 *   4. avans qarz emas — manfiy balansdan `Debt` qatori tug'ilmaydi;
 *   5. avans o'zidan ortiq sarflanmaydi (400).
 *
 * 🔴 NEGA HTTP, Nest konteksti EMAS (P1 dan meros qoida):
 * `NestFactory.createApplicationContext` prodda IKKINCHI jarayonda barcha
 * `@Cron`larni ro'yxatdan o'tkazadi — rejalangan ishlar ikki marta ketishi
 * mumkin edi. HTTP yo'li hech nima ko'tarmaydi va ustiga-ustak guard/DTO
 * qatlamini ham o'lchaydi.
 *
 * 🔴 PROD EHTIYOTKORLIGI: argumentsiz — **DRY** (faqat O'QIYDI). U holda
 * skript «jonlida qaysi faza bor» degan QAMROV o'lchovini chiqaradi, ya'ni
 * deploy oldidan ham foydali. Yozish uchun `--live`.
 *
 * 🔴 `--live` OMBORGA TEGADI: sinov cheki HAQIQIY tovarni sotadi va oxirida
 * vozvrat bilan qaytaradi. Ya'ni bu **jonli o'zgarish** — F-reja qoida 8
 * (`warehouse-state.ts` oldin/keyin) va qoida 13 (uchma-uch smoke) MAJBURIY,
 * va u ish soatidan TASHQARIDA yugurtiriladi.
 *
 * Hukm qoidalari bu faylda EMAS — sof `q6-verify-plan.ts` da (testlar bilan
 * qulflangan). Bu yerda faqat o'lchov va HTTP.
 *
 * Ishga tushirish (box):
 *   cd /var/www/sherset-v2/apps/api && set -a && . ./.env && set +a && \
 *   ./node_modules/.bin/tsx src/scripts/ops-q6-live-verify.ts            # DRY
 *   …/ops-q6-live-verify.ts --live                                      # yozadi
 *   …/ops-q6-live-verify.ts --live --only=debt                          # faqat qarz zanjiri
 *   …/ops-q6-live-verify.ts --live --only=prepay                        # faqat avans zanjiri
 *
 * Env: `Q6_API_BASE` (default `http://localhost:4001/api/v1`),
 *      `Q6_DEBT_CP` / `Q6_PREPAY_CP` (sinov kontragentlari — berilmasa tanlanadi),
 *      `Q6_PRODUCT` (sinov tovari — berilmasa qoldig'i bor eng arzoni).
 */
import { PrismaClient } from '@moysklad/db';
// `jsonwebtoken` to'g'ridan-to'g'ri bog'liqlik EMAS (u `@nestjs/jwt` ichida).
import { JwtService } from '@nestjs/jwt';
import { DEBT_LEDGER_CURRENCY } from '../modules/debt/sale-debt-registry.js';
import {
  type DeploymentProbe,
  type LedgerSnapshot,
  type Verdict,
  isLiveVerifyPossible,
  planDebtChainVerdicts,
  planPrepayChainVerdicts,
  planReadiness,
  summarizeVerdicts,
} from './q6-verify-plan.js';

const LIVE = process.argv.includes('--live');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice('--only='.length);
const RUN_DEBT = ONLY === '' || ONLY === 'debt';
const RUN_PREPAY = ONLY === '' || ONLY === 'prepay';
const API = process.env.Q6_API_BASE ?? 'http://localhost:4001/api/v1';

/** Sinov summalari — ATAYLAB kichik (hammasi oxirida qaytariladi). */
const PREPAY_MINOR = 100_000n; // 1 000 so'm
const SPEND_MINOR = 60_000n; //    600 so'm
const PAY_MINOR = 20_000n; //      200 so'm (qisman to'lov)

const prisma = new PrismaClient();
const som = (m: bigint | null | undefined) =>
  m == null ? 'null' : `${(m / 100n).toLocaleString('ru-RU')} so'm`;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok)
    throw new HttpError(res.status, `${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

/** `--live` da 400 KUTILGAN bo'lgan chaqiruv (invariant 5). */
async function expect400(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof HttpError && e.status === 400;
  }
}

/**
 * 🔴 ATAYLAB RAD ETILADIGAN CHEK — va uning IZINI TOZALASH.
 *
 * Invariant 5 ni o'lchash uchun avans qoldig'idan ORTIQ chek POST qilinadi va
 * 400 kutiladi. Lekin `POST /retail-sales` (chernovik) 400 dan OLDIN o'tib
 * bo'lgan: post rad etilsa chek `draft` holatida QOLADI.
 *
 * Bu jonlida ZARARSIZ EMAS: `draft` — smenani yopishga to'sqinlik qiluvchi
 * holatlardan biri (`unresolved-sales.ts` → «savatda», F5). Ya'ni verify
 * skripti kassirning smenasini yopolmaydigan qilib qo'yardi — aynan shu
 * sinfdagi hodisa 2026-08-24 da kassani to'xtatgan. Shuning uchun chernovik
 * HAR HOLDA bekor qilinadi (`POST :id/cancel` — `draft` dan ruxsat etilgan
 * o'tish, `retail-sale-fsm.ts#CANCELLABLE`).
 */
async function expectPostRejected(
  ctx: Ctx,
  opts: { productId: string; priceMinor: bigint; agentId: string; prepayMinor: bigint },
): Promise<boolean> {
  const draft = await call(ctx.token, 'POST', '/retail-sales', {
    sessionId: ctx.shiftId,
    agentId: opts.agentId,
    description: 'Q6 jonli verify — ATAYLAB RAD ETILADIGAN chek (invariant 5)',
    positions: [
      { productId: opts.productId, quantity: '1', priceMinor: opts.priceMinor.toString() },
    ],
  });
  try {
    return await expect400(() =>
      call(ctx.token, 'POST', `/retail-sales/${draft.id}/post`, {
        cashAmountMinor: '0',
        cardAmountMinor: '0',
        terminalAmountMinor: '0',
        debtAmountMinor: '0',
        prepayAmountMinor: opts.prepayMinor.toString(),
        agentId: opts.agentId,
        // 🔴 expectedSumMinor MAJBURIY (post() dagi mijoz-sanity, E5 dan keyin).
        // Usiz 400 «expectedSumMinor must be a non-negative integer» keladi va
        // expect400 NOTO'G'RI sababdan yashil bo'lardi — invariant 5 ning 400
        // i aynan AVANS chegarasidan kelishi kerak, shu maydon to'g'ri ketadi.
        expectedSumMinor: opts.priceMinor.toString(),
      }),
    );
  } finally {
    // Rad etilsa ham, kutilmaganda O'TIB ketsa ham — chernovik qolmaydi.
    // Post muvaffaqiyatli bo'lgan holatda `cancel` 400/409 beradi; u holda
    // hukm allaqachon QIZIL bo'ladi va tozalashni odam qiladi.
    await call(ctx.token, 'POST', `/retail-sales/${draft.id}/cancel`).catch(() => undefined);
  }
}

// ────────────────────────────────────────────── QAMROV O'LCHOVI (DRY) ───────

async function probeDeployment(token: string, accountId: string, cpId: string | null) {
  const col = async (table: string, column: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      'SELECT count(*)::bigint AS n FROM information_schema.columns WHERE table_name = $1 AND column_name = $2',
      table,
      column,
    );
    return Number(rows[0]?.n ?? 0n) > 0;
  };

  const [q1Columns, q4Column, a1Column] = await Promise.all([
    col('debts', 'source_doc_type'),
    col('company_settings', 'sale_debt_term_days'),
    col('retail_drawer_cash_in', 'kind'),
  ]);

  // 🔴 IKKI XIL «YO'Q» AJRATILADI. `HttpError` = API javob BERDI (eski
  // kod 404/400 qaytarishi mumkin) ⇒ o'lchov haqiqiy, maydon rostdan yo'q.
  // Boshqa xato (ECONNREFUSED, DNS, timeout) = API'ga UMUMAN yetib borilmadi
  // ⇒ bu O'LCHOV EMAS va «kod deploy qilinmagan» deb yozilmasligi kerak
  // (lokal DRY yugurishida aynan shu chalkashlik chiqdi).
  let apiReachable = false;
  let a2Field = false;
  let a3Field = false;
  if (cpId) {
    try {
      const s = await call(
        token,
        'GET',
        `/debts/pos/summary/${cpId}?currency=${DEBT_LEDGER_CURRENCY}`,
      );
      apiReachable = true;
      a2Field = s != null && 'prepayAvailableMinor' in s;
      a3Field = s != null && 'standing' in s;
    } catch (e) {
      apiReachable = e instanceof HttpError;
    }
  }

  const saleDebtRows = q1Columns
    ? await prisma.debt.count({
        where: { accountId, sourceDocType: 'retailsale', deletedAt: null },
      })
    : 0;
  const backfillRows = q1Columns
    ? await prisma.debtNote.count({
        where: { accountId, text: { startsWith: '[Q5-BACKFILL' } },
      })
    : 0;

  const probe: DeploymentProbe = {
    q1Columns,
    q4Column,
    a1Column,
    apiReachable,
    a2Field,
    a3Field,
    saleDebtRows,
    backfillRows,
  };
  return probe;
}

// ────────────────────────────────────────────────────────── O'LCHOVCHI ──────

interface Ctx {
  token: string;
  accountId: string;
  shiftId: string;
  cashDeskId: string;
}

async function snapshot(ctx: Ctx, cpId: string, saleId: string | null): Promise<LedgerSnapshot> {
  const [bal, desk, journal, row] = await Promise.all([
    prisma.counterpartyBalance.findFirst({
      where: { accountId: ctx.accountId, counterpartyId: cpId, currency: DEBT_LEDGER_CURRENCY },
      select: { balanceMinor: true },
    }),
    prisma.cashDesk.findFirst({ where: { id: ctx.cashDeskId }, select: { balanceMinor: true } }),
    prisma.counterpartyBalanceEntry.count({
      where: { accountId: ctx.accountId, counterpartyId: cpId },
    }),
    saleId
      ? prisma.debt.findFirst({
          where: {
            accountId: ctx.accountId,
            sourceDocType: 'retailsale',
            sourceDocId: saleId,
            deletedAt: null,
          },
          select: {
            id: true,
            totalMinor: true,
            paidMinor: true,
            status: true,
            balanceAdopted: true,
            nextContactAt: true,
            sourceDocType: true,
          },
        })
      : Promise.resolve(null),
  ]);

  // Undirish ro'yxati — HTTP orqali (sof modul + Q4 filtri + servis o'lchansin).
  //
  // 🔴 KESIM XAVFI: endpoint javobni `COLLECTION_ROW_CAP = 500` da kesadi va
  // buni `truncated` bilan OSHKORA aytadi. Q5 backfill'idan keyin ro'yxat
  // 500 dan oshadi (lokal o'lchov: 579 → 812), ya'ni sinov qatori kesimdan
  // tashqarida qolishi mumkin. «Topilmadi» ni «ro'yxatda yo'q» deb yozish
  // verify'ning O'ZINI yolg'onchi qilardi, shuning uchun:
  //   topildi           → true
  //   topilmadi + butun → false   (haqiqiy o'lchov)
  //   topilmadi + kesik → null    (O'LCHANMADI — hukmda XATO)
  // `source=retailsale` (Q4 filtri) kesim ehtimolini kamaytiradi va yo'l-yo'lakay
  // Q4 ning O'ZINI ham o'lchaydi: qator manba filtridan O'TISHI shart.
  let inCollection: boolean | null = false;
  if (row) {
    const list = await call(
      ctx.token,
      'GET',
      '/manager/collection?scope=all&source=retailsale&limit=500',
    );
    const rows: Array<{ debtId: string }> = list?.rows ?? [];
    const found = rows.some((r) => r.debtId === row.id);
    inCollection = found ? true : list?.truncated === true ? null : false;
  }

  return {
    balanceMinor: bal?.balanceMinor ?? null,
    row: row
      ? {
          totalMinor: row.totalMinor,
          paidMinor: row.paidMinor,
          status: row.status,
          balanceAdopted: row.balanceAdopted,
          nextContactAt: row.nextContactAt,
          sourceDocType: row.sourceDocType,
        }
      : null,
    inCollection,
    cashDeskMinor: desk?.balanceMinor ?? 0n,
    journalRows: journal,
  };
}

// ───────────────────────────────────────────────────── SINOV MATERIALI ──────

/** Qoldig'i bor va narxi bor eng arzon tovar — sinov cheki uchun. */
async function pickProduct(accountId: string, storeId: string) {
  const envId = process.env.Q6_PRODUCT;
  if (envId) {
    const p = await prisma.product.findFirstOrThrow({
      where: { id: envId, accountId },
      select: { id: true, name: true },
    });
    return p;
  }
  const stocks = await prisma.stock.findMany({
    where: { accountId, storeId, qty: { gt: 1 } },
    select: { assortmentId: true },
    take: 200,
  });
  if (stocks.length === 0) throw new Error(`«${storeId}» omborida qoldiqli tovar topilmadi`);
  const p = await prisma.product.findFirst({
    where: { id: { in: stocks.map((s) => s.assortmentId) }, accountId, archived: false },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  if (!p) throw new Error('Qoldiqli tovar topilmadi');
  return p;
}

/** Balansi 0 yoki musbat (avansi YO'Q) sinov kontragenti. */
async function pickDebtCounterparty(accountId: string) {
  const envId = process.env.Q6_DEBT_CP;
  if (envId) {
    return prisma.counterparty.findFirstOrThrow({
      where: { id: envId, accountId },
      select: { id: true, name: true },
    });
  }
  const rows = await prisma.counterpartyBalance.findMany({
    where: { accountId, currency: DEBT_LEDGER_CURRENCY, balanceMinor: { gte: 0n } },
    orderBy: { balanceMinor: 'asc' },
    take: 1,
    select: { counterpartyId: true },
  });
  const id = rows[0]?.counterpartyId;
  if (!id) throw new Error("Balansi manfiy bo'lmagan kontragent topilmadi");
  return prisma.counterparty.findFirstOrThrow({
    where: { id, accountId },
    select: { id: true, name: true },
  });
}

// ─────────────────────────────────────────────────────────── ZANJIRLAR ──────

/** Chek yaratadi va berilgan tenderlar bilan post qiladi; `sale` qaytaradi. */
async function postSale(
  ctx: Ctx,
  opts: {
    productId: string;
    priceMinor: bigint;
    agentId: string;
    debtMinor?: bigint;
    prepayMinor?: bigint;
    cashMinor?: bigint;
  },
) {
  const draft = await call(ctx.token, 'POST', '/retail-sales', {
    sessionId: ctx.shiftId,
    agentId: opts.agentId,
    description: 'Q6 jonli verify — SINOV cheki, oxirida qaytariladi',
    positions: [
      { productId: opts.productId, quantity: '1', priceMinor: opts.priceMinor.toString() },
    ],
  });
  const posted = await call(ctx.token, 'POST', `/retail-sales/${draft.id}/post`, {
    cashAmountMinor: (opts.cashMinor ?? 0n).toString(),
    cardAmountMinor: '0',
    terminalAmountMinor: '0',
    debtAmountMinor: (opts.debtMinor ?? 0n).toString(),
    prepayAmountMinor: (opts.prepayMinor ?? 0n).toString(),
    agentId: opts.agentId,
    // 1 dona × narx ⇒ chek jamisi aynan shu (server bazadagi summa bilan
    // qayta tekshiradi). Maydon majburiy — 2026-08-31 jonli yugurishda usiz
    // post() 400 berdi va --live zanjiri UMUMAN yurmagan edi.
    expectedSumMinor: opts.priceMinor.toString(),
  });
  return { id: draft.id as string, posted };
}

async function refundSaleFully(ctx: Ctx, saleId: string, productId: string) {
  return call(ctx.token, 'POST', `/retail-sales/${saleId}/refund`, {
    positions: [{ productId, quantity: '1' }],
  });
}

async function runDebtChain(ctx: Ctx): Promise<Verdict[]> {
  const cp = await pickDebtCounterparty(ctx.accountId);
  const store = await prisma.cashierSession.findFirstOrThrow({
    where: { id: ctx.shiftId },
    select: { storeId: true },
  });
  if (!store.storeId) throw new Error("Smenaning ombori yo'q");
  const product = await pickProduct(ctx.accountId, store.storeId);

  const debtMinor = PREPAY_MINOR; // 1 000 so'm — chek to'liq qarzga
  console.log(`\n── QARZ ZANJIRI ── kontragent «${cp.name}» · tovar «${product.name}»`);

  const before = await snapshot(ctx, cp.id, null);
  const sale = await postSale(ctx, {
    productId: product.id,
    priceMinor: debtMinor,
    agentId: cp.id,
    debtMinor,
  });
  const afterPost = await snapshot(ctx, cp.id, sale.id);

  // Qisman to'lov — POS yo'li (P1 FIFO'si + adopsiya).
  await call(ctx.token, 'POST', '/debts/pos/pay', {
    counterpartyId: cp.id,
    amountMinor: PAY_MINOR.toString(),
    currency: DEBT_LEDGER_CURRENCY,
    method: 'cash',
    cashDeskId: ctx.cashDeskId,
    retailShiftId: ctx.shiftId,
    comment: 'Q6 jonli verify — SINOV qisman to`lovi',
  });
  const afterPay = await snapshot(ctx, cp.id, sale.id);

  await refundSaleFully(ctx, sale.id, product.id);
  const afterRefund = await snapshot(ctx, cp.id, sale.id);

  console.log(`  chek ${sale.id} · qarz ${som(debtMinor)} · to'lov ${som(PAY_MINOR)}`);
  console.log(
    `  balans: ${som(before.balanceMinor)} → ${som(afterPost.balanceMinor)} → ${som(afterPay.balanceMinor)} → ${som(afterRefund.balanceMinor)}`,
  );

  return planDebtChainVerdicts({
    debtMinor,
    payMinor: PAY_MINOR,
    before,
    afterPost,
    afterPay,
    afterRefund,
  });
}

async function runPrepayChain(ctx: Ctx): Promise<Verdict[]> {
  const envCp = process.env.Q6_PREPAY_CP;
  const cp = envCp
    ? await prisma.counterparty.findFirstOrThrow({
        where: { id: envCp, accountId: ctx.accountId },
        select: { id: true, name: true },
      })
    : await pickDebtCounterparty(ctx.accountId);
  const store = await prisma.cashierSession.findFirstOrThrow({
    where: { id: ctx.shiftId },
    select: { storeId: true },
  });
  if (!store.storeId) throw new Error("Smenaning ombori yo'q");
  const product = await pickProduct(ctx.accountId, store.storeId);

  console.log(`\n── AVANS ZANJIRI ── kontragent «${cp.name}» · tovar «${product.name}»`);

  const before = await snapshot(ctx, cp.id, null);

  // 1) QABUL (A1)
  await call(ctx.token, 'POST', `/cashier-sessions/${ctx.shiftId}/customer-prepay`, {
    counterpartyId: cp.id,
    sumMinor: PREPAY_MINOR.toString(),
    description: 'Q6 jonli verify — SINOV avansi',
  });
  const afterPrepay = await snapshot(ctx, cp.id, null);

  // 2) SARFLASH (A2)
  const spend = await postSale(ctx, {
    productId: product.id,
    priceMinor: SPEND_MINOR,
    agentId: cp.id,
    prepayMinor: SPEND_MINOR,
  });
  const afterSpend = await snapshot(ctx, cp.id, null);
  const spendReceiptFullyPaid =
    BigInt(spend.posted.payedSumMinor ?? '0') === BigInt(spend.posted.sumMinor ?? '-1');

  // 3) INVARIANT 5 — qolgan avansdan ORTIQ urinish
  const remaining = PREPAY_MINOR - SPEND_MINOR;
  const overspendRejected = await expectPostRejected(ctx, {
    productId: product.id,
    priceMinor: remaining + 10_000n,
    agentId: cp.id,
    prepayMinor: remaining + 10_000n,
  });

  // 4) §2.2 KESISHUV — avansi qolgan mijozga qarzga sotuv
  const crossTotal = remaining + PREPAY_MINOR; // avans qismi + haqiqiy qarz
  const cross = await postSale(ctx, {
    productId: product.id,
    priceMinor: crossTotal,
    agentId: cp.id,
    prepayMinor: remaining,
    debtMinor: crossTotal - remaining,
  });
  const afterCrossSale = await snapshot(ctx, cp.id, cross.id);

  // 5) IZNI QAYTARISH — ikkala chek vozvrat, so'ng qolgan avans naqd
  await refundSaleFully(ctx, cross.id, product.id);
  await refundSaleFully(ctx, spend.id, product.id);
  const beforeRefundCash = await snapshot(ctx, cp.id, null);
  if (beforeRefundCash.balanceMinor !== null && beforeRefundCash.balanceMinor < 0n) {
    await call(ctx.token, 'POST', `/cashier-sessions/${ctx.shiftId}/customer-prepay-refund`, {
      counterpartyId: cp.id,
      description: 'Q6 jonli verify — SINOV avansi qaytarildi',
    });
  }
  const afterRefund = await snapshot(ctx, cp.id, null);

  console.log(
    `  avans ${som(PREPAY_MINOR)} → sarf ${som(SPEND_MINOR)} → kesishuv cheki ${som(crossTotal)}`,
  );
  console.log(
    `  balans: ${som(before.balanceMinor)} → ${som(afterPrepay.balanceMinor)} → ${som(afterSpend.balanceMinor)} → ${som(afterRefund.balanceMinor)}`,
  );

  return planPrepayChainVerdicts({
    prepayMinor: PREPAY_MINOR,
    saleMinor: SPEND_MINOR,
    overspendRejected,
    crossDebtMinor: crossTotal - remaining,
    crossPrepayMinor: remaining,
    before,
    afterPrepay,
    afterSpend,
    spendReceiptFullyPaid,
    afterCrossSale,
    afterRefund,
  });
}

// ─────────────────────────────────────────────────────────────── MAIN ───────

async function main() {
  const acc = await prisma.account.findFirstOrThrow({ select: { id: true, name: true } });
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
    { expiresIn: '30m' },
  );

  const anyCp = await prisma.counterparty.findFirst({
    where: { accountId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  const probe = await probeDeployment(token, accountId, anyCp?.id ?? null);

  console.log('════════ Q6 JONLI VERIFY ════════');
  console.log(
    `Rejim:   ${LIVE ? '🔴 LIVE (yozadi va o`zi tozalaydi)' : 'DRY (hech nima yozilmaydi)'}`,
  );
  console.log(`API:     ${API}`);
  console.log(`Akkaunt: ${acc.name} · token: ${emp.name}`);
  console.log('\n── QAMROV (jonlida qaysi faza bor) ──');
  for (const line of planReadiness(probe)) {
    console.log(`  ${line.ready ? 'OK  ' : 'YO`Q'} ${line.phase} — ${line.detail}`);
  }

  if (!LIVE) {
    console.log(
      '\nDRY — `--live` berilmadi, hech nima yozilmadi.\n' +
        `\`--live\` yugurtirish ${isLiveVerifyPossible(probe) ? 'MUMKIN' : 'MUMKIN EMAS (yuqoridagi «YO`Q» qatorlari)'}.`,
    );
    await prisma.$disconnect();
    return;
  }

  if (!isLiveVerifyPossible(probe)) {
    throw new Error(
      'Jonli verify uchun migratsiya va kod TO`LIQ bo`lishi shart — yuqoridagi qamrov jadvaliga qarang.',
    );
  }

  const openShifts = await prisma.cashierSession.findMany({
    where: { accountId, state: 'open' },
    orderBy: { openedAt: 'desc' },
    select: { id: true, cashDeskId: true },
  });
  const shift = openShifts.find((s) => s.cashDeskId != null);
  if (!shift?.cashDeskId) throw new Error('Ochiq smena (kassali) topilmadi');
  const ctx: Ctx = {
    token,
    accountId,
    shiftId: shift.id,
    cashDeskId: shift.cashDeskId,
  };

  const verdicts: Verdict[] = [];
  if (RUN_DEBT) verdicts.push(...(await runDebtChain(ctx)));
  if (RUN_PREPAY) verdicts.push(...(await runPrepayChain(ctx)));

  console.log('\n── HUKM ──');
  for (const x of verdicts) {
    console.log(`  ${x.pass ? 'OK  ' : 'XATO'} ${x.label}`);
    console.log(`        ${x.detail}`);
  }
  const sum = summarizeVerdicts(verdicts);
  console.log(`\n${sum.passed}/${sum.total} hukm o'tdi.`);
  if (!sum.ok) console.log(`Yiqilganlar: ${sum.failedKeys.join(', ')}`);
  console.log(sum.ok ? 'Q6 JONLI VERIFY O`TDI' : 'Q6 JONLI VERIFY YIQILDI');

  await prisma.$disconnect();
  process.exit(sum.ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error('XATO:', e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});

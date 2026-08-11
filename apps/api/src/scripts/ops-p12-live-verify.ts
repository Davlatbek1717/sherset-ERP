#!/usr/bin/env tsx
/**
 * P12 JONLI VERIFY — narx POLI va 0-narx taqiqi PRODDA haqiqatan to'sadimi.
 *
 * Uch urinish, ishlab turgan API orqali (HTTP ⇒ real controller + guard + servis):
 *   1) poldan 1 tiyin PAST narx  → chek post bo'lmasligi KERAK (400);
 *   2) 0 narx                    → 400;
 *   3) polga TENG narx           → post bo'lishi kerak edi, LEKIN bu sinov
 *      pul harakatini keltirib chiqaradi, shuning uchun u YUGURTIRILMAYDI —
 *      «ruxsat» tomoni testlar bilan qoplangan (`retail-sale-price-floor.test.ts`).
 *
 * 🔴 NEGA HTTP, Nest konteksti EMAS: `createApplicationContext` prodda ikkinchi
 * jarayonda barcha `@Cron`larni ro'yxatdan o'tkazadi (ops-p1-live-verify izohi).
 *
 * 🔴 PROD EHTIYOTKORLIGI (reja §0.7): argumentsiz — **DRY** (faqat o'qiydi va
 * qaysi tovar/smena tanlanishini ko'rsatadi). `--live` da esa chek DRAFT
 * yaratiladi, post RAD ETILISHI kutiladi va draft darhol BEKOR qilinadi.
 * Post rad etilgani uchun pul/ombor QIMIRLAMAYDI — bu sinovning butun mazmuni.
 *
 * Ishga tushirish (box):
 *   cd /var/www/sherset-v2/apps/api && set -a && . ./.env && set +a && \
 *   ./node_modules/.bin/tsx src/scripts/ops-p12-live-verify.ts [--live]
 */
import { PrismaClient } from '@moysklad/db';
import { priceFloorMinor } from '@moysklad/money';
import { JwtService } from '@nestjs/jwt';
import {
  type SalePricesJson,
  resolveBasePriceMinor,
} from '../modules/retail-sale/price-snapshot.js';

const LIVE = process.argv.includes('--live');
const API = process.env.P12_API_BASE ?? 'http://localhost:4001/api/v1';

const prisma = new PrismaClient();
const som = (m: bigint | null) =>
  m == null ? 'null' : `${(m / 100n).toLocaleString('ru-RU')} so'm`;

interface CallResult {
  status: number;
  body: string;
}

async function call(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<CallResult> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.text() };
}

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
    { expiresIn: '15m' },
  );

  // Ochiq smena — chek shunga bog'lanadi.
  const session = await prisma.cashierSession.findFirst({
    where: { accountId, state: 'open' },
    orderBy: { openedAt: 'desc' },
    select: { id: true, openedAt: true },
  });
  if (!session) throw new Error('Ochiq smena topilmadi');

  // Poli ANIQ tovar: tan narx ham, chakana narx ham bor.
  const priceTypes = await prisma.priceType.findMany({
    where: { accountId, archived: false },
    orderBy: { position: 'asc' },
    select: { id: true, isDefault: true },
  });
  const defaultTypeId = priceTypes.find((t) => t.isDefault)?.id ?? priceTypes[0]?.id ?? null;

  const candidates = await prisma.product.findMany({
    where: { accountId, archived: false, kind: 'product', buyPrice: { gt: 0 } },
    take: 200,
    select: { id: true, name: true, buyPrice: true, salePrices: true },
  });
  const target = candidates
    .map((p) => ({
      ...p,
      floor: priceFloorMinor({
        costMinor: p.buyPrice,
        basePriceMinor: resolveBasePriceMinor(p.salePrices as SalePricesJson, defaultTypeId),
      }),
    }))
    .find((p) => p.floor != null && p.floor > 100n);
  if (!target?.floor) throw new Error('Poli aniq tovar topilmadi');

  console.log(`Akkaunt: ${acc.name}`);
  console.log(`Smena:   ${session.id} (${session.openedAt.toISOString()})`);
  console.log(`Tovar:   ${target.name} — pol ${som(target.floor)}`);
  if (!LIVE) {
    console.log('\nDRY — hech narsa yaratilmadi. Jonli sinov uchun: --live');
    return;
  }

  const attempts: Array<{ label: string; priceMinor: bigint }> = [
    { label: 'poldan 1 tiyin past', priceMinor: target.floor - 1n },
    { label: '0 narx', priceMinor: 0n },
  ];

  let allBlocked = true;
  for (const a of attempts) {
    const created = await call(token, 'POST', '/retail-sales', {
      sessionId: session.id,
      positions: [
        {
          productId: target.id,
          quantity: '1',
          priceMinor: a.priceMinor.toString(),
          discount: '0',
        },
      ],
    });
    if (created.status >= 400) {
      console.log(
        `\n[${a.label}] chek YARATILMADI ham: ${created.status} ${created.body.slice(0, 200)}`,
      );
      continue;
    }
    const sale = JSON.parse(created.body) as { id: string; sumMinor: string };
    const posted = await call(token, 'POST', `/retail-sales/${sale.id}/post`, {
      cashAmountMinor: sale.sumMinor,
      cardAmountMinor: '0',
      expectedSumMinor: sale.sumMinor,
    });
    const blocked = posted.status === 400;
    allBlocked = allBlocked && blocked;
    console.log(
      `\n[${a.label}] narx ${som(a.priceMinor)} → post ${posted.status} ${blocked ? '✅ RAD ETILDI' : '🔴 O‘TIB KETDI'}`,
    );
    console.log(`   ${posted.body.slice(0, 300)}`);

    // Sinov cheki qolib ketmasin. Tana `{}` — Fastify `content-type: json`
    // bilan BO'SH tanani 400 qiladi (2026-08-12 da jonli o'lchandi: bekor
    // qilish «ishlamadi» deb ko'rinardi, aslida so'rov shakli xato edi).
    const cancelled = await call(token, 'POST', `/retail-sales/${sale.id}/cancel`, {});
    console.log(`   sinov cheki bekor qilindi: ${cancelled.status}`);
  }

  console.log(`\n${allBlocked ? '✅ Ikkala urinish ham serverda to‘sildi' : '🔴 TESHIK BOR'}`);
  if (!allBlocked) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error('❌', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

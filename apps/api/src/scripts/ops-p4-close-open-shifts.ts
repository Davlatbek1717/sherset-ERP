#!/usr/bin/env tsx
/**
 * P4 — ESKI OCHIQ SMENALARNI YOPISH (2026-08-12).
 *
 * Egasi qarori (2026-08-12): «uchalasi ham hozir farqsiz yopilsin», jonli
 * sinov uchun keyin YANGI smena ochiladi.
 *
 * Prod holati (o'lchangan, shu skript boshida qayta o'lchanadi):
 *   ab76c4a2  Admin User  01-avgust  → 2 posted chek, 116 600 so'm (sinov)
 *   8f87fd5b  Kassir 1    11-avgust  → 2 sotuv + 2 qaytarish = sof 0 (P3 sinovi)
 *   fc9a42ae  Kassir 2    11-avgust  → bo'sh
 *
 * 🔴 «Farqsiz» = kassir sanog'i AYNAN kutilgan naqdga teng qilib yoziladi.
 * Bu — o'lchov EMAS, ma'muriy yopish: uch smenaning ham ichida faqat sinov
 * ma'lumoti bor va real pul sanalmagan. Shuning uchun `varianceNote` da
 * ochiq yoziladi: bu qator kelajakda «kassir sanadi» deb o'qilmasin
 * (`data-quality-flag-layer` intizomi — o'lchanmagan ≠ nol).
 *
 * Smenani FAQAT uni ochgan kassir yopa oladi (servis qulfi), shuning uchun
 * har smena O'Z kassirining tokeni bilan yopiladi.
 *
 * 🔴 DRY sukut bo'yicha — `--live` bermaguncha hech nima yozilmaydi.
 *
 * Ishga tushirish (box):
 *   cd /var/www/sherset-v2/apps/api && set -a && . ./.env && set +a && \
 *   ./node_modules/.bin/tsx src/scripts/ops-p4-close-open-shifts.ts          # DRY
 *   ./node_modules/.bin/tsx src/scripts/ops-p4-close-open-shifts.ts --live   # yozadi
 */
import { PrismaClient } from '@moysklad/db';
import { JwtService } from '@nestjs/jwt';

const API = process.env.P4_API_BASE ?? 'http://localhost:4001/api/v1';
const LIVE = process.argv.includes('--live');
const prisma = new PrismaClient();

const som = (m: bigint | string | null | undefined) =>
  m == null ? 'null' : `${(BigInt(m) / 100n).toLocaleString('ru-RU')} so'm`;

async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function tokenFor(secret: string, employeeId: string) {
  const emp = await prisma.employee.findFirstOrThrow({
    where: { id: employeeId },
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
    { expiresIn: '20m' },
  );
  return { token, emp };
}

const NOTE =
  "P4 ma'muriy yopish (2026-08-12, egasi qarori): smena ichida faqat sinov " +
  "ma'lumoti bor edi, real naqd SANALMAGAN — sanoq kutilganga teng qilib yozildi.";

async function main() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET topilmadi (apps/api/.env ni source qiling)');

  console.log(`\n— P4: eski ochiq smenalar — ${LIVE ? '🔴 LIVE' : 'DRY (yozilmaydi)'} —\n`);

  const open = await prisma.cashierSession.findMany({
    where: { state: 'open' },
    orderBy: { openedAt: 'asc' },
    select: {
      id: true,
      name: true,
      cashierId: true,
      openedAt: true,
      openingCashMinor: true,
      salesCount: true,
      salesSumMinor: true,
      cashier: { select: { name: true } },
    },
  });
  if (open.length === 0) {
    console.log('Ochiq smena yo`q — qiladigan ish yo`q.');
    return;
  }

  for (const s of open) {
    const ageH = Math.floor((Date.now() - s.openedAt.getTime()) / 3_600_000);
    console.log(
      `• ${s.name || s.id} · ${s.cashier?.name ?? '—'} · ${s.openedAt.toISOString().slice(0, 16)} ` +
        `(${ageH} soat) · sotuv ${s.salesCount} / ${som(s.salesSumMinor)}`,
    );

    // Yopilishni bloklovchi yakunlanmagan cheklar bormi (P3 `unresolved-sales`).
    const unresolved = await prisma.retailSale.count({
      where: { sessionId: s.id, state: { in: ['draft', 'picking', 'ready'] } },
    });
    if (unresolved > 0) {
      console.log(
        `  🔴 ${unresolved} ta yakunlanmagan chek — yopish bloklanadi. O'TKAZIB YUBORILDI.`,
      );
      continue;
    }

    const { token } = await tokenFor(secret, s.cashierId);
    const z = await call(token, 'GET', `/cashier-sessions/${s.id}/z-report`);
    if (z.status >= 400) {
      console.log(
        `  🔴 Z-hisobot o'qilmadi (${z.status}): ${JSON.stringify(z.body).slice(0, 200)}`,
      );
      continue;
    }
    const zr = z.body as Record<string, unknown>;
    const expected = String(zr.expectedCashMinor ?? '0');
    const expectedUsd = String(zr.expectedUsdCashMinor ?? '0');
    console.log(
      `  kutilgan naqd = ${som(expected)}${expectedUsd !== '0' ? ` · USD ${expectedUsd}` : ''}`,
    );

    if (!LIVE) {
      console.log(`  DRY: close(closingCashMinor=${expected}, farq=0) yozilardi.`);
      continue;
    }

    const res = await call(token, 'POST', `/cashier-sessions/${s.id}/close`, {
      closingCashMinor: expected,
      // Dollar oqimi bo'lgan smenada sanoq MAJBURIY — kutilganga teng yoziladi.
      ...(expectedUsd !== '0' ? { closingCashUsdMinor: expectedUsd } : {}),
      varianceNote: NOTE,
      description: NOTE,
    });
    if (res.status >= 400) {
      console.log(`  🔴 yopilmadi (${res.status}): ${JSON.stringify(res.body).slice(0, 300)}`);
      continue;
    }
    const after = await prisma.cashierSession.findUniqueOrThrow({
      where: { id: s.id },
      select: { state: true, closedAt: true, discrepancyMinor: true, acceptanceState: true },
    });
    console.log(
      `  ✅ ${after.state} · ${after.closedAt?.toISOString().slice(0, 16)} · ` +
        `farq ${som(after.discrepancyMinor)} · qabul holati «${after.acceptanceState}»`,
    );
  }

  const variances = await prisma.cashierSessionVariance.count();
  const stillOpen = await prisma.cashierSession.count({ where: { state: 'open' } });
  console.log(`\nYakun: ochiq smena ${stillOpen} · farq aktlari jami ${variances}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

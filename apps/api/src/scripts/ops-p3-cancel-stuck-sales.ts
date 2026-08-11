#!/usr/bin/env tsx
/**
 * P3 — QOTIB QOLGAN CHEKLARNI BEKOR QILISH (2026-08-12).
 *
 * ── Nega kerak ────────────────────────────────────────────────────────────
 * P3 gacha kassir chekni na to'lay, na bekor qila olardi (`retailsale.approve`
 * = NO). Natijada prodda 4 ta `picking` + 1 ta `ready` chek qolib ketgan
 * (2026-08-11 sinovlari, jami ~300 500 so'm) va ular smenani YOPISHGA yo'l
 * qo'ymaydi. Egasi qarori (2026-08-12): mavjud sinov cheklari qo'lda bekor
 * qilinadi; kelgusida kassir har chekni o'zi to'laydi yoki bekor qiladi
 * (avto-bekor YO'Q).
 *
 * ── Nima qiladi ───────────────────────────────────────────────────────────
 * `draft`/`picking`/`ready` holatidagi cheklarni HTTP orqali (`POST
 * /retail-sales/:id/cancel`) bekor qiladi — to'g'ridan-to'g'ri SQL EMAS.
 * Sabab: `cancel()` holat flipidan tashqari omborchi topshiriqlarini yopadi,
 * yig'ish rezervini bo'shatadi va audit hodisasini yozadi. SQL bilan
 * `state='cancelled'` qo'yish shu uch ishni ham o'tkazib yuborardi.
 *
 * 🔴 DRY sukut bo'yicha — `--apply` bermaguncha hech nima o'zgarmaydi.
 * Ixtiyoriy `--before=YYYY-MM-DD` — faqat o'sha sanagacha yaratilganlar
 * (ishlayotgan kassirning JORIY cheki tasodifan bekor bo'lib ketmasin).
 *
 * Ishga tushirish (box):
 *   cd /var/www/sherset-v2/apps/api && set -a && . ./.env && set +a && \
 *   ./node_modules/.bin/tsx src/scripts/ops-p3-cancel-stuck-sales.ts --before=2026-08-12
 *   ...                                                              --before=2026-08-12 --apply
 */
import { PrismaClient } from '@moysklad/db';
import { JwtService } from '@nestjs/jwt';

const API = process.env.P3_API_BASE ?? 'http://localhost:4001/api/v1';
const APPLY = process.argv.includes('--apply');
const beforeArg = process.argv.find((a) => a.startsWith('--before='))?.slice('--before='.length);
const prisma = new PrismaClient();

const som = (m: bigint) => `${(m / 100n).toLocaleString('ru-RU')} so'm`;
const OPEN_STATES = ['draft', 'picking', 'ready'];

async function main() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET topilmadi (apps/api/.env ni source qiling)');

  // Admin tokeni: bekor qilish `retailsale.approve` talab qiladi va bu
  // skript kassirning nomidan emas, OPERATOR nomidan ishlaydi.
  const admin = await prisma.employee.findFirstOrThrow({
    where: { name: 'Admin User' },
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
      sub: admin.id,
      accountId: admin.accountId,
      email: admin.email,
      name: admin.name,
      username: admin.username,
      hrRoles: admin.hrRoles,
      isChecker: admin.isChecker,
      uiMode: 'full',
      hrPermissions: [],
    },
    { expiresIn: '20m' },
  );

  const before = beforeArg ? new Date(`${beforeArg}T00:00:00Z`) : null;
  const stuck = await prisma.retailSale.findMany({
    where: {
      accountId: admin.accountId,
      deletedAt: null,
      state: { in: OPEN_STATES },
      ...(before ? { createdAt: { lt: before } } : {}),
    },
    select: {
      id: true,
      name: true,
      state: true,
      sumMinor: true,
      createdAt: true,
      session: { select: { cashier: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`P3 qotgan chek tozalash — rejim: ${APPLY ? '🔴 APPLY' : '🟢 DRY'}`);
  console.log(
    `Chegara: ${before ? `${beforeArg} dan OLDIN yaratilganlar` : 'chegara YO`Q (hammasi)'}`,
  );
  console.log(`Topildi: ${stuck.length} ta chek\n`);

  let ok = 0;
  let failed = 0;
  for (const s of stuck) {
    const who = s.session?.cashier?.name ?? '—';
    const label = `${s.name} (${s.state}, ${som(s.sumMinor)}, ${who}, ${s.createdAt.toISOString().slice(0, 10)})`;
    if (!APPLY) {
      console.log(`   [DRY] bekor qilinadi: ${label}`);
      continue;
    }
    const res = await fetch(`${API}/retail-sales/${s.id}/cancel`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
    });
    if (res.ok) {
      ok++;
      console.log(`   ✅ ${label}`);
    } else {
      failed++;
      console.log(`   🔴 ${label} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  }

  if (APPLY) console.log(`\nYakun: ${ok} bekor qilindi · ${failed} xato.`);
  else if (stuck.length > 0) console.log('\nBekor qilish uchun: --apply');

  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

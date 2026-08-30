#!/usr/bin/env tsx
/**
 * B1 — OMBOR ROLLARINI SHABLONDAN YARATISH
 * (reja: `docs/ops/2026-08-29-kecha-rejasi.md` → BLOK B → B1).
 *
 * Jonlida `warehouse_manager` ham, `storekeeper` ham YO'Q (2026-08-30 da
 * o'lchandi: 8 rol, hammasi kassir/admin/menejer turkumida). Shu sababli
 * **G2, G3, G5, G6 ning qabul mezonlari printsipial ravishda yopilmaydi** —
 * «oddiy omborchida `/omborchi/kontrol` → 403» assimetriyasini sinaydigan
 * subyekt yo'q.
 *
 * 🔴 NEGA SHABLON, qo'lda matritsa EMAS: shablonsiz yaratilgan rolning
 * matritsasi BO'SH qoladi va `uiMode` ham to'g'ri tushmaydi. Shablon esa
 * `storekeeper` dan `supply` ni ALLAQACHON olib tashlagan (G3, 2026-08-24 —
 * «ombor xodimlari kirim narxini ko'rmaydi»), ya'ni qo'lda tozalash kerak emas.
 *
 * 🔴 NEGA HTTP, SQL EMAS: reja «UI orqali, SQL YO'Q» deydi. Bu skript UI
 * bosadigan AYNAN o'sha ikki marshrutni chaqiradi — `POST /roles` va
 * `POST /roles/:id/apply-template` — ya'ni guard, DTO va servis mantig'i
 * chetlab o'tilmaydi. Baza to'g'ridan-to'g'ri O'ZGARTIRILMAYDI.
 *
 * 🟢 XAVFSIZLIK: faqat ADDITIV. Mavjud rollarga, xodimlarga va ruxsatlarga
 * TEGMAYDI. Nomi bo'yicha idempotent — rol allaqachon bo'lsa qayta
 * yaratmaydi (shablonni esa qayta qo'llash mumkin, u matritsani tiklaydi).
 *
 * 🔴 BU SKRIPT XODIM BIRIKTIRMAYDI (B2). Kimni omborchi qilish — egasining
 * qarori, va u yerda o'lchangan tuzoq bor: KASSIRNI omborchi qilib bo'lmaydi
 * (`markReady` da `assigneeId === userId` bo'lsa chek `ready` ga o'tmay
 * QOTIB QOLADI).
 *
 * Ishga tushirish (box):
 *   cd /var/www/sherset-v2/apps/api && set -a && . ./.env && set +a && \
 *   ./node_modules/.bin/tsx src/scripts/ops-b1-ombor-rollari.ts          # DRY
 *   …/ops-b1-ombor-rollari.ts --apply                                    # yozadi
 *
 * Env: `B1_API_BASE` (default `http://localhost:4001/api/v1`).
 */
import { PrismaClient } from '@moysklad/db';
import { JwtService } from '@nestjs/jwt';

const prisma = new PrismaClient();
const API_BASE = process.env.B1_API_BASE ?? 'http://localhost:4001/api/v1';
const APPLY = process.argv.includes('--apply');

/** Yaratiladigan rollar — reja B1 jadvalidagi nomlar bilan. */
const WANTED = [
  { name: 'Katta omborchi', slug: 'warehouse_manager' as const },
  { name: 'Omborchi', slug: 'storekeeper' as const },
];

/**
 * Shablon ROSTDAN qo'llanganini isbotlaydigan kesim. Rol soni emas, aynan
 * ASSIMETRIYA tekshiriladi — G2/G3 ning butun ma'nosi shunda.
 */
const EXPECTED = [
  { entity: 'retailcontrol', wm: true, sk: false },
  { entity: 'returnacceptance', wm: true, sk: false },
  { entity: 'warehousenumbering', wm: true, sk: false },
  { entity: 'storecell', wm: true, sk: true },
  { entity: 'supply', wm: true, sk: false },
];

async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const acc = await prisma.account.findFirstOrThrow({ select: { id: true, name: true } });
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET topilmadi (apps/api/.env ni source qiling)');
  const emp = await prisma.employee.findFirstOrThrow({
    where: { accountId: acc.id },
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

  console.log('════════ B1 · OMBOR ROLLARI ════════');
  console.log(`Rejim:   ${APPLY ? 'APPLY (yoziladi)' : 'DRY (hech nima yozilmaydi)'}`);
  console.log(`API:     ${API_BASE}`);
  console.log(`Akkaunt: ${acc.name} · token: ${emp.name}`);
  console.log();

  const before = await prisma.role.findMany({
    where: { accountId: acc.id },
    select: { id: true, name: true, templateSlug: true },
    orderBy: { name: 'asc' },
  });
  console.log(`── OLDIN: ${before.length} rol ──`);
  for (const r of before) console.log(`   ${r.name} | shablon=${r.templateSlug ?? '-'}`);
  console.log();

  for (const want of WANTED) {
    const existing = before.find((r) => r.name === want.name || r.templateSlug === want.slug);
    if (existing) {
      console.log(
        `SKIP «${want.name}» — allaqachon bor (${existing.id}, shablon=${existing.templateSlug ?? '-'})`,
      );
      continue;
    }
    if (!APPLY) {
      console.log(`DRY  «${want.name}» yaratilardi, so'ng «${want.slug}» shabloni qo'llanardi`);
      continue;
    }
    const created = await call(token, 'POST', '/roles', {
      name: want.name,
      description: `B1 (${new Date().toISOString().slice(0, 10)}) — «${want.slug}» shablonidan`,
      permissions: [],
    });
    console.log(`OK   «${want.name}» yaratildi: ${created.id} (version=${created.version})`);
    const applied = await call(token, 'POST', `/roles/${created.id}/apply-template`, {
      slug: want.slug,
      version: created.version,
    });
    const masked = applied?.maskedByOverride?.length ?? 0;
    console.log(`OK   shablon «${want.slug}» qo'llandi · niqoblangan override: ${masked}`);
  }

  console.log();
  console.log('── KEYIN: assimetriya kesimi ──');
  const wm = await prisma.role.findFirst({
    where: { accountId: acc.id, templateSlug: 'warehouse_manager' },
    select: { id: true, name: true },
  });
  const sk = await prisma.role.findFirst({
    where: { accountId: acc.id, templateSlug: 'storekeeper' },
    select: { id: true, name: true },
  });
  if (!wm || !sk) {
    console.log(`   (rollar hali yo'q — DRY rejimida bu KUTILGAN)`);
  } else {
    const cells = await prisma.rolePermission.findMany({
      where: {
        roleId: { in: [wm.id, sk.id] },
        entity: { in: EXPECTED.map((e) => e.entity) },
        NOT: { scope: 'NO' },
      },
      select: { roleId: true, entity: true },
    });
    const has = (roleId: string, entity: string) =>
      cells.some((c) => c.roleId === roleId && c.entity === entity);
    let bad = 0;
    for (const e of EXPECTED) {
      const gotWm = has(wm.id, e.entity);
      const gotSk = has(sk.id, e.entity);
      const ok = gotWm === e.wm && gotSk === e.sk;
      if (!ok) bad++;
      console.log(
        `   ${ok ? 'OK  ' : '🔴  '}${e.entity.padEnd(20)} katta=${gotWm ? 'ha' : "yo'q"} (kutilgan ${e.wm ? 'ha' : "yo'q"}) · oddiy=${gotSk ? 'ha' : "yo'q"} (kutilgan ${e.sk ? 'ha' : "yo'q"})`,
      );
    }
    console.log();
    console.log(bad === 0 ? '🟢 ASSIMETRIYA TO`G`RI' : `🔴 ${bad} ta band mos emas`);
  }

  console.log();
  if (!APPLY) {
    console.log('DRY — `--apply` berilmadi, hech nima yozilmadi.');
  }
  console.log('🔴 KEYINGI QADAM B2 (EGASIDA): xodim biriktirish. KASSIRNI OMBORCHI QILMANG.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

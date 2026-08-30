#!/usr/bin/env tsx
/**
 * B2 — OMBOR ROLLARINI XODIMLARGA BIRIKTIRISH
 * (reja: `docs/ops/2026-08-29-kecha-rejasi.md` → BLOK B → B2).
 *
 * Egasi 2026-08-30 da tanladi:
 *   Muxriddin → «Katta omborchi», **Kassir roli SAQLANADI** (u ba'zida kassada o'tiradi)
 *   Ilhom     → «Omborchi»,       mavjud «Administrator» roli SAQLANADI
 *
 * 🔴 NEGA QO'SHIMCHA, ALMASHTIRISH EMAS: `PUT /roles/employee/:id` —
 * REPLACE-SET (`roles.schema.ts`: «server deletes the employee's existing
 * EmployeeRole rows and recreates these»). Ya'ni faqat yangi rolni yuborish
 * eskisini JIMGINA O'CHIRARDI. Bu skript doim MAVJUD + YANGI ni yuboradi.
 *
 * ── «KASSIRNI OMBORCHI QILMANG» tuzog'i — KODDAN TEKSHIRILDI ────────────────
 * Hujjatlardagi qoida shundan kelib chiqadi: `markReady`
 * (`retail-sale.service.ts:4121`) chaqiruvchining O'ZIDA shu chek uchun
 * `picking` topshirig'i bormi deb qaraydi (`assigneeId = userId`). Bor bo'lsa
 * — «tayyor» faqat O'SHA topshiriqni yopadi va chekni `ready` ga
 * **O'TKAZMAYDI**; chek katta omborchining kontrol navbatini kutadi.
 *
 * 🟢 LEKIN `assigneeId` ROLDAN emas, `sklad_keepers` DAN keladi
 * (`retail-sale.service.ts:4080` → `keeper.employeeId`). Ya'ni ROL berish
 * o'z-o'zidan hech kimni topshiriq egasi qilmaydi. Tuzoq faqat xodim
 * `sklad_keepers` ga KIRITILGANDA otiladi.
 *
 * ⇒ Shu sababli skript har bir xodim uchun `sklad_keepers` ni O'QIYDI va
 * kassirni keeper qilib qo'yilgan bo'lsa OGOHLANTIRADI. `sklad_keepers` ni
 * O'ZGARTIRMAYDI — u M4 ning ishi (reja B2 da ataylab taqiqlangan).
 *
 * ⚠️ IKKI HALOL CHEGARA (natijani o'qiyotganda yodda tuting):
 *   1. Ilhom «Administrator» bo'lib qolgani uchun undagi «oddiy omborchida
 *      `/omborchi/kontrol` → 403» sinovi MA'NOSIZ — admin baribir ko'radi.
 *      403 assimetriyasini isbotlash uchun ADMIN BO'LMAGAN omborchi kerak.
 *   2. Muxriddin ham kassir, ham katta omborchi ⇒ o'z chekini o'zi kontrol
 *      qila oladi. Bu texnik nosozlik emas, JARAYON masalasi (o'z-o'zini
 *      tasdiqlash) — egasi bilib turib tanladi.
 *
 * Ishga tushirish (box):
 *   cd /var/www/sherset-v2/apps/api && set -a && . ./.env && set +a && \
 *   ./node_modules/.bin/tsx src/scripts/ops-b2-ombor-xodimlari.ts          # DRY
 *   …/ops-b2-ombor-xodimlari.ts --apply                                    # yozadi
 */
import { PrismaClient } from '@moysklad/db';
import { JwtService } from '@nestjs/jwt';

const prisma = new PrismaClient();
const API_BASE = process.env.B2_API_BASE ?? 'http://localhost:4001/api/v1';
const APPLY = process.argv.includes('--apply');

/** Egasi tanlagan biriktirishlar. `templateSlug` — B1 yaratgan rolning kaliti. */
const WANTED = [
  { employee: 'Muxriddin', addSlug: 'warehouse_manager' as const },
  { employee: 'Ilhom', addSlug: 'storekeeper' as const },
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
  const admin = await prisma.employee.findFirstOrThrow({
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
    { expiresIn: '30m' },
  );

  console.log('════════ B2 · OMBOR XODIMLARI ════════');
  console.log(`Rejim:   ${APPLY ? 'APPLY (yoziladi)' : 'DRY (hech nima yozilmaydi)'}`);
  console.log(`Akkaunt: ${acc.name} · token: ${admin.name}`);
  console.log();

  const keepers = await prisma.skladKeeper.findMany({
    where: { accountId: acc.id },
    select: { skladNo: true, employeeId: true, employeeName: true },
    orderBy: { skladNo: 'asc' },
  });
  console.log('── sklad_keepers (topshiriq AYNAN shu jadvaldan yo`naltiriladi) ──');
  for (const k of keepers) console.log(`   sklad ${k.skladNo} -> ${k.employeeName}`);
  console.log('   (bu skript uni O`ZGARTIRMAYDI — M4 ning ishi)');
  console.log();

  for (const want of WANTED) {
    const emp = await prisma.employee.findFirst({
      where: { accountId: acc.id, name: want.employee },
      select: { id: true, name: true },
    });
    if (!emp) {
      console.log(`🔴 «${want.employee}» topilmadi — o'tkazib yuborildi`);
      continue;
    }
    const role = await prisma.role.findFirst({
      where: { accountId: acc.id, templateSlug: want.addSlug },
      select: { id: true, name: true },
    });
    if (!role) {
      console.log(`🔴 «${want.addSlug}» shabloniga ega rol yo'q — avval B1 ni yuriting`);
      continue;
    }
    const current = await prisma.employeeRole.findMany({
      where: { employeeId: emp.id },
      select: { roleId: true, role: { select: { name: true } } },
    });
    const currentIds = current.map((c) => c.roleId);
    const currentNames = current.map((c) => c.role.name);

    console.log(`── ${emp.name} ──`);
    console.log(`   hozir:   ${currentNames.join(', ') || '(rolsiz)'}`);

    if (currentIds.includes(role.id)) {
      console.log(`   SKIP     «${role.name}» allaqachon bor`);
    } else {
      const next = [...currentIds, role.id];
      console.log(`   bo'ladi: ${[...currentNames, role.name].join(', ')}`);
      if (APPLY) {
        await call(token, 'PUT', `/roles/employee/${emp.id}`, { roleIds: next });
        console.log(`   OK       biriktirildi (${next.length} rol yuborildi — REPLACE-SET)`);
      } else {
        console.log(`   DRY      PUT /roles/employee/${emp.id} { roleIds: ${next.length} ta }`);
      }
    }

    // Tuzoq sharti: xodim keeper bo'lsa `markReady` uning uchun flip QILMAYDI.
    const asKeeper = keepers.filter((k) => k.employeeId === emp.id);
    if (asKeeper.length > 0) {
      console.log(
        `   🔴 DIQQAT: ${emp.name} sklad_keepers da (sklad ${asKeeper.map((k) => k.skladNo).join(', ')}) ` +
          `⇒ unga picking topshirig'i tushadi va uning «tayyor»i chekni ready ga O'TKAZMAYDI`,
      );
    } else {
      console.log(`   🟢 ${emp.name} sklad_keepers da YO'Q ⇒ markReady tuzog'i otilmaydi`);
    }
    console.log();
  }

  console.log('── KEYIN: xodim × rol kesimi ──');
  const rows = await prisma.employeeRole.findMany({
    where: { role: { accountId: acc.id } },
    select: { employee: { select: { name: true } }, role: { select: { name: true } } },
  });
  const byEmp = new Map<string, string[]>();
  for (const r of rows) {
    const list = byEmp.get(r.employee.name) ?? [];
    list.push(r.role.name);
    byEmp.set(r.employee.name, list);
  }
  for (const [name, roles] of [...byEmp].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`   ${name.padEnd(18)} ${roles.sort().join(' + ')}`);
  }

  console.log();
  if (!APPLY) console.log('DRY — `--apply` berilmadi, hech nima yozilmadi.');
  console.log(
    "⚠️ 403 assimetriyasi (B3) ADMIN BO'LMAGAN omborchi bilan sinaladi — Ilhom admin bo'lib qolsa u sinov o'tmaydi.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

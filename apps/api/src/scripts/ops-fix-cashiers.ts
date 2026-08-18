#!/usr/bin/env tsx
/**
 * OPS (idempotent): kassirlarni ISHLAYDIGAN holatga keltiradi — rol + smena +
 * PIN. Egasi, 2026-08-18: «kassir yaratib bo'lmayapti… qolgan kassirlarni ham
 * to'g'irla, Jahongir degan yana bitta kassir qo'sh».
 *
 * 🔴 NEGA KERAK (prodda o'lchangan): kassa xodimi ishlashi uchun UCHALA bo'g'in
 * shart, va ular ALOHIDA joylarda yoziladi:
 *   1. ROL («Kassir», uiMode=kiosk) — usiz ruxsatlar yo'q;
 *   2. SMENA biriktirmasi — `openSessionFromSmena` biriktirilmagan xodimni
 *      RAD etadi (kassir «smena ochilmadi» xatosini ko'radi);
 *   3. POS PIN (argon2 xesh + HMAC lookup, IKKALASI birga) — usiz kassaga
 *      kirib bo'lmaydi.
 *
 * 18-avgustda yaratilgan 4 xodimda UCHALASI HAM yo'q edi: nginx logida
 * `POST /hr/employees → 201` bor, `PUT /roles/employee/:id` esa BIRORTA HAM
 * yo'q (FE'dagi jim shox — `employee-card.tsx` da tuzatildi).
 *
 * XAVFSIZLIK QOIDALARI:
 *   · MAVJUD PIN HECH QACHON qayta yozilmaydi — ishlayotgan kassirni ishdan
 *     chiqarib qo'ymaslik uchun; faqat PINsiz xodimga qo'yiladi;
 *   · PIN TAKRORLANMAYDI: `posPinLookup` bazada unikal bo'lishi tekshiriladi,
 *     aks holda bitta PIN ikki xodimga tushib, kirish noaniq bo'lardi;
 *   · sukut — DRY-RUN; yozish uchun `--apply`.
 *
 * Yugurtirish (apps/api ichidan):
 *   set -a; . .env; set +a; npx tsx src/scripts/ops-fix-cashiers.ts
 *   set -a; . .env; set +a; npx tsx src/scripts/ops-fix-cashiers.ts --apply
 */
import { randomInt } from 'node:crypto';
import { PrismaClient } from '@moysklad/db';
import * as argon2 from 'argon2';
import { posPinLookupHash, resolvePosPinPepper } from '../modules/auth/pos-pin-lookup.js';
import { ROLE_TEMPLATES, resolveTemplateMatrix } from '../modules/permissions/role-templates.js';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

/** Rolsiz qolgan mavjud kassirlar (18-avgust hodisasi). */
const FIX_NAMES = ['Bahodir', 'Muxriddin', 'Sardor', 'Otabek'];
/** Yangi kassir (egasi so'radi). */
const CREATE_NAMES = ['Jahongir'];

const SCHEDULE_NAME = 'Kassa 24/7';
const SMENA_NAME = 'Kassa smenasi';

const NONE = 'YOQ';

/** Bazada band bo'lmagan 4 xonali PIN — `posPinLookup` unikal bo'lishi shart. */
async function freePin(
  pepper: string,
  taken: Set<string>,
): Promise<{ pin: string; lookup: string }> {
  for (let i = 0; i < 200; i++) {
    const pin = String(randomInt(1000, 10000));
    const lookup = posPinLookupHash(pin, pepper);
    if (taken.has(lookup)) continue;
    const clash = await prisma.employee.findFirst({
      where: { posPinLookup: lookup },
      select: { id: true },
    });
    if (clash) continue;
    taken.add(lookup);
    return { pin, lookup };
  }
  throw new Error('Bosh PIN topilmadi (200 urinish) — qolda tanlang');
}

async function main() {
  const pepper = resolvePosPinPepper(process.env.POS_PIN_PEPPER, process.env.NODE_ENV);
  const accounts = await prisma.account.findMany({ select: { id: true, name: true } });
  if (accounts.length !== 1) throw new Error(`Kutilgan 1 akkaunt, topildi ${accounts.length}`);
  const accountId = accounts[0]?.id as string;
  console.log(APPLY ? 'REJIM: APPLY (yoziladi)\n' : 'REJIM: DRY-RUN (hech nima yozilmaydi)\n');

  // ── Rol ───────────────────────────────────────────────────────────────────
  const tpl = ROLE_TEMPLATES.cashier;
  let role = await prisma.role.findFirst({
    where: { accountId, templateSlug: 'cashier' },
    select: { id: true, name: true, uiMode: true },
  });
  if (role) {
    console.log(`= rol «${role.name}» (uiMode=${role.uiMode})`);
  } else {
    const cells = resolveTemplateMatrix('cashier').filter((c) => c.scope !== 'NO');
    console.log(`+ rol «${tpl.seedName}» (${cells.length} katakcha, uiMode=${tpl.uiMode})`);
    if (APPLY) {
      role = await prisma.role.create({
        data: {
          accountId,
          name: tpl.seedName,
          description: tpl.description,
          isSystem: false,
          templateSlug: 'cashier',
          uiMode: tpl.uiMode,
          permissions: {
            createMany: {
              data: cells.map((c) => ({ entity: c.entity, action: c.action, scope: c.scope })),
              skipDuplicates: true,
            },
          },
        },
        select: { id: true, name: true, uiMode: true },
      });
    }
  }

  // ── Smena (jadval + smena) ────────────────────────────────────────────────
  let schedule = await prisma.shiftSchedule.findFirst({
    where: { accountId, name: SCHEDULE_NAME },
    select: { id: true },
  });
  if (!schedule) {
    console.log(`+ jadval «${SCHEDULE_NAME}» 00:00–23:59`);
    if (APPLY) {
      schedule = await prisma.shiftSchedule.create({
        data: { accountId, name: SCHEDULE_NAME, startTime: '00:00', endTime: '23:59' },
        select: { id: true },
      });
    }
  }
  let smena = await prisma.smena.findFirst({
    where: { accountId, name: SMENA_NAME },
    select: { id: true, name: true },
  });
  if (smena) {
    console.log(`= smena «${smena.name}»`);
  } else {
    const org = await prisma.organization.findFirst({
      where: { accountId, archived: false },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!org) throw new Error('Tashkilot topilmadi');
    console.log(`+ smena «${SMENA_NAME}»`);
    if (APPLY && schedule) {
      smena = await prisma.smena.create({
        data: { accountId, name: SMENA_NAME, scheduleId: schedule.id, organizationId: org.id },
        select: { id: true, name: true },
      });
    }
  }

  // ── Xodimlar ──────────────────────────────────────────────────────────────
  const taken = new Set<string>();
  const issued: Array<{ name: string; pin: string }> = [];

  for (const name of [...FIX_NAMES, ...CREATE_NAMES]) {
    let emp = await prisma.employee.findFirst({
      where: { accountId, name, archived: false },
      select: { id: true, name: true, posPinHash: true },
    });

    if (emp) {
      console.log(`= xodim «${name}» mavjud`);
    } else {
      console.log(`+ xodim «${name}» YARATILADI`);
      if (APPLY) {
        // `email` — sxemada MAJBURIY. Kassir pochtadan foydalanmaydi (kirish
        // PIN bilan), shuning uchun mavjud kassirlar bilan AYNI konvensiya:
        // `<ism>@sherset.local`. Band bo'lsa Prisma baland ovozda yiqiladi —
        // jimgina boshqa qiymat o'ylab topmaydi.
        const local = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
        emp = await prisma.employee.create({
          data: { accountId, name, position: 'Kassir', email: `${local}@sherset.local` },
          select: { id: true, name: true, posPinHash: true },
        });
      }
    }
    if (!APPLY || !emp) continue;

    if (role) {
      await prisma.employeeRole.upsert({
        where: { employeeId_roleId: { employeeId: emp.id, roleId: role.id } },
        create: { employeeId: emp.id, roleId: role.id },
        update: {},
      });
    }
    if (smena) {
      await prisma.smenaEmployee.upsert({
        where: { smenaId_employeeId: { smenaId: smena.id, employeeId: emp.id } },
        create: { smenaId: smena.id, employeeId: emp.id },
        update: {},
      });
    }
    // 🔴 MAVJUD PIN QAYTA YOZILMAYDI — ishlayotgan kassir ishdan chiqmasin.
    if (!emp.posPinHash) {
      const { pin, lookup } = await freePin(pepper, taken);
      await prisma.employee.update({
        where: { id: emp.id },
        data: { posPinHash: await argon2.hash(pin), posPinLookup: lookup },
      });
      issued.push({ name: emp.name, pin });
    }
  }

  // ── Natija ────────────────────────────────────────────────────────────────
  console.log('\n── NATIJA ──');
  const rows = await prisma.employee.findMany({
    where: { accountId, name: { in: [...FIX_NAMES, ...CREATE_NAMES] }, archived: false },
    select: {
      name: true,
      posPinHash: true,
      posPinLookup: true,
      roles: { select: { role: { select: { name: true, uiMode: true } } } },
      smenaAssignments: { select: { smenaId: true } },
    },
    orderBy: { name: 'asc' },
  });
  for (const r of rows) {
    const rolStr = r.roles.map((x) => `${x.role.name}/${x.role.uiMode}`).join(',') || NONE;
    const pinStr = r.posPinHash && r.posPinLookup ? 'bor' : NONE;
    console.log(
      `${r.name.padEnd(12)} rol=${rolStr.padEnd(14)} smena=${r.smenaAssignments.length} PIN=${pinStr}`,
    );
  }
  if (issued.length > 0) {
    console.log('\n── BERILGAN PIN KODLAR (kartadan almashtirsa boladi) ──');
    for (const i of issued) console.log(`  ${i.name.padEnd(12)} ${i.pin}`);
  }
}

main()
  .catch((e) => {
    console.error('XATO:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

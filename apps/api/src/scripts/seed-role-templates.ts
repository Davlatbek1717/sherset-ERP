#!/usr/bin/env tsx
/**
 * MK29 — TZ §3.4 dagi 10 rol shablonini har akkauntga seed qiladi.
 *
 * ── Nega `packages/db/prisma/seed.ts` da EMAS ──────────────────────────────
 * Matritsa manbai — `apps/api/.../role-templates.ts` registri. `seed.ts`
 * boshqa paketda va undan bu registrga import yo'q, ya'ni u yerga yozish
 * matritsani NUSXALASH bo'lardi — aynan `permissions-seed-sync.test.ts`
 * tutadigan drift bug-klassi (ikki nusxa, biri eskiradi, natijada butun
 * modul jimgina 403 beradi). Shu sababli seed shu yerda, registrdan
 * to'g'ridan-to'g'ri o'qib.
 *
 * ── Xulq ───────────────────────────────────────────────────────────────────
 * Deterministik · idempotent · qayta yugurtirsa bo'ladi.
 *   - Rol `(accountId, name)` bo'yicha topiladi/yaratiladi.
 *   - `templateSlug` + `uiMode` + `description` shablon bilan tenglashtiriladi.
 *   - Matritsa MAVJUD rolda **DEFAULT bo'yicha O'ZGARTIRILMAYDI** — admin
 *     qo'lda sozlagan rolni skript bosib ketmasin. To'liq qayta yozish uchun
 *     `--rewrite` bayrog'i (yangi yaratilgan rolga esa doim yoziladi).
 *   - Xodim override'lariga (MK26) TEGILMAYDI — QAROR-B4.3.
 *
 * Yugurtirish (apps/api ichidan):
 *   npx tsx src/scripts/seed-role-templates.ts            # DRY (hisobot)
 *   npx tsx src/scripts/seed-role-templates.ts --apply
 *   npx tsx src/scripts/seed-role-templates.ts --apply --rewrite
 *
 * Jonli serverda yugurtirilgandan keyin api jarayonini qayta ishga tushiring
 * (ruxsat cache'i 5 daqiqa TTL bilan ishlaydi).
 */
import { PrismaClient } from '@moysklad/db';
import {
  ROLE_TEMPLATES,
  ROLE_TEMPLATE_SLUGS,
  resolveTemplateMatrix,
} from '../modules/permissions/role-templates.js';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const REWRITE = process.argv.includes('--rewrite');

async function main() {
  const accounts = await prisma.account.findMany({ select: { id: true, name: true } });
  console.log(
    `${APPLY ? 'APPLY' : 'DRY'}${REWRITE ? ' + REWRITE' : ''} — ${accounts.length} akkaunt, ${ROLE_TEMPLATE_SLUGS.length} shablon\n`,
  );

  let created = 0;
  let linked = 0;
  let rewritten = 0;

  for (const account of accounts) {
    console.log(`▸ ${account.name} (${account.id})`);
    for (const slug of ROLE_TEMPLATE_SLUGS) {
      const tpl = ROLE_TEMPLATES[slug];
      const cells = resolveTemplateMatrix(slug).filter((c) => c.scope !== 'NO');

      // Avval SLUG bo'yicha, keyin nom bo'yicha qidiramiz.
      //
      // Nega slug birinchi: migratsiya `Administrator` ni `admin` slug'iga
      // backfill qiladi. Faqat nom bo'yicha qidirilsa, skript yonига YANGI
      // «Admin» rolini yaratardi va akkauntda bir xil matritsali ikki rol
      // paydo bo'lardi (lokal bazada aynan shu ko'rindi: `Administrator` +
      // `Admin`, ikkalasi ham 564 katakcha).
      const existing =
        (await prisma.role.findFirst({
          where: { accountId: account.id, templateSlug: slug },
          select: { id: true, name: true, templateSlug: true, uiMode: true },
        })) ??
        (await prisma.role.findFirst({
          where: { accountId: account.id, name: tpl.seedName },
          select: { id: true, name: true, templateSlug: true, uiMode: true },
        }));

      if (!existing) {
        console.log(`   + ${slug.padEnd(18)} «${tpl.seedName}» — ${cells.length} katakcha`);
        created++;
        if (!APPLY) continue;
        await prisma.role.create({
          data: {
            accountId: account.id,
            name: tpl.seedName,
            description: tpl.description,
            // `isSystem` FAQAT `owner`/`admin` uchun: ular strukturaviy
            // (egalik o'tkazish, o'zini adminlikdan chiqara olmaslik qulfi
            // shularga tayanadi). Qolgan 8 shablon — BOSHLANG'ICH NUQTA:
            // «Haydovchi» kerak bo'lmagan akkaunt uni o'chira olsin, nomini
            // o'zgartira olsin. Shablon aloqasi nomdan emas, `templateSlug`
            // dan kelgani uchun qayta nomlash hech nimani buzmaydi.
            isSystem: slug === 'owner' || slug === 'admin',
            templateSlug: slug,
            uiMode: tpl.uiMode,
            permissions: {
              createMany: {
                data: cells.map((c) => ({ entity: c.entity, action: c.action, scope: c.scope })),
                skipDuplicates: true,
              },
            },
          },
        });
        continue;
      }

      // Mavjud rol — faqat yorliqni tenglashtiramiz.
      if (existing.templateSlug !== slug || existing.uiMode !== tpl.uiMode) {
        console.log(
          `   ~ ${slug.padEnd(18)} yorliq: templateSlug ${existing.templateSlug ?? 'null'}→${slug} · uiMode ${existing.uiMode}→${tpl.uiMode}`,
        );
        linked++;
        if (APPLY) {
          await prisma.role.update({
            where: { id: existing.id },
            data: { templateSlug: slug, uiMode: tpl.uiMode },
          });
        }
      }

      if (REWRITE) {
        console.log(`   ! ${slug.padEnd(18)} matritsa QAYTA YOZILDI — ${cells.length} katakcha`);
        rewritten++;
        if (APPLY) {
          await prisma.$transaction([
            prisma.rolePermission.deleteMany({ where: { roleId: existing.id } }),
            prisma.rolePermission.createMany({
              data: cells.map((c) => ({
                roleId: existing.id,
                entity: c.entity,
                action: c.action,
                scope: c.scope,
              })),
              skipDuplicates: true,
            }),
          ]);
        }
      }
    }
  }

  console.log(
    `\nXULOSA: yangi rol ${created} · yorliq tenglashtirildi ${linked} · matritsa qayta yozildi ${rewritten}`,
  );
  if (!APPLY) console.log('DRY rejim — hech nima yozilmadi. Yozish uchun: --apply');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

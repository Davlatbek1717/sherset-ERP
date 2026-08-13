#!/usr/bin/env tsx
/**
 * F6 — JONLI KASSIR ROLLARIGA QAYTARISH RUXSATINI QO'SHISH (2026-08-13).
 *
 * ── Nima uchun ────────────────────────────────────────────────────────────
 * Egasi 2026-08-12 qarorini («kassadan pul chiqishi menejer qarori —
 * qaytarish kassirga berilmaydi») 2026-08-13 da BEKOR qildi: «kassir
 * istalgan chekga vozvrat qilishi kerak». `role-templates.ts` dagi cashier
 * shabloniga `salesreturn.view/create = ALL` qo'shildi — lekin shablon
 * faqat YANGI yaratiladigan rollarga ta'sir qiladi. Prod'dagi MAVJUD kassir
 * rollari shu skript bilan to'ldiriladi, aks holda kassirlar
 * `POST /retail-sales/:id/refund` da 403 olaveradi
 * (xotira: `stale-seeded-db-missing-permission-rows` klassi).
 *
 * ── Nega umumiy top-up YARAMAYDI ──────────────────────────────────────────
 * `template-topup.ts` qo'riqchisi: «rolda o'sha entity bo'yicha birorta qator
 * BO'LSA, entity butunlay chetlab o'tiladi». Kassir rolida `salesreturn`
 * odatda YO'Q — lekin kimdir qo'lda bitta qator qo'ygan bo'lsa ham skript
 * katakcha darajasida ishlayveradi (ops-p3-role-topup.ts naqshi).
 *
 * ── Xavfsizlik ────────────────────────────────────────────────────────────
 *   · DRY sukut bo'yicha — yozish uchun `--apply` kerak (operator ruxsati bilan).
 *   · IDEMPOTENT — mavjud qator TEGILMAYDI (hatto scope boshqa bo'lsa ham:
 *     admin ataylab torroq qo'ygan bo'lishi mumkin). Faqat YO'Q qator yaratiladi.
 *   · Faqat `templateSlug` bo'yicha topilgan rollar — nomi bo'yicha EMAS
 *     (rol nomi tahrirlanadigan matn, `mk29-role-template-contracts`).
 *
 * Ishga tushirish (box):
 *   cd /var/www/sherset-v2/apps/api && set -a && . ./.env && set +a && \
 *   ./node_modules/.bin/tsx src/scripts/ops-f6-salesreturn-topup.ts          # DRY
 *   ./node_modules/.bin/tsx src/scripts/ops-f6-salesreturn-topup.ts --apply  # yozadi
 */
import { PrismaClient } from '@moysklad/db';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

/** [templateSlug, entity, actions] — F6 uchun aniq katakchalar. */
const PLAN: Array<{ slug: string; entity: string; actions: string[]; why: string }> = [
  {
    slug: 'cashier',
    entity: 'salesreturn',
    actions: ['view', 'create'],
    why: 'istalgan chekka qaytarish (POST /retail-sales/:id/refund `salesreturn.create` talab qiladi)',
  },
];

async function main() {
  console.log(`F6 rol top-up — rejim: ${APPLY ? '🔴 APPLY (yozadi)' : '🟢 DRY (o‘qiydi)'}\n`);

  let created = 0;
  let skipped = 0;

  for (const item of PLAN) {
    const roles = await prisma.role.findMany({
      where: { templateSlug: item.slug },
      select: { id: true, name: true, accountId: true, templateSlug: true },
    });

    console.log(`── shablon «${item.slug}» — ${item.why}`);
    if (roles.length === 0) {
      console.log('   ⚠️  bu shablonli rol TOPILMADI — hech nima qilinmaydi\n');
      continue;
    }

    for (const role of roles) {
      const existing = await prisma.rolePermission.findMany({
        where: { roleId: role.id, entity: item.entity },
        select: { action: true, scope: true },
      });
      const have = new Map(existing.map((r) => [r.action, r.scope]));

      for (const action of item.actions) {
        const current = have.get(action);
        if (current !== undefined) {
          console.log(
            `   ⏭  «${role.name}» ${item.entity}.${action} — qator BOR (scope: ${current}), tegilmadi`,
          );
          skipped++;
          continue;
        }
        console.log(`   ➕ «${role.name}» ${item.entity}.${action} = ALL${APPLY ? '' : '  [DRY]'}`);
        created++;
        if (APPLY) {
          await prisma.rolePermission.create({
            data: { roleId: role.id, entity: item.entity, action, scope: 'ALL' },
          });
        }
      }
    }
    console.log('');
  }

  console.log(
    `Yakun: ${created} qator ${APPLY ? 'YARATILDI' : 'yaratilishi kerak (DRY)'} · ${skipped} qator tegilmadi.`,
  );
  if (!APPLY && created > 0) console.log('Yozish uchun: --apply');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

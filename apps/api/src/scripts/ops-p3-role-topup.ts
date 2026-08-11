#!/usr/bin/env tsx
/**
 * P3 — JONLI ROLLARGA CHEK-ZANJIRI RUXSATLARINI QO'SHISH (2026-08-12).
 *
 * ── Nega umumiy top-up YARAMAYDI ──────────────────────────────────────────
 * `template-topup.ts` ning qo'riqchisi: «rolda o'sha entity bo'yicha birorta
 * qator BO'LSA, entity butunlay chetlab o'tiladi» (qo'lda sozlangan matritsa
 * qayta yozilmasin). Kassir rolida `retailsale` qatorlari ALLAQACHON bor
 * (view/create/update/print) — ya'ni umumiy top-up `approve` ni HECH QACHON
 * qo'shmaydi. Shuning uchun bu yerda ANIQ katakchalar ro'yxati bor.
 *
 * ── Nima qiladi ───────────────────────────────────────────────────────────
 *   · `templateSlug='cashier'` rollariga  → retailsale.approve = ALL
 *   · `templateSlug='storekeeper'` rollariga → retailsale.{view,update,print} = ALL
 *
 * Ikkalasi ham `role-templates.ts` dagi shablon bilan MOS (shablonni o'zgartirish
 * faqat YANGI rollarga ta'sir qiladi — mavjudlari shu skript bilan tuzatiladi).
 *
 * ── Xavfsizlik ────────────────────────────────────────────────────────────
 *   · DRY sukut bo'yicha — yozish uchun `--apply` kerak (reja §0.7).
 *   · IDEMPOTENT — mavjud qator TEGILMAYDI (hatto scope boshqa bo'lsa ham:
 *     admin ataylab torroq qo'ygan bo'lishi mumkin, uni kengaytirish bu
 *     skriptning ishi emas). Faqat YO'Q qator yaratiladi.
 *   · Faqat `templateSlug` bo'yicha topilgan rollar — nomi bo'yicha EMAS
 *     (rol nomi tahrirlanadigan matn, `mk29-role-template-contracts`).
 *
 * Ishga tushirish (box):
 *   cd /var/www/sherset-v2/apps/api && set -a && . ./.env && set +a && \
 *   ./node_modules/.bin/tsx src/scripts/ops-p3-role-topup.ts          # DRY
 *   ./node_modules/.bin/tsx src/scripts/ops-p3-role-topup.ts --apply  # yozadi
 */
import { PrismaClient } from '@moysklad/db';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

/** [templateSlug, entity, actions] — P3 zanjiri uchun aniq katakchalar. */
const PLAN: Array<{ slug: string; entity: string; actions: string[]; why: string }> = [
  {
    slug: 'cashier',
    entity: 'retailsale',
    actions: ['approve'],
    why: "chekni TO'LASH va BEKOR QILISH (ikkalasi ham retailsale.approve talab qiladi)",
  },
  {
    slug: 'storekeeper',
    entity: 'retailsale',
    actions: ['view', 'update', 'print'],
    why: "yig'iladigan cheklarni ko'rish va «Tayyor» belgilash (mark-ready)",
  },
];

async function main() {
  console.log(`P3 rol top-up — rejim: ${APPLY ? '🔴 APPLY (yozadi)' : '🟢 DRY (o‘qiydi)'}\n`);

  let created = 0;
  let skipped = 0;

  for (const item of PLAN) {
    const roles = await prisma.role.findMany({
      where: { templateSlug: item.slug },
      select: { id: true, name: true, accountId: true, templateSlug: true },
    });

    console.log(`── shablon «${item.slug}» — ${item.why}`);
    if (roles.length === 0) {
      console.log('   ⚠️  bu shablonli rol TOPILMADI — hech nima qilinmaydi');
      console.log(
        "      (masalan omborchi hali yollanmagan bo'lsa normal: rol shablondan yaratilganda matritsa allaqachon to'g'ri bo'ladi)\n",
      );
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

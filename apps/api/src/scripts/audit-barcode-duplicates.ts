#!/usr/bin/env tsx
/**
 * `DB-04` / Faza Q18 — SHTRIX-KOD DUBLIKATLARI O'LCHOVI.
 *
 * ⛔ BU SKRIPT FAQAT O'QIYDI. `APPLY` rejimi YO'Q va ataylab qo'shilmagan:
 *    dublikatlarni birlashtirish siyosati (qaysi tovarda qoldirish) —
 *    foydalanuvchi qarori, kod qarori emas. `APPLY=1` bilan chaqirilsa skript
 *    darhol to'xtaydi, chunki jim e'tiborsizlik «yugurtirdim, yozdi shekilli»
 *    degan noto'g'ri xulosaga olib kelardi.
 *
 * ══ NEGA ══
 * Faza 25 (`docs/REJA-AUDIT-FIX-2026-08.md` → HISOBOT JURNALI → Faza 25, DEFER-1)
 * `products_barcodes_gin_idx` ni qo'ydi va o'lchadi: ro'yxat-so'rovida GIN
 * ishlaydi, lekin POS-skanning `LIMIT 1` yo'lida planner uni TANLAMAYDI
 * (massiv `@>` uchun default 0.005 selektivlik). Haqiqiy yechim — barcode
 * uchun teng-qidiruvli UNIQUE/normalized yo'l. Lekin unique indeksni mavjud
 * dublikatlar ustiga qo'yish **deploy'ni yiqitadi**, shuning uchun avval
 * MIQDORIY manzara kerak. Shu skript aynan o'shani beradi.
 *
 * ══ NIMA O'LCHAYDI ══
 *  · shtrix-kod saqlanadigan 4 joy: `Product.barcodes[]`, `Variant.barcode` +
 *    `Variant.barcodes[]`, `ProductPack.barcode`, `Consignment.barcodes[]`
 *  · normalizatsiya-nomzodlari: chetki/ichki probel, ko'rinmas belgilar (NBSP,
 *    zero-width), registr, GTIN yetakchi noli (UPC-12 == EAN-13), nazorat raqami
 *  · dublikat TURLARI: `self` (bitta yozuv ichida takror) · `intra-product`
 *    (bir tovarning turli yozuvlarida) · `cross-product` (TURLI tovarlarda —
 *    POS skani noaniq, unique indeksni aynan shu bloklaydi)
 *  · uch daraja: xom qiymat / normalizatsiyadan keyin / kanonizatsiyadan keyin
 *    — ya'ni «normalizatsiyaning O'ZI yangi to'qnashuv yaratadimi» degan savolga
 *    javob beradi (aynan shu savol migratsiya tartibini hal qiladi)
 *
 * Chaqirish (DRY — yagona rejim):
 *   pnpm --filter @moysklad/api exec tsx src/scripts/audit-barcode-duplicates.ts
 * Bitta akkaunt:
 *   ACCOUNT_ID=<uuid> pnpm --filter @moysklad/api exec tsx src/scripts/audit-barcode-duplicates.ts
 * Prod'da (VPS, `sherset_v2`) — `DATABASE_URL` ni prod'ga qaratib, O'QISH-ONLY:
 *   DATABASE_URL='postgresql://…/sherset_v2' pnpm --filter @moysklad/api exec tsx \
 *     src/scripts/audit-barcode-duplicates.ts
 *
 * Mantiq `barcode-audit-core.ts` da (unit-test bilan qulflangan — Proxy-qulf
 * `findMany` dan boshqa metodga murojaatni darhol qizil qiladi).
 */
import { PrismaClient } from '@moysklad/db';
import {
  BARCODE_FLAG,
  type BarcodeAuditDb,
  type BarcodeAuditReport,
  type LevelStats,
  runBarcodeAudit,
} from './barcode-audit-core.js';

const prisma = new PrismaClient();

function levelLine(title: string, s: LevelStats): string {
  return [
    `  ${title.padEnd(28)} guruh: ${String(s.groups).padStart(6)}`,
    `qator: ${String(s.rows).padStart(6)}`,
    `self: ${String(s.byScope.self).padStart(5)}`,
    `intra-product: ${String(s.byScope['intra-product']).padStart(5)}`,
    `cross-product: ${String(s.byScope['cross-product']).padStart(5)}`,
  ].join(' | ');
}

function print(report: BarcodeAuditReport, accountId?: string): void {
  console.log('');
  console.log('══ DB-04 · shtrix-kod dublikat o‘lchovi (FAQAT O‘QISH) ══');
  console.log(`qamrov: ${accountId ? `ACCOUNT_ID=${accountId}` : 'BARCHA akkauntlar'}`);
  console.log(
    `qatorlar: ${report.scannedRows} | bo'sh: ${report.blank} | ` +
      `xom noyob: ${report.distinctRawValues} | kanonik noyob: ${report.distinctCanonicalValues}`,
  );
  console.log(
    `manba: product ${report.byOwner.product} · variant ${report.byOwner.variant} · ` +
      `pack ${report.byOwner.pack} · consignment ${report.byOwner.consignment}`,
  );

  console.log('');
  console.log('— normalizatsiya-nomzodlari (bayroq bo‘yicha qator soni):');
  for (const f of Object.values(BARCODE_FLAG)) {
    const n = report.byFlag[f];
    if (n > 0) console.log(`  ${f.padEnd(14)} ${n}`);
  }
  if (Object.values(report.byFlag).every((n) => n === 0)) console.log('  (yo‘q)');

  console.log('');
  console.log('— to‘qnashuvlar (uch daraja):');
  console.log(levelLine('xom qiymat (HOZIRGI)', report.raw));
  console.log(levelLine('+ probel/registr', report.normalized));
  console.log(levelLine('+ yetakchi nol (kanonik)', report.canonical));
  console.log(
    `  normalizatsiya YARATADIGAN yangi guruh: ${report.normalizedOnlyGroups} | ` +
      `kanonizatsiya qo'shadigan: ${report.canonicalOnlyGroups}`,
  );

  console.log('');
  console.log(
    report.uniqueIndexBlockers === 0
      ? '✅ UNIQUE-BLOKER YO‘Q — kanonik darajada kross-mahsulot to‘qnashuvi 0.'
      : `🔴 UNIQUE-BLOKER: ${report.uniqueIndexBlockers} ta kross-mahsulot guruhi. ` +
          'Ular hal qilinmaguncha `@@unique` migratsiyasi deploy’da YIQILADI.',
  );

  const block = (title: string, items: readonly string[]) => {
    if (items.length === 0) return;
    console.log('');
    console.log(`— ${title}:`);
    for (const s of items) console.log(`  · ${s}`);
  };
  block('kross-mahsulot namunalari (QO‘LDA hal qilinadi)', report.samples.crossProduct);
  block('bir tovar ichidagi takror (avtomatik birlashtirish mumkin)', report.samples.intraProduct);
  block('bitta yozuv ichidagi takror (massivdan olib tashlash kifoya)', report.samples.self);
  block('faqat normalizatsiyadan KEYIN paydo bo‘ladigan to‘qnashuv', report.samples.normalizedOnly);
  block('normalizatsiya-nomzod qiymatlar', report.samples.flagged);
  console.log('');
  console.log('DIQQAT: bu DRY o‘lchov — hech narsa yozilmadi.');
}

async function main(): Promise<void> {
  if (process.env.APPLY) {
    console.error(
      [
        "⛔ Bu skriptda APPLY rejimi YO'Q — u ataylab faqat o'qiydi.",
        'Dublikatlarni birlashtirish siyosati foydalanuvchi qarori (Faza Q18 hisobotidagi',
        'variantlar) va alohida ops-sessiyada bajariladi.',
      ].join('\n'),
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  const accountId = process.env.ACCOUNT_ID || undefined;
  const sampleLimit = process.env.SAMPLES ? Number(process.env.SAMPLES) : undefined;
  // `prisma` mijozining faqat kerakli o'qish-kesimi uzatiladi (yozuv metodlari
  // tipda ko'rinmaydi — chaqiruvchi ularni tasodifan ishlatolmaydi).
  const report = await runBarcodeAudit(prisma as unknown as BarcodeAuditDb, {
    accountId,
    sampleLimit,
  });
  print(report, accountId);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

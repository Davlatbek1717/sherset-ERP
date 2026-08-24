#!/usr/bin/env tsx
/**
 * Q2 — LOKAL DEV BAZASIDA ZOND (jonli bazaga TEGMAYDI).
 *
 * NEGA KERAK: `retail-sale-debt-registry.test.ts` idempotentlikni MOCK ustida
 * tekshiradi — ya'ni u «mening mock'im shunday qiladi» deyishdan nariga
 * o'tmaydi. Haqiqiy savol boshqa: Postgres'dagi HAQIQIY unique indeks
 * (`debts_account_id_source_doc_type_source_doc_id_key`, Q1 migratsiyasi) va
 * Prisma'ning `createMany({ skipDuplicates })` tarjimasi birgalikda
 * `ON CONFLICT DO NOTHING` berarmikin — ya'ni ikkinchi yozuv XATO ham
 * bermasin, tranzaksiyani ABORT ham qilmasin.
 *
 * Bu farq muhim: `create` ning `P2002` si tutilgan taqdirda ham Postgres
 * tranzaksiyani abort holatiga o'tkazadi va chekning QOLGAN yozuvlari
 * (`25P02`) yiqilardi — muvaffaqiyatli chek 500 bo'lib qaytardi.
 *
 * Zond BITTA tranzaksiyada ishlaydi va OXIRIDA `ROLLBACK` qiladi
 * (`$transaction` ichidan `throw`) — bazada hech qanday iz qolmaydi.
 * Shuning uchun «qaytarish yo'li» (qoida 12) ham shu skriptning O'ZIDA:
 * teskarisi — rollback, qo'shimcha buyruq kerak emas.
 *
 * Yugurtirish (LOKAL dev bazada, `packages/db/.env` dagi DATABASE_URL):
 *   pnpm --filter @moysklad/api exec tsx src/scripts/q2-local-registry-probe.ts
 */
import { PrismaClient } from '@moysklad/db';
import { SALE_DEBT_SOURCE_DOC_TYPE } from '../modules/debt/sale-debt-registry.js';

const prisma = new PrismaClient();

/** Zond qatorlarini rollback qilish uchun ataylab tashlanadigan xato. */
class ProbeRollback extends Error {}

async function main() {
  const account = await prisma.account.findFirst({ select: { id: true } });
  if (!account) throw new Error('Dev bazada Account yo`q — zond yugurmaydi');
  const counterparty = await prisma.counterparty.findFirst({
    where: { accountId: account.id },
    select: { id: true },
  });
  if (!counterparty) throw new Error('Dev bazada Counterparty yo`q — zond yugurmaydi');

  const fakeSaleId = '00000000-0000-4000-8000-0000000q2q2q'.replace(/q/g, '0');
  const results: string[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      const row = {
        accountId: account.id,
        counterpartyId: counterparty.id,
        totalMinor: 300_000n,
        paidMinor: 0n,
        currency: 'UZS',
        status: 'unpaid',
        balanceAdopted: true,
        nextContactAt: new Date('2026-09-08T04:00:00.000Z'),
        sourceDocType: SALE_DEBT_SOURCE_DOC_TYPE,
        sourceDocId: fakeSaleId,
        comment: 'Q2 ZOND — rollback qilinadi',
      };

      const first = await tx.debt.createMany({
        data: [{ ...row, name: 'QRZ-9999-90001' }],
        skipDuplicates: true,
      });
      results.push(`1-yozuv count=${first.count} (kutilgan: 1)`);

      // AYNAN shu (sourceDocType, sourceDocId) — HAQIQIY unique indeks bilan.
      const second = await tx.debt.createMany({
        data: [{ ...row, name: 'QRZ-9999-90002' }],
        skipDuplicates: true,
      });
      results.push(`2-yozuv count=${second.count} (kutilgan: 0 — ON CONFLICT DO NOTHING)`);

      // 🔴 ENG MUHIM TEKSHIRUV: tranzaksiya ABORT bo'lmaganini isbotlash.
      // Agar ikkinchi yozuv xato bergan bo'lsa, bu so'rov `25P02` bilan
      // yiqilardi — ya'ni chekning qolgan yozuvlari ham yiqilardi.
      const alive = await tx.debt.count({
        where: { accountId: account.id, sourceDocId: fakeSaleId },
      });
      results.push(`tranzaksiya TIRIK, qator soni=${alive} (kutilgan: 1)`);

      // `null` lar takrorlanuvchi sanalmaydi (Q1 ning NULL semantikasi) —
      // qo'lda ochiladigan qarzlar cheklanmaganini shu yerda ham tasdiqlaymiz.
      const nulls = await tx.debt.createMany({
        data: [
          { ...row, name: 'QRZ-9999-90003', sourceDocType: null, sourceDocId: null },
          { ...row, name: 'QRZ-9999-90004', sourceDocType: null, sourceDocId: null },
        ],
        skipDuplicates: true,
      });
      results.push(`NULL,NULL ikki qator count=${nulls.count} (kutilgan: 2)`);

      // `FOR UPDATE` qulfi — Q2 ning `lockCounterpartyBalance` SQL'i AYNAN shu.
      const locked = await tx.$queryRaw<Array<{ balance_minor: bigint }>>`
        SELECT balance_minor
        FROM counterparty_balances
        WHERE account_id = ${account.id}::uuid
          AND counterparty_id = ${counterparty.id}::uuid
          AND currency = ${'UZS'}
        FOR UPDATE
      `;
      results.push(`FOR UPDATE so'rovi ishladi, qator soni=${locked.length}`);

      throw new ProbeRollback('zond tugadi — ROLLBACK');
    });
  } catch (e) {
    if (!(e instanceof ProbeRollback)) throw e;
  }

  for (const line of results) console.log(`  · ${line}`);

  // Rollback HAQIQATAN bo'lganini bazadan o'qib tasdiqlaymiz.
  const leftovers = await prisma.debt.count({ where: { sourceDocId: fakeSaleId } });
  console.log(`  · ROLLBACK'dan keyin bazada qolgan zond qatorlari=${leftovers} (kutilgan: 0)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

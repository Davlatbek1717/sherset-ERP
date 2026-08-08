#!/usr/bin/env tsx
/**
 * «OPENING SNAPSHOT» — balans jurnaliga tarixiy qoldiqni kiritish (Faza 10).
 *
 * MUAMMO: `CounterpartyBalanceEntry` jurnali Faza 9 da BO'SH boshlandi, chunki
 * unga faqat o'shandan keyingi `applyDelta` chaqiruvlari yozadi. Materiallashgan
 * `CounterpartyBalance` da esa butun tarix bor. Faza 10 to'rt o'quvchini
 * (metrics byOrg · akt-sverka · statement · recompute) jurnalga ko'chirdi —
 * backfillsiz ular noldan boshlangan qoldiqni ko'rsatardi.
 *
 * NEGA HUJJAT-REPLAY EMAS (Faza 9 hisobotidagi tahlil, qayta tasdiqlangan):
 * tarixiy hujjatlarni qayta o'qib delta yozish `DUP-02` xatarini AYNAN
 * takrorlaydi — chala hujjat-ro'yxati jimgina saldo yo'qotadi/qo'shadi, va
 * unpost qilingan / o'chirilgan hujjatlar tarixini aniq tiklab bo'lmaydi.
 *
 * TANLANGAN USUL: har mavjud `CounterpartyBalance` qatori uchun BITTA jurnal
 * qatori — `deltaMinor = balanceMinor`, `docType = 'opening'`, `docId = NULL`,
 * `organizationId = NULL`. Natijada:
 *   · `Σ(jurnal) == materiallashgan balans` KONSTRUKSIYA bo'yicha aniq;
 *   · ma'lumot yo'qolishi NOL;
 *   · tarixiy davr aktda «taqsimlanmagan boshlang'ich qoldiq» bo'lib ko'rinadi
 *     (buxgalteriyada odatiy amaliyot).
 *
 * NARXI (ochiq aytiladi): backfilldan OLDINGI hujjatlar org-kesimida
 * «taqsimlanmagan» bandiga tushadi — `opening` qatorida organizatsiya yo'q.
 * Bu ataylab: mavjud materiallashgan jadvalda ham org o'lchovi YO'Q edi
 * (aynan `DUP-15`), ya'ni org-taqsimotni o'ylab topish = ma'lumot yasash.
 * Faza 10 dan keyingi har delta esa o'z organizatsiyasi bilan yoziladi.
 *
 * IDEMPOTENT: qayta yugurtirilganda mavjud `opening` qatorlarini HISOBGA OLADI
 * va faqat farqni yozadi (ikki marta yugurtirish saldoni ikkilantirmaydi).
 *
 * Run (DRY by default — hech narsa yozmaydi):
 *   pnpm --filter @moysklad/api exec tsx src/scripts/backfill-counterparty-balance-journal.ts
 * Apply:
 *   APPLY=1 pnpm --filter @moysklad/api exec tsx src/scripts/backfill-counterparty-balance-journal.ts
 */
import { PrismaClient } from '@moysklad/db';
import { OPENING_DOC_TYPE } from '../modules/counterparty-balance/counterparty-balance-doc-types.js';

const prisma = new PrismaClient();
const APPLY = process.env.APPLY === '1';

type Key = string; // `${accountId}|${counterpartyId}|${currency}`
const key = (a: string, c: string, cur: string): Key => `${a}|${c}|${cur}`;

async function main() {
  const balances = await prisma.counterpartyBalance.findMany({
    select: { accountId: true, counterpartyId: true, currency: true, balanceMinor: true },
  });

  // Jurnalda ALLAQACHON borlar (barcha turlar, faqat `opening` emas): nishon —
  // «jurnal yig'indisi materiallashganga tenglashsin», shuning uchun Faza 9 dan
  // keyin yozilgan haqiqiy deltalar ham hisobga olinadi. Aks holda backfill
  // ularni ikki marta sanardi.
  const journalRows = await prisma.counterpartyBalanceEntry.groupBy({
    by: ['accountId', 'counterpartyId', 'currency'],
    _sum: { deltaMinor: true },
  });
  const journal = new Map<Key, bigint>();
  for (const r of journalRows) {
    journal.set(key(r.accountId, r.counterpartyId, r.currency), r._sum.deltaMinor ?? 0n);
  }

  const planned: Array<{
    accountId: string;
    counterpartyId: string;
    currency: string;
    deltaMinor: bigint;
  }> = [];
  for (const b of balances) {
    const k = key(b.accountId, b.counterpartyId, b.currency);
    const gap = b.balanceMinor - (journal.get(k) ?? 0n);
    if (gap === 0n) continue;
    planned.push({
      accountId: b.accountId,
      counterpartyId: b.counterpartyId,
      currency: b.currency,
      deltaMinor: gap,
    });
  }

  // Jurnalda bor, lekin materiallashgan jadvalda YO'Q kalitlar — bu teskari
  // drift (kesh yo'qolgan). Backfill uni tuzatmaydi (uning ishi emas), lekin
  // jim o'tib ketmaydi: `recompute` skripti aynan shuni tiklaydi.
  const orphanJournal = [...journal.keys()].filter(
    (k) => !balances.some((b) => key(b.accountId, b.counterpartyId, b.currency) === k),
  );

  console.log(`mode: ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}`);
  console.log(
    `materiallashgan qatorlar: ${balances.length} | opening yoziladi: ${planned.length} | allaqachon mos: ${balances.length - planned.length}`,
  );
  for (const p of planned.slice(0, 12)) {
    console.log(`  ${p.counterpartyId} ${p.currency}: opening ${p.deltaMinor}`);
  }
  if (orphanJournal.length) {
    console.log(
      `⚠️ jurnalda bor, keshda yo'q: ${orphanJournal.length} kalit — ularni \`recompute-counterparty-balances.ts\` tiklaydi`,
    );
  }

  if (APPLY && planned.length) {
    await prisma.counterpartyBalanceEntry.createMany({
      data: planned.map((p) => ({
        accountId: p.accountId,
        counterpartyId: p.counterpartyId,
        organizationId: null,
        currency: p.currency,
        deltaMinor: p.deltaMinor,
        docType: OPENING_DOC_TYPE,
        docId: null,
      })),
    });
    console.log(`yozildi: ${planned.length} ta 'opening' qatori`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

#!/usr/bin/env tsx
/**
 * «OPENING SNAPSHOT» — balans jurnaliga tarixiy qoldiqni kiritish
 * (Faza 10 da yozilgan · P2, 2026-08-12 da manifest/rollback bilan qayta jihozlandi).
 *
 * MUAMMO: `CounterpartyBalanceEntry` jurnali Faza 9 da BO'SH boshlandi, chunki
 * unga faqat o'shandan keyingi `applyDelta` chaqiruvlari yozadi. Materiallashgan
 * `CounterpartyBalance` da esa butun tarix bor. Faza 10 to'rt o'quvchini
 * (metrics byOrg · akt-sverka · statement · recompute) jurnalga ko'chirdi —
 * backfillsiz ular noldan boshlangan qoldiqni ko'rsatardi. P2 esa mijoz
 * kartasidagi TARIXNI shu jurnaldan chizadi: backfillsiz kassir katta qarzni
 * ko'radi-yu, uning kelib chiqishini ko'rsatadigan birorta qator yo'q.
 *
 * NEGA HUJJAT-REPLAY EMAS (Faza 9 hisobotidagi tahlil, qayta tasdiqlangan):
 * tarixiy hujjatlarni qayta o'qib delta yozish `DUP-02` xatarini AYNAN
 * takrorlaydi — chala hujjat-ro'yxati jimgina saldo yo'qotadi/qo'shadi, va
 * unpost qilingan / o'chirilgan hujjatlar tarixini aniq tiklab bo'lmaydi.
 *
 * TANLANGAN USUL: har mavjud `CounterpartyBalance` qatori uchun BITTA jurnal
 * qatori — `deltaMinor = farq`, `docType = 'opening'`, `docId = NULL`,
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
 *
 * IDEMPOTENT: qaror `opening-backfill-plan.ts` da (sof, testlangan) — FARQ
 * bo'yicha ishlaydi, JAMI bo'yicha emas, ya'ni ikki marta yugurtirish saldoni
 * ikkilantirmaydi (`cell-migration-delta-not-total` xotirasi).
 *
 * ── ROLLBACK (P2, majburiy yo'l) ────────────────────────────────────────────
 * APPLY rejimi MANIFEST yozadi: qaysi kalitga qancha delta, va yozuv OYNASI
 * (`startedAt`/`finishedAt`). Qaytarish — o'sha oynadagi `opening` qatorlarini
 * o'chirish (skript oxirida aynan shu SQL bosib chiqariladi):
 *
 *   DELETE FROM counterparty_balance_entries
 *   WHERE doc_type = 'opening'
 *     AND created_at >= '<startedAt>' AND created_at <= '<finishedAt>';
 *
 * O'chirgandan keyin skriptni qayta yugurtirish holatni AYNAN tiklaydi (reja
 * farq bo'yicha hisoblanadi). Materiallashgan `CounterpartyBalance` ga bu
 * skript UMUMAN TEGMAYDI — ya'ni eng yomon holatda ham «tarix ko'rinmaydi»,
 * «qoldiq buzildi» EMAS.
 *
 * Run (DRY by default — hech narsa yozmaydi):
 *   pnpm --filter @moysklad/api exec tsx src/scripts/backfill-counterparty-balance-journal.ts
 * Apply:
 *   APPLY=1 pnpm --filter @moysklad/api exec tsx src/scripts/backfill-counterparty-balance-journal.ts
 * Manifest yo'li (ixtiyoriy):
 *   MANIFEST=/tmp/opening-backfill.json APPLY=1 …
 */
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@moysklad/db';
import { OPENING_DOC_TYPE } from '../modules/counterparty-balance/counterparty-balance-doc-types.js';
import { balanceKey, planOpeningBackfill } from './opening-backfill-plan.js';

const prisma = new PrismaClient();
const APPLY = process.env.APPLY === '1';

async function main() {
  const startedAt = new Date();

  const [balances, journalRows] = await Promise.all([
    prisma.counterpartyBalance.findMany({
      select: { accountId: true, counterpartyId: true, currency: true, balanceMinor: true },
    }),
    // Jurnalda ALLAQACHON borlar (barcha turlar, faqat `opening` emas): nishon —
    // «jurnal yig'indisi materiallashganga tenglashsin», shuning uchun Faza 9 dan
    // keyin yozilgan haqiqiy deltalar ham hisobga olinadi.
    prisma.counterpartyBalanceEntry.groupBy({
      by: ['accountId', 'counterpartyId', 'currency'],
      _sum: { deltaMinor: true },
    }),
  ]);

  const plan = planOpeningBackfill(
    balances,
    journalRows.map((r) => ({
      accountId: r.accountId,
      counterpartyId: r.counterpartyId,
      currency: r.currency,
      sumMinor: r._sum.deltaMinor ?? 0n,
    })),
  );

  console.log(`mode: ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}`);
  console.log(
    `materiallashgan qatorlar: ${balances.length} | opening yoziladi: ${plan.entries.length} | allaqachon mos: ${plan.matchedCount} | Σdelta: ${plan.totalDeltaMinor}`,
  );
  for (const p of plan.entries.slice(0, 12)) {
    console.log(`  ${p.counterpartyId} ${p.currency}: opening ${p.deltaMinor}`);
  }
  if (plan.orphanJournalKeys.length) {
    console.log(
      `⚠️ jurnalda bor, keshda yo'q: ${plan.orphanJournalKeys.length} kalit — ularni \`recompute-counterparty-balances.ts\` tiklaydi`,
    );
  }

  const manifestPath = process.env.MANIFEST ?? `opening-backfill-${startedAt.getTime()}.json`;

  if (APPLY && plan.entries.length) {
    await prisma.counterpartyBalanceEntry.createMany({
      data: plan.entries.map((p) => ({
        accountId: p.accountId,
        counterpartyId: p.counterpartyId,
        organizationId: null,
        currency: p.currency,
        deltaMinor: p.deltaMinor,
        docType: OPENING_DOC_TYPE,
        docId: null,
      })),
    });
    console.log(`yozildi: ${plan.entries.length} ta 'opening' qatori`);
  }

  const finishedAt = new Date();

  // MANIFEST — DRY'da ham yoziladi: «nima yozilardi» hujjati o'zi qimmatli.
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        mode: APPLY ? 'APPLY' : 'DRY',
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        materializedRows: balances.length,
        plannedRows: plan.entries.length,
        matchedRows: plan.matchedCount,
        totalDeltaMinor: plan.totalDeltaMinor.toString(),
        orphanJournalKeys: plan.orphanJournalKeys,
        entries: plan.entries.map((e) => ({
          key: balanceKey(e),
          deltaMinor: e.deltaMinor.toString(),
        })),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`manifest: ${manifestPath}`);

  // ── POST-VERIFY: invariant HAQIQATDAN ham o'rnatildimi ────────────────────
  // «Yozdim» degan xabar dalil emas — qayta o'qib solishtiramiz.
  if (APPLY) {
    const after = await prisma.counterpartyBalanceEntry.groupBy({
      by: ['accountId', 'counterpartyId', 'currency'],
      _sum: { deltaMinor: true },
    });
    const sums = new Map(after.map((r) => [balanceKey(r), r._sum.deltaMinor ?? 0n]));
    const mismatched = balances.filter((b) => (sums.get(balanceKey(b)) ?? 0n) !== b.balanceMinor);
    if (mismatched.length) {
      console.log(
        `🔴 INVARIANT BUZILDI: ${mismatched.length} kalitda Σ(jurnal) ≠ balans — ROLLBACK qiling (pastdagi SQL)`,
      );
    } else {
      console.log(
        `✅ invariant: Σ(jurnal) == balans — ${balances.length}/${balances.length} kalit`,
      );
    }
    console.log(
      `rollback: DELETE FROM counterparty_balance_entries WHERE doc_type = 'opening' AND created_at >= '${startedAt.toISOString()}' AND created_at <= '${finishedAt.toISOString()}';`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

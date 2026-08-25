#!/usr/bin/env tsx
/**
 * Q5 — BACKFILL'NI QAYTARISH (teskari skript, qoida 12).
 *
 * Reja: `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md` §Q5 vazifa 3.
 * Qoida manbasi: `docs/plans/2026-08-23-ombor-restrukturizatsiya.md` §2 band 12
 * («jonli ma'lumotni o'zgartiradigan har skript bilan birga uning TESKARISI
 * O'SHA sessiyada yoziladi, lokal bazada sinaladi va hisobotda buyrug'i bilan
 * ko'rsatiladi»). Sabab — IS-4: 2026-08-24 hodisasida qaytarish skripti savdo
 * shiddatida, 06:45 da shoshilinch yozilgan edi.
 *
 * ── Nima qiladi ───────────────────────────────────────────────────────────
 * AYNAN `ops-q5-backfill-sale-debts.ts` ochgan qatorlarni topadi va
 * **jismonan o'chiradi** (`debt_notes` → `debts`).
 *
 * Manzil: `Debt.sourceDocType = 'retailsale'` VA unga tegishli
 * `DebtNote` matni `[Q5-BACKFILL run=<RUN>]` bilan boshlanadi.
 * Ya'ni:
 *   · Q2 ning JONLI yozuvchisi ochgan qatorlar TEGILMAYDI (ularda bu belgi
 *     yo'q — izohi Q1 sof modulining `noteText` i);
 *   · qo'lda ochilgan `QRZ-` qarzlar TEGILMAYDI (`sourceDocType` NULL);
 *   · boshqa yugurishning (`RUN=`) qatorlari TEGILMAYDI.
 *
 * ── 🔴 IKKI QOIDA ─────────────────────────────────────────────────────────
 * **1. `deletedAt` EMAS, DELETE.** Soft-delete qator
 * `@@unique([accountId, sourceDocType, sourceDocId])` indeksini BAND qilib
 * turardi va o'sha chek uchun qator boshqa hech qachon ochilmasdi — na
 * backfill qayta yugurganda, na chek tahrirlanganda (Q3). Sinov izi butunlay
 * ketishi kerak (Q2 hisobotidagi `DELETE` retseptining aynan sababi).
 *
 * **2. BALANSGA `−total` YOZILMAYDI.** Qator `balanceAdopted = true` —
 * ochilganda balansga hech narsa qo'shilmagan, demak o'chirilganda ham
 * ayirilmaydi (`Debt` sxemasidagi «SIMMETRIYA MAJBURIY» izohi). `applyDelta`
 * bu fayldan CHAQIRILMAYDI.
 *
 * ── Nima O'CHIRILMAYDI ────────────────────────────────────────────────────
 * **To'lov tushib ulgurgan qator** (`paidMinor > 0` yoki `DebtPayment` qatori
 * bor). Uni o'chirish mijozning HAQIQIY to'lovini yo'q qilardi. Bunday
 * qatorlar ro'yxatga chiqadi va qo'lda hal qilinadi (reja §Q5 vazifa 3).
 *
 * ── Yuritish ──────────────────────────────────────────────────────────────
 *   # Ro'yxatni ko'rish (hech narsa o'chirmaydi)
 *   RUN=2026-08-26-01 pnpm --filter @moysklad/api exec \
 *     tsx src/scripts/ops-q5-backfill-rollback.ts
 *
 *   # O'chirish
 *   APPLY=1 RUN=2026-08-26-01 pnpm --filter @moysklad/api exec \
 *     tsx src/scripts/ops-q5-backfill-rollback.ts
 *
 *   # Barcha yugurishlar (RUN berilmasa) — ATAYLAB alohida bayroq talab qiladi
 *   APPLY=1 ALL_RUNS=1 …
 */
import { PrismaClient } from '@moysklad/db';
import { SALE_DEBT_SOURCE_DOC_TYPE } from '../modules/debt/sale-debt-registry.js';
import { Q5_BACKFILL_MARKER, q5BackfillMarker } from './q5-backfill-plan.js';

const prisma = new PrismaClient();

const APPLY = process.env.APPLY === '1';
const RUN_ID = process.env.RUN || undefined;
const ALL_RUNS = process.env.ALL_RUNS === '1';
const ONLY_CP = process.env.ONLY_CP || undefined;

function som(minor: bigint): string {
  return `${(minor / 100n).toLocaleString('ru-RU')} so'm`;
}

async function main() {
  console.log('═'.repeat(78));
  console.log("Q5 — backfill'ni QAYTARISH (teskari skript)");
  console.log(
    `rejim: ${APPLY ? "🔴 APPLY (O'CHIRADI)" : '🟢 DRY-RUN (faqat ro`yxat)'}` +
      ` | ${RUN_ID ? `RUN=${RUN_ID}` : ALL_RUNS ? 'BARCHA yugurishlar' : '(RUN berilmagan)'}` +
      (ONLY_CP ? ` | ONLY_CP=${ONLY_CP}` : ''),
  );
  console.log('═'.repeat(78));

  if (!RUN_ID && !ALL_RUNS) {
    // Ataylab: `RUN` siz butun backfill'ni o'chirish JUDA oson bo'lmasligi
    // kerak. Bir kunda ikki yugurish bo'lgan bo'lsa, ikkalasini birga
    // o'chirish ONGLI qaror bo'lsin.
    throw new Error(
      [
        'RUN=<yorliq> ko`rsatilmadi.',
        'Bitta yugurishni qaytarish uchun: RUN=2026-08-26-01',
        'BARCHA Q5 backfill qatorlarini qaytarish uchun (ehtiyot bo`ling): ALL_RUNS=1',
      ].join('\n'),
    );
  }

  // Belgi — izoh matnining BOSHIDA. `startsWith` bo'yicha qidiramiz, ya'ni
  // izoh matni o'zgartirilgan (odam qo'shimcha yozgan) qator ham topiladi,
  // lekin belgisi YO'Q qator hech qachon topilmaydi.
  const marker = RUN_ID ? q5BackfillMarker(RUN_ID) : Q5_BACKFILL_MARKER;

  const notes = await prisma.debtNote.findMany({
    where: {
      kind: 'debt_issue',
      text: { startsWith: marker },
      debt: {
        sourceDocType: SALE_DEBT_SOURCE_DOC_TYPE,
        ...(ONLY_CP ? { counterpartyId: ONLY_CP } : {}),
      },
    },
    select: {
      id: true,
      debtId: true,
      debt: {
        select: {
          id: true,
          accountId: true,
          name: true,
          counterpartyId: true,
          totalMinor: true,
          paidMinor: true,
          status: true,
          sourceDocId: true,
          deletedAt: true,
          counterparty: { select: { name: true } },
          _count: { select: { payments: true } },
        },
      },
    },
  });

  if (notes.length === 0) {
    console.log('Bu belgiga mos qator topilmadi — qiladigan ish yo`q.');
    return;
  }

  // Bitta qarzda bir nechta izoh bo'lishi mumkin (Q3 harakati ham
  // `debt_issue` yozadi) — qarz kesimida yagona qilamiz.
  const byDebt = new Map<string, (typeof notes)[number]['debt']>();
  for (const n of notes) byDebt.set(n.debtId, n.debt);

  const removable: Array<(typeof notes)[number]['debt']> = [];
  const kept: Array<{ debt: (typeof notes)[number]['debt']; why: string }> = [];

  for (const d of byDebt.values()) {
    if (d.paidMinor > 0n) {
      kept.push({ debt: d, why: `to'lov tushgan (paidMinor = ${som(d.paidMinor)})` });
      continue;
    }
    if (d._count.payments > 0) {
      kept.push({ debt: d, why: `${d._count.payments} ta DebtPayment qatori bor` });
      continue;
    }
    if (d.status === 'paid') {
      kept.push({ debt: d, why: 'qator YOPILGAN (status=paid)' });
      continue;
    }
    removable.push(d);
  }

  const sumRemovable = removable.reduce((s, d) => s + d.totalMinor, 0n);

  console.log('\n── TOPILDI ────────────────────────────────────────────────────');
  console.log(`backfill qatori (jami)   : ${byDebt.size}`);
  console.log(`o'chiriladi              : ${removable.length}  (Σ ${som(sumRemovable)})`);
  console.log(`SAQLANADI (to'lov bor)   : ${kept.length}`);

  if (removable.length > 0) {
    console.log('\n── O`CHIRILADI ───────────────────────────────────────────────');
    for (const d of removable) {
      console.log(
        `  · ${d.name}  ${d.counterparty.name}  ${som(d.totalMinor)}` +
          `  (chek: ${d.sourceDocId?.slice(0, 8) ?? '—'}…)`,
      );
    }
  }
  if (kept.length > 0) {
    console.log('\n── 🔴 SAQLANADI — QO`LDA HAL QILINADI ────────────────────────');
    for (const k of kept) {
      console.log(`  · ${k.debt.name}  ${k.debt.counterparty.name}: ${k.why}`);
    }
    console.log(
      '  Bu qatorlarni o`chirish mijozning HAQIQIY to`lovini yo`q qilardi.\n' +
        '  Ular reyestrda qoladi; kerak bo`lsa menejer ekrandan yopadi.',
    );
  }

  if (!APPLY) {
    console.log('\n🟢 DRY-RUN tugadi — bazaga HECH NARSA yozilmadi.');
    console.log('   O`chirish uchun: APPLY=1 …');
    return;
  }
  if (removable.length === 0) {
    console.log('\nO`chiriladigan qator yo`q.');
    return;
  }

  console.log('\n🔴 APPLY — o`chirilmoqda…');
  const ids = removable.map((d) => d.id);
  let deletedNotes = 0;
  let deletedDebts = 0;

  await prisma.$transaction(async (tx) => {
    // Tartib MAJBURIY: izohlar avval (FK `debt_notes.debt_id → debts.id`).
    const n = await tx.debtNote.deleteMany({ where: { debtId: { in: ids } } });
    deletedNotes = n.count;
    // 🔴 `deleteMany`, `update({deletedAt})` EMAS — sarlavhadagi 1-qoida.
    // 🔴 `applyDelta` CHAQIRILMAYDI — sarlavhadagi 2-qoida (balanceAdopted).
    const d = await tx.debt.deleteMany({ where: { id: { in: ids } } });
    deletedDebts = d.count;
  });

  console.log(`\n✅ O'chirildi: ${deletedDebts} qarz qatori, ${deletedNotes} izoh.`);
  console.log('   Kontragent BALANSLARI o`zgarmadi (balanceAdopted simmetriyasi).');
  console.log(
    '   Tekshirish: APPLY siz `recompute-counterparty-balances.ts` — `changed: 0` bo`lishi SHART.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

#!/usr/bin/env tsx
/**
 * PUL DAFTARI BACKFILL — tarixiy hujjatlarni `MoneyOperation` ga kiritish
 * (P14/`H4`, 2026-08-12).
 *
 * ## Nima uchun
 *
 * `MoneyOperation` daftariga olti yozuvchi bor, lekin `payment_in` ·
 * `payment_out` · `debtpayment` faqat **2026-08-08 (Faza 11)** dan boshlab
 * yozadi. Undan oldingi hujjatlar daftarda YO'Q ⇒ `/money` lentasi ularni
 * ko'rsatmaydi (`money-ledger-writers-faza11` xotirasi). `cash_in`/`cash_out`
 * ham qamrovga kiritilgan — ular ilgaridan yozardi, shuning uchun ularda reja
 * odatda BO'SH chiqadi; bo'sh chiqmasa — bu O'ZI topilma.
 *
 * Qamrovda ATAYLAB YO'Q: `drawer_cash_in|out` (alohida skript —
 * `ops-backfill-drawer-money.ts`) va `retailsale` (tender qatorlaridan
 * yig'iladi, qayta qurish pul mantiqining ikkinchi nusxasi bo'lardi).
 * Sabablari `money-backfill-plan.ts` da to'liq yozilgan.
 *
 * ## Xavfsizlik shartnomasi
 *
 * - **DRY sukut bo'yicha.** `--live` bo'lmasa BIRORTA yozuv qilinmaydi.
 * - 🔴 **FAQAT `money_operations` ga INSERT.** `CashDesk.balanceMinor` va
 *   `OrganizationAccount.balanceMinor` ustunlariga UMUMAN tegilmaydi. Sabab
 *   `money-backfill-plan.ts` da yozilgan: `cash_in`/`cash_out`/`retailsale`
 *   qoldiqni o'z vaqtida allaqachon siljitgan bo'lishi mumkin, ya'ni ko'r-ko'rona
 *   qo'shish ikki-karra hisob bo'lardi. Kutilayotgan siljish SON bo'lib
 *   chiqariladi — egasining alohida qarori uchun o'lchov.
 *   Eng yomon oqibat: «tarix ko'rinmaydi», «qoldiq buzildi» EMAS (P2 sabog'i).
 * - **FARQ asosida** — mavjud qator qayta yozilmaydi, ikkinchi yugurtirish
 *   0 ta o'zgarish qiladi.
 * - **Manifest** DRY'da ham yoziladi (`MANIFEST=/yo'l/fayl.json`).
 * - **Rollback SQL** har yugurtirishning `runId` muhri bo'yicha chiqariladi.
 *
 * ## Ishga tushirish
 *
 *   cd apps/api && npx tsx src/scripts/ops-backfill-money-ledger.ts                  # DRY
 *   MANIFEST=/root/p14-money-DRY.json npx tsx src/scripts/ops-backfill-money-ledger.ts
 *   ... --live                                                                        # yozadi
 *
 * 🔴 Prodda `--live` dan OLDIN majburiy: `pg_dump` backup + DRY natijasini
 * egaga ko'rsatish va uning ruxsati.
 */
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@moysklad/db';
import {
  MONEY_BACKFILL_KINDS,
  type MoneyBackfillDoc,
  backfillDescription,
  journalKey,
  planMoneyBackfill,
  rollbackSql,
} from './money-backfill-plan.js';

const LIVE = process.argv.includes('--live');
const MANIFEST = process.env.MANIFEST ?? '';
const RUN_ID = process.env.RUN_ID ?? randomUUID().slice(0, 8);

const prisma = new PrismaClient();

const POSTED = { state: 'posted', deletedAt: null } as const;

const som = (m: bigint) => `${(m / 100n).toLocaleString('ru-RU')} so'm`;

/** Hujjat oni — `postedAt` bo'lsa u, aks holda `moment` (qoida 2). */
const momentOf = (d: { postedAt: Date | null; moment: Date }) => d.postedAt ?? d.moment;

/**
 * Hujjatlarni O'QIYDI (hech narsa yozmaydi). Har manba o'z valyutasi bilan
 * birga olinadi — valyuta mosligini reja tekshiradi.
 */
async function collect(): Promise<MoneyBackfillDoc[]> {
  const out: MoneyBackfillDoc[] = [];

  const cashDeskSel = { select: { id: true, currency: true } };

  // --- cash_in / cash_out: kassa hujjatlari -------------------------------
  const cashIns = await prisma.cashIn.findMany({
    where: POSTED,
    select: {
      id: true,
      accountId: true,
      name: true,
      sumMinor: true,
      currency: true,
      agentId: true,
      postedAt: true,
      moment: true,
      cashDeskId: true,
      cashDesk: cashDeskSel,
    },
  });
  for (const d of cashIns) {
    out.push({
      documentKind: 'cash_in',
      documentId: d.id,
      accountId: d.accountId,
      name: d.name,
      sourceKind: 'cash_desk',
      sourceId: d.cashDeskId,
      sourceCurrency: d.cashDesk?.currency ?? null,
      currency: d.currency,
      deltaMinor: d.sumMinor,
      counterpartyId: d.agentId,
      at: momentOf(d),
    });
  }

  const cashOuts = await prisma.cashOut.findMany({
    where: POSTED,
    select: {
      id: true,
      accountId: true,
      name: true,
      sumMinor: true,
      currency: true,
      agentId: true,
      postedAt: true,
      moment: true,
      cashDeskId: true,
      cashDesk: cashDeskSel,
    },
  });
  for (const d of cashOuts) {
    out.push({
      documentKind: 'cash_out',
      documentId: d.id,
      accountId: d.accountId,
      name: d.name,
      sourceKind: 'cash_desk',
      sourceId: d.cashDeskId,
      sourceCurrency: d.cashDesk?.currency ?? null,
      currency: d.currency,
      deltaMinor: -d.sumMinor,
      counterpartyId: d.agentId,
      at: momentOf(d),
    });
  }

  // --- payment_in / payment_out: bank hujjatlari --------------------------
  const orgAccSel = { select: { id: true, currency: true } };

  const payIns = await prisma.paymentIn.findMany({
    where: POSTED,
    select: {
      id: true,
      accountId: true,
      name: true,
      sumMinor: true,
      currency: true,
      agentId: true,
      postedAt: true,
      moment: true,
      organizationAccountId: true,
      organizationAccount: orgAccSel,
    },
  });
  for (const d of payIns) {
    out.push({
      documentKind: 'payment_in',
      documentId: d.id,
      accountId: d.accountId,
      name: d.name,
      sourceKind: 'organization_account',
      sourceId: d.organizationAccountId,
      sourceCurrency: d.organizationAccount?.currency ?? null,
      currency: d.currency,
      deltaMinor: d.sumMinor,
      counterpartyId: d.agentId,
      at: momentOf(d),
    });
  }

  const payOuts = await prisma.paymentOut.findMany({
    where: POSTED,
    select: {
      id: true,
      accountId: true,
      name: true,
      sumMinor: true,
      currency: true,
      agentId: true,
      postedAt: true,
      moment: true,
      organizationAccountId: true,
      organizationAccount: orgAccSel,
    },
  });
  for (const d of payOuts) {
    out.push({
      documentKind: 'payment_out',
      documentId: d.id,
      accountId: d.accountId,
      name: d.name,
      sourceKind: 'organization_account',
      sourceId: d.organizationAccountId,
      sourceCurrency: d.organizationAccount?.currency ?? null,
      currency: d.currency,
      deltaMinor: -d.sumMinor,
      counterpartyId: d.agentId,
      at: momentOf(d),
    });
  }

  // --- debtpayment: naqd qarz to'lovi -------------------------------------
  // 🔴 Predikat jonli kod bilan bir xil bo'lishi SHART: yashiqqa FAQAT naqd va
  // kassa ko'rsatilgan to'lov tushadi (`debt/debt-cash-ledger.ts`). Storno
  // qilinganlari (`reversedAt`) daftarga umuman kirmaydi.
  const debtPayments = await prisma.debtPayment.findMany({
    where: { method: 'cash', cashDeskId: { not: null }, reversedAt: null },
    select: {
      id: true,
      accountId: true,
      amountMinor: true,
      createdAt: true,
      cashDeskId: true,
      cashDesk: cashDeskSel,
      debt: { select: { name: true, counterpartyId: true, currency: true } },
    },
  });
  for (const d of debtPayments) {
    out.push({
      documentKind: 'debtpayment',
      documentId: d.id,
      accountId: d.accountId,
      name: d.debt?.name ?? d.id,
      sourceKind: 'cash_desk',
      sourceId: d.cashDeskId,
      sourceCurrency: d.cashDesk?.currency ?? null,
      currency: d.debt?.currency ?? d.cashDesk?.currency ?? '???',
      deltaMinor: d.amountMinor,
      counterpartyId: d.debt?.counterpartyId ?? null,
      at: d.createdAt,
    });
  }

  return out;
}

/**
 * Daftarda ALLAQACHON bor kalitlar. `documentId` bo'yicha emas, TUR + ID
 * juftligi bo'yicha — bitta hujjat id'si turli turlarda uchrashi mumkin.
 *
 * ⚠️ `debtpayment` qatorlari jonli kodda `batchId` bilan ham yozilishi mumkin
 * (POS yo'li bitta jismoniy to'lovni FIFO bo'yicha N qarzga bo'ladi). Shuning
 * uchun mavjud kalitlar to'plamiga daftardagi BARCHA `documentId` lar
 * kiritiladi — batch id ham, to'lov id'si ham. Aks holda POS to'lovi
 * «daftarda yo'q» deb ko'rinib, ikkinchi marta yozilardi.
 */
async function loadExistingKeys(): Promise<Set<string>> {
  const rows = await prisma.moneyOperation.findMany({
    select: { documentKind: true, documentId: true },
  });
  const keys = new Set<string>();
  for (const r of rows) keys.add(journalKey(r.documentKind, r.documentId));
  return keys;
}

/**
 * POS qarz-to'lovi batch'i: daftarda `batchId` bilan yozilgan qatorni o'sha
 * batch'ning HAR to'lovi uchun «bor» deb sanaydi — aks holda backfill bitta
 * pulni ikki marta yozardi.
 */
async function addBatchCoveredDebtPayments(keys: Set<string>): Promise<number> {
  const batched = await prisma.debtPayment.findMany({
    where: { batchId: { not: null } },
    select: { id: true, batchId: true },
  });
  let covered = 0;
  for (const p of batched) {
    if (p.batchId && keys.has(journalKey('debtpayment', p.batchId))) {
      keys.add(journalKey('debtpayment', p.id));
      covered++;
    }
  }
  return covered;
}

async function main() {
  console.log(LIVE ? '=== LIVE (yoziladi) ===' : '=== DRY (hech narsa yozilmaydi) ===');
  console.log(`runId = ${RUN_ID}`);

  const docs = await collect();
  const keys = await loadExistingKeys();
  const batchCovered = await addBatchCoveredDebtPayments(keys);

  console.log(`\nO'qilgan hujjat: ${docs.length} ta · daftarda mavjud kalit: ${keys.size} ta`);
  if (batchCovered > 0) {
    console.log(`  (shundan ${batchCovered} ta qarz-to'lovi batch qatori bilan qoplangan)`);
  }

  const plan = planMoneyBackfill(docs, keys);

  console.log("\n-- REJA (tur bo'yicha) --");
  for (const kind of MONEY_BACKFILL_KINDS) {
    console.log(`  ${kind.padEnd(14)} ${plan.countByKind.get(kind) ?? 0} ta`);
  }
  console.log(`  JAMI yoziladi: ${plan.rows.length} ta`);

  const bySkip = new Map<string, number>();
  for (const s of plan.skipped) bySkip.set(s.reason, (bySkip.get(s.reason) ?? 0) + 1);
  console.log("\n-- CHETGA QO'YILGAN --");
  for (const [reason, n] of bySkip) console.log(`  ${reason.padEnd(20)} ${n} ta`);

  // Valyuta mos kelmagani — ODAM qaroriga, shuning uchun to'liq ro'yxat.
  const mismatched = plan.skipped.filter((s) => s.reason === 'currency_mismatch');
  if (mismatched.length > 0) {
    console.log('\n🔴 VALYUTA MOS EMAS (odam qaroriga qoldirildi):');
    for (const s of mismatched) console.log(`  ${s.name} — ${s.detail}`);
  }

  console.log("\n-- KUTILAYOTGAN QOLDIQ SILJISHI (FAQAT O'LCHOV, QO'LLANMAYDI) --");
  if (plan.expectedShiftBySource.size === 0) {
    console.log("  (siljish yo'q)");
  }
  for (const [key, delta] of plan.expectedShiftBySource) {
    console.log(`  ${key}: ${som(delta)}`);
  }
  console.log(
    '  ⚠️ Bu sonlar `CashDesk.balanceMinor` / `OrganizationAccount.balanceMinor`\n' +
      "     ustunlariga QO'LLANMAYDI. Ular jonli kod tomonidan o'z vaqtida\n" +
      "     siljitilgan bo'lishi mumkin — ko'r-ko'rona qo'shish ikki-karra hisob.",
  );

  const rollback = rollbackSql(RUN_ID);
  console.log('\n-- ROLLBACK --');
  console.log(rollback);

  if (MANIFEST) {
    const manifest = {
      runId: RUN_ID,
      mode: LIVE ? 'live' : 'dry',
      at: new Date().toISOString(),
      docsRead: docs.length,
      existingKeys: keys.size,
      batchCovered,
      planned: plan.rows.length,
      countByKind: Object.fromEntries(plan.countByKind),
      skippedByReason: Object.fromEntries(bySkip),
      currencyMismatch: mismatched.map((s) => ({ name: s.name, detail: s.detail })),
      expectedShiftBySource: Object.fromEntries(
        [...plan.expectedShiftBySource].map(([k, v]) => [k, v.toString()]),
      ),
      rows: plan.rows.map((r) => ({
        documentKind: r.documentKind,
        documentId: r.documentId,
        name: r.name,
        sourceKind: r.sourceKind,
        sourceId: r.sourceId,
        currency: r.currency,
        deltaMinor: r.deltaMinor.toString(),
        at: r.at.toISOString(),
      })),
      rollbackSql: rollback,
    };
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`\nManifest yozildi: ${MANIFEST}`);
  }

  if (!LIVE) {
    console.log('\nDRY — hech narsa yozilmadi. Yozish uchun `--live`.');
    return;
  }

  // --- LIVE: FAQAT jurnal qatorlari ---------------------------------------
  let written = 0;
  for (const r of plan.rows) {
    await prisma.moneyOperation.create({
      data: {
        accountId: r.accountId,
        at: r.at,
        cashDeskId: r.sourceKind === 'cash_desk' ? r.sourceId : null,
        organizationAccountId: r.sourceKind === 'organization_account' ? r.sourceId : null,
        deltaMinor: r.deltaMinor,
        currency: r.currency,
        documentKind: r.documentKind,
        documentId: r.documentId,
        counterpartyId: r.counterpartyId,
        description: backfillDescription(RUN_ID, r.name),
      },
    });
    written++;
  }
  console.log(`\nYozildi: ${written} ta qator.`);

  // POST-VERIFY — qayta o'qib, reja endi BO'SH ekanini tekshiramiz.
  const keys2 = await loadExistingKeys();
  await addBatchCoveredDebtPayments(keys2);
  const plan2 = planMoneyBackfill(docs, keys2);
  if (plan2.rows.length === 0) {
    console.log("✅ POST-VERIFY: qayta reja BO'SH (idempotent).");
  } else {
    console.log(`❌ POST-VERIFY: qayta rejada hamon ${plan2.rows.length} ta qator — TEKSHIRING.`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

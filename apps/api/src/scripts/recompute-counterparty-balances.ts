#!/usr/bin/env tsx
/**
 * Recompute the materialized `CounterpartyBalance` cache.
 *
 * ══ FAZA 10 — NISHON MANBASI O'ZGARDI: `CounterpartyBalanceEntry` JURNALI ══
 *
 * Ilgari nishon hujjatlardan qayta qurilardi, va aynan o'sha qayta-qurish
 * ro'yxati `DUP-02` ning ildizi edi: ro'yxatga tushmagan yozuvchining saldosi
 * `APPLY=1` da JIMGINA nolga tushardi. Faza 8 buni skanner-guard bilan
 * yumshatgan (yozuvchi ro'yxatdan tushib qolsa skript to'xtaydi), lekin
 * printsipial xatar qolgan edi.
 *
 * Endi nishon — jurnal yig'indisi: `applyDelta` materiallashgan balans bilan
 * BIR TRANZAKSIYADA jurnalga yozadi, ya'ni `Σ(jurnal) == materiallashgan`
 * KONSTRUKSIYA bo'yicha to'g'ri va hech qanday hujjat-ro'yxatiga bog'liq emas.
 * Skriptning vazifasi ham aniqlashdi: u endi «hujjatlardan saldo yasash» emas,
 * **keshni bosh daftardan tiklash** (drift → 0).
 *
 * Hujjatlardan qayta-qurish SAQLANDI, lekin faqat **CROSS-CHECK** sifatida:
 * u endi hech narsa yozmaydi, balki «hujjatlar X deydi, jurnal Y deydi» farqini
 * ko'rsatadi. Shu bilan Faza 8 ning qamrov-guardi o'z ma'nosini saqlaydi
 * (`applyDelta` ni chaqirmaydigan yoki umuman yozmaydigan yo'l darhol
 * ko'rinadi), lekin uning xatosi endi ma'lumotni buza olmaydi.
 *
 * ⚠️ BACKFILL: jurnal Faza 9 da bo'sh boshlangan. `backfill-counterparty-balance-journal.ts`
 * («opening snapshot») YUGURTIRILMAGUNCHA bu skriptning nishoni tarixiy
 * saldoni BILMAYDI. Shuning uchun `main()` birinchi yozuvdan oldin buni
 * tekshiradi va backfill qilinmagan bo'lsa `APPLY=1` ni RAD ETADI.
 *
 * Hujjat cross-checkining formulasi (avvalgidek, `applyDelta` bilan bir xil):
 *   +InvoiceOut −InvoiceIn −Supply  −PaymentIn +PaymentOut  −CashIn +CashOut
 *   −Prepayment +PrepaymentReturn  CounterpartyAdjustment ±direction
 *   −DebtPayment  +Debt(QRZ- reyestr)  +RetailSale(qarz tender) −RetailSale(qarz qaytarish)
 * `applicable: true` is the precise predicate applyDelta gates on (cancel clears it).
 *
 * ⚠️ QAMROV — Faza 8 dan qolgan guard SAQLANADI. Endi u nishonni emas,
 * CROSS-CHECK ni himoya qiladi: qamrovsiz yozuvchi bo'lsa hujjat-hisobi chala
 * bo'lib, «jurnal noto'g'ri» degan YOLG'ON signal berardi. `main()` birinchi
 * ishdan OLDIN `assertCounterpartyBalanceCoverage()` bilan to'xtaydi
 * (`counterparty-balance-sources.test.ts` xuddi shuni gate'da tekshiradi).
 * Har manba-blok quyida `SOURCE: <nom>` markeri bilan belgilangan — marker
 * reyestrdagi nomga bog'langan, shuning uchun blokni o'chirib reyestrni
 * qoldirib bo'lmaydi.
 *
 * Run (DRY by default — prints the diff, writes nothing):
 *   pnpm --filter @moysklad/api exec tsx src/scripts/recompute-counterparty-balances.ts
 * Apply:
 *   APPLY=1 pnpm --filter @moysklad/api exec tsx src/scripts/recompute-counterparty-balances.ts
 * Verify one counterparty against the /metrics endpoint:
 *   ONLY_CP=<uuid> pnpm --filter @moysklad/api exec tsx src/scripts/recompute-counterparty-balances.ts
 */
import { PrismaClient } from '@moysklad/db';
import { CASHIER_EVENT } from '../modules/retail-sale/cashier-audit.js';
import { TENDER } from '../modules/retail-sale/retail-tenders.js';
import { assertCounterpartyBalanceCoverage } from './counterparty-balance-sources.js';

const prisma = new PrismaClient();
const APPLY = process.env.APPLY === '1';
const ONLY_CP = process.env.ONLY_CP || undefined;

type Key = string; // `${accountId}|${counterpartyId}|${currency}`
const key = (a: string, c: string, cur: string): Key => `${a}|${c}|${cur}`;

/**
 * `post()` dan o'tgan cheklar. `RetailSale` FSM'ida `posted` dan `cancel` YO'Q
 * (faqat `refund`), shuning uchun bu ikkilik aynan «applyDelta yugurgan»
 * to'plam (`retail-sale-fsm.ts` diagrammasi). Qaytarish-nusxalari ham shu
 * holatlar bilan yaratiladi (`retail-sale.service.ts` refund()).
 */
const POSTED_SALE_STATES = ['posted', 'refunded'] as const;

function chunked<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** `SOLD_ON_CREDIT` hodisasining payload'idan kontragentni o'qish. */
function readEventAgentId(payload: unknown): string | null {
  if (payload && typeof payload === 'object' && 'agentId' in payload) {
    const v = (payload as { agentId?: unknown }).agentId;
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

/**
 * Qarzga sotilgan chekda qarz KIMGA yozilganini `SOLD_ON_CREDIT` audit
 * hodisasidan o'qiydi. Bu hodisa `post()` da `applyDelta` bilan BIR
 * tranzaksiyada, aynan o'sha `debtAgentId` bilan yoziladi — ya'ni daftarga
 * nima tushgani haqidagi eng aniq yozuv.
 *
 * Nega `RetailSale.agentId` yetarli emas: `post()` chek qatoridagi `agentId` ni
 * faqat u BO'SH bo'lsa to'ldiradi. Chekda allaqachon boshqa kontragent turgan
 * va to'lov payloadida boshqasi yuborilgan holatda daftar payload'dagiga
 * yozilgan, chek qatorida esa eskisi qolgan. Hodisadan o'qish shu farqni
 * to'g'ri qayta quradi (chek qatori — zaxira yo'l).
 */
async function loadCreditEventAgents(saleIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const chunk of chunked([...new Set(saleIds)], 500)) {
    const events = await prisma.cashierAuditEvent.findMany({
      where: { type: CASHIER_EVENT.soldOnCredit, docId: { in: chunk } },
      // O'sish tartibi ⇒ oxirgi (eng yangi) hodisa yozib ketadi. Bu
      // `resolveCreditDebtorId` dagi `orderBy desc` + `findFirst` bilan bir xil.
      orderBy: { createdAt: 'asc' },
      select: { docId: true, payload: true },
    });
    for (const e of events) {
      const agentId = readEventAgentId(e.payload);
      if (e.docId && agentId) out.set(e.docId, agentId);
    }
  }
  return out;
}

async function main() {
  // Birinchi so'rovdan ham oldin: qamrovsiz yozuvchi bo'lsa bu skript
  // ishlashga HAQLI EMAS (DRY-RUN ham — chunki uning chiqishi «shu saldo
  // noto'g'ri» degan yolg'on tavsiya bo'lardi).
  assertCounterpartyBalanceCoverage();

  const where = { applicable: true, ...(ONLY_CP ? { agentId: ONLY_CP } : {}) };
  const target = new Map<Key, bigint>();
  const add = (accountId: string, agentId: string, currency: string, signed: bigint) => {
    // ONLY_CP ni MARKAZDA filtrlaymiz: ba'zi manbalarda kontragent so'rov
    // shartida emas, keyin (audit hodisasidan) aniqlanadi — filtr so'rovda
    // qolsa o'sha manba ONLY_CP rejimida tushib qolardi va skript o'sha
    // kontragentning saldosini «ortiqcha» deb ko'rsatardi.
    if (ONLY_CP && agentId !== ONLY_CP) return;
    const k = key(accountId, agentId, currency);
    target.set(k, (target.get(k) ?? 0n) + signed);
  };

  // Minimal structural type for the (account,agent,currency)-groupBy the 8 fixed-sign money
  // docs share — they're distinct Prisma delegates, so a common shape lets us loop over them.
  type SumRow = {
    accountId: string;
    agentId: string;
    currency: string;
    _sum: { sumMinor: bigint | null };
  };
  type GroupByDelegate = {
    groupBy(args: {
      by: Array<'accountId' | 'agentId' | 'currency'>;
      where: { applicable: boolean; agentId?: string };
      _sum: { sumMinor: true };
    }): Promise<SumRow[]>;
  };
  // SOURCE: fixed-docs — the 9 fixed-sign doc types → Σ sumMinor × posted-sign.
  //
  //   - `supply` 2026-07-28 da qo'shildi: `Supply.post` (supply.service.ts:1338)
  //     `applyDelta(..., -sumMinor)` yozadi — qabul qilingan tovar bizning
  //     yetkazib beruvchiga qarzimizni oshiradi. Ro'yxatda yo'q edi, shuning
  //     uchun faqat Qabul orqali ishlanadigan yetkazib beruvchida «bizning
  //     qarzimiz» butunlay ko'rinmasdi.
  const fixed: Array<[GroupByDelegate, bigint]> = [
    [prisma.invoiceOut as unknown as GroupByDelegate, 1n],
    [prisma.invoiceIn as unknown as GroupByDelegate, -1n],
    [prisma.supply as unknown as GroupByDelegate, -1n],
    [prisma.paymentIn as unknown as GroupByDelegate, -1n],
    [prisma.paymentOut as unknown as GroupByDelegate, 1n],
    [prisma.cashIn as unknown as GroupByDelegate, -1n],
    [prisma.cashOut as unknown as GroupByDelegate, 1n],
    [prisma.prepayment as unknown as GroupByDelegate, -1n],
    [prisma.prepaymentReturn as unknown as GroupByDelegate, 1n],
  ];
  for (const [model, sign] of fixed) {
    const rows = await model.groupBy({
      by: ['accountId', 'agentId', 'currency'],
      where,
      _sum: { sumMinor: true },
    });
    for (const r of rows) add(r.accountId, r.agentId, r.currency, sign * (r._sum.sumMinor ?? 0n));
  }

  // SOURCE: adjustments — Adjustments carry their own sign via `direction`.
  const adj = await prisma.counterpartyAdjustment.groupBy({
    by: ['accountId', 'agentId', 'currency', 'direction'],
    where,
    _sum: { sumMinor: true },
  });
  for (const r of adj) {
    add(
      r.accountId,
      r.agentId,
      r.currency,
      (r.direction === 'INCREASE' ? 1n : -1n) * (r._sum.sumMinor ?? 0n),
    );
  }

  // SOURCE: debt-payments — qarz kartochkasi to'lovlari. `DebtService.recalc`
  // har to'lovda `applyDelta(..., -paidDelta)` yozadi (debt-recalc.ts:65),
  // shuning uchun ular ham qayta-qurishga kirishi SHART. Storno qilingan
  // (reversedAt != null) to'lovlar yig'indiga kirmaydi — `recalc` ham aynan shu
  // filtrni ishlatadi. Kontragent `debt` relationi orqali topiladi
  // (DebtPayment'da agentId yo'q).
  const debtPayments = await prisma.debtPayment.findMany({
    where: {
      reversedAt: null,
      ...(ONLY_CP ? { debt: { counterpartyId: ONLY_CP } } : {}),
    },
    select: {
      accountId: true,
      amountMinor: true,
      // DIQQAT: `DebtPayment.currency` — TO'LOV (tender) valyutasi (mijoz naqdni
      // dollarda berishi mumkin), `amountMinor` esa HAR DOIM QARZ valyutasida
      // (schema izohi). `recalc` ham `debt.currency` bilan applyDelta qiladi —
      // shuning uchun bu yerda ham qarz valyutasi olinadi, aks holda so'mlik
      // qarzga qilingan dollar to'lov USD saldo qatoriga tushib ketardi.
      debt: { select: { counterpartyId: true, currency: true } },
    },
  });
  for (const dp of debtPayments) {
    add(dp.accountId, dp.debt.counterpartyId, dp.debt.currency, -dp.amountMinor);
  }

  // SOURCE: debt-issue — QRZ- reyestrida qo'lda ochilgan qarz (DUP-02).
  //
  // `DebtService.create` 2026-08-05 dan beri `applyDelta(+totalMinor)` yozadi
  // (debt.service.ts §3.3 «BALANS SIMMETRIYASI» izohi). Bu manba ro'yxatga
  // tushmagan edi: birinchi `APPLY=1` qo'lda ochilgan qarzlarni butunlay
  // o'chirib, to'lovlari esa `-paid` bo'lib qolar va to'liq to'lagan mijoz
  // «biz unga qarzdormiz» bo'lib ko'rinardi.
  //
  // ⚠️ SOFT-DELETE SIYOSATI: o'chirilgan (deletedAt != null) qarzlar HAM
  // qo'shiladi, chunki `DebtService.remove()` create'ning +totalMinor deltasini
  // QAYTARMAYDI (DUP-03 — Faza 12'ga qoldirilgan). Ya'ni daftarda o'sha delta
  // hali turibdi va rekonstruksiya unga MOS bo'lishi kerak; `deletedAt: null`
  // filtri bugun qo'yilsa skript o'chirilgan qarzlarni «ortiqcha» deb saldodan
  // ayirib yuborardi. Faza 12 reversal qo'shganda bu filtr o'zgarishi SHART —
  // `counterparty-balance-sources.test.ts` dagi premise-testi (remove() da
  // applyDelta yo'qligi) o'sha kuni yiqilib buni eslatadi.
  //
  // `totalMinor` create'dan keyin o'zgarmaydi (Debt'da uni tahrirlaydigan yo'l
  // yo'q), shuning uchun Σ totalMinor = Σ yozilgan delta.
  const debts = await prisma.debt.groupBy({
    by: ['accountId', 'counterpartyId', 'currency'],
    where: ONLY_CP ? { counterpartyId: ONLY_CP } : {},
    _sum: { totalMinor: true },
  });
  for (const d of debts) {
    add(d.accountId, d.counterpartyId, d.currency, d._sum.totalMinor ?? 0n);
  }

  // SOURCE: retail-credit — POS qarzga sotuv (DUP-02).
  //
  // `RetailSale.post` qarz ulushini mijozning UMUMIY balansiga yozadi
  // (`+debtAmount`, retail-sale.service.ts §7.1) — reyestrga EMAS, shuning
  // uchun debt-issue bilan ikki marta sanalmaydi. Summa va valyuta `DEBT`
  // tender qatoridan olinadi: u aynan `applyDelta` olgan qiymat bilan bir
  // tranzaksiyada, kassa valyutasida yoziladi.
  const creditLines = await prisma.retailSalePayment.findMany({
    where: { method: TENDER.debt, sale: { state: { in: [...POSTED_SALE_STATES] } } },
    select: {
      accountId: true,
      amountMinor: true,
      currency: true,
      saleId: true,
      sale: { select: { name: true, agentId: true } },
    },
  });
  const creditAgents = await loadCreditEventAgents(creditLines.map((l) => l.saleId));
  const orphanCredit: string[] = [];
  for (const l of creditLines) {
    const counterpartyId = creditAgents.get(l.saleId) ?? l.sale.agentId;
    if (!counterpartyId) {
      // `post()` mijozsiz qarzga sotuvni rad etadi, ya'ni bu holat bo'lmasligi
      // kerak. Bo'lsa — rekonstruksiya shu chekning qarzini yo'qotadi va
      // kimningdir saldosini kamaytirib yozadi: jimgina davom etish mumkin emas.
      orphanCredit.push(`${l.sale.name} (${l.saleId})`);
      continue;
    }
    add(l.accountId, counterpartyId, l.currency, l.amountMinor);
  }
  if (orphanCredit.length > 0) {
    throw new Error(
      [
        'Qarzga sotilgan, lekin mijozi aniqlanmagan chek(lar) topildi — rekonstruksiya',
        "ularning qarzini yo'qotadi, shuning uchun skript to'xtadi:",
        ...orphanCredit.map((s) => `  · ${s}`),
        "Chekka mijozni biriktiring (RetailSale.agentId) yoki qarzni qo'lda tuzating.",
      ].join('\n'),
    );
  }

  // SOURCE: retail-credit-refund — POS qarz-qaytarish (SALES-04, Faza 7).
  //
  // Qaytarishda qarz hisobidan yopilgan ulush uchun pul kassadan chiqmaydi,
  // mijozning qarzi kamayadi: `applyDelta(-debtReturn)`. Qaytarish-nusxasi
  // alohida `RetailSale` qatori bo'lib, ulush unda `debtReturnMinor` sifatida
  // SAQLANADI (qayta hisoblanmaydi) — shu ustun manba. Valyuta: qaytarish
  // asl chek bilan bir smenada bo'ladi, ya'ni o'sha kassa valyutasi.
  const debtRefunds = await prisma.retailSale.findMany({
    where: { debtReturnMinor: { gt: 0 }, state: { in: [...POSTED_SALE_STATES] } },
    select: {
      accountId: true,
      name: true,
      agentId: true,
      debtReturnMinor: true,
      refundedFromId: true,
      session: { select: { cashDesk: { select: { currency: true } } } },
    },
  });
  // `resolveCreditDebtorId` tartibi: avval chek qatoridagi `agentId`, u bo'sh
  // bo'lsa ASL chekning SOLD_ON_CREDIT hodisasi. Shu tartib aynan takrorlanadi.
  const refundFallbackAgents = await loadCreditEventAgents(
    debtRefunds
      .filter((r) => !r.agentId && r.refundedFromId)
      .map((r) => r.refundedFromId as string),
  );
  const orphanRefund: string[] = [];
  for (const r of debtRefunds) {
    const counterpartyId =
      r.agentId ?? (r.refundedFromId ? (refundFallbackAgents.get(r.refundedFromId) ?? null) : null);
    if (!counterpartyId) {
      orphanRefund.push(`${r.name}`);
      continue;
    }
    add(r.accountId, counterpartyId, r.session.cashDesk.currency, -r.debtReturnMinor);
  }
  if (orphanRefund.length > 0) {
    throw new Error(
      [
        "Qarz-qaytarish qatori bor, lekin mijozi aniqlanmagan chek(lar) — skript to'xtadi:",
        ...orphanRefund.map((s) => `  · ${s}`),
      ].join('\n'),
    );
  }

  // ══ NISHON — BALANS JURNALI (Faza 10). Hujjat-hisobi yuqorida `target` da
  // qoldi va faqat solishtirish uchun ishlatiladi.
  const journalRows = await prisma.counterpartyBalanceEntry.groupBy({
    by: ['accountId', 'counterpartyId', 'currency'],
    where: ONLY_CP ? { counterpartyId: ONLY_CP } : {},
    _sum: { deltaMinor: true },
  });
  const journal = new Map<Key, bigint>();
  for (const r of journalRows) {
    journal.set(key(r.accountId, r.counterpartyId, r.currency), r._sum.deltaMinor ?? 0n);
  }

  // Current cache rows (so we can detect drift + zero-out rows with no journal).
  const current = await prisma.counterpartyBalance.findMany({
    where: ONLY_CP ? { counterpartyId: ONLY_CP } : {},
    select: { accountId: true, counterpartyId: true, currency: true, balanceMinor: true },
  });
  const currentMap = new Map<Key, bigint>();
  for (const c of current)
    currentMap.set(key(c.accountId, c.counterpartyId, c.currency), c.balanceMinor);

  // ⚠️ BACKFILL QO'RIQCHISI. Jurnal Faza 9 da BO'SH boshlangan: `opening`
  // qatorlarisiz uning yig'indisi faqat Faza 9 dan KEYINGI deltalarni biladi,
  // ya'ni `APPLY=1` butun tarixiy saldoni o'chirib yuborardi — bu aynan
  // DUP-02 halokati, faqat boshqa eshikdan. Shuning uchun: materiallashgan
  // qatori bor, lekin jurnalda umuman ko'rinmagan kalit bo'lsa — YOZMAYMIZ.
  const missingInJournal = [...currentMap.keys()].filter((k) => !journal.has(k));

  const allKeys = new Set<Key>([...journal.keys(), ...currentMap.keys()]);
  let changed = 0;
  let unchanged = 0;
  let docMismatch = 0;
  const samples: string[] = [];
  const docSamples: string[] = [];
  const writes: Array<[Key, bigint]> = [];
  for (const k of allKeys) {
    const want = journal.get(k) ?? 0n; // jurnalda yo'q ⇒ bosh daftarda harakat yo'q
    const have = currentMap.get(k) ?? 0n;
    const fromDocs = target.get(k) ?? 0n;
    if (fromDocs !== want) {
      docMismatch++;
      if (docSamples.length < 12) {
        const [, cp, cur] = k.split('|');
        docSamples.push(`  ${cp} ${cur}: hujjatlar ${fromDocs} vs jurnal ${want}`);
      }
    }
    if (want === have) {
      unchanged++;
      continue;
    }
    changed++;
    if (samples.length < 12) {
      const [, cp, cur] = k.split('|');
      samples.push(`  ${cp} ${cur}: ${have} → ${want}  (Δ ${want - have})`);
    }
    writes.push([k, want]);
  }

  console.log(
    `mode: ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}${ONLY_CP ? ` | ONLY_CP=${ONLY_CP}` : ''}`,
  );
  console.log(
    `(account,counterparty,currency) pairs: ${allKeys.size} | changed: ${changed} | unchanged: ${unchanged}`,
  );
  if (samples.length) {
    console.log('sample changes (have → want, JURNALDAN):');
    console.log(samples.join('\n'));
  }
  console.log(
    docMismatch === 0
      ? 'cross-check: hujjat-rekonstruksiyasi jurnal bilan MOS (0 farq)'
      : `cross-check: ⚠️ ${docMismatch} kalitda hujjat-rekonstruksiyasi jurnaldan farq qiladi`,
  );
  if (docSamples.length) console.log(docSamples.join('\n'));

  if (missingInJournal.length > 0) {
    console.error(
      [
        '',
        `⛔ ${missingInJournal.length} kontragent×valyuta jufti materiallashgan balansda BOR, jurnalda YO'Q.`,
        'Bu — backfill qilinmagan tarix belgisi. Jurnaldan yozish ularning saldosini nolga tushirardi.',
        'Avval `opening snapshot` ni yugurtiring:',
        '  pnpm --filter @moysklad/api exec tsx src/scripts/backfill-counterparty-balance-journal.ts',
        '  APPLY=1 pnpm --filter @moysklad/api exec tsx src/scripts/backfill-counterparty-balance-journal.ts',
        ...missingInJournal.slice(0, 10).map((k) => `  · ${k}`),
      ].join('\n'),
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  if (APPLY) {
    for (const [k, want] of writes) {
      // key() built this as `${accountId}|${counterpartyId}|${currency}` → exactly 3 parts.
      const [accountId, counterpartyId, currency] = k.split('|') as [string, string, string];
      await prisma.counterpartyBalance.upsert({
        where: { counterpartyId_currency: { counterpartyId, currency } },
        create: { accountId, counterpartyId, currency, balanceMinor: want },
        update: { balanceMinor: want },
      });
    }
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

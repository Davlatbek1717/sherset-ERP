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
 *   +InvoiceOut −Supply +PurchaseReturn  −PaymentIn +PaymentOut  −CashIn +CashOut
 *   −Prepayment +PrepaymentReturn  CounterpartyAdjustment ±direction
 *   −DebtPayment  +Debt(QRZ- reyestr, `balanceAdopted=false`)
 *   +RetailSale(qarz tender) −RetailSale(qarz qaytarish)
 *   +RetailDrawerCashOut(return_payout)  −RetailDrawerCashIn(customer_prepay)
 *   +RetailSale(PREPAY tender) −RetailSale(PREPAY vozvrat qatori)
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
async function loadEventAgents(
  eventType: string,
  saleIds: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const chunk of chunked([...new Set(saleIds)], 500)) {
    const events = await prisma.cashierAuditEvent.findMany({
      where: { type: eventType, docId: { in: chunk } },
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

const loadCreditEventAgents = (saleIds: readonly string[]) =>
  loadEventAgents(CASHIER_EVENT.soldOnCredit, saleIds);

/**
 * A2 — avansdan to'langan chekda AVANS KIMNIKI ekanini `PAID_FROM_PREPAY`
 * hodisasidan o'qiydi. Sabab `loadCreditEventAgents` bilan AYNAN bir xil
 * (yuqoridagi izoh): `RetailSale.agentId` chekda allaqachon boshqa
 * kontragent turgan holatda daftarga yozilgani bilan farq qilishi mumkin.
 */
const loadPrepayEventAgents = (saleIds: readonly string[]) =>
  loadEventAgents(CASHIER_EVENT.paidFromPrepay, saleIds);

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
  //
  //   ⚠️ FAZA 13 (2026-08-08, QAROR-B «Supply-only»):
  //     · `invoiceIn` ro'yxatdan CHIQARILDI — `InvoiceIn` endi `applyDelta` ni
  //       umuman chaqirmaydi (`PP-03`: xarid qarzi Supply bilan ikki marta
  //       sanalardi). Qolgani bo'lsa cross-check «hujjatlar ≠ jurnal» deb
  //       YOLG'ON signal berardi.
  //     · `purchaseReturn` QO'SHILDI (`PP-02`, +1n): taminotchiga qaytarish
  //       qabul deltasining teskarisini yozadi.
  //
  //   ⚠️ P14 (2026-08-12, `H1`):
  //     · `salesReturn` QO'SHILDI (−1n): mijoz qaytarishi uning qarzini
  //       kamaytiradi (`invoiceOut` +1n ning teskarisi). Bu qator YO'Q bo'lsa
  //       `APPLY=1` qaytarish deltalarini jimgina yeb yuborardi (DUP-02 klassi).
  //     ⚠️ TARIXIY QATORLAR: Faza 13'gacha post qilingan InvoiceIn'larning
  //     jurnal deltalari joyida QOLADI (append-only). Ya'ni bu skript endi
  //     ularni hujjatlardan qayta qura olmaydi va o'sha kontragentlarda
  //     cross-check farqi ko'rsatadi — bu KUTILGAN, jurnal (nishon) to'g'ri.
  const fixed: Array<[GroupByDelegate, bigint]> = [
    [prisma.invoiceOut as unknown as GroupByDelegate, 1n],
    [prisma.salesReturn as unknown as GroupByDelegate, -1n],
    [prisma.supply as unknown as GroupByDelegate, -1n],
    [prisma.purchaseReturn as unknown as GroupByDelegate, 1n],
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
  // ⚠️ SOFT-DELETE SIYOSATI (2026-08-08 Faza 12 da O'ZGARDI): o'chirilgan
  // (deletedAt != null) qarzlar rekonstruksiyaga KIRMAYDI. Sabab —
  // `DebtService.remove()` endi create'ning +totalMinor deltasini teskarisiga
  // yozadi (`DUP-03` reversali), ya'ni daftarda o'sha delta QOLMAYDI.
  // Filtrsiz qolsa `APPLY=1` o'chirilgan qarzni saldoga QAYTARIB olib kelardi.
  // Ikki tomon `counterparty-balance-sources.test.ts` da birga qulflangan.
  //
  // (Faza 12'gacha aksi to'g'ri edi: reversal yo'q edi, shuning uchun
  // o'chirilgan qarz ham qo'shilardi.)
  //
  // 🔴 ADOPSIYA QATORLARI SANALMAYDI (Q1, 2026-08-25 — reja §2.1 yorig'i).
  //
  // P1 (2026-08-11) dan beri reyestrda IKKI XIL qator bor:
  //   · odatdagi `DebtService.create` qatori — balansga `+totalMinor` YOZADI;
  //   · `balanceAdopted = true` qatori — balansga HECH NARSA yozmaydi, chunki
  //     qarz balansda ALLAQACHON bor (`pos-debt-payment.service.ts#adoptBalanceDebt`;
  //     Q2 dan keyin `retail-sale.service.ts#post` ham shunday qator ochadi).
  //
  // Ya'ni pastdagi «Σ totalMinor = Σ yozilgan delta» tengligi adopsiya
  // qatorlari uchun NOTO'G'RI. Filtrsiz qolsa hujjat-rekonstruksiyasi ularning
  // `totalMinor` ini qo'shadi, jurnalda esa mos delta yo'q ⇒ cross-check
  // «hujjatlar X vs jurnal Y» deb YOLG'ON farq ko'rsatardi. (Faza 10 dan beri
  // NISHON — jurnal, shuning uchun bu ma'lumotni BUZMAYDI; buzadigani —
  // skriptning yagona diagnostik signalining ishonchi.)
  //
  // ⚠️ SIMMETRIYA: `debt.service.ts#remove()` ham adopsiya qatoriga
  // `−totalMinor` YOZMAYDI (`if (!debt.balanceAdopted)`), ya'ni ikkala tomon
  // ham daftarga tegmaydi — filtr aynan shu haqiqatning ko'zgusi. Ikkovi
  // `counterparty-balance-sources.test.ts` da birga qulflangan.
  //
  // 🔴 2026-08-25 (Q3) — ESKI DA'VO TUZATILDI. Bu yerda ilgari «`totalMinor`
  // create'dan keyin o'zgarmaydi (Debt'da uni tahrirlaydigan yo'l yo'q)»
  // deyilardi. Q3 dan beri bu YOLG'ON: `retail-sale.service.ts` ning
  // `refund()` va `edit()` yo'llari chekdan tug'ilgan qatorning `totalMinor`
  // ini KAMAYTIRADI (tahrirda oshiradi ham) — invariant 2, simmetriya.
  //
  // Skript baribir TO'G'RI qoladi: Q3 harakatlantiradigan qatorlarning
  // HAMMASI `balanceAdopted = true`, ya'ni yuqoridagi filtr ularni bu
  // hisobdan CHIQARIB tashlaydi. Qolgan (`balanceAdopted = false`) qatorlar
  // uchun da'vo hamon o'z kuchida — ularning `totalMinor` ini o'zgartiradigan
  // yo'l yo'q, demak Σ totalMinor = Σ yozilgan delta.
  //
  // ⚠️ Eski matn ATAYLAB shu izohda qoldirildi: premise yangilanmasa keyingi
  // o'quvchi «totalMinor o'zgarmas» degan noto'g'ri asosda qaror qabul
  // qilardi (F5 sabog'i — eskirgan izoh keyingi agentni adashtiradi).
  const debts = await prisma.debt.groupBy({
    by: ['accountId', 'counterpartyId', 'currency'],
    where: {
      deletedAt: null,
      balanceAdopted: false,
      ...(ONLY_CP ? { counterpartyId: ONLY_CP } : {}),
    },
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

  // SOURCE: return-payouts — vozvrat pulining kassadan qaytarilishi (G1, 2026-08-24).
  //
  // `CashierSessionService.customerPayout` `RetailDrawerCashOut`
  // (`kind='return_payout'`, `agentId` to'ldirilgan) yozadi va o'sha
  // tranzaksiyada `applyDelta(+sumMinor)` — `SalesReturn.post()` yozgan
  // `−sumMinor` kreditning naqd bilan yopilishi. Hujjat holati doim `posted`
  // (draft bosqichi yo'q), soft-delete yo'li yo'q — filtrlar himoya uchun.
  const returnPayouts = await prisma.retailDrawerCashOut.groupBy({
    by: ['accountId', 'agentId', 'currency'],
    where: {
      kind: 'return_payout',
      state: 'posted',
      deletedAt: null,
      agentId: ONLY_CP ? ONLY_CP : { not: null },
    },
    _sum: { sumMinor: true },
  });
  for (const r of returnPayouts) {
    // `agentId: not null` filtri bor — TS uchun ochiq tekshiruv.
    if (r.agentId) add(r.accountId, r.agentId, r.currency, r._sum.sumMinor ?? 0n);
  }

  // SOURCE: customer-prepays — kassada qabul qilingan MIJOZ AVANSI (A1, 2026-08-25).
  //
  // `CashierSessionService.customerPrepay` `RetailDrawerCashIn`
  // (`kind='customer_prepay'`, `agentId` to'ldirilgan) yozadi va o'sha
  // tranzaksiyada `applyDelta(−sumMinor)` — «biz mijozga qarzdormiz»
  // (`cashIn` semantikasi). Ishora MANFIY: `return-payouts` ning ko'zgusi.
  //
  // 🔴 BU BLOK UNUTILGAN BO'LSA nima bo'lardi: hujjat-cross-check har avansli
  // mijozda «jurnal noto'g'ri» degan YOLG'ON farq ko'rsatardi va keyingi
  // sessiya haqiqiy signalni shovqin ichida yo'qotardi. Bu — reja §2.1 dagi
  // mavjud yoriqning aynan takrori bo'lardi (A2 `PREPAY` tenderi uchun ham
  // AYNI narsa qilinishi SHART — reja 7-vazifasi).
  //
  // ⚠️ `kind='topup'` («Внесение») bu yerga TUSHMAYDI va tushmasligi kerak:
  // u kontragentsiz va balansga UMUMAN tegmaydi.
  const customerPrepays = await prisma.retailDrawerCashIn.groupBy({
    by: ['accountId', 'agentId', 'currency'],
    where: {
      kind: 'customer_prepay',
      state: 'posted',
      deletedAt: null,
      agentId: ONLY_CP ? ONLY_CP : { not: null },
    },
    _sum: { sumMinor: true },
  });
  for (const r of customerPrepays) {
    if (r.agentId) add(r.accountId, r.agentId, r.currency, -(r._sum.sumMinor ?? 0n));
  }

  // SOURCE: sale-prepay — AVANSDAN TO'LOV (A2, 2026-08-25).
  //
  // `RetailSale.post()` `PREPAY` tender qatorini yozadi va o'sha
  // tranzaksiyada `applyDelta(+amountMinor, docType:'salePrepay')` —
  // mijozning avansi yeyiladi (−1 000k → −700k). `retail-credit` ning aynan
  // ko'zgusi: bir xil ishora, bir xil manba-jadval, faqat tender boshqa.
  //
  // 🔴 BU BLOK UNUTILGAN BO'LSA nima bo'lardi: hujjat-rekonstruksiyasi
  // avansning SARFLANISHINI ko'rmasdi, ya'ni har avansli mijozda cross-check
  // yolg'on farq ko'rsatardi — va Faza 10 dan OLDINGI (hujjatlarga yozadigan)
  // versiyada `APPLY=1` mijozlarning avanslarini tiklab yuborardi. Bu reja
  // §2.1 dagi yoriqning uchinchi takrori bo'lardi (A1 hisobotining
  // 1-eslatmasi aynan shu haqda ogohlantirgan).
  //
  // ⚠️ `refundedFromId: null` — VOZVRAT-nusxalari bu blokdan CHIQARILADI va
  // pastdagi `sale-prepay-refund` blokida MANFIY ishora bilan sanaladi.
  // Ikkalasi bir yerda qolsa qaytarilgan avans `+` bo'lib qo'shilib,
  // hisobni ikki barobar buzardi.
  const prepayLines = await prisma.retailSalePayment.findMany({
    where: {
      method: TENDER.prepay,
      sale: { state: { in: [...POSTED_SALE_STATES] }, refundedFromId: null },
    },
    select: {
      accountId: true,
      amountMinor: true,
      currency: true,
      saleId: true,
      sale: { select: { name: true, agentId: true } },
    },
  });
  const prepayAgents = await loadPrepayEventAgents(prepayLines.map((l) => l.saleId));
  const orphanPrepay: string[] = [];
  for (const l of prepayLines) {
    const counterpartyId = prepayAgents.get(l.saleId) ?? l.sale.agentId;
    if (!counterpartyId) {
      // `post()` mijozsiz avans-to'lovni rad etadi, ya'ni bu holat
      // bo'lmasligi kerak. Bo'lsa — rekonstruksiya kimningdir avansini
      // yo'qotadi: jimgina davom etish mumkin emas (`retail-credit` naqshi).
      orphanPrepay.push(`${l.sale.name} (${l.saleId})`);
      continue;
    }
    add(l.accountId, counterpartyId, l.currency, l.amountMinor);
  }
  if (orphanPrepay.length > 0) {
    throw new Error(
      [
        "Avansdan to'langan, lekin mijozi aniqlanmagan chek(lar) topildi — rekonstruksiya",
        "ularning avansini yo'qotadi, shuning uchun skript to'xtadi:",
        ...orphanPrepay.map((s) => `  · ${s}`),
        'Chekka mijozni biriktiring (RetailSale.agentId).',
      ].join('\n'),
    );
  }

  // SOURCE: sale-prepay-refund — avansdan to'langan chekning QAYTARILISHI (A2).
  //
  // `refund()` mirror chekka `PREPAY` qatorini yozadi va o'sha tranzaksiyada
  // `applyDelta(−prepayReturn, docType:'salePrepay')` — avans mijozning
  // balansiga qaytadi. Manba AYNAN o'sha mirror qatori (`refundedFromId`
  // to'ldirilgan cheklar), ya'ni yuqoridagi blok bilan kesishmaydi.
  const prepayRefundLines = await prisma.retailSalePayment.findMany({
    where: {
      method: TENDER.prepay,
      sale: { state: { in: [...POSTED_SALE_STATES] }, refundedFromId: { not: null } },
    },
    select: {
      accountId: true,
      amountMinor: true,
      currency: true,
      sale: { select: { name: true, agentId: true, refundedFromId: true } },
    },
  });
  const prepayRefundFallback = await loadPrepayEventAgents(
    prepayRefundLines
      .filter((l) => !l.sale.agentId && l.sale.refundedFromId)
      .map((l) => l.sale.refundedFromId as string),
  );
  const orphanPrepayRefund: string[] = [];
  for (const l of prepayRefundLines) {
    const counterpartyId =
      l.sale.agentId ??
      (l.sale.refundedFromId ? (prepayRefundFallback.get(l.sale.refundedFromId) ?? null) : null);
    if (!counterpartyId) {
      orphanPrepayRefund.push(`${l.sale.name}`);
      continue;
    }
    add(l.accountId, counterpartyId, l.currency, -l.amountMinor);
  }
  if (orphanPrepayRefund.length > 0) {
    throw new Error(
      [
        "Avans-qaytarish qatori bor, lekin mijozi aniqlanmagan chek(lar) — skript to'xtadi:",
        ...orphanPrepayRefund.map((s) => `  · ${s}`),
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

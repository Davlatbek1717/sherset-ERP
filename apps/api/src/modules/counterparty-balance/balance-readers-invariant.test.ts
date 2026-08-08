import { describe, expect, it } from 'vitest';
import { CounterpartyStatementService } from '../counterparty-statement/counterparty-statement.service.js';
import { CounterpartyService } from '../counterparty/counterparty.service.js';
import { CounterpartyActService } from '../report/counterparty-act.service.js';
import { OPENING_DOC_TYPE } from './counterparty-balance-doc-types.js';
import {
  type JournalEntry,
  foldJournalPeriod,
  journalWhere,
  sumJournalByOrganization,
} from './counterparty-balance-journal.util.js';

/**
 * FAZA 10 — «closing == materialized» INVARIANTI, TO'RT O'QUVCHI UCHUN BIRDAN.
 *
 * Bug-klass (audit `M-07`, `DUP-05`, `DUP-06`, `DUP-08`): kontragent saldosi
 * to'rt joyda MUSTAQIL ravishda hujjatlardan qayta qurilardi — metrics byOrg
 * 9 tur, statement 12 tur, akt-sverka 8 tur, recompute skripti 6 manba. Har
 * ro'yxat chala, va har biri BOSHQACHA chala edi. Natijada bitta kontragentda
 * to'rt xil son chiqar, kontragentga imzoga yuboriladigan aktdagi yakuniy
 * qoldiq esa bosh daftardagidan farq qilardi.
 *
 * Bu test aynan shu holatni ushlab turadi: ARALASH-HUJJAT stsenariysi
 * (supply · POS qarz-sotuv · qo'lda ochilgan qarz · invoice · to'lov ·
 * korrektirovka · qarz to'lovi · unpost teskarisi · boshqa valyuta) bo'ylab
 * HAR o'quvchining yakuniy qoldig'i materiallashgan `CounterpartyBalance`
 * bilan bir xil bo'lishi SHART.
 *
 * Fixture `applyDelta` xulqini takrorlaydi (materiallashgan upsert + jurnal
 * qatori BIR amalda) — Faza 9 testlari o'sha xulqni haqiqiy
 * `CounterpartyBalanceService` da, real DB round-trip bilan qulflagan; bu
 * yerda O'QUVCHI tomoni tekshiriladi.
 */

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const CP = '22222222-2222-4222-8222-222222222222';
const ORG_A = '33333333-3333-4333-8333-333333333333';
const ORG_B = '44444444-4444-4444-8444-444444444444';
const UZS = 'UZS';

// ─────────────────────────── fixture ───────────────────────────

interface PostArgs {
  docType: string;
  docId: string | null;
  orgId: string | null;
  delta: bigint;
  at: Date;
  currency?: string;
}

interface JournalRow extends JournalEntry {
  accountId: string;
  counterpartyId: string;
  currency: string;
}

/**
 * `applyDelta` ning ikki yozuvini takrorlaydigan minimal daftar: materiallashgan
 * (kontragent×valyuta) balans + append-only jurnal qatori. Ikkalasi BIR
 * metodda o'zgaradi, ya'ni fixture'ning o'zi «Σ(jurnal) == materiallashgan»
 * ni konstruksiya bo'yicha ushlab turadi — testlar esa O'QUVCHILAR shu
 * yig'indiga yetib kelishini tekshiradi.
 */
class Ledger {
  readonly rows: JournalRow[] = [];
  private readonly byCurrency = new Map<string, bigint>();
  private readonly byOrg = new Map<string, bigint>();

  post({ docType, docId, orgId, delta, at, currency = UZS }: PostArgs): void {
    this.rows.push({
      accountId: ACCOUNT,
      counterpartyId: CP,
      organizationId: orgId,
      currency,
      deltaMinor: delta,
      docType,
      docId,
      createdAt: at,
    });
    this.byCurrency.set(currency, (this.byCurrency.get(currency) ?? 0n) + delta);
    const k = `${orgId ?? ''}|${currency}`;
    this.byOrg.set(k, (this.byOrg.get(k) ?? 0n) + delta);
  }

  materialized(currency: string): bigint {
    return this.byCurrency.get(currency) ?? 0n;
  }

  materializedByOrg(orgId: string | null, currency: string): bigint {
    return this.byOrg.get(`${orgId ?? ''}|${currency}`) ?? 0n;
  }
}

interface EntryWhere {
  accountId: string;
  counterpartyId: string;
  currency: string;
  organizationId?: string | null;
  createdAt?: { lt: Date };
}

function matches(r: JournalRow, w: EntryWhere): boolean {
  if (r.accountId !== w.accountId) return false;
  if (r.counterpartyId !== w.counterpartyId) return false;
  if (r.currency !== w.currency) return false;
  if ('organizationId' in w && r.organizationId !== (w.organizationId ?? null)) return false;
  if (w.createdAt && !(r.createdAt < w.createdAt.lt)) return false;
  return true;
}

/** `docId` → hujjat qatori (raqam/sana/shartnoma) — resolver shundan o'qiydi. */
const DOCS = {
  invoiceOut: [
    { id: 'io-1', name: 'СЧ-2026-00001', moment: new Date(Date.UTC(2026, 6, 3)), contractId: null },
    {
      id: 'io-usd',
      name: 'СЧ-2026-00009',
      moment: new Date(Date.UTC(2026, 6, 13)),
      contractId: null,
    },
  ],
  invoiceIn: [
    {
      id: 'ii-1',
      name: 'СЧП-2026-00001',
      moment: new Date(Date.UTC(2026, 6, 6)),
      contractId: null,
    },
  ],
  supply: [
    { id: 'su-1', name: 'ПР-2026-00001', moment: new Date(Date.UTC(2026, 6, 4)), contractId: null },
  ],
  paymentIn: [
    { id: 'pi-1', name: 'ВП-2026-00001', moment: new Date(Date.UTC(2026, 6, 5)), contractId: null },
  ],
  cashOut: [
    { id: 'co-1', name: '00001', moment: new Date(Date.UTC(2026, 6, 7)), contractId: null },
  ],
  counterpartyAdjustment: [
    {
      id: 'adj-1',
      name: 'КР-2026-00001',
      moment: new Date(Date.UTC(2026, 6, 8)),
      contractId: null,
    },
  ],
} as const;

type DocRow = { id: string; name: string; moment: Date; contractId: string | null };

function findDocs(list: readonly DocRow[] | undefined, ids: string[]): DocRow[] {
  return (list ?? []).filter((d) => ids.includes(d.id)).map((d) => ({ ...d, positions: [] }));
}

function emptyDelegate() {
  return { findMany: async () => [] };
}

function makeLedgerClient() {
  const ledger = new Ledger();
  const docDelegate = (key: keyof typeof DOCS) => ({
    findMany: async (a: { where: { id: { in: string[] } } }) =>
      findDocs(DOCS[key] as readonly DocRow[], a.where.id.in),
  });

  const client = {
    counterpartyBalanceEntry: {
      findMany: async (a: { where: EntryWhere }) =>
        ledger.rows
          .filter((r) => matches(r, a.where))
          .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())
          .map((r) => ({
            organizationId: r.organizationId,
            deltaMinor: r.deltaMinor,
            docType: r.docType,
            docId: r.docId,
            createdAt: r.createdAt,
          })),
      groupBy: async (a: { where: EntryWhere }) => {
        const sums = new Map<string | null, bigint>();
        for (const r of ledger.rows.filter((x) => matches(x, a.where))) {
          sums.set(r.organizationId, (sums.get(r.organizationId) ?? 0n) + r.deltaMinor);
        }
        return [...sums].map(([organizationId, s]) => ({
          organizationId,
          _sum: { deltaMinor: s },
        }));
      },
    },
    counterparty: {
      findFirst: async () => ({
        id: CP,
        name: 'ООО «Тест»',
        phone: null,
        legalTitle: null,
        legalAddress: null,
        uzRequisites: null,
      }),
    },
    organization: {
      findFirst: async () => ({
        id: ORG_A,
        name: 'Наша организация',
        legalTitle: null,
        legalAddress: null,
        uzRequisites: null,
      }),
      findMany: async () => [
        { id: ORG_A, name: 'Орг А' },
        { id: ORG_B, name: 'Орг Б' },
      ],
    },
    contract: { findFirst: async () => null },
    demand: {
      aggregate: async () => ({
        _count: { _all: 0 },
        _sum: { sumMinor: null, costSumMinor: null },
        _min: { moment: null },
        _max: { moment: null },
      }),
    },
    salesReturn: {
      aggregate: async () => ({ _count: { _all: 0 }, _sum: { sumMinor: null } }),
    },
    $queryRaw: async () => [{ discount: '0' }],
    invoiceOut: docDelegate('invoiceOut'),
    invoiceIn: docDelegate('invoiceIn'),
    supply: docDelegate('supply'),
    paymentIn: docDelegate('paymentIn'),
    paymentOut: emptyDelegate(),
    cashIn: emptyDelegate(),
    cashOut: docDelegate('cashOut'),
    prepayment: emptyDelegate(),
    prepaymentReturn: emptyDelegate(),
    counterpartyAdjustment: docDelegate('counterpartyAdjustment'),
    debt: {
      findMany: async (a: { where: { id: { in: string[] } } }) =>
        [
          { id: 'debt-1', name: 'QRZ-2026-00001', createdAt: new Date(Date.UTC(2026, 6, 9)) },
        ].filter((d) => a.where.id.in.includes(d.id)),
    },
    debtPayment: {
      findMany: async (a: { where: { OR: Array<{ id?: { in: string[] } }> } }) => {
        const ids = a.where.OR.flatMap((o) => o.id?.in ?? []);
        return [
          {
            id: 'dp-1',
            batchId: null,
            createdAt: new Date(Date.UTC(2026, 6, 10)),
            debt: { name: 'QRZ-2026-00001' },
          },
        ].filter((p) => ids.includes(p.id));
      },
    },
    retailSale: {
      findMany: async (a: { where: { id: { in: string[] } } }) =>
        [{ id: 'rs-1', name: 'CHEK-00001', moment: new Date(Date.UTC(2026, 6, 11)) }].filter((d) =>
          a.where.id.in.includes(d.id),
        ),
    },
  };
  return { ledger, client };
}

/**
 * Aralash-hujjat stsenariysi. Har qator = bitta `applyDelta` chaqiruvi, aynan
 * ishlab chiqarishdagi belgi konvensiyasi bilan:
 *   +InvoiceOut  −InvoiceIn  −Supply  −PaymentIn  +CashOut  ±Adjustment
 *   +Debt(QRZ- ochildi)  −DebtPayment  +RetailSale(qarzga sotuv)
 */
function seed(l: Ledger): void {
  const d = (n: number) => new Date(Date.UTC(2026, 6, n, 10, 0, 0));
  // Faza 9 dan oldingi tarix — backfill «opening» qatori (hujjatsiz, org'siz).
  l.post({ docType: OPENING_DOC_TYPE, docId: null, orgId: null, delta: 250_000n, at: d(20) });
  l.post({ docType: 'invoiceOut', docId: 'io-1', orgId: ORG_A, delta: 1_000_000n, at: d(3) });
  l.post({ docType: 'supply', docId: 'su-1', orgId: ORG_A, delta: -400_000n, at: d(4) });
  l.post({ docType: 'paymentIn', docId: 'pi-1', orgId: ORG_A, delta: -300_000n, at: d(5) });
  l.post({ docType: 'invoiceIn', docId: 'ii-1', orgId: ORG_B, delta: -150_000n, at: d(6) });
  l.post({ docType: 'cashOut', docId: 'co-1', orgId: ORG_B, delta: 90_000n, at: d(7) });
  l.post({ docType: 'adjustment', docId: 'adj-1', orgId: ORG_B, delta: -20_000n, at: d(8) });
  // Organizatsiya o'lchovi YO'Q hujjatlar — jurnalda `organizationId: null`.
  l.post({ docType: 'debt', docId: 'debt-1', orgId: null, delta: 500_000n, at: d(9) });
  l.post({ docType: 'debtpayment', docId: 'dp-1', orgId: null, delta: -120_000n, at: d(10) });
  l.post({ docType: 'retailsale', docId: 'rs-1', orgId: null, delta: 75_000n, at: d(11) });
  // Unpost — o'sha hujjatning teskari deltasi (YANGI qator, o'chirish emas).
  l.post({ docType: 'cashOut', docId: 'co-1', orgId: ORG_B, delta: -90_000n, at: d(12) });
  // Boshqa valyuta — UZS o'quvchilariga TUSHMASLIGI kerak.
  l.post({
    docType: 'invoiceOut',
    docId: 'io-usd',
    orgId: ORG_A,
    delta: 999_999n,
    at: d(13),
    currency: 'USD',
  });
}

// ─────────────────────────── testlar ───────────────────────────

describe('Faza 10 — balans o’quvchilari jurnaldan o’qiydi', () => {
  it("jurnal so'rovi `docType` bo'yicha FILTRLAMAYDI (chala-ro'yxat bug-klassi qulfi)", () => {
    const where = journalWhere({
      accountId: ACCOUNT,
      counterpartyId: CP,
      currency: UZS,
      organizationId: ORG_A,
    });
    expect(Object.keys(where).sort()).toEqual([
      'accountId',
      'counterpartyId',
      'currency',
      'organizationId',
    ]);
    expect('docType' in where).toBe(false);
    // Davr filtri ham SO'ROVDA yo'q: akt qatorlari hujjatning O'Z sanasi
    // bo'yicha kesiladi (`foldJournalPeriod`), `createdAt` bo'yicha emas —
    // aks holda orqaga sanalgan hujjat o'z davridan jimgina tushib qolardi.
    expect('createdAt' in where).toBe(false);
  });

  it("`organizationId: undefined` filtrlamaydi, `null` esa org'siz qatorlarni tanlaydi", () => {
    const all = journalWhere({ accountId: ACCOUNT, counterpartyId: CP, currency: UZS });
    expect('organizationId' in all).toBe(false);
    const none = journalWhere({
      accountId: ACCOUNT,
      counterpartyId: CP,
      currency: UZS,
      organizationId: null,
    });
    expect(none.organizationId).toBeNull();
  });

  it('`opening` qatori davrdan qat’i nazar boshlang’ich qoldiqqa tushadi', () => {
    const at = new Date(Date.UTC(2026, 6, 20));
    const folded = foldJournalPeriod(
      [
        {
          organizationId: null,
          deltaMinor: 250_000n,
          docType: OPENING_DOC_TYPE,
          docId: null,
          createdAt: at,
          docMoment: null,
        },
        {
          organizationId: ORG_A,
          deltaMinor: 100_000n,
          docType: 'invoiceOut',
          docId: 'io-1',
          createdAt: at,
          docMoment: at,
        },
      ],
      new Date(Date.UTC(2026, 6, 15)),
    );
    // Backfill qatori BUGUN yozilgan, lekin davr qatoriga aylanmadi.
    expect(folded.openingMinor).toBe(250_000n);
    expect(folded.lines).toHaveLength(1);
    expect(folded.closingMinor).toBe(350_000n);
  });

  it('metrics byOrg: Σ(byOrg) == materiallashgan balans (M-07, DUP-05)', async () => {
    const { ledger, client } = makeLedgerClient();
    seed(ledger);
    const svc = new CounterpartyService({ client } as never);
    const m = await svc.metrics(ACCOUNT, CP);
    expect(m.balance.totalMinor).toBe(ledger.materialized(UZS).toString());
    const sum = m.balance.byOrg.reduce((s, r) => s + BigInt(r.amountMinor), 0n);
    expect(sum).toBe(ledger.materialized(UZS));
    // Org'siz hujjatlar (`debt`/`debtpayment`/`retailsale`/`opening`) yo'qolmaydi —
    // ular «taqsimlanmagan» qatorga tushadi.
    expect(m.balance.byOrg.some((r) => r.organizationId === null)).toBe(true);
  });

  it('akt-sverka: closing == materiallashgan balans (DUP-06)', async () => {
    const { ledger, client } = makeLedgerClient();
    seed(ledger);
    const svc = new CounterpartyActService({ client } as never);
    const a = await svc.counterpartyAct(ACCOUNT, {
      organizationId: ORG_A,
      counterpartyId: CP,
      currency: UZS,
    });
    expect(a.closingMinor).toBe(ledger.materializedByOrg(ORG_A, UZS).toString());
    const b = await svc.counterpartyAct(ACCOUNT, {
      organizationId: ORG_B,
      counterpartyId: CP,
      currency: UZS,
    });
    expect(b.closingMinor).toBe(ledger.materializedByOrg(ORG_B, UZS).toString());
    // Aktdagi qatorlar aktning O'Z qoldig'iga yig'iladi (ichki izchillik).
    expect(BigInt(a.openingMinor) + BigInt(a.totalDebitMinor) - BigInt(a.totalCreditMinor)).toBe(
      BigInt(a.closingMinor),
    );
    // `supply` ilgari aktning 8-turli ro'yxatida YO'Q edi — endi qator sifatida bor.
    expect(a.rows.map((r) => r.typeKey)).toContain('supply');
  });

  it('statement (akt-sverka Excel): finalBalance == materiallashgan balans (DUP-08)', async () => {
    const { ledger, client } = makeLedgerClient();
    seed(ledger);
    const svc = new CounterpartyStatementService({ client } as never, {} as never);
    const { data } = await svc.aggregate(ACCOUNT, CP);
    expect(data.finalBalanceMinor).toBe(ledger.materialized(UZS));
    // Qarzga sotuv va qo'lda ochilgan qarz qatorlari ham ko'rinadi.
    const types = data.lines.map((l) => l.docType);
    expect(types).toContain('debt');
    expect(types).toContain('retailsale');
  });

  it('recompute nishoni: Σ(jurnal) == materiallashgan balans', async () => {
    const { ledger, client } = makeLedgerClient();
    seed(ledger);
    const rows = await sumJournalByOrganization(client.counterpartyBalanceEntry as never, {
      accountId: ACCOUNT,
      counterpartyId: CP,
      currency: UZS,
    });
    const total = rows.reduce((s, r) => s + r.sumMinor, 0n);
    expect(total).toBe(ledger.materialized(UZS));
  });
});

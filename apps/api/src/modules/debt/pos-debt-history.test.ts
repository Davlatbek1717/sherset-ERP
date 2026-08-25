import { describe, expect, it, vi } from 'vitest';
import { type PosHistoryEntry, foldPosHistory } from './pos-debt-history.js';
import { PosDebtPaymentService } from './pos-debt-payment.service.js';

/**
 * P2 — MIJOZ KARTASIDAGI TARIX (sof qoida + servis shakli).
 *
 * Muammo (prodda o'lchangan, 2026-08-11): `CounterpartyBalanceEntry` jurnalida
 * 2 qator bor (ikkalasi ham P1 ning sinov to'lovi), `CounterpartyBalance` da
 * esa 206 qator — ya'ni kassir kartada katta qarzni ko'radi-yu, u QAYERDAN
 * kelganini ko'rsatadigan birorta qator yo'q. Backfilldan keyin har balans
 * qatori uchun `opening` qatori paydo bo'ladi va shu tarix mazmunga to'ladi.
 *
 * Bu yerda qulflanadigan shartnomalar:
 *   1. `opening` HARAKAT QATORI EMAS — u alohida «boshlang'ich qoldiq» soni.
 *      Aks holda kassir bugungi sana bilan turgan ulkan «harakat»ni ko'rardi
 *      (backfill qatorining `createdAt` i — backfill kuni).
 *   2. 🔴 `openingMinor: null` = backfill qatori YO'Q ≠ `0n` = qator bor, nol.
 *   3. Tartib — hujjatning O'Z sanasi bo'yicha (`docMoment ?? createdAt`),
 *      eng yangisi tepada. Orqaga sanalgan hujjat `createdAt` bilan noto'g'ri
 *      joyga tushardi (`foldJournalPeriod` bilan AYNAN bir qoida).
 *   4. Yorliq topilmasa qator BARIBIR chiqadi (`number: null`) — resolver
 *      shartnomasi: «xato YORLIQ, jimgina yo'qolgan qator emas».
 */

const ACC = '11111111-1111-1111-1111-111111111111';
const CP = '22222222-2222-2222-2222-222222222222';

const at = (iso: string) => new Date(iso);

function entry(over: Partial<PosHistoryEntry> = {}): PosHistoryEntry {
  return {
    deltaMinor: 100_000n,
    docType: 'retailsale',
    docId: 'rs-1',
    createdAt: at('2026-08-10T10:00:00Z'),
    ...over,
  };
}

describe('P2 — foldPosHistory: `opening` alohida, harakat emas', () => {
  it('`opening` qatori harakat ro`yxatiga TUSHMAYDI', () => {
    const fold = foldPosHistory(
      [
        entry({ docType: 'opening', docId: null, deltaMinor: 5_000_000n }),
        entry({ docType: 'retailsale', docId: 'rs-1', deltaMinor: 100_000n }),
      ],
      new Map(),
      5_000_000n,
    );

    expect(fold.lines).toHaveLength(1);
    expect(fold.lines[0]?.docType).toBe('retailsale');
    expect(fold.openingMinor).toBe(5_000_000n);
  });

  it('🔴 `openingMinor: null` = backfill qatori YO`Q («0» EMAS)', () => {
    const fold = foldPosHistory([entry()], new Map(), null);
    expect(fold.openingMinor).toBeNull();
  });

  it('nol boshlang`ich qoldiq `0n` bo`lib qaytadi (o`lchangan nol)', () => {
    const fold = foldPosHistory([entry()], new Map(), 0n);
    expect(fold.openingMinor).toBe(0n);
  });
});

describe('P2 — foldPosHistory: tartib va yorliq', () => {
  it('eng yangi harakat TEPADA', () => {
    const fold = foldPosHistory(
      [
        entry({ docId: 'eski', createdAt: at('2026-08-01T10:00:00Z') }),
        entry({ docId: 'yangi', createdAt: at('2026-08-09T10:00:00Z') }),
      ],
      new Map(),
      null,
    );

    expect(fold.lines.map((l) => l.docId)).toEqual(['yangi', 'eski']);
  });

  it('🔴 ORQAGA SANALGAN hujjat o`z sanasi bo`yicha joylashadi (`createdAt` emas)', () => {
    // `back` KEYIN yozilgan (createdAt yangi), lekin hujjat sanasi ESKI —
    // ya'ni ro'yxatda PASTDA turishi kerak.
    const resolved = new Map([
      ['invoiceOut|back', { number: 'СЧ-1', moment: at('2026-07-01T00:00:00Z') }],
      ['invoiceOut|fresh', { number: 'СЧ-2', moment: at('2026-08-05T00:00:00Z') }],
    ]);
    const fold = foldPosHistory(
      [
        entry({ docType: 'invoiceOut', docId: 'back', createdAt: at('2026-08-11T10:00:00Z') }),
        entry({ docType: 'invoiceOut', docId: 'fresh', createdAt: at('2026-08-06T10:00:00Z') }),
      ],
      resolved,
      null,
    );

    expect(fold.lines.map((l) => l.docId)).toEqual(['fresh', 'back']);
    expect(fold.lines[1]?.at).toEqual(at('2026-07-01T00:00:00Z'));
  });

  it('yorliq topilmasa qator BARIBIR chiqadi (`number: null`)', () => {
    const fold = foldPosHistory([entry({ docType: 'nomalum', docId: 'x' })], new Map(), null);

    expect(fold.lines).toHaveLength(1);
    expect(fold.lines[0]?.number).toBeNull();
  });

  it('qarz oshgani/kamaygani belgidan aniqlanadi', () => {
    const fold = foldPosHistory(
      [
        entry({ docId: 'sotuv', deltaMinor: 100_000n }),
        entry({
          docId: 'tolov',
          docType: 'debtpayment',
          deltaMinor: -40_000n,
          createdAt: at('2026-08-11T10:00:00Z'),
        }),
      ],
      new Map(),
      null,
    );

    expect(fold.lines.map((l) => [l.docId, l.increase])).toEqual([
      ['tolov', false],
      ['sotuv', true],
    ]);
  });
});

// ─────────────────────────── servis shakli ──────────────────────────────────

interface JournalRow {
  organizationId: string | null;
  deltaMinor: bigint;
  docType: string;
  docId: string | null;
  createdAt: Date;
}

function makeService(rows: JournalRow[], openingSum: bigint | null, total = rows.length) {
  // Test-double `take` ni HURMAT QILADI — aks holda «hasMore» shartnomasi
  // fixture bilan ziddiyatga tushardi (sahifa to'lgani yolg'on ko'rinardi).
  const findMany = vi.fn(async (args: { take: number }) => rows.slice(0, args.take));
  const aggregate = vi.fn(async () => ({ _sum: { deltaMinor: openingSum } }));
  const count = vi.fn(async () => total);
  const prisma = {
    client: {
      counterparty: { findFirst: vi.fn(async () => ({ id: CP, name: 'Alisher' })) },
      counterpartyBalanceEntry: { findMany, aggregate, count },
      debtPayment: { findMany: vi.fn(async () => []) },
      debt: { findMany: vi.fn(async () => []) },
      retailSale: { findMany: vi.fn(async () => []) },
      invoiceOut: { findMany: vi.fn(async () => []) },
      invoiceIn: { findMany: vi.fn(async () => []) },
      supply: { findMany: vi.fn(async () => []) },
      purchaseReturn: { findMany: vi.fn(async () => []) },
      paymentIn: { findMany: vi.fn(async () => []) },
      paymentOut: { findMany: vi.fn(async () => []) },
      cashIn: { findMany: vi.fn(async () => []) },
      cashOut: { findMany: vi.fn(async () => []) },
      prepayment: { findMany: vi.fn(async () => []) },
      prepaymentReturn: { findMany: vi.fn(async () => []) },
      counterpartyAdjustment: { findMany: vi.fn(async () => []) },
    },
  };
  const service = new PosDebtPaymentService(prisma as never, {} as never, {} as never);
  return { service, findMany, aggregate, count };
}

const ROW: JournalRow = {
  organizationId: null,
  deltaMinor: 100_000n,
  docType: 'retailsale',
  docId: 'rs-1',
  createdAt: at('2026-08-10T10:00:00Z'),
};

describe('P2 — PosDebtPaymentService.history', () => {
  it('jurnal so`rovi `docType` bo`yicha FILTRLAMAYDI (chala-ro`yxat bug-klassi)', async () => {
    const { service, findMany } = makeService([ROW], null);
    await service.history(ACC, CP, 'UZS');

    const where = findMany.mock.calls[0]?.[0]?.where ?? {};
    expect('docType' in where).toBe(false);
    expect(where).toMatchObject({ accountId: ACC, counterpartyId: CP, currency: 'UZS' });
  });

  it('qatorlar string bo`lib qaytadi va `openingMinor` alohida turadi', async () => {
    const { service } = makeService([ROW], 5_000_000n);
    const h = await service.history(ACC, CP, 'UZS');

    expect(h.openingMinor).toBe('5000000');
    expect(h.entries).toHaveLength(1);
    expect(h.entries[0]).toMatchObject({ deltaMinor: '100000', docType: 'retailsale' });
  });

  it('🔴 `opening` qatori YO`Q bo`lsa `openingMinor: null` («0» EMAS)', async () => {
    const { service } = makeService([ROW], null);
    const h = await service.history(ACC, CP, 'UZS');
    expect(h.openingMinor).toBeNull();
  });

  it('sahifa to`lib toshsa `hasMore`, va jami son alohida ko`rinadi', async () => {
    // 25 qator, limit 20 ⇒ servis 21 tasini so'raydi, 21-si «yana bor» degani.
    const many = Array.from({ length: 25 }, (_, i) => ({
      ...ROW,
      docId: `rs-${i}`,
      createdAt: at(`2026-08-${String(i + 1).padStart(2, '0')}T10:00:00Z`),
    }));
    const { service } = makeService(many, null, 25);
    const h = await service.history(ACC, CP, 'UZS', 20);

    expect(h.entries).toHaveLength(20);
    expect(h.hasMore).toBe(true);
    expect(h.totalCount).toBe(25);
  });

  it('sahifa to`lmasa `hasMore: false`', async () => {
    const { service } = makeService([ROW], null, 1);
    const h = await service.history(ACC, CP, 'UZS', 20);

    expect(h.hasMore).toBe(false);
  });

  it('limit chegaralanadi (kassir ekrani cheksiz so`rov yubormaydi)', async () => {
    const { service, findMany } = makeService([ROW], null);
    await service.history(ACC, CP, 'UZS', 10_000);

    expect(findMany.mock.calls[0]?.[0]?.take).toBeLessThanOrEqual(101);
  });
});

/**
 * A3 (2026-08-25, reja A3 vazifasi 3) — AVANS QATORLARI TARIXDA
 * AVTOMATIK KO'RINADI: yozma tasdiq, test bilan.
 *
 * Reja «mavjud `GET /debts/pos/history/:cpId` yangi `docType` larni
 * AVTOMATIK ko'rsatadi — tekshirilsin va hisobotda yozma tasdiqlansin»
 * degan edi. Tasdiq shu yerda MEXANIK: `foldPosHistory` (va uni
 * chaqiradigan `history()`) qatorlarni `docType` bo'yicha UMUMAN
 * filtrlamaydi, ya'ni A1 (`customerPrepay`), A2 (`salePrepay`) va A3
 * (`customerPrepayRefund`) turlari kod o'zgarmasdan chiqadi.
 *
 * Bu — «chala-ro'yxat» bug-klassining qo'riqchisi: agar kimdir bu yerga
 * «ma'lum turlar» ro'yxatini kiritsa, test qizil bo'ladi.
 */
describe('A3 — avans turlari tarixda filtrlanmaydi', () => {
  const at = (d: string) => new Date(d);

  it('uchala yangi tur ham ro`yxatda qoladi (docType filtri YO`Q)', () => {
    const fold = foldPosHistory(
      [
        // A1 — avans qabul qilindi (balans manfiy tomonga surildi).
        {
          deltaMinor: -100_000n,
          docType: 'customerPrepay',
          docId: 'in-1',
          createdAt: at('2026-08-25T09:00:00Z'),
        },
        // A2 — avansdan to'landi.
        {
          deltaMinor: 60_000n,
          docType: 'salePrepay',
          docId: 'sale-1',
          createdAt: at('2026-08-25T10:00:00Z'),
        },
        // A3 — qolgani naqd qaytarildi.
        {
          deltaMinor: 40_000n,
          docType: 'customerPrepayRefund',
          docId: 'out-1',
          createdAt: at('2026-08-25T11:00:00Z'),
        },
      ],
      new Map(),
      null,
    );
    // Tartib — YANGISIDAN eskisiga (kartadagi ro'yxat shunday chiziladi).
    expect(fold.lines.map((l) => l.docType)).toEqual([
      'customerPrepayRefund',
      'salePrepay',
      'customerPrepay',
    ]);
  });

  it('ishora konvensiyasi to`g`ri: qabul KAMAYTIRADI, sarf va qaytarish OSHIRADI', () => {
    // Kassir ekranda «+» / «−» ni AYNAN shu maydondan oladi (ekran qayta
    // hisoblamaydi) — avans qabuli mijozning qarzini kamaytiradi.
    const fold = foldPosHistory(
      [
        {
          deltaMinor: -100_000n,
          docType: 'customerPrepay',
          docId: 'in-1',
          createdAt: at('2026-08-25T09:00:00Z'),
        },
        {
          deltaMinor: 40_000n,
          docType: 'customerPrepayRefund',
          docId: 'out-1',
          createdAt: at('2026-08-25T11:00:00Z'),
        },
      ],
      new Map(),
      null,
    );
    // Ro'yxat yangisidan eskisiga: avval qaytarish (+), keyin qabul (−).
    expect(fold.lines.map((l) => l.increase)).toEqual([true, false]);
  });
});

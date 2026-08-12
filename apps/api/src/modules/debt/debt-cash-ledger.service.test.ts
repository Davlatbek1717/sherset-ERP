import { BadRequestException, Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DebtService } from './debt.service.js';

/**
 * Faza 11 — `M-05`, `DebtService` tomoni: kassir to'lovi va IKKALA STORNO yo'li.
 *
 * POS to'lovi (`pos-debt-payment.service.test.ts`) yashiqni kreditlaydi. Uni
 * QAYTARADIGAN kod esa shu yerda: `reversePayment` (kassir/rahbar stornosi) va
 * `cancelCallNote` (qo'ng'iroq natijasi bekor qilinganda bog'langan to'lov ham
 * storno bo'ladi). Agar faqat yozuv tomoni qo'shilib, storno tomoni unutilsa —
 * qaytarilgan pul yashiq qoldig'ida ABADIY qolib ketardi, ya'ni `M-05`'ning
 * o'zi teskari yo'nalishda qayta tug'ilardi.
 *
 * `addCashPayment` ham shu yerda: u ham `cashDeskId` bilan naqd qabul qiladi
 * (aynan o'sha jismoniy hodisa) va storno predikati uni ham qamrab olgani
 * uchun yozuv tomoni ham bo'lishi SHART — aks holda hech qachon kreditlanmagan
 * yashiq debetlanardi.
 *
 * NON-VACUOUS: tuzatishdan oldin `cashDeltas` HAMMA testda bo'sh.
 */

const ACC = 'acc-1';
const CP = 'cp-1';
const DEBT = 'debt-1';
/** Schema-valid uuid — `CreateCashPaymentSchema.cashDeskId` is `.uuid()`. */
const DESK = '44444444-4444-4444-4444-444444444444';

interface PaymentRow {
  id: string;
  amountMinor: bigint;
  method: string;
  cashDeskId: string | null;
  currency: string;
  amountOriginalMinor: bigint | null;
  batchId: string | null;
  reversedAt: Date | null;
  receivedById: string;
  sourceName: string | null;
  /** POS to'lovi qaysi smenada qabul qilingan (NULL = POS'dan tashqarida). */
  retailShiftId: string | null;
}

function makeSvc(
  opts: {
    totalMinor?: bigint;
    seedPayment?: Partial<PaymentRow>;
    /**
     * Faza 11'dan OLDIN yozilgan to'lov: yashiqqa hech qachon kreditlanmagan,
     * ya'ni daftarda mos `MoneyOperation` yo'q.
     */
    legacyNoLedgerRow?: true;
    /**
     * `CashDesk.currency` — YASHIQ valyutasi (to'lov valyutasi EMAS).
     *
     * Sukut 'UZS' = to'lov bilan mos. `'USD'` bersa yashiq boshqa valyutada
     * bo'ladi va `debt-cash-ledger.ts` qoidasi bo'yicha pul bu daftarga
     * TUSHMAYDI. Bu knob'siz butun `deskCurrency` simi qo'riqsiz qolardi:
     * mock har doim 'UZS' qaytarsa, xizmat `deskCurrency: payment.currency`
     * (aynan eski BUG) deb yozilganda ham hamma test yashil bo'lib turardi.
     */
    deskCurrency?: string;
    /**
     * `CashierSession.state` — to'lov qabul qilingan SMENA holati.
     *
     * `undefined` = smena qatori bazada TOPILMAYDI (`findFirst → null`): eski
     * yoki o'chib ketgan sessiyaga ishora. `'open'`/`'closed'` bersa qator
     * shu holatda topiladi.
     */
    shiftState?: 'open' | 'closed';
    /**
     * 🔴 POYGA modeli. `reversePayment` tashqarida O'QIGAN nusxada `reversedAt`
     * hali `null`, bazadagi qatorda esa raqib tranzaksiya uni allaqachon
     * qo'ygan. Ya'ni ikkinchi storno tashqi tez-yo'l tekshiruvidan JIM o'tadi
     * va faqat tranzaksiya ichidagi shartli claim to'xtatishi mumkin.
     */
    staleUnreversedSnapshot?: true;
    /**
     * `cancelCallNote` uchun ayni poyga: yozuv bazada ALLAQACHON bekor
     * qilingan, tashqi o'qish esa `canceledAt: null` ko'radi.
     */
    staleUncanceledNoteSnapshot?: true;
  } = {},
) {
  const deskCurrency = opts.deskCurrency ?? 'UZS';
  const debtRow = {
    id: DEBT,
    accountId: ACC,
    counterpartyId: CP,
    name: 'QRZ-1',
    totalMinor: opts.totalMinor ?? 100_000n,
    paidMinor: 0n,
    currency: 'UZS',
    status: 'unpaid',
    nextContactAt: null as Date | null,
    closedAt: null as Date | null,
    lastCallAt: null as Date | null,
    lastCallOutcome: null as string | null,
    callRemindedAt: null as Date | null,
    deletedAt: null as Date | null,
  };

  const payments: PaymentRow[] = [];
  if (opts.seedPayment) {
    payments.push({
      id: 'pay-seed',
      amountMinor: 30_000n,
      method: 'cash',
      cashDeskId: DESK,
      currency: 'UZS',
      amountOriginalMinor: null,
      batchId: null,
      reversedAt: null,
      receivedById: 'u1',
      sourceName: 'Kassa 1',
      retailShiftId: null,
      ...opts.seedPayment,
    });
    debtRow.paidMinor = payments[0]?.amountMinor ?? 0n;
    debtRow.status = 'partial';
  }

  /**
   * `cancelCallNote` bekor qiladigan qo'ng'iroq natijasi. `canceledAt` REAL
   * holat: yozuv-claim shu qiymatga qaraydi (poyga testi shuni ishlatadi).
   */
  const noteRow = { id: 'note-1', canceledAt: null as Date | null };
  if (opts.staleUncanceledNoteSnapshot) {
    noteRow.canceledAt = new Date('2026-08-12T09:00:00Z');
  }

  // Kassa daftari — yozilgan qatorlar shu yerda «saqlanadi», storno esa
  // aynan shundan mos kreditni qidiradi (migratsiya-qo'riqchisi).
  // Kassa daftari. `cashDeltas` — test tekshiradigan harakatlar; `ledgerRows`
  // — «bazadagi» MoneyOperation qatorlari: storno aynan shundan mos kreditni
  // qidiradi (Faza 11 migratsiya-qo'riqchisi).
  const cashDeltas: Array<Record<string, unknown>> = [];
  const ledgerRows: Array<Record<string, unknown>> = [];
  const money = {
    applyDeltas: vi.fn(async (_tx: unknown, _acc: string, ds: Array<Record<string, unknown>>) => {
      cashDeltas.push(...ds);
      ledgerRows.push(...ds);
    }),
  };
  const seeded = payments[0];
  if (!opts.legacyNoLedgerRow && seeded?.cashDeskId && seeded.method === 'cash') {
    ledgerRows.push({
      documentKind: 'debtpayment',
      documentId: seeded.batchId ?? seeded.id,
      cashDeskId: seeded.cashDeskId,
      deltaMinor: seeded.amountMinor,
    });
  }
  const balances = { applyDelta: vi.fn(async () => undefined) };

  const paymentDelegate = {
    create: async (args: { data: Record<string, unknown> }) => {
      const row: PaymentRow = {
        id: `pay-${payments.length + 1}`,
        amountMinor: 0n,
        method: 'cash',
        cashDeskId: null,
        currency: 'UZS',
        amountOriginalMinor: null,
        reversedAt: null,
        receivedById: 'u1',
        sourceName: null,
        retailShiftId: null,
        ...(args.data as unknown as Partial<PaymentRow>),
      };
      payments.push(row);
      return { ...row };
    },
    update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = payments.find((p) => p.id === args.where.id);
      if (!row) throw new Error('payment not found');
      Object.assign(row, args.data);
      return { ...row };
    },
    /**
     * SHARTLI claim — `where` HAQIQATAN filtrlaydi (`reversedAt: null` ni
     * ham). Aks holda soxta qatlam «atomik» kodni ham, shartsiz `update` ni
     * ham bir xil yashil ko'rsatardi va poyga testi bo'shab qolardi.
     */
    updateMany: async (args: {
      where: { id: string; accountId?: string; reversedAt?: null };
      data: Record<string, unknown>;
    }) => {
      const matched = payments.filter(
        (p) =>
          p.id === args.where.id &&
          (!('reversedAt' in args.where) || p.reversedAt === args.where.reversedAt),
      );
      for (const row of matched) Object.assign(row, args.data);
      return { count: matched.length };
    },
    aggregate: async () => ({
      _sum: {
        amountMinor: payments
          .filter((p) => p.reversedAt === null)
          .reduce((a, p) => a + p.amountMinor, 0n),
      },
    }),
    findFirst: async (args: { where: { id: string } }) => {
      const row = payments.find((p) => p.id === args.where.id);
      if (!row) return null;
      const snapshot = opts.staleUnreversedSnapshot ? { ...row, reversedAt: null } : { ...row };
      return { ...snapshot, receivedBy: { name: 'Kassir' } };
    },
  };

  const tx = {
    // `addCashPayment` endi yozishdan oldin qarz qatorini FOR UPDATE bilan
    // qulflaydi (check-then-write race tuzatishi). Bu SERIAL double — qulf
    // semantikasi shart emas, faqat qator topilganini qaytaramiz; race'ning
    // o'zi `debt-cash-payment-lock.test.ts` da modellangan.
    $queryRaw: async () => [{ id: DEBT }],
    moneyOperation: {
      findFirst: async (args: {
        where: { documentId: string; cashDeskId: string | null; deltaMinor: { gt: bigint } };
      }) =>
        ledgerRows.find(
          (r) =>
            r.documentId === args.where.documentId &&
            r.cashDeskId === args.where.cashDeskId &&
            (r.deltaMinor as bigint) > args.where.deltaMinor.gt,
        ) ?? null,
    },
    // Storno endi yashiq VALYUTASINI o'qiydi (`debt-cash-ledger.deskCurrency`):
    // kassa boshqa valyutada bo'lsa teskari harakat ham yozilmaydi.
    cashDesk: { findFirst: async () => ({ currency: deskCurrency }) },
    // Storno smena holatini o'qiydi: yopilgan smenaning muzlatilgan farq akti
    // retroaktiv buzilmasin (`undefined` = qator topilmadi).
    cashierSession: {
      findFirst: async () => (opts.shiftState ? { state: opts.shiftState } : null),
    },
    debtPayment: paymentDelegate,
    debtNote: {
      create: async () => ({ id: 'note-2' }),
      update: async () => ({ id: 'note-1' }),
      /**
       * Ikki xil chaqiruv shu delegatga tushadi va ular FARQLANADI:
       *  · `where.id` — `cancelCallNote` ning yozuv-claim'i (bitta «note-1»
       *    qatori bor, `canceledAt` sharti haqiqatan tekshiriladi);
       *  · `where.paymentId` — `reversePayment` ning ommaviy bekor qilishi
       *    (bu harness'da bog'langan natija-yozuv yo'q ⇒ 0).
       */
      updateMany: async (args: {
        where: { id?: string; paymentId?: string; canceledAt?: null };
        data: Record<string, unknown>;
      }) => {
        if (args.where.id !== 'note-1') return { count: 0 };
        if ('canceledAt' in args.where && noteRow.canceledAt !== args.where.canceledAt) {
          return { count: 0 };
        }
        Object.assign(noteRow, args.data);
        return { count: 1 };
      },
      findFirst: async () => null,
    },
    debt: {
      findFirstOrThrow: async () => ({ ...debtRow }),
      findFirst: async () => ({ ...debtRow }),
      update: async (args: { data: Record<string, unknown> }) => {
        for (const [k, v] of Object.entries(args.data)) {
          if (v === undefined) continue;
          (debtRow as unknown as Record<string, unknown>)[k] = v;
        }
        return { ...debtRow };
      },
    },
  };

  const client = {
    debt: { findFirst: async () => ({ ...debtRow }) },
    cashDesk: { findFirst: async () => ({ name: 'Kassa 1', currency: deskCurrency }) },
    debtPayment: paymentDelegate,
    debtNote: {
      findFirst: async (args: { where: { id?: string } }) => {
        if (args.where.id !== 'note-1') return null;
        const seed = payments[0];
        return {
          id: 'note-1',
          kind: 'call',
          outcome: 'paid_partial',
          // Tashqi o'qish — poyga rejimida «hali bekor qilinmagan» ko'rinadi.
          canceledAt: opts.staleUncanceledNoteSnapshot ? null : noteRow.canceledAt,
          authorId: 'u1',
          payment: seed
            ? { ...seed, ...(opts.staleUnreversedSnapshot ? { reversedAt: null } : {}) }
            : null,
        };
      },
    },
    $transaction: async <T>(fn: (t: unknown) => Promise<T>) => fn(tx),
  };

  const svc = new DebtService(
    { client } as never,
    undefined as never, // attachments
    undefined as never, // htmlPdf
    balances as never,
    { notifyCounterparty: vi.fn() } as never, // telegram
    undefined as never, // sms
    undefined as never, // msgTemplates
    money as never,
  );

  return { svc, cashDeltas, payments, debtRow };
}

describe('DebtService.addCashPayment — kassa daftari (M-05)', () => {
  it('naqd + kassa ⇒ yashiq kreditlanadi', async () => {
    const { svc, cashDeltas, payments } = makeSvc();

    await svc.addCashPayment(ACC, 'u1', DEBT, {
      amountMinor: '100000',
      method: 'cash',
      cashDeskId: DESK,
    });

    expect(cashDeltas).toHaveLength(1);
    expect(cashDeltas[0]).toMatchObject({
      sourceKind: 'cash_desk',
      sourceId: DESK,
      deltaMinor: 100_000n,
      documentKind: 'debtpayment',
      documentId: payments[0]?.id,
      counterpartyId: CP,
    });
  });

  it("terminal to'lovi yashiqqa tushmaydi", async () => {
    const { svc, cashDeltas } = makeSvc();

    await svc.addCashPayment(ACC, 'u1', DEBT, {
      amountMinor: '100000',
      method: 'terminal',
      cashDeskId: DESK,
    });

    expect(cashDeltas).toHaveLength(0);
  });

  it("kassasiz naqd to'lov yozilmaydi", async () => {
    const { svc, cashDeltas } = makeSvc();

    await svc.addCashPayment(ACC, 'u1', DEBT, { amountMinor: '100000', method: 'cash' });

    expect(cashDeltas).toHaveLength(0);
  });

  /**
   * 🔴 YASHIQ VALYUTASI SIMI — `addCashPayment` yo'li (fix-round I-2).
   *
   * IKKI pul-yozuvchi yo'l bor (`pos-debt-payment.pay` va shu yer) va ular
   * BIR XIL predikatdan yurishi kerak. POS yo'li `pos-debt-payment.usd.test.ts`
   * da qulflangan, bu yo'l esa qulfsiz edi: mock har doim `{currency:'UZS'}`
   * qaytarardi va to'lov ham UZS bo'lgani uchun `deskCurrency: payment.currency`
   * (AYNAN tuzatilgan bug) yozilsa ham 247 test yashil qolardi.
   *
   * MUTANT: `debt.service.ts` da `deskCurrency` o'rniga `payment.currency`
   * yozilsa yoki `debt-cash-ledger.ts` dagi valyuta sharti o'chirilsa — shu
   * test QIZIL bo'ladi.
   */
  it('🔴 USD kassa + SO`M to`lovi ⇒ yashiqqa TUSHMAYDI (valyuta simi qulfi)', async () => {
    const { svc, cashDeltas, payments } = makeSvc({ deskCurrency: 'USD' });

    await svc.addCashPayment(ACC, 'u1', DEBT, {
      amountMinor: '100000',
      method: 'cash',
      cashDeskId: DESK,
    });

    // To'lovning O'ZI yozildi (kassirning ishi to'xtamaydi)…
    expect(payments).toHaveLength(1);
    expect(payments[0]?.currency).toBe('UZS');
    // …lekin bitta-valyutali yashiq bu pulni ko'rmaydi (`MoneyService` aks
    // holda «Currency mismatch» bilan BUTUN to'lovni orqaga qaytarardi).
    expect(cashDeltas).toHaveLength(0);
  });
});

describe('DebtService storno — yashiqdan qaytarish (M-05 simmetriyasi)', () => {
  it('reversePayment naqd to`lovni yashiqdan chiqaradi', async () => {
    const { svc, cashDeltas } = makeSvc({ seedPayment: {} });

    await svc.reversePayment(ACC, 'u1', 'cashier', DEBT, 'pay-seed', { reason: 'xato summa' });

    expect(cashDeltas).toHaveLength(1);
    expect(cashDeltas[0]).toMatchObject({
      sourceKind: 'cash_desk',
      sourceId: DESK,
      deltaMinor: -30_000n,
      documentKind: 'debtpayment',
      documentId: 'pay-seed',
    });
  });

  it('terminal to`lov stornosi yashiqqa tegmaydi', async () => {
    const { svc, cashDeltas } = makeSvc({ seedPayment: { method: 'terminal' } });

    await svc.reversePayment(ACC, 'u1', 'cashier', DEBT, 'pay-seed', { reason: 'xato' });

    expect(cashDeltas).toHaveLength(0);
  });

  it('kassasiz naqd to`lov stornosi ham yashiqqa tegmaydi (hech qachon kirmagan)', async () => {
    const { svc, cashDeltas } = makeSvc({ seedPayment: { cashDeskId: null } });

    await svc.reversePayment(ACC, 'u1', 'cashier', DEBT, 'pay-seed', { reason: 'xato' });

    expect(cashDeltas).toHaveLength(0);
  });

  it('Faza 11`dan OLDINGI to`lov stornosi yashiqqa TEGMAYDI (migratsiya-qo`riqchisi)', async () => {
    // Prod bazada yashiqqa hech qachon kreditlanmagan yuzlab naqd qator bor.
    // Ularni bugun storno qilganda pulni chiqarib yuborsak — qoldiq noto'g'ri
    // kamayadi, yomon holatda overdraft qo'riqchisi stornoning O'ZINI bloklaydi.
    const { svc, cashDeltas } = makeSvc({ seedPayment: {}, legacyNoLedgerRow: true });

    await svc.reversePayment(ACC, 'u1', 'cashier', DEBT, 'pay-seed', { reason: 'eski xato' });

    expect(cashDeltas).toHaveLength(0);
  });

  it('POS to`lovi stornosi PKO cheki (batchId) ostiga tushadi', async () => {
    const { svc, cashDeltas } = makeSvc({
      seedPayment: { batchId: '55555555-5555-5555-5555-555555555555' },
    });

    await svc.reversePayment(ACC, 'u1', 'cashier', DEBT, 'pay-seed', { reason: 'xato' });

    // Kredit chek ostida yozilgan edi — debet ham o'sha yerda bo'lsin, aks
    // holda daftar ikki uchini bir-biriga ulab bo'lmaydi.
    expect(cashDeltas[0]).toMatchObject({
      documentId: '55555555-5555-5555-5555-555555555555',
      deltaMinor: -30_000n,
    });
  });

  it("cancelCallNote bog'langan naqd to'lovni ham yashiqdan chiqaradi", async () => {
    const { svc, cashDeltas, payments } = makeSvc({ seedPayment: {} });

    await svc.cancelCallNote(ACC, 'u1', 'operator', DEBT, 'note-1', { reason: 'xato natija' });

    expect(cashDeltas).toHaveLength(1);
    expect(cashDeltas[0]).toMatchObject({ deltaMinor: -30_000n, documentId: 'pay-seed' });
    // Storno muhri AYNI qulf orqali qo'yiladi (shartsiz `update` emas).
    expect(payments[0]?.reversedAt).not.toBeNull();
  });

  /**
   * 🔴 IKKINCHI KIRISH NUQTASI HAM QULFLANGAN (fix-round I-1).
   *
   * `cancelCallNote` ham `reverseCashDeskDelta` ni chaqiradi, ya'ni qulf faqat
   * `reversePayment` ga qo'yilsa yashiqdan pul HAMON ikki marta chiqishi
   * mumkin edi: `reversePayment` yutadi, `cancelCallNote` esa o'zining tashqi
   * `!note.payment.reversedAt` tekshiruvidan o'tib ikkinchi debetni yozardi.
   *
   * MUTANT: `cancelCallNote` helper chaqirig'i o'rniga eski shartsiz
   * `tx.debtPayment.update` qaytarilsa, yoki helper'ning O'ZI no-op qilinsa —
   * shu test QIZIL.
   */
  it('🔴 cancelCallNote: raqib storno ulgurgan bo`lsa xato otiladi, delta TUSHMAYDI', async () => {
    const { svc, cashDeltas, payments } = makeSvc({
      seedPayment: { reversedAt: new Date('2026-08-12T09:00:00Z') },
      staleUnreversedSnapshot: true,
    });

    await expect(
      svc.cancelCallNote(ACC, 'u1', 'operator', DEBT, 'note-1', { reason: 'xato natija' }),
    ).rejects.toThrow(BadRequestException);

    expect(cashDeltas).toHaveLength(0);
    expect(payments[0]?.reversedAt).toEqual(new Date('2026-08-12T09:00:00Z'));
  });

  /**
   * 🔴 `cancelCallNote` ham yopilgan smenani buzmaydi (fix-round I-1).
   *
   * Bu yo'l ham yashiqqa tegadi, ya'ni yopilgan smenaning muzlatilgan farq
   * aktini xuddi shunday yolg'onga chiqarardi. Qo'riqchi bitta joyda
   * (`claimPaymentForReversal`) turgani uchun ikkala yo'l bir xil rad etadi.
   */
  it('🔴 cancelCallNote: yopilgan smenadagi to`lov stornosi BLOKLANADI', async () => {
    const { svc, cashDeltas } = makeSvc({
      seedPayment: { retailShiftId: 'shift-1' },
      shiftState: 'closed',
    });

    await expect(
      svc.cancelCallNote(ACC, 'u1', 'operator', DEBT, 'note-1', { reason: 'xato natija' }),
    ).rejects.toThrow(/Smena yopilgan/);

    expect(cashDeltas).toHaveLength(0);
  });

  it('cancelCallNote: OCHIQ smenada normal o`tadi', async () => {
    const { svc, cashDeltas } = makeSvc({
      seedPayment: { retailShiftId: 'shift-1' },
      shiftState: 'open',
    });

    await svc.cancelCallNote(ACC, 'u1', 'operator', DEBT, 'note-1', { reason: 'xato natija' });

    expect(cashDeltas).toHaveLength(1);
  });

  /**
   * Yozuvning O'ZI ham atomik da'vo bilan bekor qilinadi: ikki parallel bekor
   * qilish ikki «QO'NG'IROQ NATIJASI BEKOR QILINDI» yozuvini tug'dirmasin va
   * `cancelReason` raqibning sababi ustiga yozilmasin.
   */
  it('cancelCallNote: yozuv allaqachon bekor qilingan bo`lsa (poyga) xato otiladi', async () => {
    const { svc, cashDeltas } = makeSvc({
      seedPayment: {},
      staleUncanceledNoteSnapshot: true,
    });

    await expect(
      svc.cancelCallNote(ACC, 'u1', 'operator', DEBT, 'note-1', { reason: 'ikkinchi urinish' }),
    ).rejects.toThrow(BadRequestException);

    expect(cashDeltas).toHaveLength(0);
  });

  /**
   * 🔴 «KREDIT BOR, DEBET CHIQMADI» — jim o'tmaydi (fix-round I-1 dan oldingi round).
   *
   * `CashDesk.currency` keyinchalik o'zgartirilishi mumkin (`cash-desk.service`
   * da «qoldiq nolmi» degan qo'riqchi YO'Q). Shunda UZS kredit kirgan yashiq
   * USD bo'lib turadi: valyuta sharti deltalarni bo'sh qaytaradi, ya'ni pulni
   * chiqarib bo'lmaydi (`MoneyService` boshqa valyutali deltani rad etadi).
   *
   * Ikki narsa AYNI PAYTDA talab qilinadi:
   *  1. storno BLOKLANMAYDI — operator xato to'lovni qaytara olishi kerak
   *     (`reversedAt` qo'yiladi, kontragent balansi qaytadi);
   *  2. lekin JIM ham qolmaydi — `logger.error` iz qoldiradi, aks holda
   *     yashiqdagi pul abadiy «ortiqcha» bo'lib qolar va hech kim bilmasdi.
   *
   * MUTANT: `debt.service.ts` da `logger.error(...)` o'chirilsa yoki
   * `wasWritten` tekshiruvi yana `deltas.length === 0` dan KEYINGA qaytarilsa
   * (o'sha holda bu shoxga umuman kirilmaydi) — shu test QIZIL bo'ladi.
   */
  /**
   * 🔴 IKKI PARALLEL STORNO — yashiqdan pul IKKI MARTA chiqmaydi (Faza 2).
   *
   * `reversedAt` tekshiruvi tranzaksiyadan TASHQARIDA o'qilgan nusxa ustida
   * ishlaydi, `reverseCashDeskDelta` esa har chaqiruvda `−amount` yozadi. Ikki
   * tab (yoki timeout keyin retry) ikkalasi ham tashqi tekshiruvdan o'tsa,
   * shartsiz `update` ikkinchi debetni ham yozib yuborardi.
   *
   * Bu yerda ATOMIKLIK EMAS, uning KO'RINADIGAN oqibati o'lchanadi: tashqi
   * nusxa «qaytarilmagan» deb turganda ham (raqib allaqachon qo'ygan) storno
   * XATO bilan to'xtaydi va yashiqqa BITTA ham delta tushmaydi.
   *
   * MUTANT: claim'dan `reversedAt: null` sharti olib tashlansa yoki
   * `count === 0` shoxi o'chirilsa — shu test QIZIL.
   */
  it('🔴 raqib storno ulgurgan bo`lsa: xato otiladi, yashiqqa delta TUSHMAYDI', async () => {
    const { svc, cashDeltas, payments } = makeSvc({
      // Bazadagi qator ALLAQACHON storno (raqib tranzaksiya)…
      seedPayment: { reversedAt: new Date('2026-08-12T09:00:00Z') },
      // …lekin bizning tashqi o'qishimiz uni `null` ko'rgan.
      staleUnreversedSnapshot: true,
    });

    await expect(
      svc.reversePayment(ACC, 'u1', 'cashier', DEBT, 'pay-seed', { reason: 'ikkinchi urinish' }),
    ).rejects.toThrow(BadRequestException);

    // Kredit daftarda BOR (legacy emas), ya'ni qo'riqchi bo'lmasa aynan shu
    // yerda ikkinchi `−30 000` yozilardi.
    expect(cashDeltas).toHaveLength(0);
    // Raqibning muhri o'zgarmadi — bizning `reversedById` ustiga yozilmadi.
    expect(payments[0]?.reversedAt).toEqual(new Date('2026-08-12T09:00:00Z'));
  });

  /**
   * 🔴 YOPILGAN SMENA — muzlatilgan farq akti retroaktiv buzilmaydi (Faza 2).
   *
   * Smena yopilganda kutilgan naqd MUZLATILADI (`expectedCashMinor` +
   * `CashierSessionVariance`), keyingi hisoblar esa `reversedAt: null`
   * filtridan qayta yig'iladi. Yopilgan smenadagi to'lovni storno qilish
   * kutilgan naqdni pasaytirib, muzlatilgan aktni yolg'onga chiqaradi:
   * farqsiz yopilgan smena keyin «ortiqcha» ko'rsatardi.
   *
   * MUTANT: smena qo'riqchisi o'chirilsa yoki shart `state !== 'open'` dan
   * boshqasiga aylantirilsa — shu test QIZIL.
   */
  it('🔴 yopilgan smenadagi to`lov stornosi BLOKLANADI', async () => {
    const { svc, cashDeltas } = makeSvc({
      seedPayment: { retailShiftId: 'shift-1' },
      shiftState: 'closed',
    });

    await expect(
      svc.reversePayment(ACC, 'u1', 'cashier', DEBT, 'pay-seed', { reason: 'xato summa' }),
    ).rejects.toThrow(/Smena yopilgan/);

    expect(cashDeltas).toHaveLength(0);
  });

  it('OCHIQ smenadagi to`lov stornosi normal o`tadi', async () => {
    const { svc, cashDeltas, payments } = makeSvc({
      seedPayment: { retailShiftId: 'shift-1' },
      shiftState: 'open',
    });

    await svc.reversePayment(ACC, 'u1', 'cashier', DEBT, 'pay-seed', { reason: 'xato summa' });

    expect(payments[0]?.reversedAt).not.toBeNull();
    expect(cashDeltas).toHaveLength(1);
    expect(cashDeltas[0]).toMatchObject({ deltaMinor: -30_000n });
  });

  /**
   * Smena qatori TOPILMASA storno bloklanmaydi: «o'lchanmagan» holat (eski yoki
   * o'chib ketgan sessiyaga ishora qilgan `retailShiftId`) operatorning xato
   * to'lovni qaytarish huquqini olib qo'ymasligi kerak — aks holda qo'riqchi
   * o'zi yangi tuzoq bo'lib qolardi.
   */
  it('smena qatori topilmasa storno BLOKLANMAYDI (o`lchanmagan ≠ yopilgan)', async () => {
    const { svc, cashDeltas, payments } = makeSvc({
      seedPayment: { retailShiftId: 'shift-yoq' },
      // shiftState berilmadi ⇒ `cashierSession.findFirst` null qaytaradi.
    });

    await svc.reversePayment(ACC, 'u1', 'cashier', DEBT, 'pay-seed', { reason: 'xato summa' });

    expect(payments[0]?.reversedAt).not.toBeNull();
    expect(cashDeltas).toHaveLength(1);
  });

  it('kassa valyutasi O`ZGARIB ketgan bo`lsa: storno o`tadi, lekin XATO qayd etiladi', async () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      // Kredit daftarda BOR (`legacyNoLedgerRow` berilmagan) — to'lov UZS,
      // yashiq esa bugun USD.
      const { svc, cashDeltas, payments } = makeSvc({ seedPayment: {}, deskCurrency: 'USD' });

      await svc.reversePayment(ACC, 'u1', 'cashier', DEBT, 'pay-seed', { reason: 'xato summa' });

      // Storno bajarildi…
      expect(payments[0]?.reversedAt).not.toBeNull();
      // …yashiqqa tegilmadi…
      expect(cashDeltas).toHaveLength(0);
      // …va bu JIMGINA emas: nomuvofiqlik jurnalda.
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0]?.[0])).toContain('pay-seed');
    } finally {
      errorSpy.mockRestore();
    }
  });
});

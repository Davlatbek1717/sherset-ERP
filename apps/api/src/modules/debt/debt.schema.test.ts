import { describe, expect, it } from 'vitest';
import {
  CASHIER_METHODS,
  CancelCallNoteSchema,
  CreateCardPaymentSchema,
  CreateCashPaymentSchema,
  CreateDebtNoteSchema,
  CreateDebtSchema,
  DebtFilterSchema,
  DebtPaymentsFeedFilterSchema,
  MarkCallSchema,
  ReversePaymentSchema,
  SetProblemSchema,
  usdCentsToSomTiyin,
} from './debt.schema.js';

const CP = '11111111-1111-1111-1111-111111111111';

/**
 * TZ «Qarz undirish» v2 — schema darajasidagi qoidalar qulfi.
 * Har bir test TZ bandiga bog'langan; regressiya bo'lsa aynan qaysi talab
 * buzilgani darhol ko'rinadi.
 */
describe('CreateDebtSchema — §3.3 yangi qarz berish', () => {
  const valid = {
    counterpartyId: CP,
    totalMinor: '5000000',
    comment: '2 oyga mol oldi',
    nextContactAt: '2026-08-20T09:00:00.000Z',
  };

  it('to‘g‘ri kirishni qabul qiladi', () => {
    const r = CreateDebtSchema.parse(valid);
    expect(r.totalMinor).toBe('5000000');
    expect(r.currency).toBe('UZS'); // default
    expect(r.nextContactAt).toBeInstanceOf(Date);
  });

  // TZ §3.3: «Bu ma'lumot ixtiyoriy emas — majburiy maydon sifatida so'raladi.»
  it('izohsiz RAD ETADI (§3.3 — izoh majburiy)', () => {
    expect(() => CreateDebtSchema.parse({ ...valid, comment: '' })).toThrow();
    const { comment, ...noComment } = valid;
    expect(() => CreateDebtSchema.parse(noComment)).toThrow();
  });

  it('keyingi aloqa sanasisiz RAD ETADI (§3.3 — call-markaz qachon bog‘lanishni bilishi shart)', () => {
    const { nextContactAt, ...noDate } = valid;
    expect(() => CreateDebtSchema.parse(noDate)).toThrow();
  });

  it('nol yoki manfiy summani RAD ETADI', () => {
    expect(() => CreateDebtSchema.parse({ ...valid, totalMinor: '0' })).toThrow();
    expect(() => CreateDebtSchema.parse({ ...valid, totalMinor: '-100' })).toThrow();
  });

  it('kasr summani RAD ETADI (pul — butun tiyin, ADR-0004)', () => {
    expect(() => CreateDebtSchema.parse({ ...valid, totalMinor: '100.5' })).toThrow();
  });
});

describe('CreateCashPaymentSchema — §3.6 kassada to‘lov', () => {
  it('naqd — default method', () => {
    const r = CreateCashPaymentSchema.parse({ amountMinor: '100000' });
    expect(r.method).toBe('cash');
  });

  it('terminal ham qabul qilinadi', () => {
    expect(CreateCashPaymentSchema.parse({ amountMinor: '1', method: 'terminal' }).method).toBe(
      'terminal',
    );
  });

  // TZ §3.7: screenshot to'lovi OPERATOR vazifasi — kassa endpointiga o'tmasligi shart.
  it('card_screenshot ni kassa endpointida RAD ETADI (§3.6 ≠ §3.7)', () => {
    expect(() =>
      CreateCashPaymentSchema.parse({ amountMinor: '1', method: 'card_screenshot' }),
    ).toThrow();
  });

  it('kassir kanallari ro‘yxati aynan naqd+terminal (§3.9 hisobot bazasi)', () => {
    expect([...CASHIER_METHODS]).toEqual(['cash', 'terminal']);
  });
});

describe('CreateCardPaymentSchema — §3.7 karta (screenshot) to‘lovi', () => {
  const valid = { amountMinor: '250000', screenshotBase64: 'aGVsbG8=' };

  it('rasm bilan qabul qiladi', () => {
    const r = CreateCardPaymentSchema.parse(valid);
    expect(r.mime).toBe('image/png'); // default
  });

  // TZ §3.7: «summani kiritadi VA screenshot rasmni tizimga yuklaydi».
  it('rasmsiz RAD ETADI (§3.7 — chek rasmi majburiy)', () => {
    expect(() => CreateCardPaymentSchema.parse({ amountMinor: '1' })).toThrow();
    expect(() => CreateCardPaymentSchema.parse({ ...valid, screenshotBase64: '' })).toThrow();
  });

  it('rasm bo‘lmagan mime ni RAD ETADI', () => {
    expect(() => CreateCardPaymentSchema.parse({ ...valid, mime: 'application/pdf' })).toThrow();
  });
});

describe('CreateDebtNoteSchema — §3.4 muloqot yozuvi', () => {
  it('matn majburiy', () => {
    expect(() => CreateDebtNoteSchema.parse({ text: '  ' })).toThrow();
  });

  it('keyingi sana ixtiyoriy (faqat izoh yozish ham mumkin)', () => {
    const r = CreateDebtNoteSchema.parse({ text: 'Telefon ko‘tarmadi' });
    expect(r.nextContactAt).toBeUndefined();
  });
});

describe('DebtFilterSchema — §3.1 qarzdorlar ro‘yxati filtri', () => {
  it('default scope = active («faqat qoldig‘i bor mijozlar»)', () => {
    const r = DebtFilterSchema.parse({});
    expect(r.scope).toBe('active');
    expect(r.sortBy).toBe('nextContactAt');
    expect(r.sortDir).toBe('asc'); // eng erta qo'ng'iroq yuqorida (§3.5)
  });

  it('TZ dagi 4 scope ham qo‘llab-quvvatlanadi', () => {
    for (const scope of ['active', 'today', 'overdue', 'all'] as const) {
      expect(DebtFilterSchema.parse({ scope }).scope).toBe(scope);
    }
  });

  it('summa bo‘yicha saralashni qabul qiladi (§3.1)', () => {
    expect(DebtFilterSchema.parse({ sortBy: 'remainingMinor' }).sortBy).toBe('remainingMinor');
  });

  it('noma’lum scope ni RAD ETADI', () => {
    expect(() => DebtFilterSchema.parse({ scope: 'hammasi' })).toThrow();
  });
});

describe("MarkCallSchema — «qo'ng'iroq qilindi» natijasi (2026-07-12)", () => {
  const NEXT = '2026-07-13T09:00:00Z';

  it("to'rt natijani ham qabul qiladi (har biri o'z majburiyligi bilan)", () => {
    // 2026-07-13: to'lov bo'lgan natijalarda KANAL (naqd/Click) majburiy.
    expect(MarkCallSchema.parse({ outcome: 'paid_full', paymentKind: 'cash' }).outcome).toBe(
      'paid_full',
    );
    expect(MarkCallSchema.parse({ outcome: 'not_paid' }).outcome).toBe('not_paid');
    expect(
      MarkCallSchema.parse({
        outcome: 'paid_partial',
        paymentKind: 'cash',
        amountMinor: '50000000',
        nextContactAt: NEXT,
      }).outcome,
    ).toBe('paid_partial');
    expect(MarkCallSchema.parse({ outcome: 'callback', nextContactAt: NEXT }).outcome).toBe(
      'callback',
    );
  });

  it("callback SANASIZ rad etiladi (qachon qo'ng'iroq qilishni bilish shart)", () => {
    expect(() => MarkCallSchema.parse({ outcome: 'callback' })).toThrow();
  });

  // 2026-07-12 talab: «qisman to'lov qildi deganda qancha summaligini so'rasin».
  it('paid_partial SUMMASIZ rad etiladi', () => {
    expect(() =>
      MarkCallSchema.parse({ outcome: 'paid_partial', paymentKind: 'cash', nextContactAt: NEXT }),
    ).toThrow();
  });

  it('paid_partial SANASIZ rad etiladi (qoldiq kuzatuvi davom etadi)', () => {
    expect(() =>
      MarkCallSchema.parse({ outcome: 'paid_partial', paymentKind: 'cash', amountMinor: '100' }),
    ).toThrow();
  });

  it('paid_partial nol/kasr summani rad etadi', () => {
    expect(() =>
      MarkCallSchema.parse({
        outcome: 'paid_partial',
        paymentKind: 'cash',
        amountMinor: '0',
        nextContactAt: NEXT,
      }),
    ).toThrow();
    expect(() =>
      MarkCallSchema.parse({
        outcome: 'paid_partial',
        paymentKind: 'cash',
        amountMinor: '10.5',
        nextContactAt: NEXT,
      }),
    ).toThrow();
  });

  it("not_paid sanasiz ham o'tadi (ixtiyoriy)", () => {
    expect(MarkCallSchema.parse({ outcome: 'not_paid' }).nextContactAt).toBeUndefined();
  });

  it("paid_full sanasiz o'tadi (qarz yopiladi — sana kerak emas)", () => {
    expect(
      MarkCallSchema.parse({ outcome: 'paid_full', paymentKind: 'cash' }).nextContactAt,
    ).toBeUndefined();
  });

  // ── 2026-07-13: to'lov KANALI, VALYUTA va CHEK RASMI ──────────────────────

  it("to'lov bo'lgan natijada KANAL majburiy (naqd yoki Click)", () => {
    expect(() => MarkCallSchema.parse({ outcome: 'paid_full' })).toThrow();
    expect(() =>
      MarkCallSchema.parse({
        outcome: 'paid_partial',
        amountMinor: '100',
        nextContactAt: NEXT,
      }),
    ).toThrow();
    // To'lovsiz natijalarda kanal SO'RALMAYDI.
    expect(MarkCallSchema.parse({ outcome: 'not_paid' }).paymentKind).toBeUndefined();
  });

  it("Click to'lovida CHEK RASMI majburiy", () => {
    expect(() =>
      MarkCallSchema.parse({
        outcome: 'paid_full',
        paymentKind: 'click',
        amountOriginalMinor: '100000',
      }),
    ).toThrow();
    expect(
      MarkCallSchema.parse({
        outcome: 'paid_full',
        paymentKind: 'click',
        amountOriginalMinor: '100000',
        screenshotBase64: 'data:image/png;base64,iVBORw0KGgo=',
      }).screenshotBase64,
    ).toContain('base64');
  });

  it("Click faqat so'mda bo'ladi (dollar Click rad etiladi)", () => {
    expect(() =>
      MarkCallSchema.parse({
        outcome: 'paid_full',
        paymentKind: 'click',
        currency: 'USD',
        exchangeRate: '1280000000000',
        amountOriginalMinor: '10000',
        screenshotBase64: 'data:image/png;base64,iVBORw0KGgo=',
      }),
    ).toThrow();
  });

  // HISOB RAQAM (2026-07-17): bank o'tkazmasi — chek IXTIYORIY, faqat so'mda.
  it("hisob raqam to'lovi cheksiz ham qabul qilinadi (chek ixtiyoriy)", () => {
    const r = MarkCallSchema.parse({
      outcome: 'paid_full',
      paymentKind: 'account',
      amountOriginalMinor: '100000',
    });
    expect(r.paymentKind).toBe('account');
    expect(r.screenshotBase64 ?? null).toBeNull();
  });

  it("hisob raqam to'loviga chek rasmi qo'shish ham mumkin", () => {
    const r = MarkCallSchema.parse({
      outcome: 'paid_partial',
      paymentKind: 'account',
      amountOriginalMinor: '50000',
      nextContactAt: '2026-07-20T09:00:00.000Z',
      screenshotBase64: 'data:image/jpeg;base64,iVBORw0KGgo=',
    });
    expect(r.screenshotBase64).toContain('base64');
  });

  it("hisob raqam faqat so'mda bo'ladi (dollar rad etiladi)", () => {
    expect(() =>
      MarkCallSchema.parse({
        outcome: 'paid_full',
        paymentKind: 'account',
        currency: 'USD',
        exchangeRate: '1280000000000',
        amountOriginalMinor: '10000',
      }),
    ).toThrow();
  });

  it("dollar naqdda KURS majburiy (so'mga o'girish uchun)", () => {
    expect(() =>
      MarkCallSchema.parse({
        outcome: 'paid_full',
        paymentKind: 'cash',
        currency: 'USD',
        amountOriginalMinor: '10000',
      }),
    ).toThrow();

    const ok = MarkCallSchema.parse({
      outcome: 'paid_full',
      paymentKind: 'cash',
      currency: 'USD',
      amountOriginalMinor: '10000', // 100.00 $
      exchangeRate: '1280000000000', // 12 800 so'm × 1e8 (kanonik ×10^8)
    });
    expect(ok.currency).toBe('USD');
    expect(ok.exchangeRate).toBe('1280000000000');
  });

  // DB-01 (Faza 16): kurs KANONIK ×10^8 masshtabda (Currency.rateValue bilan
  // bir xil). Eski ×10^4 qiymat (stale klient) jimgina 10 000× xato bermasin —
  // schema past qiymatni rad etadi.
  it('kurs kanonik ×10^8 — konvertatsiya va eski-masshtab guard', () => {
    // $100.00 (10 000 sent) × 12 800 so'm (1 280 000 000 000 ×1e8) = 128 000 000 tiyin
    expect(usdCentsToSomTiyin(10_000n, 1_280_000_000_000n)).toBe(128_000_000n);

    // Eski ×10^4 klient qiymati (12 800 so'm → '128000000') endi RAD etiladi.
    expect(() =>
      MarkCallSchema.parse({
        outcome: 'paid_full',
        paymentKind: 'cash',
        currency: 'USD',
        amountOriginalMinor: '10000',
        exchangeRate: '128000000',
      }),
    ).toThrow();
  });

  it("valyuta ko'rsatilmasa — so'm (UZS) deb olinadi", () => {
    expect(MarkCallSchema.parse({ outcome: 'paid_full', paymentKind: 'cash' }).currency).toBe(
      'UZS',
    );
  });

  it("qisman to'lovda summa yangi maydon orqali ham berilishi mumkin", () => {
    const v = MarkCallSchema.parse({
      outcome: 'paid_partial',
      paymentKind: 'cash',
      amountOriginalMinor: '50000000',
      nextContactAt: NEXT,
    });
    expect(v.amountOriginalMinor).toBe('50000000');
  });

  it("noma'lum natija rad etiladi", () => {
    expect(() => MarkCallSchema.parse({ outcome: 'keyin' })).toThrow();
  });

  it("scope 'called' filtrga qo'shildi", () => {
    expect(DebtFilterSchema.parse({ scope: 'called' }).scope).toBe('called');
    expect(DebtFilterSchema.parse({ scope: 'called', callOutcome: 'not_paid' }).callOutcome).toBe(
      'not_paid',
    );
  });
});

describe('DebtFilterSchema.ids — checkbox-tanlash (2026-07-12)', () => {
  it("uuid ro'yxatini qabul qiladi", () => {
    const ids = [CP, '22222222-2222-2222-2222-222222222222'];
    expect(DebtFilterSchema.parse({ ids }).ids).toEqual(ids);
  });

  it("noto'g'ri uuid rad etiladi", () => {
    expect(() => DebtFilterSchema.parse({ ids: ['abc'] })).toThrow();
  });

  it("2000 dan ortiq id rad etiladi (xavfsizlik qopqog'i)", () => {
    const many = Array.from({ length: 2001 }, () => CP);
    expect(() => DebtFilterSchema.parse({ ids: many })).toThrow();
  });
});

describe("manual_close — «To'ladi» to'lov yozuvi (2026-07-13)", () => {
  it("to'rtinchi usul sifatida qabul qilinadi", () => {
    expect(DebtPaymentsFeedFilterSchema.parse({ method: 'manual_close' }).method).toBe(
      'manual_close',
    );
  });

  // §3.9 qulfi: kassir kunlik hisoboti FAQAT kassa kanallarini sanaydi —
  // «To'ladi» belgisi kassir statistikasini shishirmasligi kerak.
  it('KASSIR kanallariga KIRMAYDI (kassir hisoboti buzilmaydi)', () => {
    expect([...CASHIER_METHODS]).toEqual(['cash', 'terminal']);
    expect(CASHIER_METHODS).not.toContain('manual_close');
  });

  it('kassa endpointida manual_close RAD ETILADI (u faqat markCall ichida)', () => {
    expect(() =>
      CreateCashPaymentSchema.parse({ amountMinor: '100', method: 'manual_close' }),
    ).toThrow();
  });
});

// ── MUAMMOLI MIJOZ (2026-07-14 talab) ───────────────────────────────────────
describe('Muammoli mijoz', () => {
  const NEXT = '2026-07-20T09:00:00Z';

  it('markCall: muammoli deb belgilashda SABAB majburiy', () => {
    expect(() =>
      MarkCallSchema.parse({ outcome: 'not_paid', problem: true, nextContactAt: NEXT }),
    ).toThrow();

    const ok = MarkCallSchema.parse({
      outcome: 'not_paid',
      problem: true,
      problemReason: "Telefonni ko'tarmaydi",
      nextContactAt: NEXT,
    });
    expect(ok.problem).toBe(true);
    expect(ok.problemReason).toBe("Telefonni ko'tarmaydi");
  });

  it('markCall: muammoli mijozga QAYTA QONGIROQ sanasi majburiy', () => {
    // Sanasiz belgilansa mijoz royxatda osilib qoladi — hech kim qaytib kormaydi.
    expect(() =>
      MarkCallSchema.parse({ outcome: 'not_paid', problem: true, problemReason: 'janjal' }),
    ).toThrow();
  });

  it('markCall: problem BERILMASA tegilmaydi (mavjud belgi ochib ketmasin)', () => {
    const v = MarkCallSchema.parse({ outcome: 'not_paid' });
    expect(v.problem).toBeUndefined();
  });

  it('markCall: problem=false bilan muammodan chiqarish mumkin (sabab shart emas)', () => {
    const v = MarkCallSchema.parse({ outcome: 'not_paid', problem: false });
    expect(v.problem).toBe(false);
  });

  it('SetProblemSchema: belgilashda sabab + sana majburiy', () => {
    expect(() => SetProblemSchema.parse({ problem: true })).toThrow();
    expect(() => SetProblemSchema.parse({ problem: true, problemReason: 'x' })).toThrow();
    expect(() => SetProblemSchema.parse({ problem: true, nextContactAt: NEXT })).toThrow();

    const ok = SetProblemSchema.parse({
      problem: true,
      problemReason: "Va'da berib bermaydi",
      nextContactAt: NEXT,
    });
    expect(ok.problem).toBe(true);
  });

  it('SetProblemSchema: YECHISHDA sabab ham, sana ham shart emas', () => {
    const v = SetProblemSchema.parse({ problem: false });
    expect(v.problem).toBe(false);
  });
});

/**
 * TO'LOVNI QAYTARISH — storno (2026-07-16).
 * Sabab MAJBURIY: sababsiz storno «bu pul qayoqqa ketdi?» savolini
 * javobsiz qoldiradi. Keyingi aloqa sanasi esa ixtiyoriy.
 */
describe('ReversePaymentSchema — to‘lovni qaytarish (storno)', () => {
  it('sabab bilan qabul qiladi (sana ixtiyoriy)', () => {
    const r = ReversePaymentSchema.parse({ reason: 'Summa xato kiritildi' });
    expect(r.reason).toBe('Summa xato kiritildi');
    expect(r.nextContactAt ?? null).toBeNull();
  });

  it('keyingi aloqa sanasi berilsa — Date bo‘lib keladi', () => {
    const r = ReversePaymentSchema.parse({
      reason: 'x',
      nextContactAt: '2026-07-20T09:00:00.000Z',
    });
    expect(r.nextContactAt).toBeInstanceOf(Date);
  });

  it('sababsiz RAD ETADI (bo‘sh, faqat probel yoki umuman yo‘q)', () => {
    expect(() => ReversePaymentSchema.parse({})).toThrow();
    expect(() => ReversePaymentSchema.parse({ reason: '' })).toThrow();
    expect(() => ReversePaymentSchema.parse({ reason: '   ' })).toThrow();
  });

  it('juda uzun sababni RAD ETADI (2000 belgi chegarasi)', () => {
    expect(() => ReversePaymentSchema.parse({ reason: 'a'.repeat(2001) })).toThrow();
  });
});

/**
 * QO'NG'IROQ NATIJASINI BEKOR QILISH (2026-07-16).
 * Storno bilan bir intizom: SABAB majburiy, keyingi aloqa sanasi ixtiyoriy.
 */
describe('CancelCallNoteSchema — qo‘ng‘iroq natijasini bekor qilish', () => {
  it('sabab bilan qabul qiladi (sana ixtiyoriy)', () => {
    const r = CancelCallNoteSchema.parse({ reason: 'Natija adashib qo‘yildi' });
    expect(r.reason).toBe('Natija adashib qo‘yildi');
    expect(r.nextContactAt ?? null).toBeNull();
  });

  it('keyingi aloqa sanasi berilsa — Date bo‘lib keladi', () => {
    const r = CancelCallNoteSchema.parse({
      reason: 'x',
      nextContactAt: '2026-07-20T09:00:00.000Z',
    });
    expect(r.nextContactAt).toBeInstanceOf(Date);
  });

  it('sababsiz RAD ETADI (bo‘sh, faqat probel yoki umuman yo‘q)', () => {
    expect(() => CancelCallNoteSchema.parse({})).toThrow();
    expect(() => CancelCallNoteSchema.parse({ reason: '' })).toThrow();
    expect(() => CancelCallNoteSchema.parse({ reason: '   ' })).toThrow();
  });

  it('juda uzun sababni RAD ETADI (2000 belgi chegarasi)', () => {
    expect(() => CancelCallNoteSchema.parse({ reason: 'a'.repeat(2001) })).toThrow();
  });
});

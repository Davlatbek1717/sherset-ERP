import { describe, expect, it } from 'vitest';
import {
  CASHIER_METHODS,
  CreateCardPaymentSchema,
  CreateCashPaymentSchema,
  CreateDebtNoteSchema,
  CreateDebtSchema,
  DebtFilterSchema,
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

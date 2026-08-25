import { describe, expect, it } from 'vitest';
import { customerStanding, debtPayable, prepayAvailable } from './pos-customer-debt.js';

/**
 * A3 — `customerStanding`: kassir ekranidagi BITTA yirik sonning MA'NOSI.
 *
 * Bu modul yangi formula QO'SHMAYDI — u `debtPayable` va `prepayAvailable`
 * ustida turadi va faqat «qaysi biri ko'rsatiladi» ni hal qiladi. Shuning
 * uchun testlar ikki narsani birdan qulflaydi: to'rt holatning o'zi VA
 * ikkinchi formula yozilmagani (natijalar manba funksiyalar bilan AYNAN
 * bir xil son beradi).
 */
describe('customerStanding — to`rt holat', () => {
  it('musbat balans → `debt`, son AYNAN `debtPayable`', () => {
    const s = customerStanding(500_000n, 0n);
    expect(s.kind).toBe('debt');
    expect(s.amountMinor).toBe(500_000n);
    expect(s.amountMinor).toBe(debtPayable(500_000n, 0n).payableMinor);
    expect(s.conflicted).toBe(false);
  });

  it('manfiy balans → `prepaid`, son AYNAN `prepayAvailable`', () => {
    const s = customerStanding(-1_000_000n, 0n);
    expect(s.kind).toBe('prepaid');
    expect(s.amountMinor).toBe(1_000_000n);
    expect(s.amountMinor).toBe(prepayAvailable(-1_000_000n));
    expect(s.conflicted).toBe(false);
  });

  it('nol balans, reyestr bo`sh → `settled`, son 0', () => {
    const s = customerStanding(0n, 0n);
    expect(s.kind).toBe('settled');
    expect(s.amountMinor).toBe(0n);
  });

  it('🔴 `null` balans → `unmeasured`, «avansi yo`q» EMAS', () => {
    // A2 hisobotining 6-eslatmasi: `prepayAvailable(null)` 0 qaytaradi, lekin
    // karta buni «avansi yo'q» deb ko'rsatsa kassirni ALDARDI — balans
    // qatori umuman yo'q, ya'ni javob NOMA'LUM.
    const s = customerStanding(null, 0n);
    expect(s.kind).toBe('unmeasured');
    expect(s.amountMinor).toBe(0n);
    expect(s.conflicted).toBe(false);
  });

  it('🔴 `null` balans + reyestrda ochiq qarz → qarz YASHIRILMAYDI', () => {
    // Holat baribir «o'lchanmagan» (karta buni alohida qator bilan aytadi),
    // lekin reyestrdagi haqiqiy qarz ekranda ko'rinishi SHART — aks holda
    // kassir to'lovni qabul qilmasdan qaytarib yuborardi.
    const s = customerStanding(null, 250_000n);
    expect(s.kind).toBe('unmeasured');
    expect(s.amountMinor).toBe(250_000n);
    expect(s.amountMinor).toBe(debtPayable(null, 250_000n).payableMinor);
  });

  it('balans 0, reyestrda qarz bor → `debt` (reyestr yetakchi)', () => {
    const s = customerStanding(0n, 300_000n);
    expect(s.kind).toBe('debt');
    expect(s.amountMinor).toBe(300_000n);
  });
});

describe('customerStanding — chegaralar va nomuvofiqlik', () => {
  it('🔴 son HECH QACHON manfiy emas — ishora `kind` da', () => {
    for (const b of [-5n, -1_000_000n, 0n, 1n, 900_000n, null]) {
      expect(customerStanding(b, 0n).amountMinor >= 0n).toBe(true);
    }
  });

  it('🔴 manfiy balans + ochiq reyestr qarzi → `prepaid` VA `conflicted`', () => {
    // Ikki daftar qarama-qarshi gapiradi (`pos-prepay-available.test.ts` shu
    // holatni «har biri O'Z daftariga sodiq» deb qulflagan). Ekran pul
    // daftariga ergashadi — mijozning puli bizda turganda undan qarz
    // SO'RASH reja invariant 4 ning buzilishi bo'lardi — lekin ziddiyat
    // JIM emas: `conflicted` bayrog'i ko'tariladi.
    const s = customerStanding(-300_000n, 100_000n);
    expect(s.kind).toBe('prepaid');
    expect(s.amountMinor).toBe(300_000n);
    expect(s.conflicted).toBe(true);
  });

  it('eng kichik avans (1 tiyin) ham `prepaid` bo`ladi', () => {
    expect(customerStanding(-1n, 0n)).toEqual({
      kind: 'prepaid',
      amountMinor: 1n,
      conflicted: false,
    });
  });

  it('manfiy reyestr (buzuq kirish) qarz tug`dirmaydi', () => {
    // `debtPayable` manfiy reyestrni 0 ga keltiradi; holat shu qoidadan
    // yuradi, o'zi qayta hisoblamaydi.
    expect(customerStanding(0n, -5_000n).kind).toBe('settled');
  });

  it('🔴 `debtPayable`/`prepayAvailable` bilan ZID natija bermaydi', () => {
    // Ikkinchi formula yozilib qolsa shu test qizil bo'ladi.
    for (const b of [null, -1_000_000n, -1n, 0n, 1n, 500_000n]) {
      for (const reg of [0n, 100_000n, 900_000n]) {
        const s = customerStanding(b, reg);
        const payable = debtPayable(b, reg).payableMinor;
        const prepay = prepayAvailable(b);
        if (s.kind === 'prepaid') expect(s.amountMinor).toBe(prepay);
        else expect(s.amountMinor).toBe(payable);
      }
    }
  });
});

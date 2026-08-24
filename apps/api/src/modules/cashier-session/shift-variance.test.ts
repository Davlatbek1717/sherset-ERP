import { describe, expect, it } from 'vitest';
import {
  VARIANCE_KIND,
  buildZReport,
  formatVarianceMessage,
  planVarianceAct,
  planVarianceActs,
} from './shift-variance.js';

describe('planVarianceAct — akt yozilsinmi', () => {
  it('nol farqda akt YO`Q', () => {
    // Nol farq uchun akt yaratish «ko'rilmagan aktlar» ro'yxatini ma'nosiz
    // yozuvlar bilan to'ldirib, haqiqiylarini ko'rinmas qilardi.
    expect(
      planVarianceAct({ currency: 'UZS', expectedMinor: 500n, countedMinor: 500n }),
    ).toBeNull();
  });

  it('kam sanalganda KAMOMAD (manfiy)', () => {
    const a = planVarianceAct({ currency: 'UZS', expectedMinor: 500_000n, countedMinor: 470_000n });
    expect(a?.kind).toBe(VARIANCE_KIND.shortage);
    expect(a?.varianceMinor).toBe(-30_000n);
  });

  it('ko`p sanalganda ORTIQCHA (musbat)', () => {
    const a = planVarianceAct({ currency: 'UZS', expectedMinor: 500_000n, countedMinor: 512_000n });
    expect(a?.kind).toBe(VARIANCE_KIND.surplus);
    expect(a?.varianceMinor).toBe(12_000n);
  });

  it('bir tiyinlik farq ham akt yozadi', () => {
    // «Kichik farqni e'tiborsiz qoldirish» siyosati TZ'da YO'Q — uni
    // o'zboshimchalik bilan kiritish pul yo'qolishini yashirardi.
    expect(planVarianceAct({ currency: 'UZS', expectedMinor: 0n, countedMinor: 1n })?.kind).toBe(
      VARIANCE_KIND.surplus,
    );
  });

  it('2^53 dan katta summada aniq', () => {
    const big = 9_007_199_254_740_993n;
    const a = planVarianceAct({ currency: 'UZS', expectedMinor: big, countedMinor: big - 1n });
    expect(a?.varianceMinor).toBe(-1n);
  });
});

describe('planVarianceActs — USD ALOHIDA yuritiladi', () => {
  it('har valyuta o`z aktini oladi, o`girilmaydi', () => {
    const acts = planVarianceActs([
      { currency: 'UZS', expectedMinor: 500_000n, countedMinor: 490_000n },
      { currency: 'USD', expectedMinor: 10_000n, countedMinor: 10_500n },
    ]);
    expect(acts).toHaveLength(2);
    expect(acts.map((a) => a.currency)).toEqual(['UZS', 'USD']);
    // USD farqi so'mga qo'shilmaydi — kurs bilan o'girish dalilni yo'qotardi.
    expect(acts[1]?.varianceMinor).toBe(500n);
  });

  it('faqat farq qilgan valyuta akt oladi', () => {
    const acts = planVarianceActs([
      { currency: 'UZS', expectedMinor: 500_000n, countedMinor: 500_000n },
      { currency: 'USD', expectedMinor: 10_000n, countedMinor: 9_000n },
    ]);
    expect(acts).toHaveLength(1);
    expect(acts[0]?.currency).toBe('USD');
  });

  it('farq umuman yo`q bo`lsa bo`sh ro`yxat', () => {
    expect(planVarianceActs([{ currency: 'UZS', expectedMinor: 1n, countedMinor: 1n }])).toEqual(
      [],
    );
  });
});

describe('formatVarianceMessage — menejer telefonida bir qarashda', () => {
  const base = {
    cashierName: 'Aliyev A.',
    cashDeskName: 'Kassa 1',
    closedAtLabel: '05.08.2026 19:40',
  };

  it('kamomad qizil sarlavha bilan boshlanadi', () => {
    const msg = formatVarianceMessage({
      ...base,
      acts: planVarianceActs([
        { currency: 'UZS', expectedMinor: 500_000n, countedMinor: 470_000n },
      ]),
    });
    expect(msg.split('\n')[0]).toContain('KAMOMAD');
    expect(msg).toContain('Aliyev A.');
    expect(msg).toContain('Kassa 1');
  });

  it('ortiqcha BOSHQA sarlavha oladi (bir xil ko`rinmaydi)', () => {
    // Ortiqcha ham muammo (chek o'tkazilmagan bo'lishi mumkin), lekin
    // BOSHQA muammo — menejer ularni ajrata olishi kerak.
    const msg = formatVarianceMessage({
      ...base,
      acts: planVarianceActs([
        { currency: 'UZS', expectedMinor: 500_000n, countedMinor: 510_000n },
      ]),
    });
    expect(msg.split('\n')[0]).toContain('ORTIQCHA');
    expect(msg.split('\n')[0]).not.toContain('KAMOMAD');
  });

  it('ikki valyuta ikki qatorda ko`rinadi', () => {
    const msg = formatVarianceMessage({
      ...base,
      acts: planVarianceActs([
        { currency: 'UZS', expectedMinor: 500_000n, countedMinor: 470_000n },
        { currency: 'USD', expectedMinor: 10_000n, countedMinor: 9_500n },
      ]),
    });
    expect(msg).toMatch(/UZS: kamomad/);
    expect(msg).toMatch(/USD: kamomad/);
  });

  it('kutilgan va sanalgan HAR IKKISI ko`rinadi', () => {
    // Faqat farqni ko'rsatish menejerni ilovani ochishga majbur qilardi.
    const msg = formatVarianceMessage({
      ...base,
      acts: planVarianceActs([
        { currency: 'UZS', expectedMinor: 500_000n, countedMinor: 470_000n },
      ]),
    });
    expect(msg).toContain('5 000,00');
    expect(msg).toContain('4 700,00');
  });

  it('kassir izohi bo`lsa qo`shiladi', () => {
    const msg = formatVarianceMessage({
      ...base,
      acts: planVarianceActs([{ currency: 'UZS', expectedMinor: 100n, countedMinor: 50n }]),
      cashierNote: 'Mijozga qaytim ortiqcha berdim',
    });
    expect(msg).toContain('Kassir izohi: Mijozga qaytim ortiqcha berdim');
  });

  it('aralash holatda kamomad ustun (eng yomoni sarlavhada)', () => {
    const msg = formatVarianceMessage({
      ...base,
      acts: planVarianceActs([
        { currency: 'UZS', expectedMinor: 100n, countedMinor: 150n },
        { currency: 'USD', expectedMinor: 100n, countedMinor: 50n },
      ]),
    });
    expect(msg.split('\n')[0]).toContain('KAMOMAD');
  });
});

describe('buildZReport — §8.5 raqamlari', () => {
  const base = {
    salesCount: 4,
    revenueByMethod: [
      { method: 'cash', sumMinor: 600_000n },
      { method: 'card', sumMinor: 200_000n },
    ],
    grossProfitMinor: 150_000n,
    discountMinor: 20_000n,
    creditSoldMinor: 90_000n,
    debtPaidMinor: 50_000n,
    returnsMinor: 10_000n,
    expenseMinor: 25_000n,
    collectionMinor: 400_000n,
    returnPayoutMinor: 0n,
    expectedCashMinor: 225_000n,
    countedCashMinor: 220_000n,
  };

  it('tushum to`lov turlari yig`indisi', () => {
    expect(buildZReport(base).revenueMinor).toBe(800_000n);
  });

  it('o`rtacha chek = tushum / chek soni', () => {
    expect(buildZReport(base).averageReceiptMinor).toBe(200_000n);
  });

  it('cheksiz smenada o`rtacha chek NULL, 0 EMAS', () => {
    // 0 ga bo'lish emas, va «o'rtacha chek 0» degan yolg'on ham emas.
    const z = buildZReport({ ...base, salesCount: 0, revenueByMethod: [] });
    expect(z.averageReceiptMinor).toBeNull();
    expect(z.revenueMinor).toBe(0n);
  });

  it('yalpi foyda noma`lum bo`lsa NULL bo`lib qoladi (100% marja yolg`oni yo`q)', () => {
    const z = buildZReport({ ...base, grossProfitMinor: null });
    expect(z.grossProfitMinor).toBeNull();
  });

  it('farq = sanalgan − kutilgan', () => {
    expect(buildZReport(base).varianceMinor).toBe(-5_000n);
  });

  it('sanalmagan (hali yopilmagan) smenada farq NULL', () => {
    expect(buildZReport({ ...base, countedCashMinor: null }).varianceMinor).toBeNull();
  });

  it('xarajat va inkassatsiya hisobotda ALOHIDA qoladi', () => {
    // §8.5 ikkalasini alohida qator qilib so'raydi — birga qo'shilsa
    // «qancha pul topshirildi» degan savolga javob yo'qolardi.
    const z = buildZReport(base);
    expect(z.expenseMinor).toBe(25_000n);
    expect(z.collectionMinor).toBe(400_000n);
  });
});

/**
 * MK31 — Z-hisobotda dollar (kassa TZ §8.5 + Faza 17 konvertatsiya
 * shartnomasi: «kursi yo'q pul jamiga qo'shilmaydi»).
 */
describe('buildZReport — dollar qatori va konvertatsiya shartnomasi', () => {
  const base = {
    salesCount: 2,
    revenueByMethod: [{ method: 'CASH_UZS', sumMinor: 100_000n }],
    grossProfitMinor: 0n,
    discountMinor: 0n,
    creditSoldMinor: 0n,
    debtPaidMinor: 0n,
    returnsMinor: 0n,
    expenseMinor: 0n,
    collectionMinor: 0n,
    returnPayoutMinor: 0n,
    expectedCashMinor: 100_000n,
    countedCashMinor: 100_000n,
  };

  it('dollar qatori jamiga SO`MDAGI ekvivalenti bilan kiradi (sent EMAS)', () => {
    // 1 000 sent ($10) ni jamiga o'sha holicha qo'shsak, tushum 12 450
    // barobar kam ko'rinardi — «kassa bugun deyarli ishlamadi» degan yolg'on.
    const z = buildZReport({
      ...base,
      revenueByMethod: [
        { method: 'CASH_UZS', sumMinor: 100_000n },
        { method: 'CASH_USD', sumMinor: 1_000n, currency: 'USD', baseMinor: 12_450_270n },
      ],
    });
    expect(z.revenueMinor).toBe(100_000n + 12_450_270n);
    expect(z.unconvertedByMethod).toEqual([]);
  });

  it('KURSI YO`Q dollar qatori jamiga QO`SHILMAYDI va ko`rinib turadi', () => {
    // Sentni tiyin deb qo'shish ham, jimgina tashlab yuborish ham yolg'on.
    // Uchinchi yo'l: jamidan chiqarib, alohida ro'yxatda ko'rsatish.
    const z = buildZReport({
      ...base,
      revenueByMethod: [
        { method: 'CASH_UZS', sumMinor: 100_000n },
        { method: 'CASH_USD', sumMinor: 1_000n, currency: 'USD', baseMinor: null },
      ],
    });
    expect(z.revenueMinor).toBe(100_000n);
    expect(z.unconvertedByMethod).toEqual([
      { method: 'CASH_USD', sumMinor: 1_000n, currency: 'USD' },
    ]);
  });

  it('faqat so`m qatorlari — natija BAYT-BA-BAYT eski (regressiya yo`q)', () => {
    const z = buildZReport(base);
    expect(z.revenueMinor).toBe(100_000n);
    expect(z.unconvertedByMethod).toEqual([]);
  });

  it('o`rtacha chek jamiga KIRGAN tushumdan hisoblanadi', () => {
    const z = buildZReport({
      ...base,
      salesCount: 2,
      revenueByMethod: [
        { method: 'CASH_UZS', sumMinor: 100_000n },
        { method: 'CASH_USD', sumMinor: 1_000n, currency: 'USD', baseMinor: 100_000n },
      ],
    });
    expect(z.averageReceiptMinor).toBe(100_000n);
  });

  it('dollar kutilgan/sanalgan/farq — sentda, so`mga o`girilmaydi', () => {
    const z = buildZReport({
      ...base,
      expectedUsdCashMinor: 10_000n,
      countedUsdCashMinor: 9_500n,
    });
    expect(z.expectedUsdCashMinor).toBe(10_000n);
    expect(z.countedUsdCashMinor).toBe(9_500n);
    expect(z.varianceUsdMinor).toBe(-500n);
    // So'm farqi mustaqil qoladi.
    expect(z.varianceMinor).toBe(0n);
  });

  it('dollar SANALMAGAN bo`lsa farq NULL (nol EMAS)', () => {
    // `0` = «sanadim, dollar yo'q»; `null` = «hali sanalmagan». Ikkalasini
    // aralashtirish ochiq smenada soxta kamomad ko'rsatardi.
    const z = buildZReport({
      ...base,
      expectedUsdCashMinor: 10_000n,
      countedUsdCashMinor: null,
    });
    expect(z.varianceUsdMinor).toBeNull();
  });

  it('dollar maydonlari berilmagan smenada kutilgan 0, farq NULL', () => {
    const z = buildZReport(base);
    expect(z.expectedUsdCashMinor).toBe(0n);
    expect(z.countedUsdCashMinor).toBeNull();
    expect(z.varianceUsdMinor).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { CurrencyTally, type RateContext } from '../report/report-rate-ctx.util.js';
import {
  EXPENSE_FACT_SOURCE,
  type ExpenseFactDoc,
  UNTAGGED_KEY,
  aggregateExpenseFact,
  drawerExpenseWhereKind,
} from './expense-fact.js';

/**
 * MK12 / 4M TZ §8 — xarajat FAKTI mavjud hujjatlardan yig'iladi.
 *
 * Bu yerda qulflanadigan uch invariant (uchalasi ham buzilsa typecheck jim
 * o'tadi va ekran «ishlayotgandek» ko'rinadi):
 *
 *  1. **Bir pul IKKI marta sanalmaydi.** Inkassatsiya (`kind='collection'`)
 *     kassadan bankka pul KO'CHIRADI — xarajat EMAS. Uni qo'shsak, o'sha pul
 *     keyin bankdan `PaymentOut` bilan chiqqanda ikkinchi marta sanaladi.
 *  2. **Kursi yo'q valyuta jamiga QO'SHILMAYDI** — hisobot konvertatsiya
 *     shartnomasi (Faza 17 / M-12). Face-value qo'shish USD 1000 ni 1000
 *     so'm qilardi va raqam baribir ishonarli ko'rinardi.
 *  3. **Moddasiz pul YO'QOLMAYDI** — u alohida `UNTAGGED_KEY` qatorida
 *     ko'rinadi. Jimgina tashlab yuborilsa, byudjet «hammasi joyida» derdi.
 */

const UZS_CTX: RateContext = { baseCode: 'UZS', rates: new Map() };

const ITEMS = [
  { id: 'item-rent', name: 'Аренда' },
  { id: 'item-ads', name: 'Реклама' },
];

function doc(over: Partial<ExpenseFactDoc>): ExpenseFactDoc {
  return {
    source: EXPENSE_FACT_SOURCE.cashOut,
    expenseItemId: null,
    expenseItemName: null,
    currency: 'UZS',
    rateValue: null,
    sumMinor: 0n,
    ...over,
  };
}

describe('aggregateExpenseFact — manba va bir-martalik sanoq', () => {
  it('uchala manbadan bir modda bo`yicha yig`adi (RKO + bank + kassa yashigi)', () => {
    const tally = new CurrencyTally();
    const out = aggregateExpenseFact(
      [
        doc({ source: EXPENSE_FACT_SOURCE.cashOut, expenseItemName: 'Аренда', sumMinor: 100_00n }),
        doc({
          source: EXPENSE_FACT_SOURCE.paymentOut,
          expenseItemName: 'Аренда',
          sumMinor: 200_00n,
        }),
        doc({
          source: EXPENSE_FACT_SOURCE.drawerCashOut,
          expenseItemId: 'item-rent',
          sumMinor: 50_00n,
        }),
      ],
      { items: ITEMS, ctx: UZS_CTX, tally },
    );

    expect(out.byItem.get('item-rent')).toBe(350_00n);
    expect(out.byItem.get(UNTAGGED_KEY)).toBeUndefined();
    expect(out.ambiguousNames).toEqual([]);
  });

  it('BITTA hujjat FAQAT bitta chelakka tushadi (FK va nom bir vaqtda bo`lsa ham)', () => {
    const tally = new CurrencyTally();
    // Bunday hujjat sxemada bo'lmasligi kerak, lekin agar ikkala kalit ham
    // to'lsa, ikki chelakka qo'shilishi = ikki karra sanoq.
    const out = aggregateExpenseFact(
      [
        doc({
          source: EXPENSE_FACT_SOURCE.drawerCashOut,
          expenseItemId: 'item-rent',
          expenseItemName: 'Реклама',
          sumMinor: 90_00n,
        }),
      ],
      { items: ITEMS, ctx: UZS_CTX, tally },
    );

    const total = [...out.byItem.values()].reduce((a, b) => a + b, 0n);
    expect(total).toBe(90_00n);
    expect(out.byItem.get('item-rent')).toBe(90_00n);
    expect(out.byItem.has('item-ads')).toBe(false);
  });

  it('inkassatsiya yashiq so`rovidan CHIQARIB tashlanadi (ikki karra sanoq qulfi)', () => {
    // Servis so'rovi `kind='expense'` bilan cheklanishi SHART. Bu yerda
    // shart-obyektining o'zi qulflanadi — servis uni ishlatadi.
    expect(drawerExpenseWhereKind()).toEqual({ kind: 'expense' });
  });
});

describe('aggregateExpenseFact — valyuta shartnomasi', () => {
  it('kursi yo`q valyuta jamiga QO`SHILMAYDI, alohida qatorda qoladi', () => {
    const tally = new CurrencyTally();
    const out = aggregateExpenseFact(
      [
        doc({ expenseItemName: 'Аренда', currency: 'UZS', sumMinor: 1_000_00n }),
        // USD uchun na hujjat kursi, na Currency qatori bor.
        doc({ expenseItemName: 'Аренда', currency: 'USD', sumMinor: 1_000_00n }),
      ],
      { items: ITEMS, ctx: UZS_CTX, tally },
    );

    expect(out.byItem.get('item-rent')).toBe(1_000_00n);
    expect(tally.hasUnconverted).toBe(true);
    expect(tally.unconvertedRows()).toEqual([{ currency: 'USD', amountMinor: '100000' }]);
  });

  it('hujjatning O`Z kursi bilan bazaga keltiriladi (tarixiy kurs)', () => {
    const tally = new CurrencyTally();
    const out = aggregateExpenseFact(
      [
        doc({
          expenseItemName: 'Аренда',
          currency: 'USD',
          // ×10^8 masshtab: 1 USD = 12 000 UZS.
          rateValue: 12_000n * 100_000_000n,
          sumMinor: 10_00n,
        }),
      ],
      { items: ITEMS, ctx: UZS_CTX, tally },
    );

    expect(out.byItem.get('item-rent')).toBe(12_000_000n);
    expect(tally.hasUnconverted).toBe(false);
  });
});

describe('aggregateExpenseFact — moddaga bog`lash', () => {
  it('moddasiz va tanilmagan nom `UNTAGGED_KEY` da ko`rinadi (yo`qolmaydi)', () => {
    const tally = new CurrencyTally();
    const out = aggregateExpenseFact(
      [
        doc({ expenseItemName: null, sumMinor: 10_00n }),
        doc({ expenseItemName: 'Кофе для офиса', sumMinor: 5_00n }),
        doc({ expenseItemName: '   ', sumMinor: 1_00n }),
      ],
      { items: ITEMS, ctx: UZS_CTX, tally },
    );

    expect(out.byItem.get(UNTAGGED_KEY)).toBe(16_00n);
  });

  it('nom bo`shliq/registrdan qat`i nazar moddaga tushadi', () => {
    const tally = new CurrencyTally();
    const out = aggregateExpenseFact([doc({ expenseItemName: '  аренда ', sumMinor: 7_00n })], {
      items: ITEMS,
      ctx: UZS_CTX,
      tally,
    });

    expect(out.byItem.get('item-rent')).toBe(7_00n);
  });

  it('bir nomni IKKI modda ko`tarsa — taxmin qilinmaydi, moddasizga tushadi', () => {
    const tally = new CurrencyTally();
    const out = aggregateExpenseFact([doc({ expenseItemName: 'Аренда', sumMinor: 7_00n })], {
      items: [...ITEMS, { id: 'item-rent-2', name: 'аренда' }],
      ctx: UZS_CTX,
      tally,
    });

    // Tavakkal biriktirish pulni NOTO'G'RI moddaga yozardi va byudjet
    // og'ishi jimgina yolg'on bo'lardi.
    expect(out.byItem.get('item-rent')).toBeUndefined();
    expect(out.byItem.get(UNTAGGED_KEY)).toBe(7_00n);
    expect(out.ambiguousNames).toEqual(['аренда']);
  });
});

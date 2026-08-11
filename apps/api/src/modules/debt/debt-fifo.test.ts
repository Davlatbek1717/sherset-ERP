import { describe, expect, it } from 'vitest';
import {
  type FifoDebt,
  allocateFifo,
  outstandingOf,
  splitOriginalMinor,
  summarize,
} from './debt-fifo.js';

/**
 * FIFO taqsimlash — sof qoidalar testi (kassa TZ §7.2, Q9).
 *
 * Qulflanadigan shartnomalar (buzilsa PUL noto'g'ri yopiladi):
 *   1. **eng eski qarz birinchi** — aks holda muddati o'tganlar hisoboti yolg'on;
 *   2. ortiqcha to'lov qarzga QO'SHILMAYDI (u avans, qarz emas);
 *   3. tartib **barqaror** — ikki chaqiruv bir xil natija berishi shart;
 *   4. hammasi `bigint` — 2^53 dan katta tiyin yaxlitlanmaydi.
 */

const d = (id: string, total: bigint, paid: bigint, iso: string): FifoDebt => ({
  id,
  totalMinor: total,
  paidMinor: paid,
  orderAt: new Date(iso),
});

describe('outstandingOf', () => {
  it('qoldiq = jami − to`langan', () => {
    expect(outstandingOf({ totalMinor: 1000n, paidMinor: 300n })).toBe(700n);
  });

  it('ortiqcha to`langan qarz MANFIY bo`lmaydi', () => {
    // Aks holda u keyingi qarzning qoldig'ini kamaytirib yuborardi.
    expect(outstandingOf({ totalMinor: 1000n, paidMinor: 1500n })).toBe(0n);
  });
});

describe('FIFO — eng eski qarzdan', () => {
  const debts = [
    d('yangi', 500n, 0n, '2026-08-01'),
    d('eski', 300n, 0n, '2026-05-01'),
    d('orta', 400n, 0n, '2026-06-15'),
  ];

  it('eng eskisi birinchi yopiladi', () => {
    const r = allocateFifo(debts, 300n);
    expect(r.allocations).toEqual([{ debtId: 'eski', amountMinor: 300n, closes: true }]);
    expect(r.appliedMinor).toBe(300n);
    expect(r.leftoverMinor).toBe(0n);
  });

  it('yetganicha ketma-ket yopadi, oxirgisi QISMAN', () => {
    const r = allocateFifo(debts, 500n);
    expect(r.allocations).toEqual([
      { debtId: 'eski', amountMinor: 300n, closes: true },
      { debtId: 'orta', amountMinor: 200n, closes: false },
    ]);
    expect(r.appliedMinor).toBe(500n);
  });

  it('hammasini yopadi va ORTIQCHA alohida qoladi', () => {
    // Ortiqcha — avans, qarz emas: oxirgi qarzga qo'shilsa mijoz kartochkasi
    // qarzni haqiqatdan katta ko'rsatardi.
    const r = allocateFifo(debts, 2_000n);
    expect(r.appliedMinor).toBe(1_200n);
    expect(r.leftoverMinor).toBe(800n);
    expect(r.allocations.every((a) => a.closes)).toBe(true);
  });

  it('qisman to`langan qarzning FAQAT qoldig`i olinadi', () => {
    const r = allocateFifo([d('a', 1_000n, 700n, '2026-05-01')], 1_000n);
    expect(r.allocations).toEqual([{ debtId: 'a', amountMinor: 300n, closes: true }]);
    expect(r.leftoverMinor).toBe(700n);
  });

  it('YOPILGAN qarz e`tiborga olinmaydi', () => {
    const r = allocateFifo(
      [d('yopiq', 500n, 500n, '2026-01-01'), d('ochiq', 200n, 0n, '2026-07-01')],
      200n,
    );
    expect(r.allocations).toEqual([{ debtId: 'ochiq', amountMinor: 200n, closes: true }]);
  });
});

describe('barqaror tartib', () => {
  it('sana teng bo`lsa `id` hal qiladi (ikki chaqiruv bir xil)', () => {
    const same = [
      d('b', 100n, 0n, '2026-05-01'),
      d('a', 100n, 0n, '2026-05-01'),
      d('c', 100n, 0n, '2026-05-01'),
    ];
    const first = allocateFifo(same, 150n);
    const second = allocateFifo([...same].reverse(), 150n);
    expect(first.allocations).toEqual(second.allocations);
    expect(first.allocations[0]?.debtId).toBe('a');
  });
});

describe('chegaraviy holatlar', () => {
  it('nol yoki manfiy to`lov hech narsa qilmaydi', () => {
    const debts = [d('a', 100n, 0n, '2026-05-01')];
    for (const amount of [0n, -50n]) {
      const r = allocateFifo(debts, amount);
      expect(r.allocations).toEqual([]);
      expect(r.appliedMinor).toBe(0n);
      expect(r.leftoverMinor).toBe(0n);
    }
  });

  it('qarz umuman yo`q — hammasi ortiqcha', () => {
    const r = allocateFifo([], 5_000n);
    expect(r.appliedMinor).toBe(0n);
    expect(r.leftoverMinor).toBe(5_000n);
  });

  it('2^53 dan katta summa yaxlitlanmaydi', () => {
    const big = 9_007_199_254_740_993n;
    const r = allocateFifo([d('a', big, 0n, '2026-05-01')], big);
    expect(r.allocations[0]?.amountMinor).toBe(big);
    expect(r.leftoverMinor).toBe(0n);
  });

  it('taqsimlangan + qoldiq = to`lov (invariant)', () => {
    const debts = [d('a', 333n, 0n, '2026-05-01'), d('b', 777n, 100n, '2026-06-01')];
    for (const amount of [1n, 100n, 333n, 1_009n, 5_000n]) {
      const r = allocateFifo(debts, amount);
      expect(r.appliedMinor + r.leftoverMinor, `to'lov ${amount}`).toBe(amount);
    }
  });
});

describe('summarize — POS oynasining yuqori qismi', () => {
  it('qoldiq, ochiq soni va ENG ESKI sana', () => {
    const s = summarize([
      d('a', 500n, 200n, '2026-06-01'),
      d('b', 300n, 0n, '2026-03-15'),
      d('yopiq', 100n, 100n, '2026-01-01'),
    ]);
    expect(s.outstandingMinor).toBe(600n); // 300 + 300
    expect(s.openCount).toBe(2);
    // Yopilgan qarz eng eski bo'lsa ham hisobga kirmaydi — kassirga
    // «muddati o'tgan qarz bor» degan yolg'on signal bermasin.
    expect(s.oldestAt?.toISOString().slice(0, 10)).toBe('2026-03-15');
  });

  it('ochiq qarz yo`q — sana NULL', () => {
    const s = summarize([d('a', 100n, 100n, '2026-01-01')]);
    expect(s).toEqual({ outstandingMinor: 0n, openCount: 0, oldestAt: null });
  });

  it('bo`sh ro`yxat', () => {
    expect(summarize([])).toEqual({ outstandingMinor: 0n, openCount: 0, oldestAt: null });
  });
});

/**
 * F6 — DOLLAR to'lovining ASL (sent) summasini FIFO qatorlariga bo'lish.
 *
 * NEGA KERAK: mijoz $100 beradi, u FIFO bo'yicha 3 qarzga bo'linadi. Har
 * `DebtPayment` qatori o'zining `amountOriginalMinor` ini olishi SHART —
 * STORNO qatordan-qatorga ishlaydi (`debt.service.reverseCashDeskDelta`
 * aynan shu maydondan yashiqdan chiqadigan JISMONIY summani oladi). Qator
 * sentsiz qolsa storno so'm qiymatini dollar deb yashiqdan chiqarardi.
 *
 * 🔴 INVARIANT: bo'laklar yig'indisi ASL summaga AYNAN teng — bir sent ham
 * yo'qolmaydi va tug'ilmaydi (yashiq daftari nolga qaytishi shundan).
 */
describe('splitOriginalMinor — F6 dollar summasini FIFO qatorlariga bo`lish', () => {
  it('bo`laklar yig`indisi asl summaga AYNAN teng (qoldiq oxirgi qatorga)', () => {
    // 3 qarz: 33 333 / 33 333 / 33 334 tiyin; jami 100 000 tiyin = $10.00.
    const parts = splitOriginalMinor([33_333n, 33_333n, 33_334n], 1000n);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(1000n);
    expect(parts).toHaveLength(3);
  });

  it('bitta qator — hammasi o`shanga tushadi', () => {
    expect(splitOriginalMinor([128_000_000n], 10_000n)).toEqual([10_000n]);
  });

  it('proporsional: teng qatorlar teng bo`lakni oladi', () => {
    expect(splitOriginalMinor([50_000n, 50_000n], 1000n)).toEqual([500n, 500n]);
  });

  it('yaxlitlash qoldig`i OXIRGI qatorga qo`shiladi (jim yo`qolmaydi)', () => {
    // 1 sentni 3 qatorga bo'lib bo'lmaydi: 0 + 0 + 1.
    expect(splitOriginalMinor([100n, 100n, 100n], 1n)).toEqual([0n, 0n, 1n]);
  });

  it('bo`sh ro`yxat — bo`sh natija (0 ga bo`lish yo`q)', () => {
    expect(splitOriginalMinor([], 1000n)).toEqual([]);
  });

  it('jami 0 bo`lsa ham 0 ga bo`lmaydi', () => {
    expect(splitOriginalMinor([0n, 0n], 500n)).toEqual([0n, 500n]);
  });
});

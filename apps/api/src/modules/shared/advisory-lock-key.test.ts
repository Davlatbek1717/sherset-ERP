import { describe, expect, it } from 'vitest';
import { advisoryLockKey } from './advisory-lock-key.js';

/**
 * Qulf kaliti — SOF funksiya, ya'ni uni DB'siz to'liq qulflash mumkin.
 * Uchta xossa muhim: (1) barqarorlik — bir kalit har doim bir son (aks holda
 * qulf hech nimani himoya qilmasdi), (2) `bigint` diapazoni — Postgres
 * `bigint` SIGNED, (3) ajratuvchanlik — yaqin kalitlar turli sonlar beradi.
 */
describe('advisoryLockKey', () => {
  it('barqaror: bir xil kalit — bir xil son', () => {
    const a = advisoryLockKey('debt.counterparty_notify|acc-1|batch-1');
    const b = advisoryLockKey('debt.counterparty_notify|acc-1|batch-1');
    expect(a).toBe(b);
  });

  it('SIGNED 64-bit diapazonida qoladi (Postgres `bigint`)', () => {
    const min = -(2n ** 63n);
    const max = 2n ** 63n - 1n;
    for (const key of ['', 'a', 'x'.repeat(500), 'акме|ombor|№7', '🔴|batch']) {
      const v = advisoryLockKey(key);
      expect(v).toBeGreaterThanOrEqual(min);
      expect(v).toBeLessThanOrEqual(max);
    }
  });

  it('bir belgi farq — boshqa son (qo`shni hujjatlar bir qulfga tushmasin)', () => {
    expect(advisoryLockKey('acc-1|batch-1')).not.toBe(advisoryLockKey('acc-1|batch-2'));
    expect(advisoryLockKey('acc-1|batch-1')).not.toBe(advisoryLockKey('acc-2|batch-1'));
  });

  it('1000 ta ketma-ket kalit — to`qnashuvsiz (amaliy ajratuvchanlik)', () => {
    const seen = new Set<bigint>();
    for (let i = 0; i < 1000; i++) seen.add(advisoryLockKey(`debt.counterparty_notify|acc|b-${i}`));
    expect(seen.size).toBe(1000);
  });

  it('UTF-8 BAYTLARI bo`yicha: ko`p baytli belgi ham barqaror', () => {
    expect(advisoryLockKey('ў')).toBe(advisoryLockKey('ў'));
    expect(advisoryLockKey('ў')).not.toBe(advisoryLockKey('у'));
  });
});

import { describe, expect, it } from 'vitest';
import { EMPTY_WEDGE_STATE, type WedgeState, feedKey } from './use-barcode-scanner';

/**
 * Belgilar ketma-ketligini sintetik timestamp'lar bilan `feedKey`ga uzatadi.
 * `keys` — har biri [key, now] jufti. Oxirgi qaytgan {state, scan}ni beradi.
 */
function feedSeq(
  keys: Array<[string, number]>,
  opts?: { maxGapMs?: number; minLength?: number },
): { state: WedgeState; scan?: string } {
  let state = EMPTY_WEDGE_STATE;
  let scan: string | undefined;
  for (const [key, now] of keys) {
    const res = feedKey(state, { key, now }, opts);
    state = res.state;
    scan = res.scan;
  }
  return { state, scan };
}

describe('feedKey — keyboard-wedge skan ajratish', () => {
  it('tez burst + Enter → skan qaytaradi', () => {
    // 13 raqam, har biri 10ms oralig'ida (skaner tezligi), keyin Enter.
    const code = '2000000026701';
    const keys: Array<[string, number]> = code
      .split('')
      .map((ch, i) => [ch, i * 10] as [string, number]);
    keys.push(['Enter', code.length * 10]);
    const { scan, state } = feedSeq(keys);
    expect(scan).toBe(code);
    // Skan'dan keyin bufer tozalanadi.
    expect(state).toEqual(EMPTY_WEDGE_STATE);
  });

  it("sekin qo'lda yozish + Enter → skan YO'Q", () => {
    // Har belgi 200ms oralig'ida (odam yozishi) — maxGap (50ms) dan katta.
    const code = '123456';
    const keys: Array<[string, number]> = code
      .split('')
      .map((ch, i) => [ch, i * 200] as [string, number]);
    keys.push(['Enter', code.length * 200]);
    const { scan } = feedSeq(keys);
    expect(scan).toBeUndefined();
  });

  it("tez lekin qisqa bufer (minLength ostida) + Enter → skan YO'Q", () => {
    const keys: Array<[string, number]> = [
      ['1', 0],
      ['2', 10],
      ['3', 20],
      ['Enter', 30],
    ];
    const { scan } = feedSeq(keys); // uzunlik 3 < 6
    expect(scan).toBeUndefined();
  });

  it("bo'sh bufer + Enter → skan YO'Q", () => {
    const { scan } = feedSeq([['Enter', 0]]);
    expect(scan).toBeUndefined();
  });

  it("oxirgi belgidan Enter'gacha katta oraliq → skan YO'Q (odam Enter bosdi)", () => {
    // Belgilar tez keldi, lekin Enter ancha kech bosildi.
    const keys: Array<[string, number]> = [
      ['1', 0],
      ['2', 10],
      ['3', 20],
      ['4', 30],
      ['5', 40],
      ['6', 50],
      ['Enter', 5000], // 4950ms keyin
    ];
    const { scan } = feedSeq(keys);
    expect(scan).toBeUndefined();
  });

  it('katta oraliqdan keyingi belgi buferni qayta boshlaydi', () => {
    // Eski tez burst, uzun pauza, keyin yangi tez burst — faqat yangisi qoladi.
    const keys: Array<[string, number]> = [
      ['9', 0],
      ['9', 10],
      ['9', 20],
      // uzun pauza:
      ['7', 5000],
      ['8', 5010],
    ];
    const { state } = feedSeq(keys);
    expect(state.buffer).toBe('78');
  });

  it('modifikator/navigatsiya tugmalari (Shift, ArrowLeft) buferni buzmaydi', () => {
    const keys: Array<[string, number]> = [
      ['2', 0],
      ['Shift', 5], // e'tiborsiz
      ['0', 10],
      ['ArrowLeft', 15], // e'tiborsiz
      ['0', 20],
      ['0', 30],
      ['0', 40],
      ['0', 50],
      ['Enter', 60],
    ];
    const { scan } = feedSeq(keys);
    expect(scan).toBe('200000');
  });

  it('maxGapMs/minLength sozlamalarini hurmat qiladi', () => {
    // minLength=3, maxGap=100 bilan qisqaroq kod ham skan bo'ladi.
    const keys: Array<[string, number]> = [
      ['A', 0],
      ['B', 80],
      ['C', 160],
      ['Enter', 240],
    ];
    const { scan } = feedSeq(keys, { maxGapMs: 100, minLength: 3 });
    expect(scan).toBe('ABC');
  });
});

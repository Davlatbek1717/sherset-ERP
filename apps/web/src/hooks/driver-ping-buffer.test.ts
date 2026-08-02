import { describe, expect, it, vi } from 'vitest';
import {
  type BufferedPing,
  MAX_BUFFERED,
  appendToBuffer,
  flushBuffer,
  loadBuffer,
  saveBuffer,
} from './driver-ping-buffer';

/**
 * Haydovchi ping buferi.
 *
 * Bu bufer server tomonidagi IKKI aniq shartga xizmat qiladi
 * (`apps/api/src/modules/hr/driver-tracking/driver-field-ingest.service.ts`):
 *   1. ping'lar KETMA-KET yuborilishi kerak — servis izohida yozilgan ma'lum
 *      cheklov (bir vaqtda kelgan ikki ping masofani ikki marta sanashi mumkin);
 *   2. har ping o'z ASL vaqtini (`ts`) olib yurishi kerak, aks holda kech
 *      yuborilgan ping «hozir» deb yozilib jump-filter tomonidan rad etiladi.
 */

const p = (n: number, ts = `2026-08-02T10:0${n}:00.000Z`): BufferedPing => ({
  lat: 41.3 + n / 1000,
  lng: 69.2,
  accuracy: 10,
  speed: 5,
  heading: 90,
  ts,
});

describe('appendToBuffer', () => {
  it("yangi ping oxiriga qo'shiladi (tartib = vaqt tartibi)", () => {
    const b = appendToBuffer(appendToBuffer([], p(1)), p(2));
    expect(b.map((x) => x.ts)).toEqual([p(1).ts, p(2).ts]);
  });

  it('chegaradan oshsa ENG ESKISI tushadi, yangisi qoladi', () => {
    let b: BufferedPing[] = [];
    for (let i = 0; i < MAX_BUFFERED + 5; i++) {
      b = appendToBuffer(b, { ...p(1), ts: `t${i}` });
    }
    expect(b.length).toBe(MAX_BUFFERED);
    expect(b.map((x) => x.ts).at(0)).toBe('t5');
    expect(b.map((x) => x.ts).at(-1)).toBe(`t${MAX_BUFFERED + 4}`);
  });
});

describe('flushBuffer', () => {
  it('KETMA-KET yuboradi — hech qachon parallel emas', async () => {
    // Server izohi #7: bir vaqtda kelgan ikki ping masofani ikki marta sanaydi.
    let inFlight = 0;
    let maxParallel = 0;
    const send = vi.fn(async () => {
      inFlight++;
      maxParallel = Math.max(maxParallel, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
    });
    const r = await flushBuffer([p(1), p(2), p(3)], send);
    expect(r.sent).toBe(3);
    expect(r.remaining).toEqual([]);
    expect(maxParallel).toBe(1);
  });

  it("birinchi xatoda TO'XTAYDI va qolganini tartibida saqlaydi", async () => {
    const send = vi.fn(async (x: BufferedPing) => {
      if (x.ts === p(2).ts) throw new Error('network');
    });
    const r = await flushBuffer([p(1), p(2), p(3)], send);
    expect(r.sent).toBe(1);
    // p(2) qayta urinishga qoladi va p(3) undan OLDIN ketmaydi.
    expect(r.remaining.map((x) => x.ts)).toEqual([p(2).ts, p(3).ts]);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("server rad etsa (accepted:false) yozuv ISTE'MOL qilinadi — abadiy qayta urinilmaydi", async () => {
    // `accuracy`/`jump` sababli rad etilgan ping HECH QACHON qabul qilinmaydi;
    // buferda qolsa oqim abadiy tiqilib qolardi.
    const send = vi.fn(async () => ({ accepted: false, reason: 'accuracy', arrivedTripId: null }));
    const r = await flushBuffer([p(1), p(2)], send);
    expect(r.sent).toBe(2);
    expect(r.remaining).toEqual([]);
  });

  it("bo'sh bufer — hech narsa yubormaydi", async () => {
    const send = vi.fn();
    const r = await flushBuffer([], send);
    expect(r.sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("asl `ts` o'zgarmasdan uzatiladi (kech flush teleport qilmasin)", async () => {
    const sent: string[] = [];
    await flushBuffer([p(1), p(2)], async (x) => {
      sent.push(x.ts);
    });
    expect(sent).toEqual([p(1).ts, p(2).ts]);
  });
});

describe('loadBuffer / saveBuffer', () => {
  it("yozilgan bufer o'qib qaytariladi", () => {
    const store: Record<string, string> = {};
    const storage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    };
    saveBuffer(storage, [p(1), p(2)]);
    expect(loadBuffer(storage).map((x) => x.ts)).toEqual([p(1).ts, p(2).ts]);
  });

  it("buzuq JSON butun sahifani yiqitmaydi — bo'sh bufer qaytadi", () => {
    expect(loadBuffer({ getItem: () => '{not json' })).toEqual([]);
    expect(loadBuffer({ getItem: () => 'null' })).toEqual([]);
    expect(loadBuffer({ getItem: () => '{"a":1}' })).toEqual([]);
    expect(loadBuffer({ getItem: () => null })).toEqual([]);
  });

  it("shakli noto'g'ri yozuvlar tashlanadi, to'g'rilari qoladi", () => {
    const raw = JSON.stringify([p(1), { lat: 'x' }, null, { ...p(2), ts: 5 }]);
    expect(loadBuffer({ getItem: () => raw }).map((x) => x.ts)).toEqual([p(1).ts]);
  });

  it("localStorage kvotasi to'lsa jim o'tadi (ilova yiqilmaydi)", () => {
    expect(() =>
      saveBuffer(
        {
          setItem: () => {
            throw new Error('QuotaExceededError');
          },
        },
        [p(1)],
      ),
    ).not.toThrow();
  });
});

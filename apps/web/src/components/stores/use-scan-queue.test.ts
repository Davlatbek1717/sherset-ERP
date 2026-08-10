import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useScanQueue } from './use-scan-queue';

/**
 * TZ v3 §3: «Tez ketma-ket skanlar navbatga tushadi va TARTIBDA qayta
 * ishlanadi — birortasi yo'qolmaydi.»
 *
 * Bugungi kod har skanni darhol `void resolve(code)` bilan uchiradi: ikki
 * skan orasida `await api.get(...)` bor, ya'ni ikkinchi skan birinchisining
 * o'rtasida holatni o'qiydi (eskirgan `pending`/`cell` bilan) va natija skan
 * tartibiga bog'liq bo'lmay qoladi. Bu test navbatni qulflaydi.
 */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * Navbat — promise-zanjir, ya'ni handler MIKROTASK'da boshlanadi (sinxron
 * emas). Sinxron `act(() => …)` mikrotasklarni bo'shatmaydi, shuning uchun
 * har qadamdan keyin makrotaskka chiqamiz: `setTimeout(0)` shu paytgacha
 * navbatga tushgan BARCHA mikrotasklarni oxirigacha yugurtiradi (nechta
 * `.then` bo'g'ini borligini sanashga hojat qolmaydi — test beqaror emas).
 */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('useScanQueue', () => {
  it('ikkinchi skan birinchisi tugamaguncha BOSHLANMAYDI', async () => {
    const started: string[] = [];
    const finished: string[] = [];
    const gates = new Map<string, ReturnType<typeof deferred>>();

    const { result } = renderHook(() =>
      useScanQueue(async (code: string) => {
        started.push(code);
        const g = deferred();
        gates.set(code, g);
        await g.promise;
        finished.push(code);
      }),
    );

    await act(async () => {
      void result.current('A');
      void result.current('B');
      await flush();
    });

    expect(started).toEqual(['A']); // B hali navbatda
    expect(finished).toEqual([]);

    await act(async () => {
      gates.get('A')?.resolve();
      await flush();
    });

    expect(started).toEqual(['A', 'B']);
    expect(finished).toEqual(['A']);

    await act(async () => {
      gates.get('B')?.resolve();
      await flush();
    });

    expect(finished).toEqual(['A', 'B']);
  });

  it('bir skan yiqilsa navbat TO`XTAMAYDI (keyingisi baribir ishlaydi)', async () => {
    const done: string[] = [];
    const { result } = renderHook(() =>
      useScanQueue(async (code: string) => {
        if (code === 'BAD') throw new Error('resolve failed');
        done.push(code);
      }),
    );

    await act(async () => {
      void result.current('BAD');
      await result.current('GOOD');
    });

    expect(done).toEqual(['GOOD']);
  });

  it('enqueue havolasi qayta render`da O`ZGARMAYDI (kamera qayta ishga tushmaydi)', () => {
    const { result, rerender } = renderHook(({ n }) => useScanQueue(async () => void n), {
      initialProps: { n: 1 },
    });
    const first = result.current;
    rerender({ n: 2 });
    expect(result.current).toBe(first);
  });

  /**
   * `enqueue` barqaror bo'lgani uchun handler REF orqali yangilanadi. Agar
   * yangilash bo'g'ini (useEffect) tushib qolsa, hook birinchi render'dagi
   * handler'ni abadiy muzlatadi — modal state'i (staged ro'yxat, joriy
   * yacheyka) yangilangan bo'lsa ham skan ESKI closure bilan ishlaydi.
   * Yuqoridagi 3 test buni TUTMAYDI (ularda yo rerender yo'q, yo rerender'dan
   * keyin handler chaqirilmaydi) — shuning uchun alohida qulf.
   */
  it('rerender`dan keyin YANGI handler ishlaydi (eskisi muzlab qolmaydi)', async () => {
    const calls: string[] = [];
    const { result, rerender } = renderHook(
      ({ tag }: { tag: string }) =>
        useScanQueue(async (code: string) => {
          calls.push(`${tag}:${code}`);
        }),
      { initialProps: { tag: 'v1' } },
    );

    await act(async () => {
      void result.current('A');
      await flush();
    });
    expect(calls).toEqual(['v1:A']);

    rerender({ tag: 'v2' });

    await act(async () => {
      void result.current('B');
      await flush();
    });
    expect(calls).toEqual(['v1:A', 'v2:B']);
  });

  /**
   * TZ v3 §3 «jim rad etish yo'q». T4/T5 skanni `void enqueue(code)` bilan
   * uchiradi (input onKeyDown, kamera callback, wedge tutqichi) — o'shanda
   * qaytgan promise'ni hech kim kutmaydi, ya'ni `onError` bo'lmasa xato
   * ekranga ham chiqmaydi, unhandled-rejection ham bo'lmaydi.
   */
  describe('onError', () => {
    it('handler yiqilsa onError AYNAN bir marta va to`g`ri kod bilan chaqiriladi', async () => {
      const seen: Array<{ message: string; code: string }> = [];
      const { result } = renderHook(() =>
        useScanQueue(
          async (code: string) => {
            if (code === 'BAD') throw new Error('skan xatosi');
          },
          (err, code) => {
            seen.push({ message: (err as Error).message, code });
          },
        ),
      );

      await act(async () => {
        void result.current('OK');
        void result.current('BAD');
        await flush();
      });

      // Bir marta — muvaffaqiyatli 'OK' uchun chaqirilmaydi, 'BAD' uchun takrorlanmaydi.
      expect(seen).toEqual([{ message: 'skan xatosi', code: 'BAD' }]);
    });

    it('onError bo`lsa ham navbat keyingi skanni bajaradi', async () => {
      const done: string[] = [];
      const errored: string[] = [];
      const { result } = renderHook(() =>
        useScanQueue(
          async (code: string) => {
            if (code === 'BAD') throw new Error('skan xatosi');
            done.push(code);
          },
          (_err, code) => {
            errored.push(code);
          },
        ),
      );

      await act(async () => {
        void result.current('BAD');
        void result.current('GOOD');
        await flush();
      });

      expect(errored).toEqual(['BAD']);
      expect(done).toEqual(['GOOD']);
    });

    it('onError BERILMASA eski xulq: xato chaqiruvchiga uzatiladi, zanjir uzilmaydi', async () => {
      const done: string[] = [];
      const { result } = renderHook(() =>
        useScanQueue(async (code: string) => {
          if (code === 'BAD') throw new Error('resolve failed');
          done.push(code);
        }),
      );

      await act(async () => {
        await expect(result.current('BAD')).rejects.toThrow('resolve failed');
        await result.current('GOOD');
      });

      expect(done).toEqual(['GOOD']);
    });

    it('onError o`zgarganda ham enqueue havolasi O`ZGARMAYDI', () => {
      const { result, rerender } = renderHook(
        ({ tag }: { tag: string }) =>
          useScanQueue(
            async () => undefined,
            () => void tag,
          ),
        { initialProps: { tag: 'a' } },
      );
      const first = result.current;
      rerender({ tag: 'b' });
      expect(result.current).toBe(first);
    });
  });

  /**
   * «Birortasi yo'qolmaydi» — 3 skan, o'rtadagisi yiqiladi. Tartib TO'LIQ
   * qulflanadi: har skan oldingisi TUGAGACH (xato yo'li bilan tugasa ham,
   * onError chaqirilgandan keyin) boshlanadi.
   */
  it('uch skan TARTIBDA ishlanadi — o`rtadagisi yiqilsa ham qolganlari tushib qolmaydi', async () => {
    const order: string[] = [];
    const { result } = renderHook(() =>
      useScanQueue(
        async (code: string) => {
          order.push(`start:${code}`);
          await Promise.resolve(); // real handler kabi «await api.get(...)»
          if (code === 'B') throw new Error('B yiqildi');
          order.push(`end:${code}`);
        },
        (_err, code) => {
          order.push(`err:${code}`);
        },
      ),
    );

    await act(async () => {
      void result.current('A');
      void result.current('B');
      void result.current('C');
      await flush();
    });

    expect(order).toEqual(['start:A', 'end:A', 'start:B', 'err:B', 'start:C', 'end:C']);
  });
});

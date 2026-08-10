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
});

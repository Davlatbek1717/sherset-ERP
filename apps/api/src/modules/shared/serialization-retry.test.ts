import { describe, expect, it, vi } from 'vitest';
import { isSerializationConflict, withSerializationRetry } from './serialization-retry.js';

/** Testda kutish bo'lmasin. */
const nosleep = async () => undefined;
/** Determinstik jitter. */
const half = () => 0.5;

describe('isSerializationConflict', () => {
  it('Prisma P2034 (write conflict / deadlock)', () => {
    expect(isSerializationConflict({ code: 'P2034' })).toBe(true);
  });

  it('$queryRaw yiqilishi — P2010 + meta.code 40001 (bizdagi lockBalances holati)', () => {
    expect(isSerializationConflict({ code: 'P2010', meta: { code: '40001' } })).toBe(true);
  });

  it('deadlock 40P01', () => {
    expect(isSerializationConflict({ code: 'P2010', meta: { code: '40P01' } })).toBe(true);
  });

  it('faqat matn qolgan holat', () => {
    expect(
      isSerializationConflict({
        message: 'Raw query failed. Code: `40001`. Message: `could not serialize access`',
      }),
    ).toBe(true);
  });

  it('BIZNES xatosi konflikt EMAS — qayta urinilmasin', () => {
    expect(isSerializationConflict(new Error("Omborda yetarli miqdor yo'q"))).toBe(false);
    expect(isSerializationConflict({ code: 'P2002' })).toBe(false); // unique violation
    expect(isSerializationConflict({ code: 'P2025' })).toBe(false); // not found
  });

  it('null/undefined/satr yiqitmaydi', () => {
    expect(isSerializationConflict(null)).toBe(false);
    expect(isSerializationConflict(undefined)).toBe(false);
    expect(isSerializationConflict('40001')).toBe(false);
  });
});

describe('withSerializationRetry', () => {
  it('muvaffaqiyatli chaqiruv — bir marta yuradi', async () => {
    const fn = vi.fn(async () => 'ok');
    expect(await withSerializationRetry(fn, { sleep: nosleep })).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('konfliktdan keyin qayta urinadi va OXIRIDA muvaffaqiyat qaytaradi', async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n++;
      if (n < 3) throw { code: 'P2034' };
      return 'nihoyat';
    });
    const res = await withSerializationRetry(fn, { sleep: nosleep, random: half });
    expect(res).toBe('nihoyat');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('BIZNES xatosi DARHOL uzatiladi — qayta urinilmaydi', async () => {
    const fn = vi.fn(async () => {
      throw new Error("Omborda yetarli miqdor yo'q");
    });
    await expect(withSerializationRetry(fn, { sleep: nosleep })).rejects.toThrow(
      "Omborda yetarli miqdor yo'q",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('urinishlar tugasa — oxirgi konflikt xatosi uzatiladi', async () => {
    const fn = vi.fn(async () => {
      throw { code: 'P2034', message: 'write conflict' };
    });
    await expect(
      withSerializationRetry(fn, { attempts: 3, sleep: nosleep, random: half }),
    ).rejects.toMatchObject({ code: 'P2034' });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('kechikish eksponensial + jitter (25·2^i · (1+r))', async () => {
    const delays: number[] = [];
    const fn = async () => {
      throw { code: 'P2034' };
    };
    await withSerializationRetry(fn, {
      attempts: 4,
      baseDelayMs: 25,
      random: half,
      sleep: async (ms) => {
        delays.push(ms);
      },
    }).catch(() => undefined);
    // i=0,1,2 → 25·1·1.5=38 · 25·2·1.5=75 · 25·4·1.5=150
    expect(delays).toEqual([38, 75, 150]);
  });

  it('onRetry log-hook har qayta urinishda chaqiriladi', async () => {
    const onRetry = vi.fn();
    await withSerializationRetry(
      async () => {
        throw { code: 'P2034' };
      },
      { attempts: 3, sleep: nosleep, random: half, onRetry },
    ).catch(() => undefined);
    expect(onRetry).toHaveBeenCalledTimes(2); // oxirgi urinishdan keyin retry yo'q
  });

  it('attempts=1 → umuman qayta urinmaydi', async () => {
    const fn = vi.fn(async () => {
      throw { code: 'P2034' };
    });
    await expect(withSerializationRetry(fn, { attempts: 1, sleep: nosleep })).rejects.toBeTruthy();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

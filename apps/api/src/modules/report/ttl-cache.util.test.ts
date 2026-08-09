import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TtlCache } from './ttl-cache.util.js';

const T0 = new Date('2026-05-20T10:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('TtlCache', () => {
  it('loads once inside the TTL and again after it', async () => {
    const load = vi.fn(async () => 'v');
    const c = new TtlCache<string>(30_000);

    expect(await c.getOrLoad('k', load)).toBe('v');
    vi.setSystemTime(new Date(T0.getTime() + 29_999));
    expect(await c.getOrLoad('k', load)).toBe('v');
    expect(load).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(T0.getTime() + 30_001));
    await c.getOrLoad('k', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight load between concurrent callers', async () => {
    let release: (v: number) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<number>((res) => {
          release = res;
        }),
    );
    const c = new TtlCache<number>(30_000);

    const both = Promise.all([c.getOrLoad('k', load), c.getOrLoad('k', load)]);
    release(7);

    expect(await both).toEqual([7, 7]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed load', async () => {
    const load = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce('ok');
    const c = new TtlCache<string>(30_000);

    await expect(c.getOrLoad('k', load)).rejects.toThrow('db down');
    // Same instant — a cached rejection would be served here instead.
    expect(await c.getOrLoad('k', load)).toBe('ok');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps distinct keys apart and evicts past maxEntries', async () => {
    const c = new TtlCache<string>(30_000, 2);
    await c.getOrLoad('a', async () => 'A');
    await c.getOrLoad('b', async () => 'B');
    await c.getOrLoad('c', async () => 'C');

    const reloadA = vi.fn(async () => 'A2');
    expect(await c.getOrLoad('a', reloadA)).toBe('A2'); // 'a' was the eviction victim
    expect(await c.getOrLoad('c', async () => 'C2')).toBe('C'); // 'c' still cached
    expect(reloadA).toHaveBeenCalledTimes(1);
  });

  it('clear() drops everything', async () => {
    const load = vi.fn(async () => 'v');
    const c = new TtlCache<string>(30_000);
    await c.getOrLoad('k', load);
    c.clear();
    await c.getOrLoad('k', load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

import { describe, expect, it } from 'vitest';
import { MinIntervalGate } from './min-interval-gate.js';

/**
 * Nominatim siyosati: «absolute maximum of 1 request per second», bitta oqimda.
 * Buzilsa IP bloklanadi — ya'ni bu testlar ishlash sharti, nafislik emas.
 *
 * Vaqt soxta: `now` qo'lda suriladi, `sleep` esa uni surib qo'yadi — test
 * real sekund kutmaydi, lekin ORALIQ mantiqi to'liq tekshiriladi.
 */
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
    get time() {
      return t;
    },
  };
}

describe('MinIntervalGate', () => {
  it("ketma-ket so'rovlar orasida kamida minIntervalMs bo'ladi", async () => {
    const clock = fakeClock();
    const gate = new MinIntervalGate({ minIntervalMs: 1000, now: clock.now, sleep: clock.sleep });
    const starts: number[] = [];
    const task = () => {
      starts.push(clock.now());
      return Promise.resolve('ok');
    };

    await Promise.all([gate.run(task), gate.run(task), gate.run(task)]);

    expect(starts.length).toBe(3);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1000);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(1000);
  });

  it("PARALLEL ishlamaydi — bir vaqtda faqat bitta so'rov uchadi", async () => {
    const clock = fakeClock();
    const gate = new MinIntervalGate({ minIntervalMs: 0, now: clock.now, sleep: clock.sleep });
    let inFlight = 0;
    let maxParallel = 0;
    const task = async () => {
      inFlight++;
      maxParallel = Math.max(maxParallel, inFlight);
      await Promise.resolve();
      inFlight--;
    };

    await Promise.all([gate.run(task), gate.run(task), gate.run(task), gate.run(task)]);
    expect(maxParallel).toBe(1);
  });

  it("birinchi so'rov kutmaydi (bo'sh navbat darhol o'tadi)", async () => {
    const clock = fakeClock();
    const gate = new MinIntervalGate({ minIntervalMs: 5000, now: clock.now, sleep: clock.sleep });
    await gate.run(async () => 'x');
    expect(clock.time).toBe(0);
  });

  it("oradan vaqt o'tgan bo'lsa qo'shimcha kutmaydi", async () => {
    const clock = fakeClock();
    const gate = new MinIntervalGate({ minIntervalMs: 1000, now: clock.now, sleep: clock.sleep });
    await gate.run(async () => 'a');
    clock.advance(3000); // dispecher 3 sekunddan keyin bosdi
    const before = clock.time;
    await gate.run(async () => 'b');
    expect(clock.time).toBe(before); // uxlamadi
  });

  it('bitta xato NAVBATNI buzmaydi — keyingilari ishlayveradi', async () => {
    // Aks holda bitta tarmoq uzilishi geokoderni butunlay o'ldirardi.
    const clock = fakeClock();
    const gate = new MinIntervalGate({ minIntervalMs: 0, now: clock.now, sleep: clock.sleep });
    const failed = gate.run(async () => {
      throw new Error('network');
    });
    await expect(failed).rejects.toThrow('network');
    await expect(gate.run(async () => 'keyingisi')).resolves.toBe('keyingisi');
  });

  it('xato chaqiruvchiga YETADI (jim yutilmaydi)', async () => {
    const gate = new MinIntervalGate({ minIntervalMs: 0 });
    await expect(
      gate.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
});

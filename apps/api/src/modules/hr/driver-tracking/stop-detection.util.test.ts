import { describe, expect, it } from 'vitest';
import { type StopPing, detectMovement, pathDistanceMeters } from './stop-detection.util.js';

// Toshkent atrofi bazaviy nuqta.
const BASE = { lat: 41.311, lng: 69.24 };
const T0 = new Date('2026-07-28T08:00:00.000Z');
const at = (sec: number): Date => new Date(T0.getTime() + sec * 1000);

/** ~metr → daraja siljish (kenglik bo'yicha; 1° ≈ 111_320 m). */
const north = (meters: number): number => BASE.lat + meters / 111_320;

describe('detectMovement — stop-detection (TZ §7)', () => {
  it('< 2 ping → unknown (hukm yetarli emas)', () => {
    expect(detectMovement([], at(0)).status).toBe('unknown');
    expect(detectMovement([{ ...BASE, at: at(0) }], at(10)).status).toBe('unknown');
  });

  it("doimiy harakat (katta siljish) → moving, to'xtash yo'q", () => {
    const pings: StopPing[] = Array.from({ length: 6 }, (_, i) => ({
      lat: north(i * 200), // har ping 200m shimolga
      lng: BASE.lng,
      at: at(i * 30),
      speed: 12,
    }));
    const s = detectMovement(pings, at(150));
    expect(s.status).toBe('moving');
    expect(s.stops).toHaveLength(0);
    expect(s.currentStopSec).toBe(0);
    expect(s.movingSec).toBeGreaterThan(0);
  });

  it('statsionar < 3 daqiqa → TASDIQLANMAYDI (hali moving)', () => {
    // Bir joyда 2.5 daqiqa (150s), keyin ma\'lumot tugaydi.
    const pings: StopPing[] = [
      { ...BASE, at: at(0), speed: 0 },
      { lat: north(5), lng: BASE.lng, at: at(60), speed: 0.2 },
      { lat: north(8), lng: BASE.lng, at: at(120), speed: 0.1 },
      { lat: north(6), lng: BASE.lng, at: at(150), speed: 0.3 },
    ];
    const s = detectMovement(pings, at(160));
    expect(s.status).toBe('moving'); // 150s < 180s → tasdiqlanmadi
    expect(s.currentStopStartedAt).toBeNull();
    expect(s.stops).toHaveLength(0);
  });

  it('statsionar ≥ 3 daqiqa (davom etmoqda) → stopped + currentStopSec `now`gа', () => {
    // Bir joyда: 0..240s (4 daqiqa), hali davom.
    const pings: StopPing[] = [
      { ...BASE, at: at(0), speed: 0 },
      { lat: north(4), lng: BASE.lng, at: at(60), speed: 0.1 },
      { lat: north(7), lng: BASE.lng, at: at(120), speed: 0.2 },
      { lat: north(3), lng: BASE.lng, at: at(200), speed: 0.1 },
      { lat: north(5), lng: BASE.lng, at: at(240), speed: 0.0 },
    ];
    const now = at(300); // to'xtash boshidan 300s
    const s = detectMovement(pings, now);
    expect(s.status).toBe('stopped');
    expect(s.currentStopStartedAt).toEqual(at(0)); // anchor = birinchi ping
    expect(s.currentStopSec).toBe(300); // now - anchor.since
    expect(s.stops).toHaveLength(1);
    expect(s.stops[0]?.endedAt).toBeNull(); // davom etmoqda
  });

  it("to'xta → keyin harakatlan (≥40m chiqish) → segment yopiladi", () => {
    const pings: StopPing[] = [
      { ...BASE, at: at(0), speed: 0 }, // to'xtash boshlanadi (anchor)
      { lat: north(5), lng: BASE.lng, at: at(120), speed: 0.1 },
      { lat: north(8), lng: BASE.lng, at: at(240), speed: 0.2 }, // 240s → tasdiqlandi
      { lat: north(120), lng: BASE.lng, at: at(300), speed: 8 }, // 120m > 40m → chiqdi
      { lat: north(400), lng: BASE.lng, at: at(360), speed: 12 },
    ];
    const s = detectMovement(pings, at(400));
    expect(s.status).toBe('moving'); // oxirida harakatда
    expect(s.stops).toHaveLength(1);
    expect(s.stops[0]?.endedAt).toEqual(at(300)); // chiqqan payt
    expect(s.stops[0]?.startedAt).toEqual(at(0));
    expect(s.stops[0]?.durationSec).toBe(300);
  });

  it("gisterezis: 30–40m oralig'idagi mayda titrash to'xtashni buzmaydi", () => {
    // To'xtaган (anchor BASE), keyin 35m tebranish (30<35<40) — chiqish EMAS.
    const pings: StopPing[] = [
      { ...BASE, at: at(0), speed: 0 },
      { lat: north(10), lng: BASE.lng, at: at(120), speed: 0.2 },
      { lat: north(35), lng: BASE.lng, at: at(240), speed: 0.4 }, // 35m < 40 → hali to'xtash
      { lat: north(20), lng: BASE.lng, at: at(300), speed: 0.1 },
    ];
    const s = detectMovement(pings, at(320));
    expect(s.status).toBe('stopped'); // 35m tebranish chiqarmadi
    expect(s.currentStopStartedAt).toEqual(at(0));
  });

  it("tirbandlikда sekin-emaklash (speed<1.5, disp<30) → to'xtash sifatida", () => {
    const pings: StopPing[] = [
      { ...BASE, at: at(0), speed: 1.0 },
      { lat: north(20), lng: BASE.lng, at: at(90), speed: 1.2 },
      { lat: north(25), lng: BASE.lng, at: at(200), speed: 0.8 },
      { lat: north(28), lng: BASE.lng, at: at(300), speed: 1.1 },
    ];
    const s = detectMovement(pings, at(310));
    expect(s.status).toBe('stopped');
  });

  // Review #1 (HIGH): oflayn-bo'shliq (>15 daqiqa) NA harakat NA to'xtash bucket'iga
  // kirmaydi — soxta soat qo'shilmaydi (smena KPI'sini buzmaydi).
  it("uzoq oflayn-bo'shliq bucket'ga qo'shilmaydi (distance bilan simmetrik)", () => {
    const pings: StopPing[] = [
      { ...BASE, at: at(0), speed: 0 },
      { ...BASE, at: at(300), speed: 0.1 }, // depoда statsionar (tasdiqlandi)
      { ...BASE, at: at(600), speed: 0.1 },
      { ...BASE, at: at(600 + 3600), speed: 0.1 }, // 1 SOAT oflayn, keyin depoда
    ];
    const s = detectMovement(pings, at(600 + 3600 + 10));
    // Bo'shliqsiz bo'lsa stoppedSec ~4200 bo'lardi (3600 soxta). Fix bilan ~600.
    expect(s.stoppedSec).toBeLessThan(1000);
    expect(s.stops).toHaveLength(1);
    expect(s.stops[0]?.endedAt).toEqual(at(600)); // bo'shliqdan oldingi ishonchli nuqta
  });

  // Review #8 (LOW): turgan joyдаgi yagona Doppler speed-spike'i (2.3 m/s, disp~0)
  // tasdiqlangan to'xtashni BO'LMAYDI (chiqish endi siljish ham talab qiladi).
  it("turgan joyдаgi speed-spike'i to'xtashni bo'lmaydi", () => {
    const pings: StopPing[] = [
      { ...BASE, at: at(0), speed: 0.0 },
      { lat: north(4), lng: BASE.lng, at: at(60), speed: 0.1 },
      { lat: north(6), lng: BASE.lng, at: at(120), speed: 0.2 },
      { lat: north(5), lng: BASE.lng, at: at(200), speed: 0.1 }, // tasdiqlandi (≥180s)
      { lat: north(5), lng: BASE.lng, at: at(260), speed: 2.3 }, // Doppler, joy o'zgarmagan
      { lat: north(5), lng: BASE.lng, at: at(320), speed: 0.1 }, // hali depoда
    ];
    const s = detectMovement(pings, at(330));
    expect(s.status).toBe('stopped');
    expect(s.currentStopSec).toBeGreaterThan(300);
    expect(s.stops).toHaveLength(1);
  });
});

describe('pathDistanceMeters', () => {
  it("bo'sh / yagona → 0", () => {
    expect(pathDistanceMeters([])).toBe(0);
    expect(pathDistanceMeters([BASE])).toBe(0);
  });
  it("ketma-ket masofalar yig'indisi", () => {
    const d = pathDistanceMeters([
      BASE,
      { lat: north(100), lng: BASE.lng },
      { lat: north(300), lng: BASE.lng },
    ]);
    expect(d).toBeGreaterThan(290);
    expect(d).toBeLessThan(310);
  });
});

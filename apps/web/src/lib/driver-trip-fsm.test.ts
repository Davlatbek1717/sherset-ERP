import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEXT_STATUS, type TripStatus, coordsValid } from './driver-trip-fsm';

/**
 * Yetkazma holat-mashinasi + serverga nisbatan DRIFT-QULF.
 *
 * FE jadvali qaysi tugmalarni chizishni hal qiladi; server jadvali qaysi
 * o'tishni QABUL qilishni hal qiladi. Ular farq qilib ketsa dispecher
 * bosgan tugma 400 qaytaradi yoki haqiqiy o'tish ekranda umuman ko'rinmaydi.
 * Shuning uchun test ikkala manbani O'QIB solishtiradi — «yodimda bor» emas.
 */

// `process.cwd()` = apps/web (vitest ildizi) — repo naqshi, `pos-cart-profit.test.ts` bilan bir xil.
const SERVER_SRC = readFileSync(
  path.join(
    process.cwd(),
    '..',
    'api',
    'src',
    'modules',
    'hr',
    'driver-tracking',
    'driver-trip.service.ts',
  ),
  'utf8',
);

/** Serverdagi `ALLOWED_TRANSITIONS` literalini o'qib obyektga aylantiradi. */
function parseServerTransitions(): Record<string, string[]> {
  const block = SERVER_SRC.match(/const ALLOWED_TRANSITIONS[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1];
  if (!block) throw new Error("ALLOWED_TRANSITIONS topilmadi — server fayli o'zgardimi?");
  const out: Record<string, string[]> = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^\s*(\w+):\s*\[(.*)\],\s*$/);
    if (!m?.[1]) continue;
    const values = (m[2] ?? '')
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    out[m[1]] = values;
  }
  return out;
}

describe('driver-trip FSM — server bilan drift-qulf', () => {
  it("serverdagi jadval o'qiladi (parser eskirsa test yiqiladi, jim o'tmaydi)", () => {
    const server = parseServerTransitions();
    expect(Object.keys(server).sort()).toEqual([
      'arrived',
      'assigned',
      'cancelled',
      'completed',
      'enroute',
    ]);
  });

  it('FE jadvali server jadvaliga AYNAN teng', () => {
    const server = parseServerTransitions();
    const fe = Object.fromEntries(
      Object.entries(NEXT_STATUS).map(([k, v]) => [k, [...v]]),
    ) as Record<string, string[]>;
    expect(fe).toEqual(server);
  });

  it("yakuniy holatlardan chiqish yo'q (completed/cancelled)", () => {
    expect(NEXT_STATUS.completed).toEqual([]);
    expect(NEXT_STATUS.cancelled).toEqual([]);
  });

  it("orqaga sakrash yo'q — hech bir holat o'zidan oldingisiga qaytmaydi", () => {
    const order: TripStatus[] = ['assigned', 'enroute', 'arrived', 'completed'];
    for (let i = 0; i < order.length; i++) {
      const from = order[i];
      if (!from) continue;
      for (const to of NEXT_STATUS[from]) {
        if (to === 'cancelled') continue;
        expect(order.indexOf(to)).toBeGreaterThan(i);
      }
    }
  });
});

describe('coordsValid — server TripAssignSchema chegaralari', () => {
  it('haqiqiy Toshkent koordinatasi qabul qilinadi', () => {
    expect(coordsValid('41.311081', '69.240562')).toBe(true);
  });

  it("bo'sh maydon rad etiladi (0 deb o'qilib Gvineya ko'rfaziga yubormasin)", () => {
    // Number('') === 0 — himoyasiz kod buni «to'g'ri koordinata» deb qabul qilardi.
    expect(coordsValid('', '69.2')).toBe(false);
    expect(coordsValid('41.3', '')).toBe(false);
    expect(coordsValid('   ', '  ')).toBe(false);
  });

  it('chegaradan tashqari rad etiladi', () => {
    expect(coordsValid('91', '69.2')).toBe(false);
    expect(coordsValid('-91', '69.2')).toBe(false);
    expect(coordsValid('41.3', '181')).toBe(false);
    expect(coordsValid('41.3', '-181')).toBe(false);
  });

  it("chegaraning O'ZI qabul qilinadi (server ham `min/max` inklyuziv)", () => {
    expect(coordsValid('90', '180')).toBe(true);
    expect(coordsValid('-90', '-180')).toBe(true);
  });

  it("raqam bo'lmagan qiymat rad etiladi", () => {
    expect(coordsValid('abc', '69.2')).toBe(false);
    expect(coordsValid('41.3', 'NaN')).toBe(false);
    expect(coordsValid('Infinity', '69.2')).toBe(false);
  });

  it('nol koordinata ATAYLAB qabul qilinadi (chegarada, lekin haqiqiy qiymat)', () => {
    expect(coordsValid('0', '0')).toBe(true);
  });
});

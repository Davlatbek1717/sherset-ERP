import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseNominatim } from './nominatim-geocode.service.js';

/**
 * Nominatim javobini tahlil qilish.
 *
 * ASOSIY TUZOQ: Nominatim `lat`/`lon` ni **SATR** qaytaradi va maydon nomi
 * `lon` (`lng` EMAS) — Yandex esa bitta «lng lat» satrida beradi. Ikkalasini
 * chalkashtirish haydovchini boshqa qit'aga yuboradi, va bu jimgina bo'ladi.
 */

const sample = [
  {
    lat: '41.3110810',
    lon: '69.2405624',
    display_name: "Amir Temur ko'chasi, Toshkent, O'zbekiston",
    addresstype: 'road',
    type: 'primary',
  },
];

describe('parseNominatim', () => {
  it('satr lat/lon ni raqamga aylantiradi va lat/lng ni ALMASHTIRMAYDI', () => {
    const r = parseNominatim(sample);
    expect(r).not.toBeNull();
    // Toshkent: lat ~41, lng ~69. Almashsa lat=69 bo'lardi (mavjud bo'lmagan kenglik).
    expect(r?.lat).toBeCloseTo(41.311081, 5);
    expect(r?.lng).toBeCloseTo(69.2405624, 5);
    expect(r?.formatted).toContain('Toshkent');
  });

  it("addresstype → shu loyihaning precision lug'atiga solinadi", () => {
    expect(parseNominatim([{ ...sample[0], addresstype: 'house' }])?.precision).toBe('exact');
    expect(parseNominatim([{ ...sample[0], addresstype: 'road' }])?.precision).toBe('street');
    expect(parseNominatim([{ ...sample[0], addresstype: 'city' }])?.precision).toBe('near');
    expect(parseNominatim([{ ...sample[0], addresstype: 'quux' }])?.precision).toBe('other');
  });

  it("bo'sh / noto'g'ri javob → null (graceful, hech qachon throw emas)", () => {
    expect(parseNominatim(null)).toBeNull();
    expect(parseNominatim([])).toBeNull();
    expect(parseNominatim({})).toBeNull();
    expect(parseNominatim([null])).toBeNull();
    expect(parseNominatim(['matn'])).toBeNull();
  });

  it("BO'SH satr koordinata bo'lib o'tib ketmaydi (Number('') === 0)", () => {
    // Himoyasiz kod buni lat=0,lng=0 — Gvineya ko'rfazi — deb qabul qilardi.
    expect(parseNominatim([{ lat: '', lon: '', display_name: 'x' }])).toBeNull();
    expect(parseNominatim([{ lat: '   ', lon: '69.2' }])).toBeNull();
  });

  it("raqam bo'lmagan yoki chegaradan tashqari qiymat → null", () => {
    expect(parseNominatim([{ lat: 'abc', lon: '69.2' }])).toBeNull();
    expect(parseNominatim([{ lat: '91', lon: '69.2' }])).toBeNull();
    expect(parseNominatim([{ lat: '41.3', lon: '181' }])).toBeNull();
    expect(parseNominatim([{ lat: null, lon: '69.2' }])).toBeNull();
  });

  it("display_name yo'q bo'lsa formatted=null, lekin koordinata qoladi", () => {
    const r = parseNominatim([{ lat: '41.3', lon: '69.2' }]);
    expect(r?.formatted).toBeNull();
    expect(r?.lat).toBeCloseTo(41.3, 5);
  });
});

/**
 * Manba-skaner: Nominatim foydalanish siyosatining shartlari kodda ustidan
 * o'chib ketmasin. Bular xulq-testlari bilan tutilmaydi (tashqi HTTP kerak),
 * lekin buzilishi IP-ban bilan tugaydi.
 */
describe("Nominatim siyosat qo'riqchisi (manba-skaner)", () => {
  const SRC = readFileSync(
    path.join(process.cwd(), 'src/modules/hr/driver-tracking/nominatim-geocode.service.ts'),
    'utf8',
  );
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('chastota darvozasi ishlatiladi va oraliq >= 1000ms', () => {
    expect(CODE).toContain('MinIntervalGate');
    const m = CODE.match(/MIN_INTERVAL_MS\s*=\s*([0-9_]+)/);
    expect(m).not.toBeNull();
    expect(Number((m?.[1] ?? '0').replace(/_/g, ''))).toBeGreaterThanOrEqual(1000);
  });

  it("fetch DOIM darvoza orqali ketadi (to'g'ridan-to'g'ri fetch yo'q)", () => {
    // Darvozasiz fetch = siyosat buzilishi (parallel/tez-tez so'rov → ban).
    // Ikki shart birga: (a) gate.run ichida fetch bor; (b) faylda fetch AYNAN
    // bitta — ya'ni darvozadan chetlab o'tadigan ikkinchi chaqiruv yo'q.
    expect(CODE).toMatch(/gate\.run\(\s*\(\)\s*=>\s*fetch\(/);
    expect((CODE.match(/\bfetch\(/g) ?? []).length).toBe(1);
  });

  it("o'zini tanitadigan User-Agent yuboriladi", () => {
    // Standart kutubxona UA'si bilan Nominatim so'rovni rad etadi.
    expect(CODE).toContain("'User-Agent'");
    expect(CODE).toContain('NOMINATIM_USER_AGENT');
  });

  it('natijalar keshlanadi (musbat ham, manfiy ham)', () => {
    expect(CODE).toContain('this.cache.has(cacheKey)');
    expect(CODE).toMatch(/remember\(cacheKey,\s*null\)/);
  });
});

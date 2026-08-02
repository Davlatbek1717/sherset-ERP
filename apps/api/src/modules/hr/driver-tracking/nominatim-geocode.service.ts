import { Injectable, Logger } from '@nestjs/common';
import type { GeocodeProvider, GeocodeResult } from './geocode.port.js';
import { MinIntervalGate } from './min-interval-gate.js';

/**
 * OpenStreetMap Nominatim geokoderi (manzil → koordinata).
 *
 * NEGA U DEFAULT: Yandex Maps API'ning bepul shartlari bu loyihaga to'g'ri
 * kelmaydi (yopiq ERP · natijani saqlaymiz · **xodim/transportni real vaqtda
 * kuzatish alohida taqiqlangan**), pullik litsenziya esa 208 800 ₽/yil.
 * Nominatim ODbL ostida: saqlash mumkin, kuzatuv taqiqi yo'q, atribut talab
 * qilinadi.
 *
 * ⚠️ FOYDALANISH SIYOSATI — BULAR SHART, OPTIMIZATSIYA EMAS
 * (https://operations.osmfoundation.org/policies/nominatim/):
 *  1. **Maksimum 1 so'rov/sekund**, bitta oqimda → `MinIntervalGate`.
 *  2. **O'zini tanitadigan User-Agent** — kutubxonaning standart UA'si bilan
 *     so'rov RAD ETILADI. `NOMINATIM_USER_AGENT` env bilan sozlanadi.
 *  3. **Kesh majburiy** — bir xil matn qayta so'ralmaydi (musbat ham, manfiy ham).
 *  4. **Avtomatik-to'ldirish (autocomplete) QAT'IY TAQIQLANGAN** — ban sababi.
 *     Shuning uchun FE'da har harfda emas, **«Topish» tugmasi** bosilganda
 *     chaqiriladi (`driver-trip-assign.tsx`). Buni `onChange`ga ulash — ban.
 *  5. Atribut: xarita allaqachon Leaflet+OSM va «© OpenStreetMap» ni ko'rsatadi.
 *
 * Natija O'zbekistonga cheklanadi (`countrycodes=uz`) — «Amir Temur» kabi
 * umumiy nomlar boshqa davlatga tushib ketmasin.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const MIN_INTERVAL_MS = 1_100; // 1 s/so'rov + zaxira (soat farqiga chidamli)
const TIMEOUT_MS = 10_000;
const DEFAULT_UA = 'SherestERP/1.0 (+https://erp.sherset.uz; driver delivery geocoding)';

@Injectable()
export class NominatimGeocodeService implements GeocodeProvider {
  readonly name = 'nominatim';
  private readonly logger = new Logger(NominatimGeocodeService.name);
  private readonly cache = new Map<string, GeocodeResult | null>();
  private readonly gate = new MinIntervalGate({ minIntervalMs: MIN_INTERVAL_MS });

  /**
   * Nominatim kalit talab qilmaydi — u DOIM yoqilgan, ataylab o'chirilmasa
   * (`GEOCODER_PROVIDER=none`). Shu sababli bu yerda `true`; provayder tanlovi
   * `GeocodeService` da.
   */
  isEnabled(): boolean {
    return true;
  }

  async geocode(address: string): Promise<GeocodeResult | null> {
    const q = address.trim();
    if (q.length === 0) return null;
    const cacheKey = q.toLowerCase();
    // Manfiy natija ham keshlanadi — «topilmadi» uchun qayta-qayta so'rov
    // yuborish siyosatning «repeated identical queries» bandiga tushadi.
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey) ?? null;

    try {
      const url =
        `${NOMINATIM_URL}?format=jsonv2&limit=1&addressdetails=1&countrycodes=uz` +
        `&q=${encodeURIComponent(q)}`;
      const res = await this.gate.run(() =>
        fetch(url, {
          headers: {
            'User-Agent': process.env.NOMINATIM_USER_AGENT || DEFAULT_UA,
            'Accept-Language': 'uz,ru;q=0.9,en;q=0.8',
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        }),
      );
      if (!res.ok) {
        // 403/429 = siyosat buzilgani signali — ALOHIDA ko'rinsin.
        this.logger.warn(
          res.status === 403 || res.status === 429
            ? `Nominatim ${res.status} — foydalanish siyosati (UA yoki chastota) tekshirilsin`
            : `Nominatim HTTP ${res.status}`,
        );
        return this.remember(cacheKey, null);
      }
      return this.remember(cacheKey, parseNominatim(await res.json()));
    } catch (e) {
      // Tarmoq/timeout — KESHLAMAYMIZ (vaqtinchalik bo'lishi mumkin).
      this.logger.warn(`Nominatim geocode failed: ${(e as Error).message}`);
      return null;
    }
  }

  private remember(key: string, value: GeocodeResult | null): GeocodeResult | null {
    this.cache.set(key, value);
    return value;
  }
}

/**
 * Nominatim `jsonv2` javobini xavfsiz tahlil qiladi. Eksport — test uchun.
 *
 * DIQQAT: Nominatim `lat`/`lon` ni **SATR** sifatida qaytaradi (Yandex esa
 * bitta «lng lat» satrida) — shuning uchun ikkalasi alohida parser.
 * Maydon nomi `lon`, `lng` EMAS.
 */
export function parseNominatim(json: unknown): GeocodeResult | null {
  const first = Array.isArray(json) ? json[0] : undefined;
  if (!first || typeof first !== 'object') return null;
  const row = first as {
    lat?: unknown;
    lon?: unknown;
    display_name?: unknown;
    addresstype?: unknown;
    type?: unknown;
  };
  const lat = Number(row.lat);
  const lng = Number(row.lon);
  // `Number('')` === 0 — bo'sh satr koordinata bo'lib o'tib ketmasin.
  if (typeof row.lat !== 'string' && typeof row.lat !== 'number') return null;
  if (typeof row.lon !== 'string' && typeof row.lon !== 'number') return null;
  if (String(row.lat).trim() === '' || String(row.lon).trim() === '') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    lat,
    lng,
    precision: precisionOf(row.addresstype ?? row.type),
    formatted: typeof row.display_name === 'string' ? row.display_name : null,
  };
}

/**
 * Nominatim'da Yandex'dagi `precision` yo'q. `addresstype`ni SHU loyiha
 * ishlatadigan lug'atga solamiz, shunda dispecher ikki provayderda bir xil
 * so'zni ko'radi.
 */
function precisionOf(addresstype: unknown): string {
  switch (addresstype) {
    case 'house':
    case 'building':
      return 'exact';
    case 'road':
    case 'residential':
      return 'street';
    case 'city':
    case 'town':
    case 'village':
    case 'suburb':
      return 'near';
    default:
      return 'other';
  }
}

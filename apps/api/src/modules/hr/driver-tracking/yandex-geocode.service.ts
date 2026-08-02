import { Injectable, Logger } from '@nestjs/common';
import type { GeocodeProvider, GeocodeResult } from './geocode.port.js';

// `GeocodeResult` endi `geocode.port.ts` da (ikki provayder bitta shakl
// qaytarishi uchun). Eski import yo'llari buzilmasin deb re-eksport qilinadi.
export type { GeocodeResult };

/**
 * Yandex Geocoder (manzil → koordinata) — TZ 2026-07-28 §8.
 *
 * ⚠️ FAQAT PULLIK LITSENZIYA BILAN. Yandex Maps API'ning BEPUL sharti bu
 * loyihaga to'g'ri kelmaydi (2026-08-02 tekshiruvi): loyiha ochiq kirishli
 * bo'lishi shart (bizniki login ortida) · natijani saqlash taqiqlanadi (biz
 * `driver_trips.dest_lat/lng` ga yozamiz) · **xodim/transportni real vaqtda
 * kuzatish alohida taqiqlangan** — bu loyihaning aynan o'zi. Shu sababli
 * default provayder Nominatim (`geocode.service.ts`); bu servis faqat
 * `GEOCODER_PROVIDER=yandex` + `YANDEX_API_KEY` bo'lganda ishlaydi.
 *
 * Kalitsiz yoki xatoda `null` qaytaradi (graceful). Bir xil matn
 * qayta-geokodlanmaydi (in-memory kesh).
 */
@Injectable()
export class YandexGeocodeService implements GeocodeProvider {
  readonly name = 'yandex';
  private readonly logger = new Logger(YandexGeocodeService.name);
  private readonly cache = new Map<string, GeocodeResult | null>();

  private get apiKey(): string | undefined {
    return process.env.YANDEX_API_KEY;
  }

  /** Kalit sozlanganmi (frontend «avto-geocode» tugmasini yoqish uchun). */
  isEnabled(): boolean {
    return !!this.apiKey;
  }

  async geocode(address: string): Promise<GeocodeResult | null> {
    const key = this.apiKey;
    const q = address.trim();
    if (!key || q.length === 0) return null;
    const cacheKey = q.toLowerCase();
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey) ?? null;

    try {
      const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${encodeURIComponent(key)}&format=json&results=1&geocode=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(`Yandex geocode HTTP ${res.status}`);
        return this.remember(cacheKey, null);
      }
      const parsed = parseYandexGeocode(await res.json());
      return this.remember(cacheKey, parsed);
    } catch (e) {
      this.logger.warn(`Yandex geocode failed: ${(e as Error).message}`);
      return null; // xato — keshlamaymiz (vaqtinchalik tarmoq bo'lishi mumkin)
    }
  }

  private remember(key: string, value: GeocodeResult | null): GeocodeResult | null {
    this.cache.set(key, value);
    return value;
  }
}

/**
 * Yandex 1.x JSON javobini xavfsiz tahlil qiladi (har shakl-nomuvofiqlik → null).
 * `Point.pos` = "lng lat" (Yandex tartibi — LNG BIRINCHI). Eksport — test uchun.
 */
export function parseYandexGeocode(json: unknown): GeocodeResult | null {
  const member = (
    json as {
      response?: { GeoObjectCollection?: { featureMember?: unknown[] } };
    }
  )?.response?.GeoObjectCollection?.featureMember?.[0] as
    | {
        GeoObject?: {
          Point?: { pos?: string };
          metaDataProperty?: { GeocoderMetaData?: { precision?: string; text?: string } };
        };
      }
    | undefined;
  const pos = member?.GeoObject?.Point?.pos;
  if (typeof pos !== 'string') return null;
  const [lngStr, latStr] = pos.split(' ');
  const lng = Number(lngStr);
  const lat = Number(latStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const meta = member?.GeoObject?.metaDataProperty?.GeocoderMetaData;
  return { lat, lng, precision: meta?.precision ?? 'other', formatted: meta?.text ?? null };
}

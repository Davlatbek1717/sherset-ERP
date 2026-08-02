import { Inject, Injectable, Logger } from '@nestjs/common';
import type { GeocodeProvider, GeocodeResult } from './geocode.port.js';
import { NominatimGeocodeService } from './nominatim-geocode.service.js';
import { YandexGeocodeService } from './yandex-geocode.service.js';

/**
 * Geokoder fasadi — qaysi provayder ishlashini bitta joyda hal qiladi.
 * Kontroller shu servisga bog'lanadi, konkret provayderga EMAS.
 *
 * Tanlov (`GEOCODER_PROVIDER` env):
 *   'nominatim' (DEFAULT) — OpenStreetMap. Kalit kerak emas, saqlash mumkin,
 *                           kuzatuv taqiqi yo'q. Sekin (1 so'rov/sek) va
 *                           O'zbekiston manzil sifati Yandex'dan pastroq.
 *   'yandex'              — faqat egasi PULLIK litsenziya olgan bo'lsa
 *                           (`YANDEX_API_KEY`). Bepul tarif bu loyihaga
 *                           to'g'ri kelmaydi — sabablari `geocode.port.ts` da.
 *   'none'                — geokoder o'chiq; dispecher koordinatani qo'lda
 *                           kiritadi (panel baribir to'liq ishlaydi).
 *
 * Noma'lum qiymat yozilsa — default'ga tushamiz va OGOHLANTIRAMIZ, jim
 * o'chib qolmaymiz (typo tufayli funksiya bilinmay yo'qolishi eng yomon holat).
 */
export type GeocoderProviderName = 'nominatim' | 'yandex' | 'none';

export const DEFAULT_PROVIDER: GeocoderProviderName = 'nominatim';

/** Env qiymatini normallashtiradi. Eksport — test uchun. */
export function resolveProviderName(raw: string | undefined): {
  name: GeocoderProviderName;
  invalid: boolean;
} {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === '') return { name: DEFAULT_PROVIDER, invalid: false };
  if (v === 'nominatim' || v === 'yandex' || v === 'none') {
    return { name: v, invalid: false };
  }
  return { name: DEFAULT_PROVIDER, invalid: true };
}

@Injectable()
export class GeocodeService {
  private readonly logger = new Logger(GeocodeService.name);
  private warnedInvalid = false;

  constructor(
    @Inject(NominatimGeocodeService) private readonly nominatim: NominatimGeocodeService,
    @Inject(YandexGeocodeService) private readonly yandex: YandexGeocodeService,
  ) {}

  /** Joriy provayder — yoki `null` (o'chiq / sozlanmagan). */
  private provider(): GeocodeProvider | null {
    const { name, invalid } = resolveProviderName(process.env.GEOCODER_PROVIDER);
    if (invalid && !this.warnedInvalid) {
      this.warnedInvalid = true;
      this.logger.warn(
        `GEOCODER_PROVIDER='${process.env.GEOCODER_PROVIDER}' noma'lum — '${DEFAULT_PROVIDER}' ishlatiladi`,
      );
    }
    if (name === 'none') return null;
    if (name === 'yandex') {
      // Kalitsiz yandex tanlangan bo'lsa — JIM o'chib qolmaymiz, Nominatim'ga
      // tushamiz: dispecher tugmasi ishlashda davom etadi.
      if (this.yandex.isEnabled()) return this.yandex;
      this.logger.warn(
        "GEOCODER_PROVIDER=yandex, lekin YANDEX_API_KEY yo'q — nominatim ishlatiladi",
      );
      return this.nominatim;
    }
    return this.nominatim;
  }

  /** FE «Topish» tugmasini yoqish uchun. */
  isEnabled(): boolean {
    const p = this.provider();
    return !!p && p.isEnabled();
  }

  /** Joriy provayder nomi — javobda qaytariladi (diagnostika + atribut uchun). */
  providerName(): GeocoderProviderName | null {
    const p = this.provider();
    return p ? (p.name as GeocoderProviderName) : null;
  }

  async geocode(address: string): Promise<GeocodeResult | null> {
    const p = this.provider();
    if (!p) return null;
    return p.geocode(address);
  }
}

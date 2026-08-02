/**
 * Geokoder porti — manzil matni → koordinata.
 *
 * Nega port: provayder tanlovi HUQUQIY masala, texnik emas. Yandex Maps API'ning
 * bepul shartlari bu loyihaga TO'G'RI KELMAYDI (2026-08-02 da tekshirildi):
 * loyiha ochiq kirishli bo'lishi shart (bizniki login ortida) · natijani saqlash
 * taqiqlanadi (biz `driver_trips.dest_lat/lng` ga yozamiz) · va **transport/xodimni
 * real vaqtda kuzatish alohida taqiqlangan** — bu loyihaning aynan o'zi.
 * Pullik litsenziya esa 208 800 ₽/yil. Shuning uchun default provayder —
 * OpenStreetMap Nominatim; Yandex kaliti bo'lsa u ishlatiladi (egasi litsenziya
 * sotib olsa), kalitsiz — Nominatim, u ham bo'lmasa — o'chiq (dispecher
 * koordinatani qo'lda kiritadi, panel baribir ishlaydi).
 */

export interface GeocodeResult {
  lat: number;
  lng: number;
  /**
   * Natija aniqligi. Yandex: exact|number|near|range|street|other.
   * Nominatim'da bunday maydon yo'q — `addresstype`dan taxminlanadi.
   */
  precision: string;
  /** Provayder qaytargan to'liq manzil matni (dispecher tasdiqlashi uchun). */
  formatted: string | null;
}

export interface GeocodeProvider {
  /** Provayder nomi — log va diagnostika uchun. */
  readonly name: string;
  /** Sozlangan va ishlatishga tayyormi (FE «Topish» tugmasi shunga qaraydi). */
  isEnabled(): boolean;
  /** Topolmasa yoki xato bo'lsa `null` — HECH QACHON throw qilmaydi. */
  geocode(address: string): Promise<GeocodeResult | null>;
}

import { describe, expect, it } from 'vitest';
import { parseYandexGeocode } from './yandex-geocode.service.js';

// Yandex `pos` = "LNG LAT" (uzunlik BIRINCHI) — bu yerда adashish oson.
const sample = {
  response: {
    GeoObjectCollection: {
      featureMember: [
        {
          GeoObject: {
            Point: { pos: '69.240562 41.311081' }, // lng lat
            metaDataProperty: {
              GeocoderMetaData: { precision: 'exact', text: "Toshkent, Amir Temur ko'chasi" },
            },
          },
        },
      ],
    },
  },
};

describe('parseYandexGeocode', () => {
  it('pos "lng lat"ни to\'g\'ri ajratadi (lat/lng almashtirmaydi)', () => {
    const r = parseYandexGeocode(sample);
    expect(r).not.toBeNull();
    expect(r?.lat).toBeCloseTo(41.311081, 5);
    expect(r?.lng).toBeCloseTo(69.240562, 5);
    expect(r?.precision).toBe('exact');
    expect(r?.formatted).toContain('Toshkent');
  });

  it("bo'sh / noto'g'ri javob → null (graceful)", () => {
    expect(parseYandexGeocode(null)).toBeNull();
    expect(parseYandexGeocode({})).toBeNull();
    expect(
      parseYandexGeocode({ response: { GeoObjectCollection: { featureMember: [] } } }),
    ).toBeNull();
    expect(
      parseYandexGeocode({
        response: {
          GeoObjectCollection: { featureMember: [{ GeoObject: { Point: { pos: 'x y' } } }] },
        },
      }),
    ).toBeNull(); // NaN koordinata
  });
});

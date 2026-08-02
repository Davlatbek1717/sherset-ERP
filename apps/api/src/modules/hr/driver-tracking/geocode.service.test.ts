import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROVIDER, GeocodeService, resolveProviderName } from './geocode.service.js';

/**
 * Provayder tanlovi. Bu yerdagi asosiy xavf — geokoderning JIM o'chib qolishi:
 * env'da typo bo'lsa yoki yandex kaliti yo'q bo'lsa, dispecher tugmani bosadi,
 * hech narsa bo'lmaydi va sabab hech qayerda ko'rinmaydi.
 */

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

describe('resolveProviderName', () => {
  it("sozlanmagan bo'lsa default = nominatim", () => {
    expect(resolveProviderName(undefined)).toEqual({ name: 'nominatim', invalid: false });
    expect(resolveProviderName('')).toEqual({ name: 'nominatim', invalid: false });
    expect(DEFAULT_PROVIDER).toBe('nominatim');
  });

  it("uchala qiymat qabul qilinadi (registr va bo'shliqqa chidamli)", () => {
    expect(resolveProviderName('nominatim').name).toBe('nominatim');
    expect(resolveProviderName(' YANDEX ').name).toBe('yandex');
    expect(resolveProviderName('None').name).toBe('none');
  });

  it("noma'lum qiymat → default, LEKIN invalid bayrog'i bilan (jim o'tmaydi)", () => {
    expect(resolveProviderName('nominatum')).toEqual({ name: 'nominatim', invalid: true });
    expect(resolveProviderName('google')).toEqual({ name: 'nominatim', invalid: true });
  });
});

function makeService(opts: { yandexEnabled: boolean }) {
  const nominatim = {
    name: 'nominatim',
    isEnabled: () => true,
    geocode: vi.fn(async () => ({ lat: 41.3, lng: 69.2, precision: 'exact', formatted: 'N' })),
  };
  const yandex = {
    name: 'yandex',
    isEnabled: () => opts.yandexEnabled,
    geocode: vi.fn(async () => ({ lat: 1, lng: 2, precision: 'exact', formatted: 'Y' })),
  };
  return {
    svc: new GeocodeService(nominatim as never, yandex as never),
    nominatim,
    yandex,
  };
}

describe('GeocodeService — provayder tanlovi', () => {
  it('default: nominatim ishlaydi, yandex chaqirilmaydi', async () => {
    process.env.GEOCODER_PROVIDER = undefined;
    // biome-ignore lint/performance/noDelete: env'ni haqiqatan olib tashlash kerak
    delete process.env.GEOCODER_PROVIDER;
    const { svc, nominatim, yandex } = makeService({ yandexEnabled: true });
    expect(svc.isEnabled()).toBe(true);
    expect(svc.providerName()).toBe('nominatim');
    await svc.geocode('Toshkent');
    expect(nominatim.geocode).toHaveBeenCalledTimes(1);
    expect(yandex.geocode).not.toHaveBeenCalled();
  });

  it('yandex tanlangan VA kalit bor → yandex', async () => {
    process.env.GEOCODER_PROVIDER = 'yandex';
    const { svc, nominatim, yandex } = makeService({ yandexEnabled: true });
    expect(svc.providerName()).toBe('yandex');
    await svc.geocode('Toshkent');
    expect(yandex.geocode).toHaveBeenCalledTimes(1);
    expect(nominatim.geocode).not.toHaveBeenCalled();
  });

  it("yandex tanlangan-u KALIT YO'Q → nominatim'ga tushadi (jim o'chmaydi)", async () => {
    // Bu eng muhim holat: egasi env'ni yozgan, kalitni qo'ymagan. Tugma
    // ishlashda davom etishi kerak, aks holda sabab ko'rinmaydigan nosozlik.
    process.env.GEOCODER_PROVIDER = 'yandex';
    const { svc, nominatim, yandex } = makeService({ yandexEnabled: false });
    expect(svc.isEnabled()).toBe(true);
    expect(svc.providerName()).toBe('nominatim');
    await svc.geocode('Toshkent');
    expect(nominatim.geocode).toHaveBeenCalledTimes(1);
    expect(yandex.geocode).not.toHaveBeenCalled();
  });

  it("'none' → o'chiq: isEnabled=false va hech kim chaqirilmaydi", async () => {
    process.env.GEOCODER_PROVIDER = 'none';
    const { svc, nominatim, yandex } = makeService({ yandexEnabled: true });
    expect(svc.isEnabled()).toBe(false);
    expect(svc.providerName()).toBeNull();
    expect(await svc.geocode('Toshkent')).toBeNull();
    expect(nominatim.geocode).not.toHaveBeenCalled();
    expect(yandex.geocode).not.toHaveBeenCalled();
  });

  it("noma'lum env qiymati → nominatim (funksiya yo'qolmaydi)", async () => {
    process.env.GEOCODER_PROVIDER = 'nominatum';
    const { svc, nominatim } = makeService({ yandexEnabled: false });
    expect(svc.isEnabled()).toBe(true);
    await svc.geocode('Toshkent');
    expect(nominatim.geocode).toHaveBeenCalledTimes(1);
  });
});

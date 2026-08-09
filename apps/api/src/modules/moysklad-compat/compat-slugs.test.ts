import { describe, expect, it } from 'vitest';
import { isScopeSlugKnown } from './api-token.scope.js';
import { COMPAT_SLUGS, isKnownCompatSlug } from './compat-slugs.js';
import { MoyskladCompatService } from './moysklad-compat.service.js';

/**
 * Faza Q14 — compat slug REYESTRI (`INT-07` DEFER-4).
 *
 * Faza 24 scope'ni majburlashni yoqdi, lekin slug'ni faqat SINTAKSIS
 * bo'yicha tekshirardi: `prodcut:read` (typo) yaratishda o'tib ketardi va
 * fail-closed bo'lgani uchun integratsiyaning BIRINCHI 403 ida ko'rinardi.
 * Faza 24 hisoboti sababini ham yozgan: `SLUGS` konstantasi
 * `moysklad-compat.service.ts` ichida yopiq edi.
 *
 * Endi nomlar alohida SOF faylda (`compat-slugs.ts`), servis esa
 * `Record<CompatSlug, SlugConfig>` deb tiplangan — ya'ni reyestr bilan
 * mosligi TYPECHECK darajasida ushlanadi. Bu test runtime tomondan ham
 * qulflaydi (`supportedSlugs()` discovery endpointi va scope-UI aynan shu
 * ro'yxatni ko'rsatadi — ikkisi ajralib ketmasin).
 */

function serviceSlugs(): string[] {
  const svc = new MoyskladCompatService({ client: {} } as never);
  return svc.supportedSlugs();
}

describe('COMPAT_SLUGS reyestri', () => {
  it('servisdagi SLUGS kalitlari bilan AYNAN mos (drift qulfi)', () => {
    expect([...COMPAT_SLUGS].sort()).toEqual([...serviceSlugs()].sort());
  });

  it('bo`sh emas va hammasi kichik harf', () => {
    expect(COMPAT_SLUGS.length).toBeGreaterThan(30);
    for (const s of COMPAT_SLUGS) expect(s).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('isKnownCompatSlug — mavjud/typo ni ajratadi', () => {
    expect(isKnownCompatSlug('product')).toBe(true);
    expect(isKnownCompatSlug('prodcut')).toBe(false);
    expect(isKnownCompatSlug('PRODUCT')).toBe(false); // normalizatsiya chaqiruvchida
  });
});

describe('isScopeSlugKnown — scope yozuvi reyestrga solishtiriladi', () => {
  it('`*` doim ma`lum', () => {
    expect(isScopeSlugKnown('*')).toBe(true);
  });

  it('mavjud slug — action bilan ham, actionsiz ham', () => {
    expect(isScopeSlugKnown('product')).toBe(true);
    expect(isScopeSlugKnown('product:read')).toBe(true);
    expect(isScopeSlugKnown('customerorder:write')).toBe(true);
  });

  it('typo slug — RAD (aynan Faza 24 DEFER-4 teshigi)', () => {
    expect(isScopeSlugKnown('prodcut')).toBe(false);
    expect(isScopeSlugKnown('prodcut:read')).toBe(false);
    expect(isScopeSlugKnown('orders')).toBe(false);
  });
});

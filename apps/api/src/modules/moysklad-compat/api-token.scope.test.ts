import { describe, expect, it } from 'vitest';
import {
  isCompatActionAllowed,
  isScopeSyntaxValid,
  normalizeScopes,
  scopesGrantFullAccess,
  scopesToPermissions,
  slugFromRemapUrl,
} from './api-token.scope.js';

/**
 * Faza 24 (`INT-07`).
 *
 * `ApiToken.scopes` DB'da saqlanardi, admin UI'da ko'rsatilardi — lekin
 * HECH QAYERDA tekshirilmasdi: guard har tokenga `permissions: ['*']`
 * berardi. «Faqat product o'qish» tokeni butun akkauntga kirardi.
 *
 * Bu yerdagi testlar — sof qaror mantiqi (guard'siz). Shartnoma:
 *   · bo'sh scopes  = to'liq kirish (eski tokenlar buzilmasin; OCHIQ hujjatlangan)
 *   · '*'           = to'liq kirish
 *   · '<slug>'      = o'sha slug'ga read+write
 *   · '<slug>:read' = faqat o'qish (compat router hozir faqat GET)
 *   · noma'lum/typo slug = hech narsa ochilmaydi (fail-closed)
 */

describe('normalizeScopes', () => {
  it('trims, lowercases and drops empties', () => {
    expect(normalizeScopes([' Product ', '', '  ', 'CustomerOrder:Read'])).toEqual([
      'product',
      'customerorder:read',
    ]);
  });

  it('dedupes', () => {
    expect(normalizeScopes(['product', 'product'])).toEqual(['product']);
  });
});

describe('isScopeSyntaxValid', () => {
  it.each(['*', 'product', 'customerorder', 'product:read', 'product:write'])('accepts %s', (s) => {
    expect(isScopeSyntaxValid(s)).toBe(true);
  });

  it.each(['', 'product:', ':read', 'product:delete', 'product read', '../etc', 'Product'])(
    'rejects %s',
    (s) => {
      expect(isScopeSyntaxValid(s)).toBe(false);
    },
  );
});

describe('scopesGrantFullAccess', () => {
  it('empty scopes = full access (legacy tokens)', () => {
    expect(scopesGrantFullAccess([])).toBe(true);
  });

  it('explicit wildcard = full access', () => {
    expect(scopesGrantFullAccess(['*'])).toBe(true);
  });

  it('any concrete scope = NOT full access', () => {
    expect(scopesGrantFullAccess(['product:read'])).toBe(false);
  });
});

describe('slugFromRemapUrl', () => {
  it.each([
    ['/api/v1/api/remap/1.2/entity/product', 'product'],
    ['/api/remap/1.2/entity/product?limit=10&offset=0', 'product'],
    ['/api/remap/1.2/entity/customerorder/1234-5678', 'customerorder'],
    ['/api/remap/1.2/entity/demand/1234/positions?expand=assortment', 'demand'],
    ['/api/remap/1.2/entity/product/metadata', 'product'],
    ['/API/REMAP/1.2/ENTITY/PRODUCT', 'product'],
  ])('%s → %s', (url, slug) => {
    expect(slugFromRemapUrl(url)).toBe(slug);
  });

  it.each([
    '/api/remap/1.2/_compat/slugs',
    '/api/remap/1.2/entity',
    '/api/remap/1.2/entity/',
    '/api/v1/products',
  ])('%s → null (entity marshruti emas)', (url) => {
    expect(slugFromRemapUrl(url)).toBeNull();
  });
});

describe('isCompatActionAllowed', () => {
  it('slug scope opens read AND write for that slug only', () => {
    expect(isCompatActionAllowed(['product'], 'product', 'read')).toBe(true);
    expect(isCompatActionAllowed(['product'], 'product', 'write')).toBe(true);
    expect(isCompatActionAllowed(['product'], 'customerorder', 'read')).toBe(false);
  });

  it('read scope does NOT open write (kelajakdagi POST/PUT uchun)', () => {
    expect(isCompatActionAllowed(['product:read'], 'product', 'read')).toBe(true);
    expect(isCompatActionAllowed(['product:read'], 'product', 'write')).toBe(false);
  });

  it('write scope implies read', () => {
    expect(isCompatActionAllowed(['product:write'], 'product', 'read')).toBe(true);
    expect(isCompatActionAllowed(['product:write'], 'product', 'write')).toBe(true);
  });

  it('wildcard opens everything', () => {
    expect(isCompatActionAllowed(['*'], 'counterparty', 'write')).toBe(true);
  });

  it('empty scopes open everything (legacy)', () => {
    expect(isCompatActionAllowed([], 'counterparty', 'write')).toBe(true);
  });

  it('typo scope opens nothing — fail-closed', () => {
    expect(isCompatActionAllowed(['prodcut:read'], 'product', 'read')).toBe(false);
  });
});

describe('scopesToPermissions', () => {
  it('unscoped token keeps the historical wildcard', () => {
    expect(scopesToPermissions([])).toEqual(['*']);
    expect(scopesToPermissions(['*'])).toEqual(['*']);
  });

  it('scoped token gets compat-namespaced permissions, never a bare wildcard', () => {
    const perms = scopesToPermissions(['product:read', 'counterparty']);
    expect(perms).not.toContain('*');
    expect(perms).toContain('compat:product:read');
    expect(perms).toContain('compat:counterparty:read');
    expect(perms).toContain('compat:counterparty:write');
  });
});

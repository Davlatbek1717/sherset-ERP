import { describe, expect, it } from 'vitest';
import { scrubAccessTokenFromUrl } from './observability.js';

/** AUTH-04 — access-log'dagi req.url'da JWT qiymati qolmasligi kerak. */
describe('scrubAccessTokenFromUrl', () => {
  it('yakka query-param redakt qilinadi', () => {
    expect(scrubAccessTokenFromUrl('/api/v1/notifications/stream?access_token=eyJhbGci.x.y')).toBe(
      '/api/v1/notifications/stream?access_token=[redacted]',
    );
  });

  it('boshqa paramlar saqlanadi', () => {
    expect(
      scrubAccessTokenFromUrl(
        '/api/v1/purchase-orders/list-report?state=new&access_token=tok&sort=asc',
      ),
    ).toBe('/api/v1/purchase-orders/list-report?state=new&access_token=[redacted]&sort=asc');
  });

  it('token yo‘q URL o‘zgarmaydi', () => {
    expect(scrubAccessTokenFromUrl('/api/v1/products?search=abc')).toBe(
      '/api/v1/products?search=abc',
    );
  });
});

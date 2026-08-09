import { describe, expect, it } from 'vitest';
import { employeeImageRawUrl, imageRawUrl } from './image-url';

/**
 * Faza Q13 (`AUTH-04`) regressiya qulfi — media URL'larida SIR BO'LMASIN.
 *
 * Ilgari bu ikki helper amaldagi access-JWT'ni `?access_token=` bilan URL'ga
 * yozardi: har nginx access-log qatori, brauzer tarixi va `Referer` sarlavhasi
 * to'liq huquqli tokenni ko'tarib yurardi. Endi autentifikatsiya HttpOnly
 * `ms_mt` media-cookie'si orqali (server: `auth/media-token.ts`), URL esa sof
 * yo'l. Bu test qaytib token qo'shilishini tutadi.
 */
describe('image-url — media URL sirsiz (Faza Q13)', () => {
  it('mahsulot rasmi: sof yo‘l, query yo‘q', () => {
    expect(imageRawUrl('img-1')).toBe('/api/v1/images/img-1/raw');
  });

  it('xodim rasmi: sof yo‘l, `bust` bo‘lsa faqat `v=`', () => {
    expect(employeeImageRawUrl('emp-1')).toBe('/api/v1/hr/employees/emp-1/image/raw');
    expect(employeeImageRawUrl('emp-1', 42)).toBe('/api/v1/hr/employees/emp-1/image/raw?v=42');
  });

  it('hech bir URL `access_token` ni ko‘tarmaydi', () => {
    for (const url of [
      imageRawUrl('img-1'),
      employeeImageRawUrl('emp-1'),
      employeeImageRawUrl('emp-1', 7),
    ]) {
      expect(url).not.toContain('access_token');
      expect(url).not.toContain('token');
    }
  });

  it('kesh kaliti token aylanishidan MUSTAQIL (ikki chaqiruv — bir xil URL)', () => {
    expect(imageRawUrl('img-1')).toBe(imageRawUrl('img-1'));
  });
});

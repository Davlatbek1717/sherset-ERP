import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  INBOUND_SIGNATURE_HEADER,
  computeInboundSignature,
  verifyInboundSignature,
} from './online-order.inbound.js';

/**
 * F042 — tashqi kanaldan kelgan buyurtma webhook'ining IMZO shartnomasi.
 *
 * Shartnoma: `X-Sherset-Signature: sha256=<hex>` = HMAC-SHA256(**xom tana**, kanal siri).
 * Xom tana (`rawBody`) imzolanadi, qayta-serializatsiya qilingani EMAS — aks holda
 * probel/kalit-tartibi farqi to'g'ri imzoni yiqitadi.
 *
 * Solishtirish `secretEquals` orqali constant-time (INT-01/INT-14 naqshi): oddiy `===`
 * birinchi farqli baytda to'xtaydi ⇒ ochiq, guard'siz endpointda timing-oracle.
 *
 * FAIL-CLOSED: sir sozlanmagan / sarlavha yo'q / tana yo'q — HECH QACHON o'tmaydi.
 */
const SECRET = 'chan-secret-0123456789abcdef';
const BODY = '{"externalOrderId":"A-1","sumMinor":"150000","items":[{"name":"kabel","qty":2}]}';

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

describe('online-order inbound imzo protokoli', () => {
  it('sarlavha nomi kichik harfda e‘lon qilingan (Fastify sarlavhalarni kichik harfga tushiradi)', () => {
    expect(INBOUND_SIGNATURE_HEADER).toBe(INBOUND_SIGNATURE_HEADER.toLowerCase());
  });

  it('computeInboundSignature — HMAC-SHA256 hex qaytaradi', () => {
    expect(computeInboundSignature(BODY, SECRET)).toBe(sign(BODY, SECRET));
  });

  it('string va Buffer tana bir xil imzo beradi', () => {
    expect(computeInboundSignature(Buffer.from(BODY, 'utf8'), SECRET)).toBe(
      computeInboundSignature(BODY, SECRET),
    );
  });

  it("to'g'ri imzo (xom hex) → true", () => {
    expect(verifyInboundSignature(BODY, sign(BODY, SECRET), SECRET)).toBe(true);
  });

  it("to'g'ri imzo (`sha256=` prefiksi bilan) → true", () => {
    expect(verifyInboundSignature(BODY, `sha256=${sign(BODY, SECRET)}`, SECRET)).toBe(true);
  });

  it('prefiks va hex atrofidagi probel/registr farqi imzoni buzmaydi', () => {
    expect(
      verifyInboundSignature(BODY, `  SHA256=${sign(BODY, SECRET).toUpperCase()} `, SECRET),
    ).toBe(true);
  });

  it('tana BIR BAYTGA o‘zgarsa → false (payload buzilishi aniqlanadi)', () => {
    const tampered = BODY.replace('"qty":2', '"qty":9');
    expect(verifyInboundSignature(tampered, sign(BODY, SECRET), SECRET)).toBe(false);
  });

  it("noto'g'ri sir bilan imzolangan → false", () => {
    expect(verifyInboundSignature(BODY, sign(BODY, 'boshqa-sir'), SECRET)).toBe(false);
  });

  it('sarlavha yo‘q (undefined/null/bo‘sh) → false', () => {
    expect(verifyInboundSignature(BODY, undefined, SECRET)).toBe(false);
    expect(verifyInboundSignature(BODY, null, SECRET)).toBe(false);
    expect(verifyInboundSignature(BODY, '', SECRET)).toBe(false);
    expect(verifyInboundSignature(BODY, 'sha256=', SECRET)).toBe(false);
  });

  it('FAIL-CLOSED: sir sozlanmagan (null/bo‘sh) → sarlavha bo‘lsa ham false', () => {
    expect(verifyInboundSignature(BODY, sign(BODY, ''), '')).toBe(false);
    expect(verifyInboundSignature(BODY, 'sha256=deadbeef', null)).toBe(false);
    expect(verifyInboundSignature(BODY, 'sha256=deadbeef', undefined)).toBe(false);
  });

  it('FAIL-CLOSED: tana yo‘q → false (bo‘sh POST imzo bilan o‘tmaydi)', () => {
    expect(verifyInboundSignature(undefined, 'sha256=deadbeef', SECRET)).toBe(false);
    expect(verifyInboundSignature(null, 'sha256=deadbeef', SECRET)).toBe(false);
  });

  it('bo‘sh tanani imzolash mumkin emas — computeInboundSignature sirsiz chaqirilsa yiqiladi', () => {
    expect(() => computeInboundSignature(BODY, '')).toThrow();
  });
});

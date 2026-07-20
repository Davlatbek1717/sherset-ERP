import { describe, expect, it } from 'vitest';
import { smsSegments } from './sms-segments';

describe('smsSegments', () => {
  it('qisqa lotin matn = 1 SMS (gsm)', () => {
    const r = smsSegments('Salom Akmal, qarz 1 250 000 som');
    expect(r.encoding).toBe('gsm');
    expect(r.segments).toBe(1);
  });

  it('160 gsm belgi = 1, 161 = 2', () => {
    expect(smsSegments('a'.repeat(160)).segments).toBe(1);
    expect(smsSegments('a'.repeat(161)).segments).toBe(2);
  });

  it('kirill = unicode (70/segment)', () => {
    const r = smsSegments('Салом'.repeat(20)); // 100 kirill belgi
    expect(r.encoding).toBe('unicode');
    expect(r.segments).toBe(2); // 100 > 70
  });

  it("bo'sh matn = 0 segment", () => {
    expect(smsSegments('').segments).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { normalizeScanInput } from './scan';

describe('normalizeScanInput', () => {
  it('passes raw codes through (old labels, hand-typed input)', () => {
    expect(normalizeScanInput('4780000000000')).toBe('4780000000000');
    expect(normalizeScanInput('  00042  ')).toBe('00042');
  });

  it('extracts the code from a full scan URL', () => {
    expect(normalizeScanInput('https://climartgroup.uz/scan?c=4780000000000')).toBe(
      '4780000000000',
    );
    expect(normalizeScanInput('http://localhost:3000/scan?c=00042')).toBe('00042');
  });

  it('handles scheme-less and extra-param variants', () => {
    expect(normalizeScanInput('climartgroup.uz/scan?c=123')).toBe('123');
    expect(normalizeScanInput('scan?c=123')).toBe('123');
    expect(normalizeScanInput('https://x.uz/scan?utm=1&c=abc%20d')).toBe('abc d');
  });

  it('leaves unrelated URLs and malformed queries alone', () => {
    expect(normalizeScanInput('https://x.uz/products/1')).toBe('https://x.uz/products/1');
    expect(normalizeScanInput('https://x.uz/scan?x=1')).toBe('https://x.uz/scan?x=1');
  });
});

import { describe, expect, it } from 'vitest';
import { resolveSecret } from './boot-secrets.js';

/**
 * AUTH-02 — prod'da JWT_SECRET/COOKIE_SECRET unutilsa API jimgina hammaga
 * ma'lum 'dev-secret-change-in-prod' bilan ishga tushardi ⇒ istalgan admin
 * JWT'sini qalbaki imzolash mumkin. parseTtl kabi: boot'da baland ovozda
 * yiqilish kerak, jim fallback emas.
 */
describe('resolveSecret (AUTH-02 boot-guard)', () => {
  const opts = { name: 'JWT_SECRET', devFallback: 'dev-secret-change-in-prod' };

  it('production + env yo‘q → throw (var nomi bilan)', () => {
    expect(() => resolveSecret({ ...opts, value: undefined, nodeEnv: 'production' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('production + bo‘sh qiymat → throw', () => {
    expect(() => resolveSecret({ ...opts, value: '', nodeEnv: 'production' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('production + qiymat dev-fallback bilan bir xil → throw', () => {
    expect(() =>
      resolveSecret({ ...opts, value: 'dev-secret-change-in-prod', nodeEnv: 'production' }),
    ).toThrow(/JWT_SECRET/);
  });

  it('production + haqiqiy sir → qiymat qaytadi', () => {
    expect(resolveSecret({ ...opts, value: 's3cr3t-real', nodeEnv: 'production' })).toBe(
      's3cr3t-real',
    );
  });

  it('dev + env yo‘q → fallback qaytadi (jim, avvalgidek)', () => {
    expect(resolveSecret({ ...opts, value: undefined, nodeEnv: 'development' })).toBe(
      'dev-secret-change-in-prod',
    );
  });

  it('dev + env bor → env qiymati qaytadi', () => {
    expect(resolveSecret({ ...opts, value: 'local-x', nodeEnv: undefined })).toBe('local-x');
  });
});

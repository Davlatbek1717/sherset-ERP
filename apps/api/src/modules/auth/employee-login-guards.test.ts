import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { assertEmployeeMayLogin } from './employee-login-guards.js';

const META = { ipAddress: '10.0.0.5', genericMessage: 'PIN noto`g`ri' };
const OPEN = { lockedUntil: null, attributes: null };

describe('assertEmployeeMayLogin', () => {
  it('toza xodimni o`tkazadi', () => {
    expect(() => assertEmployeeMayLogin(OPEN, META)).not.toThrow();
  });

  it('lockedUntil kelajakda — bloklangan, qolgan daqiqa xabarda', () => {
    const until = new Date(Date.now() + 5 * 60_000);
    expect(() => assertEmployeeMayLogin({ ...OPEN, lockedUntil: until }, META)).toThrow(
      /bloklangan/,
    );
  });

  it('lockedUntil o`tmishda — o`tkazadi', () => {
    const until = new Date(Date.now() - 60_000);
    expect(() => assertEmployeeMayLogin({ ...OPEN, lockedUntil: until }, META)).not.toThrow();
  });

  it('loginAllowed=false — RAD ETADI va sababni oshkor qilmaydi', () => {
    const attributes = { __employee_system: { loginAllowed: false } };
    try {
      assertEmployeeMayLogin({ ...OPEN, attributes }, META);
      throw new Error('kutilmagan: o`tkazdi');
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      // Hisob holati sizib chiqmasin — chaqiruvchining umumiy xabari.
      expect((err as UnauthorizedException).message).toBe('PIN noto`g`ri');
    }
  });

  it('IP allowlist`dan tashqarida — RAD ETADI', () => {
    const attributes = { __employee_system: { allowedIps: ['10.0.0.1'] } };
    expect(() => assertEmployeeMayLogin({ ...OPEN, attributes }, META)).toThrow(/IP/);
  });

  it('IP allowlist ichida — o`tkazadi', () => {
    const attributes = { __employee_system: { allowedIps: ['10.0.0.5'] } };
    expect(() => assertEmployeeMayLogin({ ...OPEN, attributes }, META)).not.toThrow();
  });
});

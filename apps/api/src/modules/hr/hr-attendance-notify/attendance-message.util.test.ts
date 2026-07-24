import { describe, expect, it } from 'vitest';
import { buildCheckInText, buildCheckOutText, buildTestText } from './attendance-message.util.js';

describe('buildCheckInText', () => {
  it('check-in with lateness + fine + department/position', () => {
    const t = buildCheckInText({
      name: 'Aziz Karimov',
      timeHHmm: '09:15',
      lateMinutes: 15,
      fineMinor: 10000n,
      department: 'Sotuv',
      position: 'Sotuvchi',
    });
    expect(t).toContain('✅ *Keldi* — Aziz Karimov');
    expect(t).toContain('🕐 09:15');
    expect(t).toContain('15 daqiqa kechikdi');
    expect(t).toContain('Jarima');
    expect(t).toContain('🏢 Sotuv · Sotuvchi');
  });

  it('check-in on time → no ⏰ / no 💰 lines', () => {
    const t = buildCheckInText({ name: 'X', timeHHmm: '08:59', lateMinutes: 0, fineMinor: 0n });
    expect(t).toContain('✅ *Keldi* — X');
    expect(t).not.toContain('kechikdi');
    expect(t).not.toContain('Jarima');
    expect(t).not.toContain('🏢');
  });

  it('late but no fine → shows ⏰, omits 💰', () => {
    const t = buildCheckInText({ name: 'X', timeHHmm: '09:20', lateMinutes: 20, fineMinor: 0n });
    expect(t).toContain('20 daqiqa kechikdi');
    expect(t).not.toContain('Jarima');
  });

  it('only department present → single org part, no separator', () => {
    const t = buildCheckInText({
      name: 'X',
      timeHHmm: '09:00',
      lateMinutes: 0,
      fineMinor: 0n,
      department: 'Sotuv',
      position: null,
    });
    expect(t).toContain('🏢 Sotuv');
    expect(t).not.toContain('·');
  });
});

describe('buildCheckOutText', () => {
  it('check-out with worked label', () => {
    const t = buildCheckOutText({ name: 'X', timeHHmm: '18:05', workedLabel: '8s 50d' });
    expect(t).toContain('🚪 *Ketdi* — X');
    expect(t).toContain('🕐 18:05');
    expect(t).toContain('Bugun ishlagan: 8s 50d');
  });

  it('check-out without worked label → no ⏱ segment', () => {
    const t = buildCheckOutText({ name: 'X', timeHHmm: '18:05' });
    expect(t).toContain('🚪 *Ketdi* — X');
    expect(t).not.toContain('Bugun ishlagan');
  });
});

describe('buildTestText', () => {
  it('returns the fixed test message', () => {
    expect(buildTestText()).toContain('Test');
  });
});

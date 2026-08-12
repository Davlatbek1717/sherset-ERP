import { describe, expect, it } from 'vitest';
import { describeShiftAge, formatOpenShiftConflict, formatShiftAge } from './stale-shift.js';

/**
 * P4 — «unutilgan smena» sof qoidalari.
 *
 * Chegara ATROFIDAGI qadamlar ataylab tekshiriladi: `>` va `>=` farqi
 * shu yerda bir daqiqalik jim xatoga aylanardi.
 */

const at = (iso: string) => new Date(iso);

describe('describeShiftAge', () => {
  it('yoshni daqiqada o`lchaydi', () => {
    const age = describeShiftAge({
      openedAt: at('2026-08-12T06:00:00Z'),
      now: at('2026-08-12T09:30:00Z'),
      warnHours: 12,
    });
    expect(age.openMinutes).toBe(210);
    expect(age.stale).toBe(false);
  });

  it('chegaraga AYNAN yetganda eskirgan bo`ladi (>=, > emas)', () => {
    const base = { openedAt: at('2026-08-12T00:00:00Z'), warnHours: 12 };
    expect(describeShiftAge({ ...base, now: at('2026-08-12T11:59:00Z') }).stale).toBe(false);
    expect(describeShiftAge({ ...base, now: at('2026-08-12T12:00:00Z') }).stale).toBe(true);
    expect(describeShiftAge({ ...base, now: at('2026-08-12T12:01:00Z') }).stale).toBe(true);
  });

  it('chegara `null` bo`lsa yosh o`lchanadi, LEKIN eskirgan deb belgilanmaydi', () => {
    const age = describeShiftAge({
      openedAt: at('2026-08-01T00:00:00Z'),
      now: at('2026-08-12T00:00:00Z'),
      warnHours: null,
    });
    // 11 kun — lekin chegara o'chirilgan.
    expect(age.openMinutes).toBe(11 * 24 * 60);
    expect(age.stale).toBe(false);
    expect(age.warnHours).toBeNull();
  });

  it('manfiy yosh 0 ga qisiladi (soat siljishi ekranda `-3 soat` bermasin)', () => {
    const age = describeShiftAge({
      openedAt: at('2026-08-12T10:00:00Z'),
      now: at('2026-08-12T09:00:00Z'),
      warnHours: 12,
    });
    expect(age.openMinutes).toBe(0);
    expect(age.stale).toBe(false);
  });

  it('buzuq sana (`Invalid Date`) 0 beradi, NaN emas', () => {
    const age = describeShiftAge({
      openedAt: new Date('buzuq'),
      now: at('2026-08-12T09:00:00Z'),
      warnHours: 12,
    });
    expect(age.openMinutes).toBe(0);
    expect(Number.isNaN(age.openMinutes)).toBe(false);
  });

  it('chegara 0 yoki manfiy bo`lsa hamma smena eskirgan bo`lib qolmaydi', () => {
    const base = { openedAt: at('2026-08-12T09:00:00Z'), now: at('2026-08-12T09:01:00Z') };
    expect(describeShiftAge({ ...base, warnHours: 0 }).stale).toBe(false);
    expect(describeShiftAge({ ...base, warnHours: -5 }).stale).toBe(false);
  });
});

describe('formatShiftAge', () => {
  it('kun · soat · daqiqa', () => {
    expect(formatShiftAge(0)).toBe('0 daqiqa');
    expect(formatShiftAge(12)).toBe('12 daqiqa');
    expect(formatShiftAge(60)).toBe('1 soat');
    expect(formatShiftAge(320)).toBe('5 soat 20 daqiqa');
    expect(formatShiftAge(24 * 60)).toBe('1 kun');
    expect(formatShiftAge(2 * 24 * 60 + 3 * 60 + 7)).toBe('2 kun 3 soat');
  });

  it('manfiy kiritma 0 ga qisiladi', () => {
    expect(formatShiftAge(-90)).toBe('0 daqiqa');
  });
});

describe('formatOpenShiftConflict', () => {
  const age = describeShiftAge({
    openedAt: at('2026-08-01T00:00:00Z'),
    now: at('2026-08-12T00:00:00Z'),
    warnHours: 12,
  });

  it('davomiylikni VA nima qilish kerakligini aytadi', () => {
    const msg = formatOpenShiftConflict({ age, sessionId: 'sess-1', sessionName: 'ТРН-0001' });
    expect(msg).toContain('ТРН-0001');
    expect(msg).toContain('11 kun');
    // Kassir nima qilishini bilishi shart — «yoping» ko'rsatmasi.
    expect(msg).toMatch(/yoping/i);
  });

  it('nom bo`lmasa id ko`rsatiladi (kassir menejerga ayta olsin)', () => {
    const msg = formatOpenShiftConflict({ age, sessionId: 'sess-1', sessionName: null });
    expect(msg).toContain('sess-1');
  });

  it('eskirgan smenada qo`shimcha ogohlantirish bor', () => {
    const fresh = describeShiftAge({
      openedAt: at('2026-08-12T09:00:00Z'),
      now: at('2026-08-12T10:00:00Z'),
      warnHours: 12,
    });
    expect(formatOpenShiftConflict({ age, sessionId: 'x' })).toMatch(/uzoq ochiq/);
    expect(formatOpenShiftConflict({ age: fresh, sessionId: 'x' })).not.toMatch(/uzoq ochiq/);
  });
});

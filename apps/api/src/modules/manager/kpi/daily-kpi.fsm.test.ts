import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  DAILY_KPI_STATES,
  DAILY_KPI_TRANSITIONS,
  type DailyKpiState,
  KPI_REASON_CODES,
  applyTransition,
  assertWritable,
  isInQueue,
  isReasonCode,
  shouldEscalate,
} from './daily-kpi.fsm.js';

/**
 * Kunlik KPI qabul FSM — sof qoidalar testi (TZ §3.1, §10.2).
 *
 * Bu yerda qulflanadigan shartnomalar (buzilsa pul noto'g'ri to'lanadi):
 *   1. QABUL QILINGAN kunga yozib bo'lmaydi (muzlatish);
 *   2. takror qabul — XATO emas, no-op (idempotentlik → bonus ikki marta yozilmaydi);
 *   3. sabab majburiy bo'lgan amallar sababsiz o'tmaydi;
 *   4. vakolat: egasining majburiy yopishini menejer qila olmaydi.
 */

describe('applyTransition — asosiy oqim', () => {
  it('hisoblandi → qabul kutmoqda (tizim yopadi)', () => {
    expect(applyTransition('submit', 'computed', { actor: 'system' })).toEqual({
      to: 'pending',
      noop: false,
    });
  });

  it('qabul kutmoqda → QABUL QILINDI', () => {
    expect(applyTransition('accept', 'pending', { actor: 'manager' })).toEqual({
      to: 'accepted',
      noop: false,
    });
  });

  it('rad etish → tushuntirish → navbatga qaytish', () => {
    expect(
      applyTransition('reject', 'pending', { actor: 'manager', reasonCode: 'data_error' }).to,
    ).toBe('rejected');
    expect(applyTransition('explain', 'rejected', { actor: 'employee' }).to).toBe('pending');
  });

  it('eskirgan kun qayta qabul qilinadi (§3.4)', () => {
    expect(applyTransition('mark_stale', 'accepted', { actor: 'system' }).to).toBe('stale');
    expect(applyTransition('accept', 'stale', { actor: 'manager' }).to).toBe('accepted');
  });

  it('eskalatsiya → egasi majburiy yopadi', () => {
    expect(applyTransition('escalate', 'pending', { actor: 'system' }).to).toBe('escalated');
    expect(
      applyTransition('force_accept', 'escalated', { actor: 'owner', reasonCode: 'other' }).to,
    ).toBe('accepted');
  });

  it('qayta ochish qabul qilingan kunni navbatga qaytaradi', () => {
    expect(
      applyTransition('reopen', 'accepted', { actor: 'manager', reasonCode: 'data_error' }).to,
    ).toBe('pending');
  });
});

describe('idempotentlik — takror bosish XATO emas', () => {
  it('qabul qilingan kunni qayta qabul qilish no-op qaytaradi', () => {
    expect(applyTransition('accept', 'accepted', { actor: 'manager' })).toEqual({
      to: 'accepted',
      noop: true,
    });
  });

  it('rad etilgan kunni qayta rad etish no-op', () => {
    expect(
      applyTransition('reject', 'rejected', { actor: 'manager', reasonCode: 'employee_fault' })
        .noop,
    ).toBe(true);
  });

  it('no-op bo`lsa ham sabab majburiyligi saqlanadi', () => {
    // Aks holda «takror» yo'li orqali sababsiz rad etib bo'lardi.
    expect(() => applyTransition('reject', 'rejected', { actor: 'manager' })).toThrow(
      BadRequestException,
    );
  });

  it('qayta ochish idempotent EMAS — har ochish yangi hodisa', () => {
    expect(DAILY_KPI_TRANSITIONS.reopen.idempotent).toBe(false);
  });
});

describe('sabab kodi majburiyligi', () => {
  it.each(['reject', 'reopen', 'force_accept'] as const)('%s sababsiz o`tmaydi', (action) => {
    const from = DAILY_KPI_TRANSITIONS[action].from[0];
    const actor = DAILY_KPI_TRANSITIONS[action].actors[0];
    expect(() => applyTransition(action, from, { actor })).toThrow(BadRequestException);
  });

  it('bo`sh joy sabab hisoblanmaydi', () => {
    expect(() =>
      applyTransition('reject', 'pending', { actor: 'manager', reasonCode: '   ' }),
    ).toThrow(BadRequestException);
  });

  it('qabul qilish sabab talab qilmaydi (odatiy amal sekinlashmasin)', () => {
    expect(() => applyTransition('accept', 'pending', { actor: 'manager' })).not.toThrow();
  });
});

describe('vakolat', () => {
  it('menejer egasining majburiy yopishini qila olmaydi', () => {
    expect(() =>
      applyTransition('force_accept', 'escalated', { actor: 'manager', reasonCode: 'other' }),
    ).toThrow(ForbiddenException);
  });

  it('xodim o`z kunini qabul qila olmaydi', () => {
    expect(() => applyTransition('accept', 'pending', { actor: 'employee' })).toThrow(
      ForbiddenException,
    );
  });

  it('kunni tizimdan boshqa hech kim yopa olmaydi (submit)', () => {
    expect(() => applyTransition('submit', 'computed', { actor: 'manager' })).toThrow(
      ForbiddenException,
    );
  });
});

describe('noto`g`ri holat — 409', () => {
  it('hisoblanmagan (computed) kunni qabul qilib bo`lmaydi', () => {
    // Kun hali tugamagan — jonli raqamni qabul qilish ma'nosiz.
    expect(() => applyTransition('accept', 'computed', { actor: 'manager' })).toThrow(
      ConflictException,
    );
  });

  it('qabul qilinmagan kunni eskirgan deb belgilab bo`lmaydi', () => {
    expect(() => applyTransition('mark_stale', 'pending', { actor: 'system' })).toThrow(
      ConflictException,
    );
  });

  it('har o`tish faqat ta`riflangan holatlardan ishlaydi', () => {
    for (const action of Object.keys(
      DAILY_KPI_TRANSITIONS,
    ) as (keyof typeof DAILY_KPI_TRANSITIONS)[]) {
      const rule = DAILY_KPI_TRANSITIONS[action];
      const illegal = DAILY_KPI_STATES.filter(
        (s) => !rule.from.includes(s) && !(rule.idempotent && s === rule.to),
      );
      for (const state of illegal) {
        expect(() =>
          applyTransition(action, state, { actor: rule.actors[0], reasonCode: 'other' }),
        ).toThrow(ConflictException);
      }
    }
  });
});

describe('muzlatish (assertWritable)', () => {
  it('qabul qilingan kunga yozib bo`lmaydi', () => {
    expect(() => assertWritable('accepted')).toThrow(ConflictException);
  });

  it.each(DAILY_KPI_STATES.filter((s) => s !== 'accepted') as DailyKpiState[])(
    '%s holatida yozish mumkin',
    (state) => {
      expect(() => assertWritable(state)).not.toThrow();
    },
  );
});

describe('navbat va eskalatsiya', () => {
  it('navbatda faqat menejer ko`rishi kerak bo`lgan holatlar turadi', () => {
    expect(isInQueue('pending')).toBe(true);
    expect(isInQueue('rejected')).toBe(true);
    expect(isInQueue('stale')).toBe(true);
    expect(isInQueue('escalated')).toBe(true);
    expect(isInQueue('computed')).toBe(false);
    expect(isInQueue('accepted')).toBe(false);
  });

  it('3 kundan keyin eskalatsiya', () => {
    const queued = new Date('2026-08-01T10:00:00Z');
    expect(shouldEscalate('pending', queued, new Date('2026-08-03T09:00:00Z'))).toBe(false);
    expect(shouldEscalate('pending', queued, new Date('2026-08-04T10:00:00Z'))).toBe(true);
  });

  it('qabul qilingan kun eskalatsiya qilinmaydi', () => {
    const queued = new Date('2026-08-01T10:00:00Z');
    expect(shouldEscalate('accepted', queued, new Date('2026-09-01T10:00:00Z'))).toBe(false);
    expect(shouldEscalate('escalated', queued, new Date('2026-09-01T10:00:00Z'))).toBe(false);
  });
});

describe('sabab kodlari yopiq ro`yxat', () => {
  it('katalogdagi kod qabul qilinadi', () => {
    for (const code of KPI_REASON_CODES) expect(isReasonCode(code)).toBe(true);
  });

  it('erkin matn qabul qilinmaydi (statistikani buzadi)', () => {
    expect(isReasonCode('shunchaki')).toBe(false);
    expect(isReasonCode(null)).toBe(false);
    expect(isReasonCode(7)).toBe(false);
  });
});

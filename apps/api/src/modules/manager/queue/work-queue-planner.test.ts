import { describe, expect, it } from 'vitest';
import type { WorkItemCandidate } from './work-item-rules.js';
import {
  DEFAULT_STALE_AFTER_DAYS,
  type ExistingWorkItem,
  planQueueSync,
  sortQueue,
} from './work-queue-planner.js';

/**
 * MK06 — navbat dvigatelining YADROSI (4M TZ §5.1). Sof modul.
 *
 * Rejaning to'rt testidan ikkitasi aynan shu yerda:
 *   №1 «bir sabab bo'yicha ikki marta ishga tushirilsa BITTA element»;
 *   №2 «element eskirsa BELGI qo'yiladi, O'CHIRILMAYDI».
 */

const NOW = new Date('2026-08-09T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const candidate = (over: Partial<WorkItemCandidate> = {}): WorkItemCandidate => ({
  dedupKey: 'cash_variance:var-1',
  ruleType: 'CASH_VARIANCE',
  severity: 'warning',
  subjectEmployeeId: 'emp-1',
  amountMinor: -250_000n,
  currency: 'UZS',
  docType: 'cashiersession',
  docId: 'sess-1',
  occurredAt: daysAgo(1),
  context: {},
  ...over,
});

const existing = (over: Partial<ExistingWorkItem> = {}): ExistingWorkItem => ({
  id: 'wi-1',
  dedupKey: 'cash_variance:var-1',
  status: 'open',
  staleAt: null,
  statusChangedAt: daysAgo(1),
  ...over,
});

// ── Reja testi №1 — DEDUP ───────────────────────────────────────────────────

describe('dedup — bir hodisa = bitta element', () => {
  it('🔴 mavjud kalit ikkinchi marta YARATILMAYDI (dvigatel qayta yugurdi)', () => {
    const plan = planQueueSync([candidate()], [existing()], { now: NOW });
    expect(plan.creates).toEqual([]);
    expect(plan.duplicates).toBe(1);
  });

  it('🔴 BIR yugurishda takrorlangan nomzod ham bitta bo`ladi', () => {
    // Ikki manba bir hodisani ko'rsatishi mumkin (masalan narx ikki marta
    // tahrirlanib bitta audit qatoriga tushsa).
    const plan = planQueueSync([candidate(), candidate()], [], { now: NOW });
    expect(plan.creates).toHaveLength(1);
    expect(plan.duplicates).toBe(1);
  });

  it('yangi kalit yaratiladi', () => {
    const plan = planQueueSync([candidate({ dedupKey: 'cash_variance:var-2' })], [existing()], {
      now: NOW,
    });
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]?.dedupKey).toBe('cash_variance:var-2');
  });

  it('🔴 YOPILGAN element qayta tug`ilmaydi — aks holda navbat cheksiz halqa', () => {
    // Menejer «ko'rdim, sababi shu» deb yopgan hodisa ertangi `sync` da qaytib
    // kelsa, navbat hech qachon bo'shamaydi va sabab statistikasi buziladi.
    for (const status of ['resolved', 'dismissed', 'escalated', 'in_review'] as const) {
      const plan = planQueueSync([candidate()], [existing({ status })], { now: NOW });
      expect(plan.creates, `status=${status}`).toEqual([]);
    }
  });
});

// ── Reja testi №2 — ESKIRISH ────────────────────────────────────────────────

describe('eskirish — belgi qo`yiladi, o`chirilmaydi', () => {
  it('🔴 rejada `deletes`/`removes` YO`Q — dvigatel element o`chira olmaydi', () => {
    const plan = planQueueSync([], [existing({ statusChangedAt: daysAgo(30) })], { now: NOW });
    const destructive = Object.keys(plan).filter((k) => /delete|remove|purge|drop/i.test(k));
    expect(destructive).toEqual([]);
  });

  it(`${DEFAULT_STALE_AFTER_DAYS} kundan ORTIQ tegilmagan ochiq element belgilanadi`, () => {
    const plan = planQueueSync([], [existing({ statusChangedAt: daysAgo(4) })], { now: NOW });
    expect(plan.markStaleIds).toEqual(['wi-1']);
  });

  it('aynan chegaradagi element hali eskirmagan (chegara qat`iy)', () => {
    const plan = planQueueSync(
      [],
      [existing({ statusChangedAt: daysAgo(DEFAULT_STALE_AFTER_DAYS) })],
      { now: NOW },
    );
    expect(plan.markStaleIds).toEqual([]);
  });

  it('allaqachon belgilangan element qayta belgilanmaydi (idempotent)', () => {
    const plan = planQueueSync(
      [],
      [existing({ statusChangedAt: daysAgo(10), staleAt: daysAgo(2) })],
      { now: NOW },
    );
    expect(plan.markStaleIds).toEqual([]);
  });

  it('YOPILGAN element eskirmaydi — tugagan ish e`tibordan qolmaydi', () => {
    for (const status of ['resolved', 'dismissed'] as const) {
      const plan = planQueueSync([], [existing({ status, statusChangedAt: daysAgo(30) })], {
        now: NOW,
      });
      expect(plan.markStaleIds, `status=${status}`).toEqual([]);
    }
  });

  it('KO`RIB CHIQILAYOTGAN element ham eskirishi mumkin — «oldim» deb tashlab qo`yish', () => {
    const plan = planQueueSync(
      [],
      [existing({ status: 'in_review', statusChangedAt: daysAgo(9) })],
      {
        now: NOW,
      },
    );
    expect(plan.markStaleIds).toEqual(['wi-1']);
  });

  it('chegara sozlanadi', () => {
    const plan = planQueueSync([], [existing({ statusChangedAt: daysAgo(2) })], {
      now: NOW,
      staleAfterDays: 1,
    });
    expect(plan.markStaleIds).toEqual(['wi-1']);
  });

  it('🔴 eskirish HODISA vaqtidan emas, NAVBATDA turgan vaqtdan sanaladi', () => {
    // Bir oylik audit yozuvi bugun sync qilinsa, u bugun navbatga tushdi —
    // uni darhol «e'tibordan qolgan» deb belgilash yolg'on ayblov bo'lardi.
    const plan = planQueueSync([], [existing({ statusChangedAt: daysAgo(1) })], { now: NOW });
    expect(plan.markStaleIds).toEqual([]);
  });
});

// ── Navbat tartibi (§5.1: eskirgani yuqoriga) ───────────────────────────────

describe('sortQueue — nima birinchi ko`rinadi', () => {
  const row = (over: Partial<Parameters<typeof sortQueue>[0][number]>) => ({
    staleAt: null,
    severity: 'warning' as const,
    occurredAt: daysAgo(1),
    ...over,
  });

  it('🔴 eskirgan element eng tepada (§5.1)', () => {
    const sorted = sortQueue([
      row({ severity: 'critical', occurredAt: NOW }),
      row({ staleAt: daysAgo(1), severity: 'info', occurredAt: daysAgo(20) }),
    ]);
    expect(sorted[0]?.staleAt).not.toBeNull();
  });

  it('eskirmaganlar orasida jiddiyligi yuqori tepada', () => {
    const sorted = sortQueue([row({ severity: 'info' }), row({ severity: 'critical' })]);
    expect(sorted[0]?.severity).toBe('critical');
  });

  it('teng jiddiylikda eng yangisi tepada', () => {
    const sorted = sortQueue([row({ occurredAt: daysAgo(5) }), row({ occurredAt: daysAgo(1) })]);
    expect(sorted[0]?.occurredAt).toEqual(daysAgo(1));
  });

  it('kirish massivi O`ZGARTIRILMAYDI', () => {
    const input = [row({ severity: 'info' }), row({ severity: 'critical' })];
    const snapshot = [...input];
    sortQueue(input);
    expect(input).toEqual(snapshot);
  });
});

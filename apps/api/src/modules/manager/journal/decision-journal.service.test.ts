import { describe, expect, it, vi } from 'vitest';
import { DecisionJournalService } from './decision-journal.service.js';
import { DecisionJournalQuerySchema } from './manager-journal.schema.js';

/**
 * MK21 — qaror jurnalining I/O qatlami. Prisma qo'lda mock qilingan
 * (`debt-collection.service.test.ts` uslubi) — DB yo'q.
 *
 * Bu yerda tekshiriladigan shartnomalar:
 *  1. **To'rt manba bitta oqimga** qo'shiladi va yorliq/ism/pul biriktiriladi.
 *  2. **Bekor qilish zondi** — oynadan KEYINGI `reopen` oynadagi qarorga belgi
 *     qo'yadi (aks holda «kuchda» ko'rinardi).
 *  3. **Kesish JIM emas** — chegaraga tegilgan manba nomma-nom qaytariladi.
 *  4. **Faqat so'ralgan manba o'qiladi** — filtr keraksiz so'rovni tejaydi.
 */

const NOW = new Date('2026-08-09T09:00:00.000Z'); // Toshkentda 14:00

interface Seed {
  kpiEvents?: Array<Record<string, unknown>>;
  itemEvents?: Array<Record<string, unknown>>;
  shiftEvents?: Array<Record<string, unknown>>;
  supplyEvents?: Array<Record<string, unknown>>;
  /** Oynadan keyingi `reopen` — zond so'rovi qaytaradigan qatorlar. */
  kpiProbes?: Array<Record<string, unknown>>;
  money?: Array<{ kpiEventId: string; kind: string; amountMinor: bigint }>;
}

function makeService(seed: Seed) {
  const calls: Record<string, number> = {};
  const count = (k: string) => {
    calls[k] = (calls[k] ?? 0) + 1;
  };

  const kpiEventFindMany = vi.fn(async (args: { where?: { action?: string } }) => {
    // Zond so'rovi `action: 'reopen'` bilan keladi — asosiy o'qishdan shu bilan
    // farqlanadi (servis ikkalasini bir modeldan oladi).
    if (args.where?.action === 'reopen') {
      count('kpiProbe');
      return seed.kpiProbes ?? [];
    }
    count('kpiEvents');
    return seed.kpiEvents ?? [];
  });

  const prisma = {
    client: {
      employeeDailyKpiEvent: { findMany: kpiEventFindMany },
      managerWorkItemEvent: {
        findMany: vi.fn(async (args: { where?: { action?: string } }) => {
          if (args.where?.action === 'reopen') return [];
          count('itemEvents');
          return seed.itemEvents ?? [];
        }),
      },
      cashierSessionAcceptanceEvent: {
        findMany: vi.fn(async (args: { where?: { action?: string } }) => {
          if (args.where?.action === 'reopen') return [];
          count('shiftEvents');
          return seed.shiftEvents ?? [];
        }),
      },
      supplyApprovalEvent: {
        findMany: vi.fn(async () => {
          count('supplyEvents');
          return seed.supplyEvents ?? [];
        }),
      },
      employeeDailyKpi: {
        findMany: vi.fn(async () => [
          { id: 'day-1', employeeId: 'emp-1', date: new Date('2026-08-01T00:00:00.000Z') },
        ]),
      },
      managerWorkItem: {
        findMany: vi.fn(async () => [
          { id: 'item-1', ruleType: 'BIG_DEBT', subjectEmployeeId: 'emp-2' },
        ]),
      },
      cashierSession: {
        findMany: vi.fn(async () => [
          {
            id: 'ses-1',
            name: 'SMENA-7',
            cashierId: 'emp-3',
            openedAt: new Date('2026-08-02T05:00:00.000Z'),
          },
        ]),
      },
      supply: { findMany: vi.fn(async () => [{ id: 'sup-1', name: 'PR-2026-00042' }]) },
      hrBonusFineLog: { findMany: vi.fn(async () => seed.money ?? []) },
      employee: {
        findMany: vi.fn(async () => [
          { id: 'mgr-1', name: 'Aziz' },
          { id: 'emp-1', name: 'Sardor' },
          { id: 'emp-2', name: 'Bek' },
          { id: 'emp-3', name: 'Dilnoza' },
        ]),
      },
    },
  };

  return {
    service: new DecisionJournalService(prisma as never),
    calls,
  };
}

function kpiEvent(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'k1',
    dailyKpiId: 'day-1',
    fromState: 'pending',
    toState: 'accepted',
    action: 'accept',
    actorType: 'manager',
    actorId: 'mgr-1',
    reasonCode: null,
    comment: null,
    createdAt: new Date('2026-08-05T10:00:00.000Z'),
    ...over,
  };
}

const query = (over: Record<string, unknown> = {}) =>
  DecisionJournalQuerySchema.parse({
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-08T00:00:00.000Z',
    ...over,
  });

describe('MK21 servis — to`rt manba bitta oqimga', () => {
  it('yorliq va ismlar biriktiriladi (jurnalda faqat id bor)', async () => {
    const { service } = makeService({
      kpiEvents: [kpiEvent()],
      itemEvents: [
        {
          id: 'w1',
          itemId: 'item-1',
          fromStatus: 'open',
          toStatus: 'resolved',
          action: 'acknowledge',
          actorType: 'manager',
          actorId: 'mgr-1',
          reasonCode: 'justified',
          comment: null,
          createdAt: new Date('2026-08-06T10:00:00.000Z'),
        },
      ],
      shiftEvents: [
        {
          id: 's1',
          sessionId: 'ses-1',
          fromState: 'pending',
          toState: 'accepted',
          action: 'accept',
          actorType: 'manager',
          actorId: 'mgr-1',
          reasonCode: null,
          comment: null,
          createdAt: new Date('2026-08-04T10:00:00.000Z'),
        },
      ],
      supplyEvents: [
        {
          id: 'p1',
          supplyId: 'sup-1',
          fromStage: 'awaiting_admin',
          toStage: 'completed',
          action: 'admin_ok',
          actorType: 'admin',
          actorId: null,
          reason: 'hammasi joyida',
          createdAt: new Date('2026-08-03T10:00:00.000Z'),
        },
      ],
    });

    const out = await service.list('acc-1', query(), NOW);

    expect(out.rows.map((r) => r.key)).toEqual([
      'work_item:w1',
      'daily_kpi:k1',
      'shift:s1',
      'supply:p1',
    ]);

    const byKey = new Map(out.rows.map((r) => [r.key, r]));
    expect(byKey.get('daily_kpi:k1')?.subjectLabel).toBe('2026-08-01');
    expect(byKey.get('daily_kpi:k1')?.subjectEmployeeName).toBe('Sardor');
    expect(byKey.get('daily_kpi:k1')?.actorName).toBe('Aziz');
    // Navbat elementining yorlig'i — QOIDA TURI (ekranda MK07 tarjimasi).
    expect(byKey.get('work_item:w1')?.subjectLabel).toBe('BIG_DEBT');
    expect(byKey.get('work_item:w1')?.subjectEmployeeName).toBe('Bek');
    expect(byKey.get('shift:s1')?.subjectLabel).toBe('SMENA-7');
    expect(byKey.get('supply:p1')?.subjectLabel).toBe('PR-2026-00042');
    // Qabul zanjirida yopiq sabab kodi yo'q — erkin matn izohga tushadi.
    expect(byKey.get('supply:p1')?.reasonCode).toBeNull();
    expect(byKey.get('supply:p1')?.comment).toBe('hammasi joyida');
  });

  it('MK01 puli hodisaga ulanadi (teskari yozuv ham)', async () => {
    const { service } = makeService({
      kpiEvents: [kpiEvent(), kpiEvent({ id: 'k2', action: 'reopen', toState: 'pending' })],
      money: [
        { kpiEventId: 'k1', kind: 'bonus', amountMinor: 50_000n },
        { kpiEventId: 'k2', kind: 'bonus', amountMinor: -50_000n },
      ],
    });

    const out = await service.list('acc-1', query(), NOW);
    const byKey = new Map(out.rows.map((r) => [r.key, r]));

    expect(byKey.get('daily_kpi:k1')?.money).toEqual([{ kind: 'bonus', amountMinor: 50_000n }]);
    expect(byKey.get('daily_kpi:k2')?.money).toEqual([{ kind: 'bonus', amountMinor: -50_000n }]);
  });
});

describe('MK21 servis — bekor qilish zondi', () => {
  it('oynadan KEYINGI `reopen` oynadagi qarorga belgi qo`yadi', async () => {
    const { service, calls } = makeService({
      kpiEvents: [kpiEvent()],
      kpiProbes: [
        { id: 'k9', dailyKpiId: 'day-1', createdAt: new Date('2026-08-20T10:00:00.000Z') },
      ],
    });

    const out = await service.list('acc-1', query(), NOW);

    expect(calls.kpiProbe).toBe(1);
    expect(out.rows.map((r) => r.key)).toEqual(['daily_kpi:k1']);
    expect(out.rows[0]?.voided).toBe(true);
    expect(out.rows[0]?.voidedByKey).toBe('daily_kpi:k9');
  });
});

describe('MK21 servis — halollik va tejamkorlik', () => {
  it('o`qish chegarasiga tegilgan manba NOMMA-NOM aytiladi', async () => {
    const many = Array.from({ length: 1000 }, (_, i) =>
      kpiEvent({ id: `k${i}`, createdAt: new Date(`2026-08-0${(i % 7) + 1}T10:00:00.000Z`) }),
    );
    const { service } = makeService({ kpiEvents: many });

    const out = await service.list('acc-1', query(), NOW);
    expect(out.cappedSources).toEqual(['daily_kpi']);
  });

  it('manba filtri berilsa, boshqa jadvallar UMUMAN o`qilmaydi', async () => {
    const { service, calls } = makeService({ kpiEvents: [kpiEvent()] });

    await service.list('acc-1', query({ sources: 'daily_kpi' }), NOW);

    expect(calls.kpiEvents).toBe(1);
    expect(calls.itemEvents).toBeUndefined();
    expect(calls.shiftEvents).toBeUndefined();
    expect(calls.supplyEvents).toBeUndefined();
  });

  it('davr berilmasa — oxirgi 30 kun, `to` = hozir', async () => {
    const { service } = makeService({});
    const out = await service.list('acc-1', DecisionJournalQuerySchema.parse({}), NOW);

    expect(out.to).toBe(NOW.toISOString());
    expect(out.from).toBe(new Date(NOW.getTime() - 30 * 86_400_000).toISOString());
    expect(out.generatedAt).toBe(NOW.toISOString());
  });
});

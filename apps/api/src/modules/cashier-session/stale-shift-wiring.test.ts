import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CashierSessionService } from './cashier-session.service.js';

/**
 * P4 — «unutilgan smena» himoyasining ULANISHI (xulq darajasida).
 *
 * Sof qoidalar `stale-shift.test.ts` da. Bu yerda tekshiriladigan narsa
 * boshqacha: qoida HAQIQATAN chaqirilyaptimi, chegara MK13 registridan
 * o'qilyaptimi va javob POS ko'radigan shaklda chiqyaptimi. Typecheck bu
 * ulanishlarning birortasini ham ko'rmaydi (`DocumentEditor` prop-drop
 * klassi: maydon qo'shildi-yu, uzatilmadi).
 */

const ACC = 'acc-1';
const CASHIER = 'cash-1';

const OPENED = new Date('2026-08-01T00:00:00Z');

function makeService(opts: { thresholdRows?: unknown[]; openedAt?: Date } = {}) {
  const session = {
    id: 'sess-1',
    name: 'Смена-0007',
    accountId: ACC,
    cashierId: CASHIER,
    state: 'open',
    openedAt: opts.openedAt ?? OPENED,
    cashier: { id: CASHIER, name: 'Kassir 1' },
    cashDesk: { id: 'cd-1', name: 'Asosiy kassa', currency: 'UZS' },
    store: { id: 'st-1', name: 'Ombor' },
    organization: { id: 'org-1', name: 'Sherset' },
  };
  const findFirst = vi.fn().mockResolvedValue(session);
  const client = {
    cashierSession: { findFirst },
    managerRuleConfig: { findMany: vi.fn().mockResolvedValue(opts.thresholdRows ?? []) },
  };
  const service = new CashierSessionService({ client } as never);
  return { service, findFirst, client, session };
}

/** «Hozir» ni boshqarish — soatga bog'liq test bo'lmasin. */
function withNow<T>(iso: string, fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
  return fn().finally(() => vi.useRealTimers());
}

describe('current() — smena YOSHI javobda', () => {
  it('yosh va chegara javobga qo`shiladi (POS o`zi hisoblamaydi)', async () => {
    const { service } = makeService();
    const res = await withNow('2026-08-01T05:30:00Z', () =>
      service.findCurrentForCashier(ACC, CASHIER),
    );
    expect(res?.openMinutes).toBe(330);
    // Registr sukuti — 12 soat.
    expect(res?.staleWarnHours).toBe(12);
    expect(res?.stale).toBe(false);
  });

  it('chegaradan oshgan smena `stale: true` bo`ladi', async () => {
    const { service } = makeService();
    const res = await withNow('2026-08-12T00:00:00Z', () =>
      service.findCurrentForCashier(ACC, CASHIER),
    );
    expect(res?.openMinutes).toBe(11 * 24 * 60);
    expect(res?.stale).toBe(true);
  });

  it('chegara MK13 registridan o`qiladi (sozlangan qiymat qo`llanadi)', async () => {
    const { service } = makeService({
      thresholdRows: [
        {
          ruleType: 'SHIFT_OPEN_WARN_HOURS',
          enabled: true,
          thresholdValue: '4',
          thresholdUnit: 'hours',
          mode: null,
          severity: null,
        },
      ],
    });
    const res = await withNow('2026-08-01T05:00:00Z', () =>
      service.findCurrentForCashier(ACC, CASHIER),
    );
    expect(res?.staleWarnHours).toBe(4);
    // 5 soat > 4 soat.
    expect(res?.stale).toBe(true);
  });

  it('chegara O`CHIRILGAN bo`lsa yosh baribir qaytadi, `stale` esa false', async () => {
    const { service } = makeService({
      thresholdRows: [
        {
          ruleType: 'SHIFT_OPEN_WARN_HOURS',
          enabled: false,
          thresholdValue: '12',
          thresholdUnit: 'hours',
          mode: null,
          severity: null,
        },
      ],
    });
    const res = await withNow('2026-08-12T00:00:00Z', () =>
      service.findCurrentForCashier(ACC, CASHIER),
    );
    expect(res?.staleWarnHours).toBeNull();
    expect(res?.stale).toBe(false);
    expect(res?.openMinutes).toBe(11 * 24 * 60);
  });

  it('🔴 noto`g`ri BIRLIKDAGI sozlama jimgina qo`llanmaydi (registr sukutiga qaytadi)', async () => {
    // `days` deb yozilgan 1 qiymat «1 soat» bo'lib talqin qilinsa, har
    // smena birinchi soatdayoq «unutilgan» bo'lardi.
    const { service } = makeService({
      thresholdRows: [
        {
          ruleType: 'SHIFT_OPEN_WARN_HOURS',
          enabled: true,
          thresholdValue: '1',
          thresholdUnit: 'days',
          mode: null,
          severity: null,
        },
      ],
    });
    const res = await withNow('2026-08-01T02:00:00Z', () =>
      service.findCurrentForCashier(ACC, CASHIER),
    );
    expect(res?.staleWarnHours).toBe(12);
    expect(res?.stale).toBe(false);
  });

  it('ochiq smena yo`q bo`lsa `null` (yosh maydonlari qo`shilmaydi)', async () => {
    const { service, findFirst } = makeService();
    findFirst.mockResolvedValueOnce(null);
    await expect(service.findCurrentForCashier(ACC, CASHIER)).resolves.toBeNull();
  });

  it('chegarani o`qib bo`lmasa POS yiqilmaydi — sukut qo`llanadi', async () => {
    const { service, client } = makeService();
    client.managerRuleConfig.findMany.mockRejectedValueOnce(new Error('db down'));
    const res = await withNow('2026-08-12T00:00:00Z', () =>
      service.findCurrentForCashier(ACC, CASHIER),
    );
    expect(res?.staleWarnHours).toBe(12);
    expect(res?.stale).toBe(true);
  });
});

describe('open() — «allaqachon ochiq smena» xabari', () => {
  it('davomiylik va keyingi qadam bilan 409 beradi', async () => {
    const { service } = makeService();
    const err = await withNow('2026-08-12T00:00:00Z', async () => {
      try {
        await service.open(ACC, CASHIER, {
          cashDeskId: '11111111-1111-4111-8111-111111111111',
          storeId: '22222222-2222-4222-8222-222222222222',
          organizationId: '33333333-3333-4333-8333-333333333333',
          openingCashMinor: 0,
        });
        return null;
      } catch (e) {
        return e as Error;
      }
    });
    expect(err).toBeInstanceOf(ConflictException);
    expect(err?.message).toContain('Смена-0007');
    expect(err?.message).toContain('11 kun');
    expect(err?.message).toMatch(/yoping/i);
    // Ilgarigi inglizcha matn qaytib kelmasin.
    expect(err?.message).not.toContain('Close it first');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { materializeComment } from '../comments/comment-templates.js';
import { DailyKpiAcceptanceService } from './daily-kpi-acceptance.service.js';
import { KPI_ACCRUAL_CONDITION_TYPE } from './kpi-accrual.js';
import { BUILT_IN_CATALOG } from './kpi-metrics.js';

/**
 * Qabul → bonus/jarima ULANISHI (MK01, QAROR-B1).
 *
 * Sof modul (`kpi-accrual.test.ts`) formulani qulflaydi; bu yerda **pul
 * haqiqatan yozilishi** tekshiriladi. Har biri buzilsa oylik jimgina
 * noto'g'ri bo'lardi:
 *   1. qoida bor-u yozuv yo'q — bonus hech qachon to'lanmaydi;
 *   2. qoida yo'q-u yozuv bor — hech kim so'ramagan pul paydo bo'ladi;
 *   3. bekor qilinganda teskari qator yo'q — bekor qilingan kun puli qoladi;
 *   4. yozuv tranzaksiyadan tashqarida — holat qaytadi, pul qoladi.
 */

const ACC = 'acc-1';
const ID = 'day-1';
const EMP = 'emp-1';
const MANAGER = { accountId: ACC, actor: 'manager' as const, actorId: 'mgr-1' };
const OWNER = { accountId: ACC, actor: 'owner' as const, actorId: 'own-1' };

const BONUS_RULE = {
  id: 'rule-bonus',
  name: 'Kunlik reja bajarildi',
  kind: 'bonus',
  amountMinor: 50_000_00n,
  condition: { type: KPI_ACCRUAL_CONDITION_TYPE, minPercent: 100, maxPercent: null },
};

function makeService(opts: {
  state?: string;
  /** `null` = profil yo'q ⇒ ball hisoblanmaydi (`scorePercent` NULL). */
  profileVersion?: {
    metrics: Array<{ weight: number; target: bigint | null; metricDef: { key: string } }>;
  } | null;
  rules?: Array<Record<string, unknown>>;
  /** Kunda allaqachon turgan pul yozuvlari (bekor qilish uchun). */
  ledger?: Array<{ kind: string; amountMinor: bigint }>;
  claimCount?: number;
}) {
  const logCreate = vi.fn().mockResolvedValue({ id: 'log-1' });
  const logFindMany = vi.fn().mockResolvedValue(opts.ledger ?? []);
  const eventCreate = vi.fn().mockResolvedValue({ id: 'ev-1' });
  const tx = {
    employeeDailyKpi: { updateMany: vi.fn().mockResolvedValue({ count: opts.claimCount ?? 1 }) },
    employeeDailyKpiEvent: { create: eventCreate },
    employeeDailyKpiMetric: { update: vi.fn().mockResolvedValue({}) },
    employeeKpiCorrection: { create: vi.fn().mockResolvedValue({}) },
    hrBonusFineLog: { create: logCreate, findMany: logFindMany },
  };
  const client = {
    employeeDailyKpi: {
      findFirst: vi.fn().mockResolvedValue({
        id: ID,
        state: opts.state ?? 'pending',
        employeeId: EMP,
        date: new Date('2026-08-05T00:00:00Z'),
        acceptedFactMinor: null,
        employee: { name: 'Aliyev A.' },
        metrics: [
          { metricKey: 'cash_revenue', autoValue: 1500n, adjustValue: null, complete: true },
        ],
        profileVersion:
          opts.profileVersion === undefined
            ? { metrics: [{ weight: 100, target: 1000n, metricDef: { key: 'cash_revenue' } }] }
            : opts.profileVersion,
      }),
      // `markStale` kunlarni sana bo'yicha skanerlaydi (tizim o'tishi).
      findMany: vi.fn().mockResolvedValue([{ id: ID, state: opts.state ?? 'accepted' }]),
    },
    hrBonusFineRule: { findMany: vi.fn().mockResolvedValue(opts.rules ?? []) },
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const catalog = {
    resolve: vi.fn().mockResolvedValue(BUILT_IN_CATALOG),
  };
  // MK20 — shablon servisi dublyori (shablonsiz yo'l).
  const commentTemplates = {
    resolveComment: vi.fn(async (_acc: string, input: { comment?: string | null }) =>
      materializeComment({ comment: input.comment }),
    ),
  };
  const service = new DailyKpiAcceptanceService(
    { client } as never,
    catalog as never,
    commentTemplates as never,
  );
  return { service, logCreate, logFindMany, eventCreate, client, tx };
}

describe('qabulda bonus/jarima YOZILADI', () => {
  it('mos qoida bor — `kpi_accept` yozuvi kun va hodisaga bog`lanadi', async () => {
    // Ball = 1500/1000 = 150% ⇒ [100, ∞) oralig'i.
    const { service, logCreate } = makeService({ rules: [BONUS_RULE] });
    await service.transition(MANAGER, ID, 'accept');

    expect(logCreate).toHaveBeenCalledTimes(1);
    const data = logCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      accountId: ACC,
      employeeId: EMP,
      employeeName: 'Aliyev A.', // snapshot — xodim nomi o'zgarsa tarix buzilmaydi
      kind: 'bonus',
      source: 'kpi_accept',
      amountMinor: 50_000_00n,
      dailyKpiId: ID,
      kpiEventId: 'ev-1',
      ruleId: 'rule-bonus',
      createdById: 'mgr-1',
    });
  });

  it('egasining `force_accept` i ham pul yozadi', async () => {
    const { service, logCreate } = makeService({ state: 'escalated', rules: [BONUS_RULE] });
    await service.transition(OWNER, ID, 'force_accept', { reasonCode: 'owner_decision' });
    expect(logCreate).toHaveBeenCalledTimes(1);
  });

  it('qoida yo`q — hech qanday pul yozilmaydi (opt-in)', async () => {
    const { service, logCreate } = makeService({ rules: [] });
    await service.transition(MANAGER, ID, 'accept');
    expect(logCreate).not.toHaveBeenCalled();
  });

  it('ball NULL (profil yo`q) — pul yozilmaydi', async () => {
    const { service, logCreate } = makeService({ profileVersion: null, rules: [BONUS_RULE] });
    await service.transition(MANAGER, ID, 'accept');
    expect(logCreate).not.toHaveBeenCalled();
  });

  it('faqat FAOL va o`chirilmagan qoidalar o`qiladi', async () => {
    const { service, client } = makeService({ rules: [BONUS_RULE] });
    await service.transition(MANAGER, ID, 'accept');
    expect(client.hrBonusFineRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ accountId: ACC, isActive: true, deletedAt: null }),
      }),
    );
  });

  it('yozuv holat o`zgarishi bilan BITTA tranzaksiyada', async () => {
    // Alohida ketsa: holat qaytadi (rollback), pul esa qolib ketadi.
    const { service, tx, logCreate } = makeService({ rules: [BONUS_RULE] });
    await service.transition(MANAGER, ID, 'accept');
    expect(logCreate).toHaveBeenCalledTimes(1);
    expect(tx.employeeDailyKpi.updateMany).toHaveBeenCalledTimes(1);
  });

  it('da`vo tegmasa (parallel menejer) — pul ham yozilmaydi', async () => {
    const { service, logCreate } = makeService({ rules: [BONUS_RULE], claimCount: 0 });
    await expect(service.transition(MANAGER, ID, 'accept')).rejects.toThrow();
    // `create` chaqirilgan bo'lsa ham tranzaksiya qaytardi — lekin bu yerda
    // umuman chaqirilmasligi kerak: da'vo BIRINCHI bajariladi.
    expect(logCreate).not.toHaveBeenCalled();
  });

  it('takroriy qabul (no-op) — ikkinchi yozuv YO`Q', async () => {
    // Menejer 20+ kunni klaviatura bilan yopadi, `A` ni ikki marta bosish normal.
    const { service, logCreate } = makeService({ state: 'accepted', rules: [BONUS_RULE] });
    const res = await service.transition(MANAGER, ID, 'accept');
    expect(res.changed).toBe(false);
    expect(logCreate).not.toHaveBeenCalled();
  });
});

describe('bekor qilinganda ZERO-SUM teskari qator', () => {
  it('`reopen` — kun qoldig`i nolga keltiriladi, o`chirilmaydi', async () => {
    const { service, logCreate, logFindMany } = makeService({
      state: 'accepted',
      ledger: [
        { kind: 'bonus', amountMinor: 50_000_00n, employeeId: EMP, employeeName: 'Aliyev A.' },
      ],
    });
    await service.transition(MANAGER, ID, 'reopen', { reasonCode: 'correction' });

    expect(logFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ accountId: ACC, dailyKpiId: ID }),
      }),
    );
    expect(logCreate).toHaveBeenCalledTimes(1);
    expect(logCreate.mock.calls[0][0].data).toMatchObject({
      kind: 'bonus',
      source: 'kpi_accept_reversal',
      amountMinor: -50_000_00n,
      dailyKpiId: ID,
      kpiEventId: 'ev-1',
    });
  });

  it('`mark_stale` (tizim) — eskirgan kun puli ham qaytariladi', async () => {
    const { service, logCreate } = makeService({
      state: 'accepted',
      ledger: [
        { kind: 'bonus', amountMinor: 30_000_00n, employeeId: EMP, employeeName: 'Aliyev A.' },
      ],
    });
    await service.markStale(ACC, EMP, new Date('2026-08-05T00:00:00Z'));
    expect(logCreate).toHaveBeenCalledTimes(1);
    expect(logCreate.mock.calls[0][0].data).toMatchObject({
      source: 'kpi_accept_reversal',
      amountMinor: -30_000_00n,
    });
  });

  it('qoldiq allaqachon 0 — teskari qator YOZILMAYDI', async () => {
    const { service, logCreate } = makeService({
      state: 'accepted',
      ledger: [
        { kind: 'bonus', amountMinor: 50_000_00n, employeeId: EMP, employeeName: 'Aliyev A.' },
        { kind: 'bonus', amountMinor: -50_000_00n, employeeId: EMP, employeeName: 'Aliyev A.' },
      ],
    });
    await service.transition(MANAGER, ID, 'reopen', { reasonCode: 'correction' });
    expect(logCreate).not.toHaveBeenCalled();
  });

  it('muzlamagan holatdan chiqishda (rejected) — teskari qator izlanmaydi', async () => {
    // `pending → rejected` da hech qachon pul yozilmagan; bo'sh so'rov ortiqcha.
    const { service, logFindMany, logCreate } = makeService({ state: 'pending' });
    await service.transition(MANAGER, ID, 'reject', { reasonCode: 'data_dispute' });
    expect(logFindMany).not.toHaveBeenCalled();
    expect(logCreate).not.toHaveBeenCalled();
  });
});

describe('eskirgan kun tuzatmasi bilan IKKI KARRA bo`lmaydi', () => {
  it('qabul → eskirish → qayta qabul: eski bonus qaytariladi, yangisi yoziladi', async () => {
    // 1-qabul: 150% ⇒ 50 000.00 bonus.
    const first = makeService({ rules: [BONUS_RULE] });
    await first.service.transition(MANAGER, ID, 'accept');
    expect(first.logCreate.mock.calls[0][0].data.amountMinor).toBe(50_000_00n);

    // Eskirish: qoldiq (50 000.00) nolga keltiriladi.
    const stale = makeService({
      state: 'accepted',
      ledger: [
        { kind: 'bonus', amountMinor: 50_000_00n, employeeId: EMP, employeeName: 'Aliyev A.' },
      ],
    });
    await stale.service.markStale(ACC, EMP, new Date('2026-08-05T00:00:00Z'));
    expect(stale.logCreate.mock.calls[0][0].data.amountMinor).toBe(-50_000_00n);

    // 2-qabul (`stale` dan): yangi qoida summasi yoziladi.
    const again = makeService({
      state: 'stale',
      rules: [{ ...BONUS_RULE, amountMinor: 30_000_00n }],
      ledger: [
        { kind: 'bonus', amountMinor: 50_000_00n, employeeId: EMP, employeeName: 'Aliyev A.' },
        { kind: 'bonus', amountMinor: -50_000_00n, employeeId: EMP, employeeName: 'Aliyev A.' },
      ],
    });
    await again.service.transition(MANAGER, ID, 'accept');
    const rows = again.logCreate.mock.calls.map((c) => c[0].data);
    expect(rows).toHaveLength(1);
    expect(rows[0].amountMinor).toBe(30_000_00n);

    // Jami: 50 000 − 50 000 + 30 000 = 30 000 (ikki karra EMAS).
    const net = 50_000_00n - 50_000_00n + 30_000_00n;
    expect(net).toBe(30_000_00n);
  });
});

describe('sxema shartnomasi (DB darajasidagi qulf)', () => {
  const SCHEMA = readFileSync(
    join(
      import.meta.dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      '..',
      'packages',
      'db',
      'prisma',
      'schema.prisma',
    ),
    'utf8',
  );

  it('bir FSM o`tishi → har turdan bitta yozuv (`@@unique`)', () => {
    // Servis mantig'i buzilsa ham DB ikkinchi yozuvni qabul qilmaydi.
    expect(SCHEMA).toContain('uq_bonusfine_kpi_event_kind');
  });

  it('kun o`chsa pul yozuvi QOLADI (SetNull, Cascade emas)', () => {
    const model = SCHEMA.slice(SCHEMA.indexOf('model HrBonusFineLog'));
    const body = model.slice(0, model.indexOf('@@map("hr_bonus_fine_log")'));
    expect(body).toMatch(/dailyKpi\s+EmployeeDailyKpi\?.*onDelete: SetNull/);
    expect(body).toMatch(/kpiEvent\s+EmployeeDailyKpiEvent\?.*onDelete: SetNull/);
  });
});

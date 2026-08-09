import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DailyKpiAcceptanceService } from '../kpi/daily-kpi-acceptance.service.js';
import { ManagerQueueService } from '../queue/manager-queue.service.js';
import { WORK_ITEM_ACTION, WORK_ITEM_STATUS } from '../queue/work-item-fsm.js';

/**
 * MK20 — ULANISH: shablon matni HAQIQATAN jurnalga tushadimi.
 *
 * Sof modul «matn ko'chiriladi» deb aytadi, servis esa matnni qaytaradi —
 * lekin ikkalasi ham chaqiruvchiga ULANMASA, ekranda shablon tanlanadi va
 * jurnalga hech narsa tushmaydi. Bu jim nuqson repoda allaqachon bo'lgan
 * (`DocumentEditor` prop-drop, yetim modul). Shu sabab bu yerda **haqiqiy
 * servis** chaqiriladi va Prisma'ga BERILGAN payload tekshiriladi.
 *
 * 🔴 Ikkinchi qulf: jurnal payload'ida `templateId` KALITI BO'LMASLIGI shart.
 * Kimdir «statistika uchun» havola qo'shsa — shablon tahrirlanganda tarix
 * boshqacha o'qiladigan bo'lib qoladi (MK20 ning butun sababi shu).
 */

const ACC = 'acc-1';
const MANAGER = { actor: 'manager' as const, actorId: 'mgr-1' };
const BODY = 'Bu element dublikat — hodisa allaqachon ko`rilgan.';

function fakeTemplates(body = BODY) {
  return {
    resolveComment: vi.fn(async (_acc: string, input: { templateId?: string; comment?: string }) =>
      input.templateId ? input.comment?.trim() || body : (input.comment?.trim() ?? null),
    ),
  };
}

// ── Navbat (MK06/MK07) ──────────────────────────────────────────────────────

function makeQueue(body?: string) {
  const managerWorkItem = {
    findFirst: vi.fn().mockResolvedValue({
      id: 'wi-1',
      status: WORK_ITEM_STATUS.open,
      ruleType: 'BIG_DEBT',
    }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const managerWorkItemEvent = { create: vi.fn().mockResolvedValue({ id: 'ev-1' }) };
  const client = {
    managerWorkItem,
    managerWorkItemEvent,
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ managerWorkItem, managerWorkItemEvent }),
    ),
  };
  const templates = fakeTemplates(body);
  const service = new ManagerQueueService(
    { client } as never,
    { stockSignalRows: vi.fn() } as never,
    templates as never,
  );
  return { service, managerWorkItem, managerWorkItemEvent, templates };
}

describe('navbat elementi — shablon matni jurnalga', () => {
  it('`templateId` uzatilsa jurnalga SHABLON MATNI yoziladi', async () => {
    const { service, managerWorkItemEvent } = makeQueue();

    await service.act(ACC, MANAGER, 'wi-1', {
      action: WORK_ITEM_ACTION.dismiss,
      reasonCode: 'duplicate',
      templateId: 'tpl-1',
    } as never);

    expect(managerWorkItemEvent.create.mock.calls[0]?.[0].data.comment).toBe(BODY);
  });

  it('🔴 jurnal payload`ida shablonga HAVOLA yo`q', async () => {
    const { service, managerWorkItemEvent, managerWorkItem } = makeQueue();

    await service.act(ACC, MANAGER, 'wi-1', {
      action: WORK_ITEM_ACTION.dismiss,
      reasonCode: 'duplicate',
      templateId: 'tpl-1',
    } as never);

    const eventData = managerWorkItemEvent.create.mock.calls[0]?.[0].data as Record<
      string,
      unknown
    >;
    const itemData = managerWorkItem.updateMany.mock.calls[0]?.[0].data as Record<string, unknown>;
    for (const key of Object.keys(eventData)) expect(key.toLowerCase()).not.toContain('template');
    for (const key of Object.keys(itemData)) expect(key.toLowerCase()).not.toContain('template');
  });

  it('yopilgan element ustunida ham AYNI matn (jurnal bilan ajralmaydi)', async () => {
    const { service, managerWorkItem } = makeQueue();

    await service.act(ACC, MANAGER, 'wi-1', {
      action: WORK_ITEM_ACTION.dismiss,
      reasonCode: 'duplicate',
      templateId: 'tpl-1',
    } as never);

    expect(managerWorkItem.updateMany.mock.calls[0]?.[0].data.resolutionComment).toBe(BODY);
  });

  it('shablonsiz izoh AVVALGIDEK ishlaydi (MK06 regressiyasi yo`q)', async () => {
    const { service, managerWorkItemEvent } = makeQueue();

    await service.act(ACC, MANAGER, 'wi-1', {
      action: WORK_ITEM_ACTION.dismiss,
      reasonCode: 'duplicate',
      comment: 'O`zim yozgan izoh',
    } as never);

    expect(managerWorkItemEvent.create.mock.calls[0]?.[0].data.comment).toBe('O`zim yozgan izoh');
  });
});

// ── Kun qabuli (MK01) ───────────────────────────────────────────────────────

describe('kun qabuli — shablon matni jurnalga', () => {
  function makeAcceptance() {
    const employeeDailyKpiEvent = { create: vi.fn().mockResolvedValue({ id: 'ev-1' }) };
    const employeeDailyKpi = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'day-1',
        accountId: ACC,
        employeeId: 'emp-1',
        state: 'pending',
        acceptedFactMinor: null,
        employee: { id: 'emp-1', name: 'Ali' },
        metrics: [],
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const client = {
      employeeDailyKpi,
      employeeDailyKpiEvent,
      employeeDailyKpiMetric: { findMany: vi.fn().mockResolvedValue([]) },
      kpiProfileMetric: { findMany: vi.fn().mockResolvedValue([]) },
      managerRuleConfig: { findMany: vi.fn().mockResolvedValue([]) },
      hrBonusFineLog: { create: vi.fn() },
      employeeKpiCorrection: { create: vi.fn() },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ employeeDailyKpi, employeeDailyKpiEvent, hrBonusFineLog: { create: vi.fn() } }),
      ),
    };
    const templates = fakeTemplates();
    const service = new DailyKpiAcceptanceService(
      { client } as never,
      { resolve: vi.fn() } as never,
      templates as never,
    );
    return { service, employeeDailyKpiEvent, templates };
  }

  it('`templateId` uzatilsa kun jurnaliga SHABLON MATNI yoziladi', async () => {
    const { service, employeeDailyKpiEvent } = makeAcceptance();

    await service.transition(
      { accountId: ACC, actor: 'manager', actorId: 'mgr-1' } as never,
      'day-1',
      'reject' as never,
      { reasonCode: 'variance_unexplained', templateId: 'tpl-1' } as never,
    );

    expect(employeeDailyKpiEvent.create.mock.calls[0]?.[0].data.comment).toBe(BODY);
  });

  it('🔴 kun jurnali payload`ida ham havola yo`q', async () => {
    const { service, employeeDailyKpiEvent } = makeAcceptance();

    await service.transition(
      { accountId: ACC, actor: 'manager', actorId: 'mgr-1' } as never,
      'day-1',
      'reject' as never,
      { reasonCode: 'variance_unexplained', templateId: 'tpl-1' } as never,
    );

    const data = employeeDailyKpiEvent.create.mock.calls[0]?.[0].data as Record<string, unknown>;
    for (const key of Object.keys(data)) expect(key.toLowerCase()).not.toContain('template');
  });
});

// ── Sxema qulfi ─────────────────────────────────────────────────────────────

describe('🔴 sxema qulfi — jurnal jadvallarida shablon ustuni YO`Q', () => {
  const schema = readFileSync(
    resolve(process.cwd(), '../../packages/db/prisma/schema.prisma'),
    'utf8',
  );

  for (const model of ['ManagerWorkItemEvent', 'EmployeeDailyKpiEvent']) {
    it(`${model} da \`template\` maydoni yo'q`, () => {
      const at = schema.indexOf(`model ${model} {`);
      expect(at).toBeGreaterThan(-1);
      const block = schema.slice(at);
      const body = block.slice(0, block.indexOf('\n}'));
      // Bo'sh emasligini tasdiqlash: model nomi o'zgarsa test JIMGINA yashil
      // qolib, qulf yo'qolgan bo'lardi.
      expect(body).toContain('comment');
      expect(body.toLowerCase()).not.toContain('template');
    });
  }
});

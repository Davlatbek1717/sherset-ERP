import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrTemplateSchedulerService } from './hr-template-scheduler.service.js';

function makePrisma() {
  return {
    client: {
      hrTaskTemplate: { findMany: vi.fn() },
    },
  };
}

function makeRegistry() {
  const jobs = new Map<string, unknown>();
  return {
    addCronJob: vi.fn((name: string, job: unknown) => {
      jobs.set(name, job);
    }),
    deleteCronJob: vi.fn((name: string) => {
      jobs.delete(name);
    }),
    doesExist: vi.fn((_type: string, name: string) => jobs.has(name)),
    _jobs: jobs,
  };
}

function makeSendService() {
  return {
    dispatchTemplate: vi.fn().mockResolvedValue(undefined),
  };
}

describe('HrTemplateSchedulerService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let registry: ReturnType<typeof makeRegistry>;
  let send: ReturnType<typeof makeSendService>;
  let svc: HrTemplateSchedulerService;

  beforeEach(() => {
    prisma = makePrisma();
    registry = makeRegistry();
    send = makeSendService();
    svc = new HrTemplateSchedulerService(
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      prisma as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      registry as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      send as any,
    );
  });

  it('onModuleInit registers each active scheduled template from DB', async () => {
    prisma.client.hrTaskTemplate.findMany.mockResolvedValue([
      {
        id: 'tpl-1',
        accountId: 'acc1',
        scheduleConfig: { time: '09:00', mode: 'weekly', days: [1, 2, 3] },
      },
      {
        id: 'tpl-2',
        accountId: 'acc1',
        scheduleConfig: { time: '15:00', mode: 'monthly', dayOfMonth: 15 },
      },
    ]);
    await svc.onModuleInit();
    expect(registry.addCronJob).toHaveBeenCalledTimes(2);
    expect(registry._jobs.has('hr-template-tpl-1')).toBe(true);
    expect(registry._jobs.has('hr-template-tpl-2')).toBe(true);
  });

  it('register adds a cron job under predictable name', () => {
    svc.register('tpl-x', 'acc1', { time: '09:00', mode: 'weekly', days: [1] });
    expect(registry.addCronJob).toHaveBeenCalledWith('hr-template-tpl-x', expect.anything());
  });

  it('register is idempotent — second call replaces first', () => {
    svc.register('tpl-x', 'acc1', { time: '09:00', mode: 'weekly', days: [1] });
    svc.register('tpl-x', 'acc1', { time: '10:00', mode: 'weekly', days: [2] });
    expect(registry.deleteCronJob).toHaveBeenCalledWith('hr-template-tpl-x');
    expect(registry.addCronJob).toHaveBeenCalledTimes(2);
  });

  it('register with null config is a no-op (no cron created, no throw)', () => {
    svc.register('tpl-x', 'acc1', null);
    expect(registry.addCronJob).not.toHaveBeenCalled();
  });

  it('unregister removes existing; no-op if absent', () => {
    svc.register('tpl-x', 'acc1', { time: '09:00', mode: 'weekly', days: [1] });
    svc.unregister('tpl-x');
    expect(registry.deleteCronJob).toHaveBeenCalledWith('hr-template-tpl-x');

    registry.deleteCronJob.mockClear();
    svc.unregister('tpl-not-existing');
    expect(registry.deleteCronJob).not.toHaveBeenCalled();
  });

  it('onModuleInit continues past one bad template (catches cron parser throw)', async () => {
    prisma.client.hrTaskTemplate.findMany.mockResolvedValue([
      {
        id: 'tpl-good',
        accountId: 'acc1',
        scheduleConfig: { time: '09:00', mode: 'weekly', days: [1] },
      },
      // bad: weekly with empty days[] → cron-builder throws
      {
        id: 'tpl-bad',
        accountId: 'acc1',
        scheduleConfig: { time: '09:00', mode: 'weekly', days: [] },
      },
      {
        id: 'tpl-good-2',
        accountId: 'acc1',
        scheduleConfig: { time: '10:00', mode: 'monthly', dayOfMonth: 1 },
      },
    ]);
    await expect(svc.onModuleInit()).resolves.not.toThrow();
    expect(registry._jobs.has('hr-template-tpl-good')).toBe(true);
    expect(registry._jobs.has('hr-template-tpl-good-2')).toBe(true);
    expect(registry._jobs.has('hr-template-tpl-bad')).toBe(false);
  });
});

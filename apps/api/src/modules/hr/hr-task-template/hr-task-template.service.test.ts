import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrTaskTemplateService } from './hr-task-template.service.js';

function makePrisma() {
  return {
    client: {
      hrTaskTemplate: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      hrTaskLog: {
        count: vi.fn(),
      },
      employee: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
}

function makeScheduler() {
  return {
    register: vi.fn(),
    unregister: vi.fn(),
  };
}

const baseInput = {
  title: 'Kassani yopdingmi?',
  description: 'Kun oxirida kassani yoping',
  assignedEmployeeId: 'emp-1',
  assignedRole: null,
  department: null,
  priority: 'medium' as const,
  triggerType: 'scheduled' as const,
  scheduleConfig: { time: '23:00', mode: 'weekly' as const, days: [1, 2, 3, 4, 5] },
  eventConfig: null,
  responseType: 'yes_no' as const,
  deadlineMinutes: 30,
  rewardMinor: 10_000_00,
  fineMinor: 5_000_00,
  checkerId: null,
  dependsOnId: null,
  isActive: true,
};

describe('HrTaskTemplateService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let scheduler: ReturnType<typeof makeScheduler>;
  let service: HrTaskTemplateService;

  beforeEach(() => {
    prisma = makePrisma();
    scheduler = makeScheduler();
    service = new HrTaskTemplateService(prisma as never, scheduler as never);
  });

  it('list applies search + transaction returns rows+total', async () => {
    prisma.client.$transaction.mockResolvedValue([[], 0]);
    const result = await service.list('acc1', { search: 'kassa', page: 1, limit: 50 });
    expect(result).toEqual({ rows: [], total: 0, page: 1, limit: 50 });
  });

  it('findOne throws NotFound when missing', async () => {
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue(null);
    await expect(service.findOne('acc1', 'tpl-1')).rejects.toThrow(NotFoundException);
  });

  it('create rejects assignee not found in this account', async () => {
    prisma.client.employee.findFirst.mockResolvedValue(null);
    await expect(service.create('acc1', baseInput)).rejects.toThrow(/xodim topilmadi/);
  });

  it('create rejects checker without isChecker=true', async () => {
    prisma.client.employee.findFirst
      .mockResolvedValueOnce({ id: 'emp-1' } as never) // assignee ok
      .mockResolvedValueOnce(null); // checker missing
    await expect(service.create('acc1', { ...baseInput, checkerId: 'emp-2' })).rejects.toThrow(
      /isChecker/,
    );
  });

  it('create succeeds with valid assignee + scheduled trigger', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1' } as never);
    prisma.client.hrTaskTemplate.create.mockResolvedValue({ id: 'new' } as never);
    await service.create('acc1', baseInput);
    expect(prisma.client.hrTaskTemplate.create).toHaveBeenCalled();
    const callArgs = prisma.client.hrTaskTemplate.create.mock.calls[0]![0];
    expect(callArgs.data.rewardMinor).toBe(BigInt(10_000_00));
    expect(callArgs.data.fineMinor).toBe(BigInt(5_000_00));
  });

  it('update rejects self-dependency', async () => {
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue({ id: 'tpl-1' } as never);
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1' } as never);
    await expect(
      service.update('acc1', 'tpl-1', { ...baseInput, dependsOnId: 'tpl-1' }),
    ).rejects.toThrow(/o'ziga bog'liq/);
  });

  it('delete: soft-delete (isActive=false) when logs exist', async () => {
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue({ id: 'tpl-1' } as never);
    prisma.client.hrTaskLog.count.mockResolvedValue(3);
    prisma.client.hrTaskTemplate.update.mockResolvedValue({} as never);
    const result = await service.delete('acc1', 'tpl-1');
    expect(result).toEqual({ ok: true, mode: 'soft' });
    expect(prisma.client.hrTaskTemplate.update).toHaveBeenCalled();
    expect(prisma.client.hrTaskTemplate.delete).not.toHaveBeenCalled();
  });

  it('delete: hard-delete when no logs', async () => {
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue({ id: 'tpl-1' } as never);
    prisma.client.hrTaskLog.count.mockResolvedValue(0);
    prisma.client.hrTaskTemplate.delete.mockResolvedValue({} as never);
    const result = await service.delete('acc1', 'tpl-1');
    expect(result).toEqual({ ok: true, mode: 'hard' });
    expect(prisma.client.hrTaskTemplate.delete).toHaveBeenCalled();
  });

  it('setActive toggles isActive flag', async () => {
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue({ id: 'tpl-1' } as never);
    prisma.client.hrTaskTemplate.update.mockResolvedValue({ isActive: false } as never);
    await service.setActive('acc1', 'tpl-1', false);
    expect(prisma.client.hrTaskTemplate.update).toHaveBeenCalledWith({
      where: { id: 'tpl-1' },
      data: { isActive: false },
    });
  });

  it('create registers cron when scheduled + active', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1' } as never);
    prisma.client.hrTaskTemplate.create.mockResolvedValue({
      id: 'new',
      accountId: 'acc1',
      triggerType: 'scheduled',
      isActive: true,
      scheduleConfig: { time: '09:00', mode: 'weekly', days: [1, 2, 3] },
    } as never);
    await service.create('acc1', baseInput);
    expect(scheduler.register).toHaveBeenCalledWith(
      'new',
      'acc1',
      expect.objectContaining({ time: '09:00' }),
    );
    expect(scheduler.unregister).not.toHaveBeenCalled();
  });

  it('create unregisters when triggerType=manual', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1' } as never);
    prisma.client.hrTaskTemplate.create.mockResolvedValue({
      id: 'new',
      accountId: 'acc1',
      triggerType: 'manual',
      isActive: true,
      scheduleConfig: null,
    } as never);
    await service.create('acc1', { ...baseInput, triggerType: 'manual', scheduleConfig: null });
    expect(scheduler.register).not.toHaveBeenCalled();
    expect(scheduler.unregister).toHaveBeenCalledWith('new');
  });

  it('setActive(false) unregisters scheduled template', async () => {
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue({ id: 'tpl-1' } as never);
    prisma.client.hrTaskTemplate.update.mockResolvedValue({
      id: 'tpl-1',
      accountId: 'acc1',
      triggerType: 'scheduled',
      isActive: false,
      scheduleConfig: { time: '09:00', mode: 'weekly', days: [1] },
    } as never);
    await service.setActive('acc1', 'tpl-1', false);
    expect(scheduler.unregister).toHaveBeenCalledWith('tpl-1');
    expect(scheduler.register).not.toHaveBeenCalled();
  });

  it('delete (hard) unregisters cron', async () => {
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue({ id: 'tpl-1' } as never);
    prisma.client.hrTaskLog.count.mockResolvedValue(0);
    prisma.client.hrTaskTemplate.delete.mockResolvedValue({} as never);
    await service.delete('acc1', 'tpl-1');
    expect(scheduler.unregister).toHaveBeenCalledWith('tpl-1');
  });

  // ─── Adversarial QA additions (P3 Phase 2) ───────────────────────────

  it('update: optimistic-lock — refuses when expectedUpdatedAt mismatches current', async () => {
    const realUpdatedAt = new Date('2026-05-21T10:00:00Z');
    const staleSeen = new Date('2026-05-21T09:00:00Z');
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue({
      id: 'tpl-1',
      updatedAt: realUpdatedAt,
    } as never);

    await expect(
      service.update('acc1', 'tpl-1', {
        ...baseInput,
        expectedUpdatedAt: staleSeen,
      } as never),
    ).rejects.toThrow(ConflictException);
    expect(prisma.client.hrTaskTemplate.update).not.toHaveBeenCalled();
  });

  it('update: optimistic-lock — passes when expectedUpdatedAt matches current', async () => {
    const realUpdatedAt = new Date('2026-05-21T10:00:00Z');
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue({
      id: 'tpl-1',
      updatedAt: realUpdatedAt,
    } as never);
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1' } as never);
    prisma.client.hrTaskTemplate.update.mockResolvedValue({
      id: 'tpl-1',
      accountId: 'acc1',
      triggerType: 'manual',
      isActive: true,
      scheduleConfig: null,
    } as never);

    await service.update('acc1', 'tpl-1', {
      ...baseInput,
      triggerType: 'manual',
      scheduleConfig: null,
      expectedUpdatedAt: realUpdatedAt,
    } as never);

    expect(prisma.client.hrTaskTemplate.update).toHaveBeenCalled();
  });

  it('update: optimistic-lock — omitted expectedUpdatedAt still allows update (back-compat)', async () => {
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue({
      id: 'tpl-1',
      updatedAt: new Date(),
    } as never);
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1' } as never);
    prisma.client.hrTaskTemplate.update.mockResolvedValue({
      id: 'tpl-1',
      accountId: 'acc1',
      triggerType: 'manual',
      isActive: true,
      scheduleConfig: null,
    } as never);

    await service.update('acc1', 'tpl-1', {
      ...baseInput,
      triggerType: 'manual',
      scheduleConfig: null,
    });
    expect(prisma.client.hrTaskTemplate.update).toHaveBeenCalled();
  });

  it('update: cycle detection — A→B and editing A.dependsOn=A throws self-dep', async () => {
    // already covered by "update rejects self-dependency"; this just locks the message
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue({ id: 'tpl-A' } as never);
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1' } as never);
    await expect(
      service.update('acc1', 'tpl-A', { ...baseInput, dependsOnId: 'tpl-A' }),
    ).rejects.toThrow(/o'ziga bog'liq/);
  });

  it('update: cycle detection — A→B→A transitive cycle rejected (BadRequest)', async () => {
    // Editing tpl-A to depend on tpl-B; tpl-B already depends on tpl-A → cycle.
    //
    // findFirst is called in order: findOne(A) → validateDependsOn(parent=B exists)
    //   → assertNoCycle walks chain from B: lookup B → returns {dependsOnId:'tpl-A'}
    //   → cursor='tpl-A' == forbiddenId → throw.
    prisma.client.hrTaskTemplate.findFirst
      .mockResolvedValueOnce({ id: 'tpl-A', updatedAt: new Date() } as never) // findOne
      .mockResolvedValueOnce({ id: 'tpl-B' } as never) // validateDependsOn parent lookup
      .mockResolvedValueOnce({ dependsOnId: 'tpl-A' } as never); // assertNoCycle step 1
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1' } as never);

    await expect(
      service.update('acc1', 'tpl-A', { ...baseInput, dependsOnId: 'tpl-B' }),
    ).rejects.toThrow(/halqasi/);
  });

  it('update: cycle detection — A→B→C→A 3-hop cycle still rejected', async () => {
    prisma.client.hrTaskTemplate.findFirst
      .mockResolvedValueOnce({ id: 'tpl-A', updatedAt: new Date() } as never) // findOne
      .mockResolvedValueOnce({ id: 'tpl-B' } as never) // validateDependsOn
      .mockResolvedValueOnce({ dependsOnId: 'tpl-C' } as never) // assertNoCycle step 1: B → C
      .mockResolvedValueOnce({ dependsOnId: 'tpl-A' } as never); // step 2: C → A (boom)
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1' } as never);

    await expect(
      service.update('acc1', 'tpl-A', { ...baseInput, dependsOnId: 'tpl-B' }),
    ).rejects.toThrow(/halqasi/);
  });

  it('update: cycle detection — non-cyclic chain (A→B→C end) succeeds', async () => {
    prisma.client.hrTaskTemplate.findFirst
      .mockResolvedValueOnce({ id: 'tpl-A', updatedAt: new Date() } as never)
      .mockResolvedValueOnce({ id: 'tpl-B' } as never) // validateDependsOn
      .mockResolvedValueOnce({ dependsOnId: 'tpl-C' } as never) // B → C
      .mockResolvedValueOnce({ dependsOnId: null } as never); // C → end
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1' } as never);
    prisma.client.hrTaskTemplate.update.mockResolvedValue({
      id: 'tpl-A',
      accountId: 'acc1',
      triggerType: 'manual',
      isActive: true,
      scheduleConfig: null,
    } as never);

    await expect(
      service.update('acc1', 'tpl-A', {
        ...baseInput,
        triggerType: 'manual',
        scheduleConfig: null,
        dependsOnId: 'tpl-B',
      }),
    ).resolves.toBeTruthy();
  });

  it('update: validateDependsOn rejects unknown parent (BadRequest)', async () => {
    prisma.client.hrTaskTemplate.findFirst
      .mockResolvedValueOnce({ id: 'tpl-1', updatedAt: new Date() } as never)
      .mockResolvedValueOnce(null as never); // parent missing
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1' } as never);

    await expect(
      service.update('acc1', 'tpl-1', { ...baseInput, dependsOnId: 'tpl-MISSING' }),
    ).rejects.toThrow(BadRequestException);
  });
});

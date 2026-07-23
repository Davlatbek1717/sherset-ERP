import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HR_EVENT } from '../hr-shared/hr-events.types.js';
import { HrTaskSendService } from './hr-task-send.service.js';

function makePrisma() {
  return {
    client: {
      hrTaskTemplate: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      hrTaskLog: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      hrTelegramOutbox: { create: vi.fn() },
      hrBonusFineLog: { create: vi.fn() },
      task: { create: vi.fn() },
      employee: { findFirst: vi.fn(), findUnique: vi.fn() },
      $transaction: vi.fn(),
    },
  };
}

function makeEvents() {
  return { emit: vi.fn() };
}

function setupTxCallback(prisma: ReturnType<typeof makePrisma>) {
  // $transaction(cb) — invokes cb with same client (atomic semantics not relevant in unit test).
  prisma.client.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    if (typeof cb === 'function') return cb(prisma.client);
    return cb; // array form for listLogs
  });
}

const baseTemplate = {
  id: 'tpl-1',
  accountId: 'acc1',
  title: 'Kassa yopildimi?',
  description: 'Kun oxirida tekshir',
  assignedEmployeeId: 'emp-1',
  assignedRole: null,
  priority: 'medium',
  triggerType: 'manual',
  scheduleConfig: null,
  eventConfig: null,
  responseType: 'yes_no',
  deadlineMinutes: 30,
  rewardMinor: 10_000n,
  fineMinor: 5_000n,
  checkerId: null,
  dependsOnId: null,
  isActive: true,
};

describe('HrTaskSendService.dispatchTemplate', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let events: ReturnType<typeof makeEvents>;
  let svc: HrTaskSendService;

  beforeEach(() => {
    prisma = makePrisma();
    events = makeEvents();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrTaskSendService(prisma as any, events as any);
    setupTxCallback(prisma);
  });

  it('throws NotFound when template missing or inactive', async () => {
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue(null);
    await expect(svc.dispatchTemplate('acc1', 'tpl-x', { triggeredBy: 'manual' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('uses employeeIdOverride and validates it exists in account', async () => {
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue(baseTemplate);
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-9' });
    prisma.client.employee.findUnique.mockResolvedValue({ id: 'emp-9', telegramPhone: null });
    prisma.client.task.create.mockResolvedValue({ id: 'task-1' });
    prisma.client.hrTaskLog.create.mockResolvedValue({ id: 'log-1' });

    await svc.dispatchTemplate('acc1', 'tpl-1', {
      triggeredBy: 'manual',
      employeeIdOverride: 'emp-9',
    });

    expect(prisma.client.employee.findFirst).toHaveBeenCalledWith({
      where: { id: 'emp-9', accountId: 'acc1', archived: false },
      select: { id: true },
    });
    expect(prisma.client.task.create).toHaveBeenCalled();
    const taskArgs = prisma.client.task.create.mock.calls[0]![0];
    expect(taskArgs.data.assigneeId).toBe('emp-9');
    expect(taskArgs.data.kind).toBe('HR');
  });

  it('falls back to assignedEmployeeId when no override', async () => {
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue(baseTemplate);
    prisma.client.employee.findUnique.mockResolvedValue({ id: 'emp-1', telegramPhone: null });
    prisma.client.task.create.mockResolvedValue({ id: 'task-1' });
    prisma.client.hrTaskLog.create.mockResolvedValue({ id: 'log-1' });

    await svc.dispatchTemplate('acc1', 'tpl-1', { triggeredBy: 'manual' });

    const taskArgs = prisma.client.task.create.mock.calls[0]![0];
    expect(taskArgs.data.assigneeId).toBe('emp-1');
  });

  it('picks first employee by role when only assignedRole set', async () => {
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue({
      ...baseTemplate,
      assignedEmployeeId: null,
      assignedRole: 'cashier',
    });
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-role-1' });
    prisma.client.employee.findUnique.mockResolvedValue({ id: 'emp-role-1', telegramPhone: null });
    prisma.client.task.create.mockResolvedValue({ id: 'task-1' });
    prisma.client.hrTaskLog.create.mockResolvedValue({ id: 'log-1' });

    await svc.dispatchTemplate('acc1', 'tpl-1', { triggeredBy: 'scheduled' });

    expect(prisma.client.employee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: 'acc1', archived: false, hrRoles: { has: 'cashier' } },
        orderBy: { createdAt: 'asc' },
      }),
    );
    const taskArgs = prisma.client.task.create.mock.calls[0]![0];
    expect(taskArgs.data.assigneeId).toBe('emp-role-1');
  });

  it('throws BadRequest when assignedRole has no employee', async () => {
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue({
      ...baseTemplate,
      assignedEmployeeId: null,
      assignedRole: 'ghost',
    });
    prisma.client.employee.findFirst.mockResolvedValue(null);

    await expect(svc.dispatchTemplate('acc1', 'tpl-1', { triggeredBy: 'manual' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('copies HR fields onto the Task instance (kind=HR, dependsOn, reward, fine, deadline)', async () => {
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue({
      ...baseTemplate,
      checkerId: 'checker-1',
      dependsOnId: 'tpl-prev',
    });
    prisma.client.employee.findUnique.mockResolvedValue({ id: 'emp-1', telegramPhone: null });
    prisma.client.task.create.mockResolvedValue({ id: 'task-1' });
    prisma.client.hrTaskLog.create.mockResolvedValue({ id: 'log-1' });

    await svc.dispatchTemplate('acc1', 'tpl-1', { triggeredBy: 'manual' });

    const td = prisma.client.task.create.mock.calls[0]![0].data;
    expect(td.kind).toBe('HR');
    expect(td.hrCheckerId).toBe('checker-1');
    expect(td.hrDependsOnId).toBe('tpl-prev');
    expect(td.hrRewardMinor).toBe(10_000n);
    expect(td.hrFineMinor).toBe(5_000n);
    expect(td.hrDeadlineMinutes).toBe(30);
    expect(td.hrResponseType).toBe('yes_no');
    // priority remapped medium → normal
    expect(td.priority).toBe('normal');
  });

  it('creates HrTaskLog with status=sent and sentAt now', async () => {
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue(baseTemplate);
    prisma.client.employee.findUnique.mockResolvedValue({ id: 'emp-1', telegramPhone: null });
    prisma.client.task.create.mockResolvedValue({ id: 'task-99' });
    prisma.client.hrTaskLog.create.mockResolvedValue({ id: 'log-99' });

    await svc.dispatchTemplate('acc1', 'tpl-1', { triggeredBy: 'manual' });

    const logArgs = prisma.client.hrTaskLog.create.mock.calls[0]![0];
    expect(logArgs.data.status).toBe('sent');
    expect(logArgs.data.taskId).toBe('task-99');
    expect(logArgs.data.templateId).toBe('tpl-1');
    expect(logArgs.data.employeeId).toBe('emp-1');
    expect(logArgs.data.sentAt).toBeInstanceOf(Date);
  });

  it('enqueues HrTelegramOutbox when employee has telegramPhone', async () => {
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue(baseTemplate);
    prisma.client.employee.findUnique.mockResolvedValue({
      id: 'emp-1',
      telegramPhone: '+998901234567',
    });
    prisma.client.task.create.mockResolvedValue({ id: 'task-1' });
    prisma.client.hrTaskLog.create.mockResolvedValue({ id: 'log-1' });

    const result = await svc.dispatchTemplate('acc1', 'tpl-1', { triggeredBy: 'manual' });

    expect(result.telegramQueued).toBe(true);
    const outArgs = prisma.client.hrTelegramOutbox.create.mock.calls[0]![0];
    expect(outArgs.data.toPhone).toBe('+998901234567');
    expect(outArgs.data.status).toBe('pending');
    expect(outArgs.data.sourceEventType).toBe('hr.task.manual');
  });

  it('skips outbox when employee has no telegramPhone', async () => {
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue(baseTemplate);
    prisma.client.employee.findUnique.mockResolvedValue({ id: 'emp-1', telegramPhone: null });
    prisma.client.task.create.mockResolvedValue({ id: 'task-1' });
    prisma.client.hrTaskLog.create.mockResolvedValue({ id: 'log-1' });

    const result = await svc.dispatchTemplate('acc1', 'tpl-1', { triggeredBy: 'manual' });

    expect(result.telegramQueued).toBe(false);
    expect(prisma.client.hrTelegramOutbox.create).not.toHaveBeenCalled();
  });
});

describe('HrTaskSendService.recordAnswer (FSM)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let events: ReturnType<typeof makeEvents>;
  let svc: HrTaskSendService;

  beforeEach(() => {
    prisma = makePrisma();
    events = makeEvents();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrTaskSendService(prisma as any, events as any);
    setupTxCallback(prisma);
  });

  it('throws NotFound when log missing', async () => {
    prisma.client.hrTaskLog.findFirst.mockResolvedValue(null);
    await expect(svc.recordAnswer('acc1', 'log-x', 'emp-1', { type: 'yes' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws Forbidden when acting employee != log owner', async () => {
    prisma.client.hrTaskLog.findFirst.mockResolvedValue({
      id: 'log-1',
      employeeId: 'emp-1',
      status: 'sent',
      templateId: 'tpl-1',
      template: { ...baseTemplate, checkerId: null },
    });
    await expect(svc.recordAnswer('acc1', 'log-1', 'emp-OTHER', { type: 'yes' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws BadRequest when log already answered (status != sent)', async () => {
    prisma.client.hrTaskLog.findFirst.mockResolvedValue({
      id: 'log-1',
      employeeId: 'emp-1',
      status: 'answered_yes',
      templateId: 'tpl-1',
      template: { ...baseTemplate },
    });
    await expect(svc.recordAnswer('acc1', 'log-1', 'emp-1', { type: 'yes' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('yes + no checker → status=answered_yes, finalize fires (bonus log created, event emitted)', async () => {
    prisma.client.hrTaskLog.findFirst.mockResolvedValue({
      id: 'log-1',
      employeeId: 'emp-1',
      status: 'sent',
      templateId: 'tpl-1',
      template: { ...baseTemplate, checkerId: null, rewardMinor: 10_000n },
    });
    prisma.client.hrTaskLog.update.mockResolvedValue({ id: 'log-1', status: 'answered_yes' });
    prisma.client.hrTaskTemplate.findUnique.mockResolvedValue({
      ...baseTemplate,
      rewardMinor: 10_000n,
    });
    prisma.client.hrTaskTemplate.findMany.mockResolvedValue([]); // no dependents

    await svc.recordAnswer('acc1', 'log-1', 'emp-1', { type: 'yes' });

    expect(prisma.client.hrTaskLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'answered_yes' }),
      }),
    );
    expect(prisma.client.hrBonusFineLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'bonus',
          source: 'auto_task_reward',
          amountMinor: 10_000n,
        }),
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'hr.event.hrTaskLog.finalized',
      expect.objectContaining({ status: 'answered_yes' }),
    );
  });

  it('yes + with checker → status=pending_review, finalize NOT fired (no bonus yet)', async () => {
    prisma.client.hrTaskLog.findFirst.mockResolvedValue({
      id: 'log-1',
      employeeId: 'emp-1',
      status: 'sent',
      templateId: 'tpl-1',
      template: { ...baseTemplate, checkerId: 'checker-1', rewardMinor: 10_000n },
    });
    prisma.client.hrTaskLog.update.mockResolvedValue({ id: 'log-1', status: 'pending_review' });

    await svc.recordAnswer('acc1', 'log-1', 'emp-1', { type: 'yes' });

    expect(prisma.client.hrTaskLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pending_review' }),
      }),
    );
    expect(prisma.client.hrBonusFineLog.create).not.toHaveBeenCalled();
    // Answer + pending-review notifications fire (live WS), but finalize does NOT.
    expect(events.emit).toHaveBeenCalledWith(
      HR_EVENT.HR_TASK_ANSWERED,
      expect.objectContaining({ status: 'pending_review', requiresReview: true }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      HR_EVENT.HR_TASK_PENDING_REVIEW,
      expect.objectContaining({ checkerId: 'checker-1' }),
    );
    expect(events.emit).not.toHaveBeenCalledWith(HR_EVENT.HR_TASK_LOG_FINALIZED, expect.anything());
  });

  it('no answer + no checker → status=answered_no, fine log created', async () => {
    prisma.client.hrTaskLog.findFirst.mockResolvedValue({
      id: 'log-1',
      employeeId: 'emp-1',
      status: 'sent',
      templateId: 'tpl-1',
      template: { ...baseTemplate, checkerId: null, fineMinor: 5_000n },
    });
    prisma.client.hrTaskLog.update.mockResolvedValue({ id: 'log-1', status: 'answered_no' });
    prisma.client.hrTaskTemplate.findUnique.mockResolvedValue({
      ...baseTemplate,
      fineMinor: 5_000n,
    });
    prisma.client.hrTaskTemplate.findMany.mockResolvedValue([]);

    await svc.recordAnswer('acc1', 'log-1', 'emp-1', { type: 'no' });

    expect(prisma.client.hrBonusFineLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'fine',
          source: 'auto_task_fine',
          amountMinor: 5_000n,
        }),
      }),
    );
  });

  it('no answer + with checker → status=answered_no (no review needed for negative), finalize fires fine', async () => {
    // FSM rule: pending_review only for yes/text + has checker. 'no' bypasses checker.
    prisma.client.hrTaskLog.findFirst.mockResolvedValue({
      id: 'log-1',
      employeeId: 'emp-1',
      status: 'sent',
      templateId: 'tpl-1',
      template: { ...baseTemplate, checkerId: 'checker-1', fineMinor: 5_000n },
    });
    prisma.client.hrTaskLog.update.mockResolvedValue({ id: 'log-1', status: 'answered_no' });
    prisma.client.hrTaskTemplate.findUnique.mockResolvedValue({
      ...baseTemplate,
      fineMinor: 5_000n,
    });
    prisma.client.hrTaskTemplate.findMany.mockResolvedValue([]);

    await svc.recordAnswer('acc1', 'log-1', 'emp-1', { type: 'no' });

    expect(prisma.client.hrTaskLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'answered_no' }),
      }),
    );
    expect(prisma.client.hrBonusFineLog.create).toHaveBeenCalled();
  });

  it('depends_on chain: dependents dispatched on answered_yes', async () => {
    prisma.client.hrTaskLog.findFirst.mockResolvedValue({
      id: 'log-1',
      employeeId: 'emp-1',
      status: 'sent',
      templateId: 'tpl-1',
      template: { ...baseTemplate, checkerId: null, rewardMinor: 0n },
    });
    prisma.client.hrTaskLog.update.mockResolvedValue({ id: 'log-1', status: 'answered_yes' });
    prisma.client.hrTaskTemplate.findUnique.mockResolvedValue({
      ...baseTemplate,
      rewardMinor: 0n,
    });
    // Two dependents to dispatch:
    prisma.client.hrTaskTemplate.findMany.mockResolvedValue([
      { id: 'tpl-dep1' },
      { id: 'tpl-dep2' },
    ]);
    // dispatch chain calls findFirst again per dependent — make them all fail (not the focus)
    prisma.client.hrTaskTemplate.findFirst.mockResolvedValue(null);

    await svc.recordAnswer('acc1', 'log-1', 'emp-1', { type: 'yes' });

    // The dependents trigger dispatchTemplate (findFirst for each) — 2 extra calls beyond initial:
    expect(prisma.client.hrTaskTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dependsOnId: 'tpl-1', isActive: true, accountId: 'acc1' },
      }),
    );
    // Dispatch attempted twice — both fail (template missing in test), warnings logged silently
    // findFirst called once for the answered template lookup phase + 2 for dependents
    expect(prisma.client.hrTaskTemplate.findFirst).toHaveBeenCalledTimes(2);
  });

  it('depends_on chain: no dispatch on answered_no', async () => {
    prisma.client.hrTaskLog.findFirst.mockResolvedValue({
      id: 'log-1',
      employeeId: 'emp-1',
      status: 'sent',
      templateId: 'tpl-1',
      template: { ...baseTemplate, checkerId: null, fineMinor: 0n },
    });
    prisma.client.hrTaskLog.update.mockResolvedValue({ id: 'log-1', status: 'answered_no' });
    prisma.client.hrTaskTemplate.findUnique.mockResolvedValue({
      ...baseTemplate,
      fineMinor: 0n,
    });

    await svc.recordAnswer('acc1', 'log-1', 'emp-1', { type: 'no' });

    expect(prisma.client.hrTaskTemplate.findMany).not.toHaveBeenCalled();
  });

  it('text answer stores responseText and finalizes as answered_text when no checker', async () => {
    prisma.client.hrTaskLog.findFirst.mockResolvedValue({
      id: 'log-1',
      employeeId: 'emp-1',
      status: 'sent',
      templateId: 'tpl-1',
      template: { ...baseTemplate, checkerId: null, responseType: 'text' },
    });
    prisma.client.hrTaskLog.update.mockResolvedValue({
      id: 'log-1',
      status: 'answered_text',
    });
    prisma.client.hrTaskTemplate.findUnique.mockResolvedValue(baseTemplate);
    prisma.client.hrTaskTemplate.findMany.mockResolvedValue([]);

    await svc.recordAnswer('acc1', 'log-1', 'emp-1', { type: 'text', text: 'Bajardim' });

    const updateArgs = prisma.client.hrTaskLog.update.mock.calls[0]![0];
    expect(updateArgs.data.responseText).toBe('Bajardim');
    expect(updateArgs.data.status).toBe('answered_text');
  });

  it('does not create bonus when rewardMinor is zero', async () => {
    prisma.client.hrTaskLog.findFirst.mockResolvedValue({
      id: 'log-1',
      employeeId: 'emp-1',
      status: 'sent',
      templateId: 'tpl-1',
      template: { ...baseTemplate, checkerId: null, rewardMinor: 0n },
    });
    prisma.client.hrTaskLog.update.mockResolvedValue({ id: 'log-1', status: 'answered_yes' });
    prisma.client.hrTaskTemplate.findUnique.mockResolvedValue({
      ...baseTemplate,
      rewardMinor: 0n,
    });
    prisma.client.hrTaskTemplate.findMany.mockResolvedValue([]);

    await svc.recordAnswer('acc1', 'log-1', 'emp-1', { type: 'yes' });

    expect(prisma.client.hrBonusFineLog.create).not.toHaveBeenCalled();
  });
});

describe('HrTaskSendService.listLogs', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let events: ReturnType<typeof makeEvents>;
  let svc: HrTaskSendService;

  beforeEach(() => {
    prisma = makePrisma();
    events = makeEvents();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrTaskSendService(prisma as any, events as any);
  });

  it('admin (null scope) sees all logs in account', async () => {
    prisma.client.$transaction.mockResolvedValue([[], 0]);
    await svc.listLogs('acc1', null, { page: 1, limit: 50 });
    const findArgs = prisma.client.hrTaskLog.findMany.mock.calls[0]![0];
    expect(findArgs.where).toEqual({ accountId: 'acc1' });
  });

  it('non-admin (scoped) filtered by employeeId', async () => {
    prisma.client.$transaction.mockResolvedValue([[], 0]);
    await svc.listLogs('acc1', 'emp-1', { page: 1, limit: 50 });
    const findArgs = prisma.client.hrTaskLog.findMany.mock.calls[0]![0];
    expect(findArgs.where).toMatchObject({ accountId: 'acc1', employeeId: 'emp-1' });
  });

  it('applies status + dateFrom/dateTo + templateId filters', async () => {
    prisma.client.$transaction.mockResolvedValue([[], 0]);
    const dateFrom = new Date('2026-05-01');
    const dateTo = new Date('2026-05-31');
    await svc.listLogs('acc1', null, {
      page: 1,
      limit: 50,
      status: 'answered_yes',
      dateFrom,
      dateTo,
      templateId: 'tpl-1',
    });
    const findArgs = prisma.client.hrTaskLog.findMany.mock.calls[0]![0];
    expect(findArgs.where.status).toBe('answered_yes');
    expect(findArgs.where.templateId).toBe('tpl-1');
    expect(findArgs.where.sentAt).toEqual({ gte: dateFrom, lte: dateTo });
  });
});

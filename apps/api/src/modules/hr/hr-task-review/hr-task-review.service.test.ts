import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrTaskReviewService } from './hr-task-review.service.js';

function makePrisma() {
  return {
    client: {
      hrTaskLog: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
}

function makeSendService() {
  return { finalize: vi.fn().mockResolvedValue(undefined) };
}

const pendingLog = {
  id: 'log-1',
  accountId: 'acc1',
  templateId: 'tpl-1',
  employeeId: 'emp-1',
  status: 'pending_review',
  template: {
    id: 'tpl-1',
    checkerId: 'checker-1',
    title: 'Kassa yopildimi?',
    rewardMinor: 10_000n,
    fineMinor: 5_000n,
  },
};

describe('HrTaskReviewService.listPending', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let send: ReturnType<typeof makeSendService>;
  let svc: HrTaskReviewService;

  beforeEach(() => {
    prisma = makePrisma();
    send = makeSendService();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrTaskReviewService(prisma as any, send as any);
    prisma.client.$transaction.mockResolvedValue([[], 0]);
  });

  it('admin sees all pending_review in account', async () => {
    await svc.listPending('acc1', 'admin-1', true, { page: 1, limit: 50 });
    const where = prisma.client.hrTaskLog.findMany.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where.status).toBe('pending_review');
    expect(where.accountId).toBe('acc1');
    expect(where.template).toBeUndefined();
  });

  it('non-admin (checker) sees only their designated queue (template.checkerId === reviewerId)', async () => {
    await svc.listPending('acc1', 'checker-1', false, { page: 1, limit: 50 });
    const where = prisma.client.hrTaskLog.findMany.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where.template).toEqual({ is: { checkerId: 'checker-1' } });
  });

  it('applies optional templateId + employeeId filters', async () => {
    await svc.listPending('acc1', 'admin-1', true, {
      page: 1,
      limit: 50,
      employeeId: 'emp-9',
      templateId: 'tpl-5',
    });
    const where = prisma.client.hrTaskLog.findMany.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where.employeeId).toBe('emp-9');
    expect(where.templateId).toBe('tpl-5');
  });
});

describe('HrTaskReviewService.approve / reject', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let send: ReturnType<typeof makeSendService>;
  let svc: HrTaskReviewService;

  beforeEach(() => {
    prisma = makePrisma();
    send = makeSendService();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrTaskReviewService(prisma as any, send as any);
  });

  it('throws NotFound when log missing', async () => {
    prisma.client.hrTaskLog.findFirst.mockResolvedValue(null);
    await expect(svc.approve('acc1', 'log-x', 'checker-1', false, null)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws BadRequest when log not in pending_review state', async () => {
    prisma.client.hrTaskLog.findFirst.mockResolvedValue({
      ...pendingLog,
      status: 'approved',
    });
    await expect(svc.approve('acc1', 'log-1', 'checker-1', false, null)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('blocks self-approval (reviewer === employee)', async () => {
    prisma.client.hrTaskLog.findFirst.mockResolvedValue({
      ...pendingLog,
      employeeId: 'reviewer-x',
    });
    await expect(svc.approve('acc1', 'log-1', 'reviewer-x', false, null)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('blocks non-designated checker (no admin bypass)', async () => {
    prisma.client.hrTaskLog.findFirst.mockResolvedValue(pendingLog);
    await expect(svc.approve('acc1', 'log-1', 'checker-OTHER', false, null)).rejects.toThrow(
      /belgilangan tekshiruvchisi emassiz/,
    );
  });

  it('admin bypass: any admin can approve regardless of designation', async () => {
    prisma.client.hrTaskLog.findFirst.mockResolvedValue(pendingLog);
    prisma.client.hrTaskLog.updateMany.mockResolvedValue({ count: 1 });
    prisma.client.hrTaskLog.findUnique.mockResolvedValue({ id: 'log-1', status: 'approved' });

    await svc.approve('acc1', 'log-1', 'admin-1', true, 'looks good');

    expect(prisma.client.hrTaskLog.updateMany).toHaveBeenCalledWith({
      where: { id: 'log-1', status: 'pending_review' },
      data: expect.objectContaining({
        status: 'approved',
        reviewedById: 'admin-1',
        reviewComment: 'looks good',
      }),
    });
    expect(send.finalize).toHaveBeenCalledWith(
      'acc1',
      'log-1',
      'approved',
      'tpl-1',
      'emp-1',
      'admin-1',
      'review',
    );
  });

  it('designated checker approves → status flips to approved, finalize fires with review source', async () => {
    prisma.client.hrTaskLog.findFirst.mockResolvedValue(pendingLog);
    prisma.client.hrTaskLog.updateMany.mockResolvedValue({ count: 1 });
    prisma.client.hrTaskLog.findUnique.mockResolvedValue({ id: 'log-1', status: 'approved' });

    await svc.approve('acc1', 'log-1', 'checker-1', false, 'Bajardi');

    expect(send.finalize).toHaveBeenCalledWith(
      'acc1',
      'log-1',
      'approved',
      'tpl-1',
      'emp-1',
      'checker-1',
      'review',
    );
  });

  it('designated checker rejects → status=rejected, finalize fires (review)', async () => {
    prisma.client.hrTaskLog.findFirst.mockResolvedValue(pendingLog);
    prisma.client.hrTaskLog.updateMany.mockResolvedValue({ count: 1 });
    prisma.client.hrTaskLog.findUnique.mockResolvedValue({ id: 'log-1', status: 'rejected' });

    await svc.reject('acc1', 'log-1', 'checker-1', false, 'Mavzu chala');

    const updArgs = prisma.client.hrTaskLog.updateMany.mock.calls[0]?.[0];
    expect(updArgs?.data.status).toBe('rejected');
    expect(updArgs?.data.reviewComment).toBe('Mavzu chala');
    expect(send.finalize).toHaveBeenCalledWith(
      'acc1',
      'log-1',
      'rejected',
      'tpl-1',
      'emp-1',
      'checker-1',
      'review',
    );
  });

  it('race-loss detection: updateMany count=0 throws BadRequest "allaqachon tekshirildi"', async () => {
    prisma.client.hrTaskLog.findFirst.mockResolvedValue(pendingLog);
    prisma.client.hrTaskLog.updateMany.mockResolvedValue({ count: 0 });

    await expect(svc.approve('acc1', 'log-1', 'checker-1', false, null)).rejects.toThrow(
      /allaqachon tekshirildi/,
    );
    expect(send.finalize).not.toHaveBeenCalled();
  });

  it('reject persists provided comment', async () => {
    prisma.client.hrTaskLog.findFirst.mockResolvedValue(pendingLog);
    prisma.client.hrTaskLog.updateMany.mockResolvedValue({ count: 1 });
    prisma.client.hrTaskLog.findUnique.mockResolvedValue({ id: 'log-1', status: 'rejected' });

    await svc.reject('acc1', 'log-1', 'checker-1', false, "Sabab: kassa hisobotlari yo'q");

    const updArgs = prisma.client.hrTaskLog.updateMany.mock.calls[0]?.[0];
    expect(updArgs?.data.reviewComment).toBe("Sabab: kassa hisobotlari yo'q");
  });
});

import { describe, expect, it, vi } from 'vitest';
import { TelegramBackfillWorkerService } from './telegram-backfill-worker.service.js';

function textMsg(id: number, direction: 'in' | 'out') {
  return {
    tgMessageId: id,
    direction,
    text: `m${id}`,
    date: 1_700_000_000 + id,
    senderName: direction === 'in' ? 'Ali' : null,
    fwdFromName: null,
    replyToTgMessageId: null,
    kind: 'text' as const,
    mimeType: null,
    fileName: null,
    downloadMedia: null,
  };
}

function makePrisma(job: Record<string, unknown> | null) {
  const created: unknown[] = [];
  const jobUpdate = vi.fn(async () => ({}));
  const chatUpdate = vi.fn(async () => ({}));
  const client = {
    telegramBackfillJob: {
      findFirst: vi.fn(async () => job),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: jobUpdate,
    },
    telegramChat: {
      findFirst: vi.fn(async () => null),
      upsert: vi.fn(async () => ({ id: 'chat1' })),
      update: chatUpdate,
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    telegramChatMessage: {
      upsert: vi.fn(async (arg: { create: unknown }) => {
        created.push(arg.create);
        return { id: `m${created.length}` };
      }),
      update: vi.fn(async () => ({})),
    },
  };
  return { prisma: { client }, created, jobUpdate };
}

describe('TelegramBackfillWorkerService.runOnce', () => {
  it("queued job → tarix sahifasi import, bo'sh keyingi sahifa → done", async () => {
    const { prisma, created, jobUpdate } = makePrisma({
      id: 'job1',
      accountId: 'acc',
      counterpartyId: 'cp1',
      phone: '+998901234567',
      status: 'queued',
      cursorOffsetId: null,
    });
    const adapter = {
      fetchHistory: vi
        .fn()
        .mockResolvedValueOnce({
          slot: 1,
          peerId: '99',
          messages: [textMsg(20, 'out'), textMsg(19, 'in')],
        })
        .mockResolvedValueOnce({ slot: 1, peerId: '99', messages: [] }),
    };
    const attachments = { createFromBuffer: vi.fn() };
    const svc = new TelegramBackfillWorkerService(
      prisma as never,
      adapter as never,
      attachments as never,
    );

    const res = await svc.runOnce();

    expect(res.imported).toBe(2);
    expect(created).toHaveLength(2);
    // done: status 'done'
    expect(jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'done' }) }),
    );
  });

  it("job yo'q → hech narsa, imported=0, adapter chaqirilmaydi", async () => {
    const { prisma } = makePrisma(null);
    const adapter = { fetchHistory: vi.fn() };
    const svc = new TelegramBackfillWorkerService(
      prisma as never,
      adapter as never,
      { createFromBuffer: vi.fn() } as never,
    );
    const res = await svc.runOnce();
    expect(res.imported).toBe(0);
    expect(adapter.fetchHistory).not.toHaveBeenCalled();
  });

  it('flood xatosi → job qayta queued (error EMAS)', async () => {
    const { prisma, jobUpdate } = makePrisma({
      id: 'job1',
      accountId: 'acc',
      counterpartyId: 'cp1',
      phone: '+998901234567',
      status: 'queued',
      cursorOffsetId: null,
    });
    const floodErr = Object.assign(new Error('FLOOD'), { isFlood: true });
    const adapter = { fetchHistory: vi.fn().mockRejectedValue(floodErr) };
    const svc = new TelegramBackfillWorkerService(
      prisma as never,
      adapter as never,
      { createFromBuffer: vi.fn() } as never,
    );
    await svc.runOnce();
    expect(jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'queued' }) }),
    );
  });
});

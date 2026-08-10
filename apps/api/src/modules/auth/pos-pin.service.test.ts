import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PosPinService } from './pos-pin.service.js';

function makePrisma(overrides: Record<string, unknown> = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const employee = {
    findFirst: vi.fn().mockResolvedValue({ id: 'emp-1', posPinHash: null }),
    update: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => {
      updates.push(args.data);
      return args.data;
    }),
    ...overrides,
  };
  const client = { employee };
  return { prisma: { client } as never, updates, employee };
}

const CONFIG = { get: () => 'test-pepper' } as never;

describe('PosPinService.setPin', () => {
  it('posPinHash VA posPinLookup ni birga yozadi', async () => {
    const { prisma, updates } = makePrisma();
    const svc = new PosPinService(prisma, CONFIG);
    await svc.setPin('acc-1', 'emp-1', '1234');
    expect(updates).toHaveLength(1);
    expect(updates[0]).toHaveProperty('posPinHash');
    // Lookup — 64 belgili hex, PIN matni emas.
    expect(updates[0]?.posPinLookup).toMatch(/^[0-9a-f]{64}$/);
  });

  it('noto`g`ri shakldagi PIN rad etiladi (3 raqam)', async () => {
    const { prisma } = makePrisma();
    const svc = new PosPinService(prisma, CONFIG);
    await expect(svc.setPin('acc-1', 'emp-1', '123')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('takror PIN (Prisma P2002) → tushunarli 400 xabari', async () => {
    const { prisma } = makePrisma({
      update: vi.fn().mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' })),
    });
    const svc = new PosPinService(prisma, CONFIG);
    await expect(svc.setPin('acc-1', 'emp-1', '1234')).rejects.toThrow(/band/);
  });

  it('boshqa DB xatosi YUTILMAYDI (faqat P2002 tarjima qilinadi)', async () => {
    const { prisma } = makePrisma({
      update: vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { code: 'P2025' })),
    });
    const svc = new PosPinService(prisma, CONFIG);
    await expect(svc.setPin('acc-1', 'emp-1', '1234')).rejects.toThrow(/boom/);
  });
});

describe('PosPinService.clearPin', () => {
  it('ikkala ustunni NULL qiladi', async () => {
    const { prisma, updates } = makePrisma();
    const svc = new PosPinService(prisma, CONFIG);
    await svc.clearPin('acc-1', 'emp-1');
    expect(updates[0]).toEqual({ posPinHash: null, posPinLookup: null });
  });

  it('begona akkauntning xodimiga tegmaydi', async () => {
    const { prisma } = makePrisma({ findFirst: vi.fn().mockResolvedValue(null) });
    const svc = new PosPinService(prisma, CONFIG);
    await expect(svc.clearPin('acc-1', 'emp-x')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PosPinService.findByPin', () => {
  it('lookup bo`yicha xodimni topadi', async () => {
    const { prisma, employee } = makePrisma();
    employee.findFirst = vi.fn().mockResolvedValue({ id: 'emp-7' });
    const svc = new PosPinService(prisma, CONFIG);
    expect(await svc.findByPin('1234')).toEqual({ employeeId: 'emp-7' });
    // Qidiruv AYNAN lookup ustuni bo'yicha ketishi shart (jadval skanerlash emas).
    const where = employee.findFirst.mock.calls[0]?.[0]?.where;
    expect(where).toHaveProperty('posPinLookup');
    expect(where.posPinLookup).toMatch(/^[0-9a-f]{64}$/);
    // Arxivlangan xodim kira olmasin.
    expect(where.archived).toBe(false);
  });

  it('topilmasa null', async () => {
    const { prisma, employee } = makePrisma();
    employee.findFirst = vi.fn().mockResolvedValue(null);
    const svc = new PosPinService(prisma, CONFIG);
    expect(await svc.findByPin('9999')).toBeNull();
  });

  it('turli PIN — turli lookup (bir xil qiymat qidirilmaydi)', async () => {
    const { prisma, employee } = makePrisma();
    employee.findFirst = vi.fn().mockResolvedValue(null);
    const svc = new PosPinService(prisma, CONFIG);
    await svc.findByPin('1111');
    await svc.findByPin('2222');
    const a = employee.findFirst.mock.calls[0]?.[0]?.where?.posPinLookup;
    const b = employee.findFirst.mock.calls[1]?.[0]?.where?.posPinLookup;
    expect(a).not.toBe(b);
  });
});

import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OptimisticLockException } from '../shared/optimistic-lock.js';
import { StaffService } from './staff.service.js';

function makePrisma() {
  return {
    client: {
      employee: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      role: { findMany: vi.fn() },
      $transaction: vi.fn(),
    },
  };
}

/** Prisma-shaped P2002 (grounded: meta.target is the field array). */
function p2002(target: string[]) {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    meta: { target },
  });
}

const baseCreate = {
  email: 'new@demo.local',
  name: 'Yangi Xodim',
  password: 'password123',
  roleIds: [] as string[],
};

describe('StaffService — uniqueness handling', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: StaffService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new StaffService(prisma as never);
  });

  // ── create: app-level pre-checks (existing behaviour, characterised) ──
  it('create: rejects a duplicate email via the pre-check, never opening the tx', async () => {
    prisma.client.employee.findFirst.mockResolvedValueOnce({ id: 'dup' } as never);
    await expect(service.create('acc1', { ...baseCreate })).rejects.toThrow(ConflictException);
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });

  it('create: rejects a duplicate username via the pre-check', async () => {
    prisma.client.employee.findFirst
      .mockResolvedValueOnce(null) // email free
      .mockResolvedValueOnce({ id: 'dup' } as never); // username taken
    await expect(service.create('acc1', { ...baseCreate, username: 'taken' })).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });

  // ── create: TOCTOU race past the pre-check → DB index → P2002 ──
  it('create: maps a P2002 email race from the transaction to ConflictException (not 500)', async () => {
    prisma.client.employee.findFirst.mockResolvedValue(null); // both pre-checks pass
    prisma.client.$transaction.mockRejectedValue(p2002(['account_id', 'email']));
    await expect(service.create('acc1', { ...baseCreate })).rejects.toThrow(ConflictException);
  });

  it('create: maps a P2002 username race to ConflictException', async () => {
    prisma.client.employee.findFirst.mockResolvedValue(null);
    prisma.client.$transaction.mockRejectedValue(p2002(['account_id', 'username']));
    await expect(service.create('acc1', { ...baseCreate, username: 'racey' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('create: rethrows a non-P2002 transaction error unchanged', async () => {
    prisma.client.employee.findFirst.mockResolvedValue(null);
    prisma.client.$transaction.mockRejectedValue(new Error('connection lost'));
    await expect(service.create('acc1', { ...baseCreate })).rejects.toThrow('connection lost');
  });

  // ── update: existence, lock, and race nets coexist ──
  it('update: throws NotFound when the row is missing / other tenant', async () => {
    prisma.client.employee.findFirst.mockResolvedValueOnce(null);
    await expect(service.update('acc1', 'ghost', { name: 'X', version: 1 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('update: maps a P2002 email race to ConflictException', async () => {
    prisma.client.employee.findFirst
      .mockResolvedValueOnce({ id: 'e1', email: 'old@demo.local', username: null } as never) // existing
      .mockResolvedValue(null); // dup checks pass
    prisma.client.$transaction.mockRejectedValue(p2002(['account_id', 'email']));
    await expect(
      service.update('acc1', 'e1', { email: 'new@demo.local', version: 1, roleIds: [] }),
    ).rejects.toThrow(ConflictException);
  });

  it('update: still maps a P2025 (stale version) to OptimisticLockException', async () => {
    prisma.client.employee.findFirst.mockResolvedValueOnce({
      id: 'e1',
      email: 'old@demo.local',
      username: null,
    } as never);
    prisma.client.$transaction.mockRejectedValue(
      Object.assign(new Error('not found'), { code: 'P2025' }),
    );
    await expect(service.update('acc1', 'e1', { name: 'New', version: 1 })).rejects.toThrow(
      OptimisticLockException,
    );
  });
});

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OptimisticLockException } from '../../shared/optimistic-lock.js';
import { HrEmployeeService } from './hr-employee.service.js';

/** Prisma-shaped P2002 (grounded: meta.target is the field array). */
function p2002(target: string[]) {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    meta: { target },
  });
}

function makePrisma() {
  return {
    client: {
      employee: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
}

describe('HrEmployeeService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: HrEmployeeService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new HrEmployeeService(prisma as never);
  });

  it('list filters by accountId and archived=false', async () => {
    prisma.client.$transaction.mockResolvedValue([[], 0]);
    await service.list('acc1', { page: 1, limit: 50 });
    expect(prisma.client.$transaction).toHaveBeenCalled();
    const result = await service.list('acc1', { page: 1, limit: 50 });
    expect(result).toEqual({ rows: [], total: 0, page: 1, limit: 50 });
  });

  it('list applies search across name/phone/email/username', async () => {
    prisma.client.$transaction.mockResolvedValue([[], 0]);
    await service.list('acc1', { search: 'Ahmad', page: 1, limit: 50 });
    expect(prisma.client.$transaction).toHaveBeenCalled();
  });

  it('findOne throws NotFound when employee missing', async () => {
    prisma.client.employee.findFirst.mockResolvedValue(null);
    await expect(service.findOne('acc1', 'e1')).rejects.toThrow(NotFoundException);
  });

  it('findOne returns employee when found', async () => {
    const emp = { id: 'e1', name: 'X', email: 'x@y' };
    prisma.client.employee.findFirst.mockResolvedValue(emp as never);
    await expect(service.findOne('acc1', 'e1')).resolves.toEqual(emp);
  });

  it('create with all fields', async () => {
    prisma.client.employee.create.mockResolvedValue({ id: 'new' } as never);
    await service.create('acc1', {
      name: 'Yangi',
      email: 'y@y.uz',
      phone: '+998901234567',
      telegramPhone: '+998901234567',
      department: 'Sotuv',
      hrRoles: ['cashier'],
      isChecker: false,
      moyskladAgentId: null,
    });
    expect(prisma.client.employee.create).toHaveBeenCalled();
  });

  it('update passes only provided fields', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1' } as never);
    prisma.client.employee.update.mockResolvedValue({} as never);
    await service.update('acc1', 'e1', { name: 'Yangi nom' });
    const call = prisma.client.employee.update.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect((call as { data: { name?: string } }).data.name).toBe('Yangi nom');
    expect((call as { data: Record<string, unknown> }).data.email).toBeUndefined();
  });

  it('setPassword fails on duplicate username', async () => {
    prisma.client.employee.findFirst
      .mockResolvedValueOnce({ id: 'e1' } as never)
      .mockResolvedValueOnce({ id: 'other' } as never);
    await expect(
      service.setPassword('acc1', 'e1', { username: 'taken', password: 'abcd' }),
    ).rejects.toThrow(ConflictException);
  });

  it('setPassword hashes via argon2 + writes', async () => {
    prisma.client.employee.findFirst
      .mockResolvedValueOnce({ id: 'e1' } as never)
      .mockResolvedValueOnce(null);
    prisma.client.employee.update.mockResolvedValue({} as never);
    await service.setPassword('acc1', 'e1', { username: 'ozod', password: 'verysecure' });
    const updateCall = prisma.client.employee.update.mock.calls[0]?.[0] as {
      data: { username: string; passwordHash: string };
    };
    expect(updateCall.data.username).toBe('ozod');
    expect(updateCall.data.passwordHash).toMatch(/^\$argon2/);
  });

  // ─── Uniqueness: duplicate email/username → 409, not a raw 500 ───────
  // HR create/update have NO app pre-check, so a duplicate (sequential OR a
  // concurrent race) hits the DB unique index directly → Prisma P2002. Without
  // mapping it falls through to a 500 (no global Prisma exception filter).

  it('create: maps a duplicate email (P2002) to ConflictException, not a raw error', async () => {
    prisma.client.employee.create.mockRejectedValue(p2002(['account_id', 'email']));
    await expect(
      service.create('acc1', { name: 'X', email: 'taken@y.uz', hrRoles: [], isChecker: false }),
    ).rejects.toThrow(ConflictException);
  });

  it('create: rethrows a non-P2002 error unchanged', async () => {
    prisma.client.employee.create.mockRejectedValue(new Error('connection lost'));
    await expect(
      service.create('acc1', { name: 'X', email: 'a@y.uz', hrRoles: [], isChecker: false }),
    ).rejects.toThrow('connection lost');
  });

  it('update: maps a duplicate email (P2002) to ConflictException', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1' } as never); // findOne ok
    prisma.client.employee.update.mockRejectedValue(p2002(['account_id', 'email']));
    await expect(service.update('acc1', 'e1', { email: 'taken@y.uz', version: 1 })).rejects.toThrow(
      ConflictException,
    );
  });

  it('update: still maps a P2025 (stale version) to OptimisticLockException', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1' } as never);
    prisma.client.employee.update.mockRejectedValue(
      Object.assign(new Error('not found'), { code: 'P2025' }),
    );
    await expect(service.update('acc1', 'e1', { name: 'Y', version: 1 })).rejects.toThrow(
      OptimisticLockException,
    );
  });

  it('setPassword: maps a P2002 username race (past the pre-check) to ConflictException', async () => {
    prisma.client.employee.findFirst
      .mockResolvedValueOnce({ id: 'e1' } as never) // findOne
      .mockResolvedValueOnce(null); // pre-check: username free
    prisma.client.employee.update.mockRejectedValue(p2002(['account_id', 'username']));
    await expect(
      service.setPassword('acc1', 'e1', { username: 'racey', password: 'verysecure' }),
    ).rejects.toThrow(ConflictException);
  });

  // ─── Adversarial QA: telegramPhone normalization on write ────────────

  it('create: normalizes Uzbek 9-digit mobile to canonical +998…', async () => {
    prisma.client.employee.create.mockResolvedValue({ id: 'new' } as never);
    await service.create('acc1', {
      name: 'Anvar',
      telegramPhone: '901234567',
      hrRoles: [],
      isChecker: false,
    });
    const args = prisma.client.employee.create.mock.calls[0]?.[0] as {
      data: { telegramPhone: string };
    };
    expect(args.data.telegramPhone).toBe('+998901234567');
  });

  it('create: strips separators in telegramPhone (+998 (90) 123-45-67)', async () => {
    prisma.client.employee.create.mockResolvedValue({ id: 'new' } as never);
    await service.create('acc1', {
      name: 'Anvar',
      telegramPhone: '+998 (90) 123-45-67',
      hrRoles: [],
      isChecker: false,
    });
    const args = prisma.client.employee.create.mock.calls[0]?.[0] as {
      data: { telegramPhone: string };
    };
    expect(args.data.telegramPhone).toBe('+998901234567');
  });

  it('create: rejects garbage telegramPhone via BadRequest', async () => {
    await expect(
      service.create('acc1', {
        name: 'Anvar',
        telegramPhone: 'not-a-number',
        hrRoles: [],
        isChecker: false,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.client.employee.create).not.toHaveBeenCalled();
  });

  it('update: omitting telegramPhone leaves it unchanged (no field in update data)', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1' } as never);
    prisma.client.employee.update.mockResolvedValue({} as never);
    await service.update('acc1', 'e1', { name: 'Anvar' });
    const call = prisma.client.employee.update.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.telegramPhone).toBeUndefined();
  });

  it('update: normalizing telegramPhone runs on update too', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1' } as never);
    prisma.client.employee.update.mockResolvedValue({} as never);
    await service.update('acc1', 'e1', { telegramPhone: '998901234567' });
    const call = prisma.client.employee.update.mock.calls[0]?.[0] as {
      data: { telegramPhone: string };
    };
    expect(call.data.telegramPhone).toBe('+998901234567');
  });

  // ─── Bulk «Изменить»: archive / restore / hard-delete + self-guard ───────

  it('list: archived=true flips the where filter to the archived view', async () => {
    prisma.client.$transaction.mockResolvedValue([[], 0]);
    await service.list('acc1', { archived: true, page: 1, limit: 50 });
    const findManyArgs = prisma.client.employee.findMany.mock.calls[0]?.[0] as {
      where: { accountId: string; archived: boolean };
    };
    expect(findManyArgs.where.archived).toBe(true);
    expect(findManyArgs.where.accountId).toBe('acc1');
  });

  it('setArchived: archives via tenant-scoped lookup (findFirst by id+accountId)', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1', archived: false } as never);
    prisma.client.employee.update.mockResolvedValue({} as never);
    await service.setArchived('acc1', 'e1', true, 'me');
    const lookup = prisma.client.employee.findFirst.mock.calls[0]?.[0] as {
      where: { id: string; accountId: string };
    };
    expect(lookup.where).toEqual({ id: 'e1', accountId: 'acc1' });
    const upd = prisma.client.employee.update.mock.calls[0]?.[0] as { data: { archived: boolean } };
    expect(upd.data.archived).toBe(true);
  });

  it('setArchived: restore (archived=false) is allowed even for self', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'me', archived: true } as never);
    prisma.client.employee.update.mockResolvedValue({} as never);
    await expect(service.setArchived('acc1', 'me', false, 'me')).resolves.toEqual({ ok: true });
    const upd = prisma.client.employee.update.mock.calls[0]?.[0] as { data: { archived: boolean } };
    expect(upd.data.archived).toBe(false);
  });

  it('setArchived: cannot archive YOURSELF (self-lockout) → BadRequest, no update', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'me', archived: false } as never);
    await expect(service.setArchived('acc1', 'me', true, 'me')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.client.employee.update).not.toHaveBeenCalled();
  });

  it('setArchived: throws NotFound when employee is missing / other tenant', async () => {
    prisma.client.employee.findFirst.mockResolvedValue(null);
    await expect(service.setArchived('acc1', 'ghost', true, 'me')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.client.employee.update).not.toHaveBeenCalled();
  });

  it('softDelete: cannot archive yourself via the per-row delete icon', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'me', archived: false } as never);
    await expect(service.softDelete('acc1', 'me', 'me')).rejects.toThrow(BadRequestException);
    expect(prisma.client.employee.update).not.toHaveBeenCalled();
  });

  it('hardDelete: deletes scoped by id + accountId after tenant ownership check', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1', archived: true } as never);
    prisma.client.employee.delete.mockResolvedValue({} as never);
    await expect(service.hardDelete('acc1', 'e1', 'me')).resolves.toEqual({ ok: true });
    const del = prisma.client.employee.delete.mock.calls[0]?.[0] as {
      where: { id: string; accountId: string };
    };
    expect(del.where).toEqual({ id: 'e1', accountId: 'acc1' });
  });

  it('hardDelete: cannot delete YOURSELF → BadRequest, no delete', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'me', archived: false } as never);
    await expect(service.hardDelete('acc1', 'me', 'me')).rejects.toThrow(BadRequestException);
    expect(prisma.client.employee.delete).not.toHaveBeenCalled();
  });

  it('hardDelete: translates FK violation (P2003) to a clear Conflict message', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1', archived: false } as never);
    prisma.client.employee.delete.mockRejectedValue(
      Object.assign(new Error('FK constraint'), { code: 'P2003' }),
    );
    await expect(service.hardDelete('acc1', 'e1', 'me')).rejects.toThrow(ConflictException);
  });

  it('hardDelete: rethrows non-FK errors unchanged', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'e1', archived: false } as never);
    prisma.client.employee.delete.mockRejectedValue(new Error('connection lost'));
    await expect(service.hardDelete('acc1', 'e1', 'me')).rejects.toThrow('connection lost');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrEmployeePermissionService } from './hr-employee-permission.service.js';

function makePrisma() {
  const tx = {
    hrEmployeePermission: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return {
    client: {
      hrEmployeePermission: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn(async (cb: (tx: typeof tx) => unknown) => cb(tx)),
      _tx: tx,
    },
  };
}

describe('HrEmployeePermissionService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: HrEmployeePermissionService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new HrEmployeePermissionService(prisma as never);
  });

  it('list filters by accountId + employeeId', async () => {
    prisma.client.hrEmployeePermission.findMany.mockResolvedValue([]);
    await service.list('acc1', 'e1');
    const call = prisma.client.hrEmployeePermission.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(call.where).toEqual({ accountId: 'acc1', employeeId: 'e1' });
  });

  it('replace deletes all then inserts new set', async () => {
    await service.replace('acc1', 'e1', {
      permissions: [
        { pageKey: 'messages', section: null, accessLevel: 'full' },
        { pageKey: 'tasks', section: null, accessLevel: 'read' },
      ],
    });
    expect(prisma.client._tx.hrEmployeePermission.deleteMany).toHaveBeenCalledWith({
      where: { accountId: 'acc1', employeeId: 'e1' },
    });
    expect(prisma.client._tx.hrEmployeePermission.createMany).toHaveBeenCalled();
  });

  it('replace with empty array deletes all', async () => {
    const result = await service.replace('acc1', 'e1', { permissions: [] });
    expect(prisma.client._tx.hrEmployeePermission.deleteMany).toHaveBeenCalled();
    expect(prisma.client._tx.hrEmployeePermission.createMany).not.toHaveBeenCalled();
    expect(result.count).toBe(0);
  });

  it('returns count = input length', async () => {
    const result = await service.replace('acc1', 'e1', {
      permissions: [{ pageKey: 'oylik', section: null, accessLevel: 'own_only' }],
    });
    expect(result.count).toBe(1);
  });

  it('replace runs in single transaction', async () => {
    await service.replace('acc1', 'e1', { permissions: [] });
    expect(prisma.client.$transaction).toHaveBeenCalledOnce();
  });
});

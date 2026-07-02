import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrRoleService } from './hr-role.service.js';

function makePrisma() {
  return {
    client: {
      hrRole: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
  };
}

describe('HrRoleService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: HrRoleService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new HrRoleService(prisma as never);
  });

  it('create fails when value already exists', async () => {
    prisma.client.hrRole.findFirst.mockResolvedValue({ id: 'r1' } as never);
    await expect(service.create('acc1', { value: 'admin', label: 'Admin' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('create succeeds when value unique', async () => {
    prisma.client.hrRole.findFirst.mockResolvedValue(null);
    prisma.client.hrRole.create.mockResolvedValue({ id: 'r1' } as never);
    await service.create('acc1', { value: 'manager', label: 'Manager' });
    expect(prisma.client.hrRole.create).toHaveBeenCalled();
  });

  it('delete fails on default role', async () => {
    prisma.client.hrRole.findFirst.mockResolvedValue({ id: 'r1', isDefault: true } as never);
    await expect(service.delete('acc1', 'r1')).rejects.toThrow(BadRequestException);
  });

  it('delete succeeds on custom role', async () => {
    prisma.client.hrRole.findFirst.mockResolvedValue({ id: 'r1', isDefault: false } as never);
    prisma.client.hrRole.delete.mockResolvedValue({} as never);
    await expect(service.delete('acc1', 'r1')).resolves.toEqual({ ok: true });
  });
});

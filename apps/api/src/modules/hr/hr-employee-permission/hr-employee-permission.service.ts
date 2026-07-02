import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { PutPermissionsInput } from './hr-employee-permission.schema.js';

@Injectable()
export class HrEmployeePermissionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, employeeId: string) {
    return this.prisma.client.hrEmployeePermission.findMany({
      where: { accountId, employeeId },
      orderBy: [{ pageKey: 'asc' }, { section: 'asc' }],
      select: { pageKey: true, section: true, accessLevel: true },
    });
  }

  async replace(accountId: string, employeeId: string, input: PutPermissionsInput) {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.hrEmployeePermission.deleteMany({ where: { accountId, employeeId } });
      if (input.permissions.length === 0) return { count: 0 };
      await tx.hrEmployeePermission.createMany({
        data: input.permissions.map((p) => ({
          accountId,
          employeeId,
          pageKey: p.pageKey,
          section: p.section,
          accessLevel: p.accessLevel,
        })),
      });
      return { count: input.permissions.length };
    });
  }
}

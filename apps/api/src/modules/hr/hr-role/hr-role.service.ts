import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { CreateHrRoleInput, UpdateHrRoleInput } from './hr-role.schema.js';

@Injectable()
export class HrRoleService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string) {
    return this.prisma.client.hrRole.findMany({
      where: { accountId },
      orderBy: [{ isDefault: 'desc' }, { label: 'asc' }],
    });
  }

  async create(accountId: string, input: CreateHrRoleInput) {
    const existing = await this.prisma.client.hrRole.findFirst({
      where: { accountId, value: input.value },
    });
    if (existing) throw new BadRequestException('Bu rol allaqachon mavjud');
    return this.prisma.client.hrRole.create({
      data: { accountId, value: input.value, label: input.label, isDefault: false },
    });
  }

  async update(accountId: string, id: string, input: UpdateHrRoleInput) {
    const role = await this.prisma.client.hrRole.findFirst({ where: { id, accountId } });
    if (!role) throw new NotFoundException('Rol topilmadi');
    return this.prisma.client.hrRole.update({
      where: { id },
      data: { label: input.label },
    });
  }

  async delete(accountId: string, id: string) {
    const role = await this.prisma.client.hrRole.findFirst({ where: { id, accountId } });
    if (!role) throw new NotFoundException('Rol topilmadi');
    if (role.isDefault) {
      throw new BadRequestException("Standart rolni o'chirib bo'lmaydi");
    }
    await this.prisma.client.hrRole.delete({ where: { id } });
    return { ok: true };
  }
}

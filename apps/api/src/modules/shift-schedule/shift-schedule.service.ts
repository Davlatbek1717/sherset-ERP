import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type CreateShiftScheduleInput,
  CreateShiftScheduleSchema,
  type UpdateShiftScheduleInput,
  UpdateShiftScheduleSchema,
} from './shift-schedule.schema.js';

@Injectable()
export class ShiftScheduleService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string) {
    return this.prisma.client.shiftSchedule.findMany({
      where: { accountId, archived: false },
      orderBy: { startTime: 'asc' },
    });
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.shiftSchedule.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException('Ish vaqti topilmadi');
    return row;
  }

  async create(accountId: string, raw: unknown) {
    const data = CreateShiftScheduleSchema.parse(raw) as CreateShiftScheduleInput;
    return this.prisma.client.shiftSchedule.create({
      data: { accountId, ...data },
    });
  }

  async update(accountId: string, id: string, raw: unknown) {
    await this.findById(accountId, id);
    const data = UpdateShiftScheduleSchema.parse(raw) as UpdateShiftScheduleInput;
    return this.prisma.client.shiftSchedule.update({
      where: { id },
      data,
    });
  }

  async remove(accountId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.shiftSchedule.update({
      where: { id },
      data: { archived: true },
    });
    return { ok: true };
  }
}

import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type CreateSmenaInput,
  CreateSmenaSchema,
  type OpenSessionFromSmenaInput,
  OpenSessionFromSmenaSchema,
  type UpdateSmenaInput,
  UpdateSmenaSchema,
} from './smena.schema.js';

/** Returns true if current time (Tashkent UTC+5) falls within startTime..endTime */
function isWithinShift(startTime: string, endTime: string): boolean {
  const now = new Date();
  const tzOffset = 5 * 60; // UTC+5
  const local = new Date(now.getTime() + (tzOffset - now.getTimezoneOffset()) * 60000);
  const hh = local.getUTCHours().toString().padStart(2, '0');
  const mm = local.getUTCMinutes().toString().padStart(2, '0');
  const current = `${hh}:${mm}`;

  if (startTime <= endTime) {
    return current >= startTime && current < endTime;
  }
  // overnight shift (e.g. 22:00–06:00)
  return current >= startTime || current < endTime;
}

@Injectable()
export class SmenaService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private readonly INCLUDE = {
    schedule: true,
    organization: { select: { id: true, name: true } },
    employees: { include: { employee: { select: { id: true, name: true } } } },
  } as const;

  async list(accountId: string) {
    return this.prisma.client.smena.findMany({
      where: { accountId, archived: false },
      include: this.INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.smena.findFirst({
      where: { id, accountId },
      include: this.INCLUDE,
    });
    if (!row) throw new NotFoundException('Smena topilmadi');
    return row;
  }

  async create(accountId: string, raw: unknown) {
    const data = CreateSmenaSchema.parse(raw) as CreateSmenaInput;
    const { employeeIds, ...rest } = data;
    return this.prisma.client.smena.create({
      data: {
        accountId,
        ...rest,
        employees: {
          create: employeeIds.map((employeeId) => ({ employeeId })),
        },
      },
      include: this.INCLUDE,
    });
  }

  async update(accountId: string, id: string, raw: unknown) {
    await this.findById(accountId, id);
    const data = UpdateSmenaSchema.parse(raw) as UpdateSmenaInput;
    const { employeeIds, ...rest } = data;

    return this.prisma.client.$transaction(async (tx) => {
      if (employeeIds !== undefined) {
        await tx.smenaEmployee.deleteMany({ where: { smenaId: id } });
        await tx.smenaEmployee.createMany({
          data: employeeIds.map((employeeId) => ({ smenaId: id, employeeId })),
        });
      }
      return tx.smena.update({
        where: { id },
        data: rest,
        include: this.INCLUDE,
      });
    });
  }

  async remove(accountId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.smena.update({ where: { id }, data: { archived: true } });
    return { ok: true };
  }

  /** Joriy xodimning faol smenasin topadi va vaqt ichida ekanini tekshiradi */
  async mine(accountId: string, employeeId: string) {
    const assignments = await this.prisma.client.smenaEmployee.findMany({
      where: { employeeId, smena: { accountId, archived: false } },
      include: {
        smena: {
          include: {
            schedule: true,
            organization: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (assignments.length === 0) return { smena: null, withinShift: false };

    // Xodimning birinchi (yagona) smenasini olish
    const smena = assignments[0]!.smena;
    const withinShift = isWithinShift(smena.schedule.startTime, smena.schedule.endTime);

    return { smena, withinShift };
  }

  /** Smena asosida CashierSession ochish */
  async openSessionFromSmena(accountId: string, cashierId: string, raw: unknown) {
    const input = OpenSessionFromSmenaSchema.parse(raw) as OpenSessionFromSmenaInput;

    const smena = await this.prisma.client.smena.findFirst({
      where: { id: input.smenaId, accountId, archived: false },
      include: { schedule: true },
    });
    if (!smena) throw new NotFoundException('Smena topilmadi');

    const withinShift = isWithinShift(smena.schedule.startTime, smena.schedule.endTime);
    if (!withinShift && !input.outOfShiftReason) {
      throw new BadRequestException('Smena vaqtidan tashqari — sabab yozish shart');
    }

    // Allaqachon ochiq sessiya bormi?
    const existing = await this.prisma.client.cashierSession.findFirst({
      where: { accountId, cashierId, state: 'open' },
    });
    if (existing) throw new BadRequestException('Allaqachon ochiq smena mavjud');

    return this.prisma.client.cashierSession.create({
      data: {
        accountId,
        cashierId,
        organizationId: smena.organizationId,
        smenaId: smena.id,
        outOfShiftReason: input.outOfShiftReason ?? null,
        openingCashMinor: input.openingCashMinor,
        state: 'open',
      },
      include: {
        organization: { select: { id: true, name: true } },
      },
    });
  }
}

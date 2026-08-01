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

    // ── Kassa/ombor: climart sxemasi bilan ko'prik ────────────────────────────
    // Sherset'ning asl sxemasida `CashierSession` da `cashDeskId`/`storeId`
    // YO'Q edi, climart versiyasida esa ular MAJBURIY. /sotuv sahifasi ularni
    // yubormaydi (u faqat `smenaId` beradi) va sahifani 1:1 saqlash uchun
    // so'rovni o'zgartirmadik — shuning uchun server aniqlaydi:
    //   ombor — kassirning «Значения по умолчанию» dagi `defaultStoreId`,
    //           bo'lmasa hisobning eng eski arxivlanmagan ombori;
    //   kassa — hisobning eng eski arxivlanmagan kassasi (sxemada «asosiy
    //           kassa» tushunchasi umuman yo'q — bu ochiq qaror, egasi
    //           smenaga aniq kassa biriktirishni xohlashi mumkin).
    // Ikkalasi ham topilmasa smenani ochib bo'lmaydi — jim noto'g'ri kassaga
    // yozishdan ko'ra ochiq xato beramiz.
    // `UserSettings` xodim bo'yicha kalitlangan (`accountId` maydoni yo'q) —
    // ijara xavfsizligi quyida omborni `accountId` bilan tekshirish orqali.
    const userSettings = await this.prisma.client.userSettings.findUnique({
      where: { employeeId: cashierId },
      select: { defaultStoreId: true },
    });
    const store = userSettings?.defaultStoreId
      ? await this.prisma.client.store.findFirst({
          where: { id: userSettings.defaultStoreId, accountId, archived: false },
          select: { id: true },
        })
      : await this.prisma.client.store.findFirst({
          where: { accountId, archived: false },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
    if (!store) throw new BadRequestException('Ombor topilmadi — avval ombor yarating');

    const cashDesk = await this.prisma.client.cashDesk.findFirst({
      where: { accountId, archived: false },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!cashDesk) throw new BadRequestException('Kassa topilmadi — avval kassa yarating');

    return this.prisma.client.cashierSession.create({
      data: {
        accountId,
        cashierId,
        cashDeskId: cashDesk.id,
        storeId: store.id,
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

import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  EQUIPMENT_STATUS,
  assignBlockReason,
  manualStatusBlockReason,
  normalizeInventoryNo,
  statusAfterReturn,
} from './equipment.js';
import type {
  AssignEquipmentInput,
  CreateEquipmentInput,
  EquipmentFilterInput,
  ReturnEquipmentInput,
  UpdateEquipmentInput,
} from './hr-equipment.schema.js';

/**
 * Jihoz reyestri — I/O tomoni (qoidalar `equipment.ts` sof modulida).
 *
 * ⚠️ **Tarix APPEND-ONLY**: qaytarish biriktirish qatorini o'chirmaydi,
 * `returnedAt` ni yozadi. «Kim, qachon, qanday holatda topshirdi» savoli
 * keyin — nizo paytida — beriladi, o'sha payt yozuv bo'lishi kerak.
 */
@Injectable()
export class EquipmentService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async mustFind(accountId: string, id: string) {
    const eq = await this.prisma.client.equipment.findFirst({
      where: { id, accountId },
      select: { id: true, status: true, name: true },
    });
    if (!eq) throw new NotFoundException('Jihoz topilmadi');
    return eq;
  }

  /** Ochiq (qaytarilmagan) biriktirish — «kimda» savolining YAGONA manbai. */
  private openAssignment(accountId: string, equipmentId: string) {
    return this.prisma.client.equipmentAssignment.findFirst({
      where: { accountId, equipmentId, returnedAt: null },
      select: { id: true, employeeId: true, issuedAt: true },
    });
  }

  async list(accountId: string, filter: EquipmentFilterInput) {
    const rows = await this.prisma.client.equipment.findMany({
      where: {
        accountId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.q
          ? {
              OR: [
                { name: { contains: filter.q, mode: 'insensitive' as const } },
                { inventoryNo: { contains: filter.q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
        // «Kimda» bo'yicha filtr ham OCHIQ qator orqali — holat ustuni emas.
        ...(filter.employeeId
          ? { assignments: { some: { employeeId: filter.employeeId, returnedAt: null } } }
          : {}),
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        inventoryNo: true,
        category: true,
        status: true,
        note: true,
        // Faqat OCHIQ biriktirish — «hozir kimda» shundan chiqadi.
        assignments: {
          where: { returnedAt: null },
          select: {
            id: true,
            issuedAt: true,
            employee: { select: { id: true, name: true } },
          },
          take: 1,
        },
      },
    });

    return {
      items: rows.map((r) => {
        const open = r.assignments[0] ?? null;
        return {
          id: r.id,
          name: r.name,
          inventoryNo: r.inventoryNo,
          category: r.category,
          status: r.status,
          note: r.note,
          holder: open?.employee ?? null,
          issuedAt: open?.issuedAt ?? null,
        };
      }),
      total: rows.length,
    };
  }

  /** Jihoz kartasi — joriy egasi + TO'LIQ tarix (eng yangisi birinchi). */
  async get(accountId: string, id: string) {
    const eq = await this.prisma.client.equipment.findFirst({
      where: { id, accountId },
      select: {
        id: true,
        name: true,
        inventoryNo: true,
        category: true,
        status: true,
        note: true,
        createdAt: true,
      },
    });
    if (!eq) throw new NotFoundException('Jihoz topilmadi');

    const history = await this.prisma.client.equipmentAssignment.findMany({
      where: { accountId, equipmentId: id },
      orderBy: { issuedAt: 'desc' },
      select: {
        id: true,
        issuedAt: true,
        issueNote: true,
        returnedAt: true,
        returnCondition: true,
        returnNote: true,
        employee: { select: { id: true, name: true } },
        issuedBy: { select: { id: true, name: true } },
        receivedBy: { select: { id: true, name: true } },
      },
    });

    const open = history.find((h) => h.returnedAt === null) ?? null;
    return {
      ...eq,
      holder: open?.employee ?? null,
      issuedAt: open?.issuedAt ?? null,
      history,
    };
  }

  /** Xodimdagi ochiq jihozlar — bo'shatish ro'yxati va xodim kartasi uchun. */
  async listForEmployee(accountId: string, employeeId: string) {
    const rows = await this.prisma.client.equipmentAssignment.findMany({
      where: { accountId, employeeId, returnedAt: null },
      orderBy: { issuedAt: 'asc' },
      select: {
        id: true,
        issuedAt: true,
        equipment: { select: { id: true, name: true, inventoryNo: true, category: true } },
      },
    });
    return { items: rows, total: rows.length };
  }

  async create(accountId: string, input: CreateEquipmentInput) {
    const inventoryNo = normalizeInventoryNo(input.inventoryNo);
    try {
      return await this.prisma.client.equipment.create({
        data: {
          accountId,
          name: input.name,
          inventoryNo,
          category: input.category?.trim() || null,
          note: input.note?.trim() || null,
          // Yangi jihoz HAR DOIM omborda: «kimda» faqat biriktirish orqali.
          status: EQUIPMENT_STATUS.inStock,
        },
        select: { id: true, name: true, inventoryNo: true, status: true },
      });
    } catch (e) {
      throw duplicateOrRethrow(e, inventoryNo);
    }
  }

  /**
   * Tahrir.
   *
   * ⚠️ Holat o'zgartirish ikki joyda to'siladi: `assigned` ni qo'lda yozib
   * bo'lmaydi, va xodimda turgan jihozni umuman qayta belgilash mumkin emas
   * — aks holda «hisobdan chiqarildi» bosish bilan javobgarlikni o'chirish
   * yo'li ochiq qolardi.
   */
  async update(accountId: string, id: string, input: UpdateEquipmentInput) {
    await this.mustFind(accountId, id);

    if (input.status !== undefined) {
      const open = await this.openAssignment(accountId, id);
      const reason = manualStatusBlockReason(input.status, open !== null);
      if (reason) throw new BadRequestException(reason);
    }

    const inventoryNo =
      input.inventoryNo === undefined ? undefined : normalizeInventoryNo(input.inventoryNo);

    try {
      return await this.prisma.client.equipment.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(inventoryNo === undefined ? {} : { inventoryNo }),
          ...(input.category === undefined ? {} : { category: input.category?.trim() || null }),
          ...(input.note === undefined ? {} : { note: input.note?.trim() || null }),
          ...(input.status === undefined ? {} : { status: input.status }),
        },
        select: { id: true, name: true, inventoryNo: true, status: true },
      });
    } catch (e) {
      throw duplicateOrRethrow(e, inventoryNo ?? null);
    }
  }

  /**
   * Xodimga biriktirish.
   *
   * Ochiq qator BOR-YO'QLIGI tekshiriladi (holat ustuniga emas — u qo'lda
   * tahrirdan buzilgan bo'lishi mumkin). Poyga esa migratsiyadagi qisman
   * unique indeks bilan yopilgan; `P2002` tushunarli xatoga aylantiriladi.
   */
  async assign(accountId: string, actorId: string, id: string, input: AssignEquipmentInput) {
    const eq = await this.mustFind(accountId, id);
    const employee = await this.prisma.client.employee.findFirst({
      where: { id: input.employeeId, accountId, archived: false },
      select: { id: true },
    });
    // Arxivlangan xodimga biriktirish — bo'shatish ro'yxatini abadiy ochiq
    // qoldirardi (u qaytarilmagan jihozni bloklovchi band deb ko'radi).
    if (!employee) throw new NotFoundException('Xodim topilmadi yoki arxivlangan');

    const open = await this.openAssignment(accountId, id);
    const reason = assignBlockReason(eq.status, open !== null);
    if (reason) throw new BadRequestException(reason);

    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.equipmentAssignment.create({
          data: {
            accountId,
            equipmentId: id,
            employeeId: input.employeeId,
            issuedById: actorId,
            issueNote: input.note?.trim() || null,
          },
        });
        await tx.equipment.update({
          where: { id },
          data: { status: EQUIPMENT_STATUS.assigned },
        });
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new BadRequestException('Jihoz shu payt boshqa xodimga biriktirildi — yangilang');
      }
      throw e;
    }

    return this.get(accountId, id);
  }

  /**
   * Qaytarib olish — qator YOPILADI, o'chirilmaydi.
   *
   * Yangi holat qaytarish shartidan kelib chiqadi: shikastlangan jihoz
   * ta'mirga tushadi va darhol boshqa xodimga berilmaydi; yo'qolgani esa
   * `lost` bo'lib reyestrda QOLADI — yo'qolgan jihoz izsiz ketmasin.
   */
  async returnItem(accountId: string, actorId: string, id: string, input: ReturnEquipmentInput) {
    await this.mustFind(accountId, id);
    const open = await this.openAssignment(accountId, id);
    if (!open) throw new BadRequestException('Bu jihoz hech kimga biriktirilmagan');

    await this.prisma.client.$transaction(async (tx) => {
      await tx.equipmentAssignment.update({
        where: { id: open.id },
        data: {
          returnedAt: new Date(),
          returnedById: actorId,
          returnCondition: input.condition,
          returnNote: input.note?.trim() || null,
        },
      });
      await tx.equipment.update({
        where: { id },
        data: { status: statusAfterReturn(input.condition) },
      });
    });

    return this.get(accountId, id);
  }
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002';
}

function duplicateOrRethrow(e: unknown, inventoryNo: string | null): unknown {
  if (isUniqueViolation(e)) {
    return new BadRequestException(
      inventoryNo
        ? `«${inventoryNo}» inventar raqami band`
        : 'Bunday inventar raqami allaqachon mavjud',
    );
  }
  return e;
}

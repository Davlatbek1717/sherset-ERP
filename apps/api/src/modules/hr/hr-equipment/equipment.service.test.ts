import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EQUIPMENT_STATUS } from './equipment.js';
import { EquipmentService } from './equipment.service.js';

/**
 * Reyestrning I/O tomoni (qoidalar `equipment.ts` da, 16 test).
 *
 * Bu yerda tekshiriladigan narsa — **tarix append-only qolishi** va
 * javobgarlikni jimgina o'chirish yo'llarining yopiqligi.
 */
function makeDeps() {
  const tx = {
    equipment: { update: vi.fn() },
    equipmentAssignment: { create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  };
  const prisma = {
    client: {
      equipment: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
      equipmentAssignment: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
      employee: { findFirst: vi.fn() },
      $transaction: vi.fn(async (arg: unknown) =>
        typeof arg === 'function' ? (arg as (t: unknown) => unknown)(tx) : arg,
      ),
    },
  };
  return { prisma, tx };
}

describe('EquipmentService.assign', () => {
  let deps: ReturnType<typeof makeDeps>;
  let service: EquipmentService;

  beforeEach(() => {
    deps = makeDeps();
    service = new EquipmentService(deps.prisma as never);
    deps.prisma.client.equipment.findFirst.mockResolvedValue({
      id: 'eq1',
      status: EQUIPMENT_STATUS.inStock,
      name: 'Skaner',
    } as never);
    deps.prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp1' } as never);
    deps.prisma.client.equipmentAssignment.findFirst.mockResolvedValue(null as never);
    // `assign`/`returnItem` yakunda kartani qaytaradi — tarix so'rovi.
    deps.prisma.client.equipmentAssignment.findMany.mockResolvedValue([] as never);
  });

  it('biriktirish qator YOZADI va holatni `assigned` qiladi', async () => {
    await service.assign('acc1', 'mgr1', 'eq1', { employeeId: 'emp1', note: null });
    expect(deps.tx.equipmentAssignment.create).toHaveBeenCalledTimes(1);
    const upd = deps.tx.equipment.update.mock.calls[0]?.[0] as { data: { status: string } };
    expect(upd.data.status).toBe(EQUIPMENT_STATUS.assigned);
  });

  it('kim berganini yozadi — «kim javobgar» savoli javobsiz qolmasin', async () => {
    await service.assign('acc1', 'mgr1', 'eq1', { employeeId: 'emp1', note: null });
    const arg = deps.tx.equipmentAssignment.create.mock.calls[0]?.[0] as {
      data: { issuedById: string; employeeId: string };
    };
    expect(arg.data.issuedById).toBe('mgr1');
    expect(arg.data.employeeId).toBe('emp1');
  });

  it('ochiq biriktirish bo`lsa RAD etiladi', async () => {
    deps.prisma.client.equipmentAssignment.findFirst.mockResolvedValue({
      id: 'as1',
      employeeId: 'emp2',
    } as never);
    await expect(
      service.assign('acc1', 'mgr1', 'eq1', { employeeId: 'emp1', note: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deps.tx.equipmentAssignment.create).not.toHaveBeenCalled();
  });

  it('hisobdan chiqarilgan jihoz biriktirilmaydi', async () => {
    deps.prisma.client.equipment.findFirst.mockResolvedValue({
      id: 'eq1',
      status: EQUIPMENT_STATUS.writtenOff,
      name: 'Eski telefon',
    } as never);
    await expect(
      service.assign('acc1', 'mgr1', 'eq1', { employeeId: 'emp1', note: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('POYGA: unique indeks buzilsa 500 emas, tushunarli xato', async () => {
    // Ikki menejer bir vaqtda biriktirsa, qisman unique indeks (migratsiya)
    // ikkinchisini to'xtatadi — foydalanuvchi buni xato sifatida ko'rishi
    // kerak, «Internal server error» sifatida emas.
    deps.prisma.client.$transaction.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }) as never,
    );
    await expect(
      service.assign('acc1', 'mgr1', 'eq1', { employeeId: 'emp1', note: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('EquipmentService.returnItem — tarix APPEND-ONLY', () => {
  let deps: ReturnType<typeof makeDeps>;
  let service: EquipmentService;

  beforeEach(() => {
    deps = makeDeps();
    service = new EquipmentService(deps.prisma as never);
    deps.prisma.client.equipment.findFirst.mockResolvedValue({
      id: 'eq1',
      status: EQUIPMENT_STATUS.assigned,
      name: 'Skaner',
    } as never);
    deps.prisma.client.equipmentAssignment.findFirst.mockResolvedValue({
      id: 'as1',
      employeeId: 'emp1',
    } as never);
    deps.prisma.client.equipmentAssignment.findMany.mockResolvedValue([] as never);
  });

  it('qaytarish qatorni O`CHIRMAYDI — yopadi', async () => {
    await service.returnItem('acc1', 'mgr1', 'eq1', { condition: 'ok', note: null });
    expect(deps.tx.equipmentAssignment.deleteMany).not.toHaveBeenCalled();
    const upd = deps.tx.equipmentAssignment.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { returnedAt: Date; returnedById: string };
    };
    expect(upd.where.id).toBe('as1');
    expect(upd.data.returnedAt).toBeInstanceOf(Date);
    expect(upd.data.returnedById).toBe('mgr1');
  });

  it('soz qaytarilsa jihoz omborga qaytadi', async () => {
    await service.returnItem('acc1', 'mgr1', 'eq1', { condition: 'ok', note: null });
    const upd = deps.tx.equipment.update.mock.calls[0]?.[0] as { data: { status: string } };
    expect(upd.data.status).toBe(EQUIPMENT_STATUS.inStock);
  });

  it('shikastlangan qaytarilsa TA`MIRGA tushadi (darhol qayta berilmaydi)', async () => {
    await service.returnItem('acc1', 'mgr1', 'eq1', { condition: 'damaged', note: null });
    const upd = deps.tx.equipment.update.mock.calls[0]?.[0] as { data: { status: string } };
    expect(upd.data.status).toBe(EQUIPMENT_STATUS.repair);
  });

  it('ochiq biriktirish yo`q bo`lsa RAD etiladi', async () => {
    deps.prisma.client.equipmentAssignment.findFirst.mockResolvedValue(null as never);
    await expect(
      service.returnItem('acc1', 'mgr1', 'eq1', { condition: 'ok', note: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('EquipmentService.update — javobgarlikni jimgina o`chirib bo`lmaydi', () => {
  let deps: ReturnType<typeof makeDeps>;
  let service: EquipmentService;

  beforeEach(() => {
    deps = makeDeps();
    service = new EquipmentService(deps.prisma as never);
    deps.prisma.client.equipment.findFirst.mockResolvedValue({
      id: 'eq1',
      status: EQUIPMENT_STATUS.assigned,
      name: 'Skaner',
    } as never);
  });

  it('xodimda turgan jihozni HISOBDAN CHIQARIB bo`lmaydi', async () => {
    // Aks holda «hisobdan chiqarildi» bosish bilan bo'shatish ro'yxati ham,
    // javobgarlik taxtasi ham qaytarilmagan jihozni ko'rmay qolardi.
    deps.prisma.client.equipmentAssignment.findFirst.mockResolvedValue({ id: 'as1' } as never);
    await expect(
      service.update('acc1', 'eq1', { status: EQUIPMENT_STATUS.writtenOff }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deps.prisma.client.equipment.update).not.toHaveBeenCalled();
  });

  it('`assigned` holatini QO`LDA yozib bo`lmaydi', async () => {
    deps.prisma.client.equipmentAssignment.findFirst.mockResolvedValue(null as never);
    await expect(
      service.update('acc1', 'eq1', { status: EQUIPMENT_STATUS.assigned }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bo`sh jihozning nomi tahrirlanadi', async () => {
    deps.prisma.client.equipmentAssignment.findFirst.mockResolvedValue(null as never);
    deps.prisma.client.equipment.update.mockResolvedValue({ id: 'eq1' } as never);
    await service.update('acc1', 'eq1', { name: 'Yangi nom' });
    const arg = deps.prisma.client.equipment.update.mock.calls[0]?.[0] as {
      data: { name: string };
    };
    expect(arg.data.name).toBe('Yangi nom');
  });
});

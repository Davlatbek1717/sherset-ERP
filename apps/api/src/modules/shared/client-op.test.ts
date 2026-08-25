import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  DuplicateClientOpError,
  assertSameRoute,
  claimClientOp,
  findClientOp,
  isDuplicateClientOp,
  normalizeClientOpId,
} from './client-op.js';

/**
 * G6 — OFLAYN AMALNING IDEMPOTENTLIK KALITI.
 *
 * Bu modulning butun ma'nosi bitta jumlada: TSD aloqasi uzilib qayta
 * yuborilgan amal IKKINCHI marta bajarilmasin. Shuning uchun testlar aynan
 * shu ikki holatni qulflaydi — odatiy takror (oldindan o'qish) va poyga
 * (tranzaksiya ichidagi unikal buzilish).
 */

const uniqueViolation = () => Object.assign(new Error('unique'), { code: 'P2002' });

describe('normalizeClientOpId', () => {
  it('bo`sh/probel/undefined — «kalit yo`q» (web yo`li)', () => {
    expect(normalizeClientOpId(undefined)).toBeNull();
    expect(normalizeClientOpId(null)).toBeNull();
    expect(normalizeClientOpId('   ')).toBeNull();
  });
  it('probellar kesiladi', () => {
    expect(normalizeClientOpId('  abc  ')).toBe('abc');
  });
});

describe('findClientOp — tranzaksiyadan OLDIN', () => {
  const db = (row: { route: string } | null) => ({
    clientOperation: { findFirst: vi.fn().mockResolvedValue(row), create: vi.fn() },
  });

  it('kalitsiz so`rov — hech narsa o`qilmaydi (web xulqi bir bayt ham o`zgarmaydi)', async () => {
    const d = db(null);
    expect(await findClientOp(d, { accountId: 'a', clientOpId: null, route: 'r' })).toBe(false);
    expect(d.clientOperation.findFirst).not.toHaveBeenCalled();
  });

  it('yangi kalit — false (amal bajarilsin)', async () => {
    expect(await findClientOp(db(null), { accountId: 'a', clientOpId: 'k', route: 'r' })).toBe(
      false,
    );
  });

  it('takror kalit — true (amal QAYTA bajarilmaydi)', async () => {
    expect(
      await findClientOp(db({ route: 'r' }), { accountId: 'a', clientOpId: 'k', route: 'r' }),
    ).toBe(true);
  });

  it('kalit BOSHQA marshrutda ishlatilgan — 409, jimgina o`tkazilmaydi', async () => {
    await expect(
      findClientOp(db({ route: 'products/cell-move' }), {
        accountId: 'a',
        clientOpId: 'k',
        route: 'products/cell-place',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('claimClientOp — tranzaksiya ICHIDA', () => {
  it('kalitsiz — yozuv YO`Q', async () => {
    const tx = { clientOperation: { create: vi.fn(), findFirst: vi.fn() } };
    await claimClientOp(tx, { accountId: 'a', clientOpId: null, route: 'r' });
    expect(tx.clientOperation.create).not.toHaveBeenCalled();
  });

  it('kalit yoziladi — akkaunt, marshrut va xodim bilan', async () => {
    const tx = {
      clientOperation: { create: vi.fn().mockResolvedValue({}), findFirst: vi.fn() },
    };
    await claimClientOp(tx, {
      accountId: 'acc',
      clientOpId: 'op-1',
      route: 'products/cell-move',
      employeeId: 'emp-1',
    });
    expect(tx.clientOperation.create).toHaveBeenCalledWith({
      data: {
        accountId: 'acc',
        clientOpId: 'op-1',
        route: 'products/cell-move',
        employeeId: 'emp-1',
      },
    });
  });

  it('poyga (P2002) — `DuplicateClientOpError`, ya`ni tranzaksiya QAYTADI', async () => {
    const tx = {
      clientOperation: { create: vi.fn().mockRejectedValue(uniqueViolation()), findFirst: vi.fn() },
    };
    await expect(
      claimClientOp(tx, { accountId: 'a', clientOpId: 'k', route: 'r' }),
    ).rejects.toBeInstanceOf(DuplicateClientOpError);
  });

  it('BOSHQA xato yutilmaydi (yo`qolgan ulanish takror deb qaralmasin)', async () => {
    const boom = new Error('connection lost');
    const tx = {
      clientOperation: { create: vi.fn().mockRejectedValue(boom), findFirst: vi.fn() },
    };
    await expect(claimClientOp(tx, { accountId: 'a', clientOpId: 'k', route: 'r' })).rejects.toBe(
      boom,
    );
  });
});

describe('isDuplicateClientOp', () => {
  it('o`z sinfini taniydi', () => {
    expect(isDuplicateClientOp(new DuplicateClientOpError())).toBe(true);
  });
  it('nomi bo`yicha ham taniydi (Prisma o`ramidan o`tgan holat)', () => {
    expect(isDuplicateClientOp({ name: 'DuplicateClientOpError' })).toBe(true);
  });
  it('boshqa xatoni takror deb sanamaydi', () => {
    expect(isDuplicateClientOp(new Error('boshqa'))).toBe(false);
    expect(isDuplicateClientOp(null)).toBe(false);
  });
});

describe('assertSameRoute', () => {
  it('bir xil marshrut — jim', () => {
    expect(() => assertSameRoute('r', 'r')).not.toThrow();
  });
  it('boshqa marshrut — 409', () => {
    expect(() => assertSameRoute('a', 'b')).toThrow(ConflictException);
  });
});

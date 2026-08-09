import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { BranchService } from './branch.service.js';

/**
 * Faza F001 — `Branch` (filial) modeli.
 *
 * NEGA XULQ TESTI, MANBA-SKAN EMAS: fazaning yagona qattiq invarianti —
 * **har akkauntda AYNAN BITTA `isDefault` filial**. Buni faqat servis
 * chaqiruvlarining KETMA-KETLIGI ochadi (yaratish → ikkinchisini yaratish →
 * almashtirish), manba matni emas.
 *
 * DB kerak emas: quyidagi `fakePrisma` — `branch` jadvalining xotiradagi
 * modeli. U `where` ni HAQIQATAN filtrlaydi (shu jumladan `accountId`),
 * shuning uchun cross-tenant testi «servis where'ga accountId yozganmi»
 * emas, «B akkaunt A ning filialini OLA OLADIMI» degan savolga javob beradi.
 *
 * ⚠️ Xotira-fake DB-darajadagi qisman-unikal indeksni (partial unique index)
 * TAKRORLAMAYDI — u `branch-migration.test.ts` da alohida qo'riqlanadi.
 * Ikkalasi birga: servis qatlami + baza qatlami.
 */

interface BranchRow {
  id: string;
  accountId: string;
  organizationId: string | null;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  isDefault: boolean;
  archived: boolean;
  sortOrder: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

type Where = Record<string, unknown>;

function matches(row: BranchRow, where: Where | undefined): boolean {
  if (!where) return true;
  for (const [key, expected] of Object.entries(where)) {
    const actual = (row as unknown as Record<string, unknown>)[key];
    if (expected && typeof expected === 'object') {
      const cond = expected as { contains?: string; not?: unknown };
      if (cond.contains !== undefined) {
        if (
          !String(actual ?? '')
            .toLowerCase()
            .includes(cond.contains.toLowerCase())
        )
          return false;
        continue;
      }
      if ('not' in cond) {
        if (actual === cond.not) return false;
        continue;
      }
    }
    if (actual !== expected) return false;
  }
  return true;
}

/** Prisma'ning `branch` delegati — xotirada, `where` filtri haqiqiy. */
function fakePrisma(seed: BranchRow[] = []) {
  const rows: BranchRow[] = [...seed];
  let seq = seed.length;

  /**
   * Prisma yozuvni AJRATILGAN obyekt sifatida qaytaradi (JSON round-trip).
   * Fake ham shunday qilishi SHART: jonli havola qaytarilsa test qo'lidagi
   * `row.version` keyingi `update` dan keyin O'ZI o'zgarib ketadi va
   * optimistik-qulf testi yolg'on yashil bo'lardi (aynan shu tutildi).
   */
  const copy = <T>(r: T): T => ({ ...r });

  const delegate = {
    findMany: async (args: { where?: Where; take?: number } = {}) =>
      rows
        .filter((r) => matches(r, args.where))
        .slice(0, args.take ?? rows.length)
        .map(copy),
    findFirst: async (args: { where?: Where } = {}) => {
      const hit = rows.find((r) => matches(r, args.where));
      return hit ? copy(hit) : null;
    },
    count: async (args: { where?: Where } = {}) =>
      rows.filter((r) => matches(r, args.where)).length,
    create: async (args: { data: Partial<BranchRow> }) => {
      seq += 1;
      const row: BranchRow = {
        id: `br-${seq}`,
        accountId: '',
        organizationId: null,
        name: '',
        code: null,
        address: null,
        phone: null,
        isDefault: false,
        archived: false,
        sortOrder: 0,
        version: 1,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        ...args.data,
      };
      rows.push(row);
      return copy(row);
    },
    update: async (args: { where: Where; data: Record<string, unknown> }) => {
      const row = rows.find((r) => matches(r, args.where));
      if (!row) {
        const err = new Error('Record to update not found') as Error & { code?: string };
        err.code = 'P2025';
        throw err;
      }
      for (const [key, value] of Object.entries(args.data)) {
        if (value && typeof value === 'object' && 'increment' in value) {
          const current = (row as unknown as Record<string, number>)[key] ?? 0;
          (row as unknown as Record<string, number>)[key] =
            current + (value as { increment: number }).increment;
          continue;
        }
        (row as unknown as Record<string, unknown>)[key] = value;
      }
      return copy(row);
    },
    updateMany: async (args: { where: Where; data: Record<string, unknown> }) => {
      const hit = rows.filter((r) => matches(r, args.where));
      for (const row of hit) Object.assign(row, args.data);
      return { count: hit.length };
    },
    delete: async (args: { where: Where }) => {
      const i = rows.findIndex((r) => matches(r, args.where));
      if (i < 0) {
        const err = new Error('Record to delete does not exist') as Error & { code?: string };
        err.code = 'P2025';
        throw err;
      }
      return rows.splice(i, 1)[0] as BranchRow;
    },
  };

  const client = {
    branch: delegate,
    // `setDefault` bitta tranzaksiyada ikki yozuvni o'zgartiradi.
    $transaction: async <T>(fn: (tx: { branch: typeof delegate }) => Promise<T>): Promise<T> =>
      fn({ branch: delegate }),
  };

  return { rows, service: new BranchService({ client } as never) };
}

const NEW = { name: 'Chilonzor filiali' };

describe('F001 — filial: har akkauntda AYNAN BITTA standart filial', () => {
  let ctx: ReturnType<typeof fakePrisma>;

  beforeEach(() => {
    ctx = fakePrisma();
  });

  it('birinchi standart filial yaratiladi', async () => {
    const row = await ctx.service.create('acc-1', { name: 'Asosiy', isDefault: true });
    expect(row.isDefault).toBe(true);
    expect(ctx.rows.filter((r) => r.accountId === 'acc-1' && r.isDefault)).toHaveLength(1);
  });

  it('IKKINCHI `isDefault` yaratishga urinish RAD etiladi', async () => {
    await ctx.service.create('acc-1', { name: 'Asosiy', isDefault: true });
    await expect(
      ctx.service.create('acc-1', { name: 'Yunusobod', isDefault: true }),
    ).rejects.toThrow(ConflictException);
    expect(ctx.rows.filter((r) => r.accountId === 'acc-1' && r.isDefault)).toHaveLength(1);
  });

  it('`update` orqali ikkinchi standart QILIB BO`LMAYDI (yon eshik yopiq)', async () => {
    await ctx.service.create('acc-1', { name: 'Asosiy', isDefault: true });
    const second = await ctx.service.create('acc-1', NEW);
    await expect(
      ctx.service.update('acc-1', second.id, { isDefault: true, version: second.version }),
    ).rejects.toThrow(ConflictException);
    expect(ctx.rows.filter((r) => r.accountId === 'acc-1' && r.isDefault)).toHaveLength(1);
  });

  it('`setDefault` bayroqni KO`CHIRADI — ikkitasi qolmaydi', async () => {
    const first = await ctx.service.create('acc-1', { name: 'Asosiy', isDefault: true });
    const second = await ctx.service.create('acc-1', NEW);
    await ctx.service.setDefault('acc-1', second.id);
    const defaults = ctx.rows.filter((r) => r.accountId === 'acc-1' && r.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.id).toBe(second.id);
    expect(ctx.rows.find((r) => r.id === first.id)?.isDefault).toBe(false);
  });

  it('standart filialni arxivlash/o`chirish TAQIQ (akkaunt filialsiz qolmasin)', async () => {
    const main = await ctx.service.create('acc-1', { name: 'Asosiy', isDefault: true });
    await expect(ctx.service.archive('acc-1', main.id)).rejects.toThrow(BadRequestException);
    await expect(ctx.service.delete('acc-1', main.id)).rejects.toThrow(BadRequestException);
    expect(ctx.rows).toHaveLength(1);
  });
});

describe('F001 — filial: ijarachilar ajratilgan (cross-tenant)', () => {
  it('B akkaunt A ning filialini KO`RMAYDI va O`QIY OLMAYDI', async () => {
    const ctx = fakePrisma();
    const a = await ctx.service.create('acc-A', { name: 'A-Asosiy', isDefault: true });
    await ctx.service.create('acc-B', { name: 'B-Asosiy', isDefault: true });

    await expect(ctx.service.findById('acc-B', a.id)).rejects.toThrow(NotFoundException);
    const listB = await ctx.service.list('acc-B', {});
    expect(listB.items.map((r) => r.name)).toEqual(['B-Asosiy']);
    expect(listB.total).toBe(1);
  });

  it('B akkaunt A ning filialini O`ZGARTIRA/O`CHIRA olmaydi', async () => {
    const ctx = fakePrisma();
    const a = await ctx.service.create('acc-A', { name: 'A-Asosiy', isDefault: true });
    await expect(
      ctx.service.update('acc-B', a.id, { name: 'bosib olindi', version: 1 }),
    ).rejects.toThrow(NotFoundException);
    await expect(ctx.service.delete('acc-B', a.id)).rejects.toThrow(NotFoundException);
    expect(ctx.rows.find((r) => r.id === a.id)?.name).toBe('A-Asosiy');
  });

  it('boshqa akkauntda ham standart filial bo`lishi MUMKIN (qulf akkaunt ichida)', async () => {
    const ctx = fakePrisma();
    await ctx.service.create('acc-A', { name: 'A-Asosiy', isDefault: true });
    await expect(
      ctx.service.create('acc-B', { name: 'B-Asosiy', isDefault: true }),
    ).resolves.toMatchObject({ isDefault: true });
  });
});

describe('F001 — filial: CRUD asoslari', () => {
  it('arxivlangan filial default ro`yxatda ko`rinmaydi, `archived=true` bilan ko`rinadi', async () => {
    const ctx = fakePrisma();
    await ctx.service.create('acc-1', { name: 'Asosiy', isDefault: true });
    const extra = await ctx.service.create('acc-1', NEW);
    await ctx.service.archive('acc-1', extra.id);

    const active = await ctx.service.list('acc-1', {});
    expect(active.items.map((r) => r.name)).toEqual(['Asosiy']);

    const archived = await ctx.service.list('acc-1', { archived: 'true' });
    expect(archived.items.map((r) => r.name)).toEqual([NEW.name]);
  });

  it('eskirgan `version` bilan saqlash 409 beradi (optimistik qulf)', async () => {
    const ctx = fakePrisma();
    const row = await ctx.service.create('acc-1', { name: 'Asosiy', isDefault: true });
    await ctx.service.update('acc-1', row.id, { name: 'Asosiy ombor', version: row.version });
    await expect(
      ctx.service.update('acc-1', row.id, { name: 'yana', version: row.version }),
    ).rejects.toThrow(ConflictException);
  });

  it('bo`sh nom rad etiladi (jimgina saqlanmaydi)', async () => {
    const ctx = fakePrisma();
    await expect(ctx.service.create('acc-1', { name: '' })).rejects.toThrow(BadRequestException);
    expect(ctx.rows).toHaveLength(0);
  });
});

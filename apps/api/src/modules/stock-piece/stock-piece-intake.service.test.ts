import { readFileSync } from 'node:fs';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  applyPieceRecount,
  applyReturnPieceIntake,
  applySupplyPieceIntake,
  parseEntryOrThrow,
} from './stock-piece-intake.service.js';

/**
 * K5 — ommaviy kiritish yo'lining WIRING qulfi.
 *
 * Eng muhim da'vo birinchi testda: **bu modul QOLDIQQA yozmaydi**. Qoldiqni
 * hujjatlarning O'Z posting yo'llari o'zgartiradi; bu yerdagi yagona ish —
 * `stock_pieces` ni hujjat aytgan haqiqatga hizalash. 2026-08-24 da savdo
 * aynan qoldiq mexanizmiga tegilgani uchun 46 daqiqa to'xtagan edi.
 */

const ACC = 'acc-1';
const SCOPE = {
  accountId: ACC,
  storeId: 'store-1',
  cellId: 'cell-1',
  assortmentKind: 'product',
  assortmentId: 'prod-1',
};

const dec = (v: string) => ({ toString: () => v }) as unknown as never;

function makeTx(opts: { maxLabel?: string | null; existing?: unknown[]; found?: unknown[] } = {}) {
  const createMany = vi.fn().mockResolvedValue({ count: 0 });
  const update = vi.fn().mockResolvedValue({});
  const updateMany = vi.fn().mockResolvedValue({ count: 0 });
  const findMany = vi
    .fn()
    .mockImplementation(async (args: { where?: { label?: unknown } }) =>
      args.where?.label ? (opts.found ?? []) : (opts.existing ?? []),
    );
  const findFirst = vi
    .fn()
    .mockResolvedValue(opts.maxLabel === undefined ? null : { label: opts.maxLabel });

  // 🔴 `stock` va `stockByCell` ATAYLAB berilmagan: chaqirilsa TypeError
  // bilan yiqilardi (K2/K4 fake klientlaridagi AYNI qulf).
  const tx = { stockPiece: { createMany, update, updateMany, findMany, findFirst } } as never;
  return { tx, createMany, update, updateMany, findMany, findFirst };
}

const entry = (raw: string) => parseEntryOrThrow(raw);

// ---------------------------------------------------------------------------
describe('K5 — kiritish yo`li QOLDIQQA tegmaydi', () => {
  it('🔴 manbada `stock`/`stockByCell` yozuv metodlari UMUMAN yo`q', () => {
    const src = readFileSync(new URL('./stock-piece-intake.service.ts', import.meta.url), 'utf8');
    for (const forbidden of [
      'stock.create',
      'stock.update',
      'stock.upsert',
      'stockByCell.create',
      'stockByCell.update',
      'stockByCell.upsert',
      'stockByCell.delete',
      'executeRaw',
      'applyDeltas',
    ]) {
      expect(src.includes(forbidden), `manbada «${forbidden}» bo'lmasligi kerak`).toBe(false);
    }
  });

  it('sof yadro Prisma va qoldiqqa UMUMAN murojaat qilmaydi', () => {
    // Izohlarda `StockByCell` eslatiladi (nega tegilmasligi tushuntiriladi) —
    // qulf CHAQIRUV naqshlariga: yadro hech qanday klientni ko'rmaydi.
    const src = readFileSync(new URL('./piece-intake-core.ts', import.meta.url), 'utf8');
    for (const forbidden of ['prisma', 'tx.', 'stockByCell.', 'stock.', 'PrismaService']) {
      expect(src.includes(forbidden), `yadroda «${forbidden}» bo'lmasligi kerak`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
describe('K5 — kiritish matnini o`qish (400)', () => {
  it('yaroqsiz matn 400 beradi va xato matni O`ZBEKCHA', () => {
    expect(() => parseEntryOrThrow('abc')).toThrow(BadRequestException);
    try {
      parseEntryOrThrow('250+abc');
    } catch (e) {
      expect((e as BadRequestException).message).toContain('2-guruh');
    }
  });

  it('to`g`ri matn tuzilgan kiritish qaytaradi', () => {
    expect(parseEntryOrThrow('250x3').total).toBe('750');
  });
});

// ---------------------------------------------------------------------------
describe('K5/1 — SANASH: reyestr sanoq natijasiga tenglashadi', () => {
  const existing = [
    { id: 'w1', length: dec('250'), whole: true, label: null },
    { id: 'p1', length: dec('200'), whole: false, label: 'BLK-000041' },
    { id: 'p2', length: dec('150'), whole: false, label: 'BLK-000042' },
  ];

  it('o`zgarmagan sanoq — HECH NARSA yozilmaydi (yorliq ham bosilmaydi)', async () => {
    const t = makeTx({ existing, maxLabel: 'BLK-000042' });
    const out = await applyPieceRecount(t.tx, SCOPE, entry('250+BLK-000041:200+BLK-000042:150'));
    expect(out).toMatchObject({ kept: 3, adjusted: 0, created: 0, closed: 0 });
    expect(out.labels).toEqual([]);
    expect(t.createMany).not.toHaveBeenCalled();
    expect(t.update).not.toHaveBeenCalled();
    expect(t.updateMany).not.toHaveBeenCalled();
  });

  it('doira AYNAN (ombor × yacheyka × tovar) va faqat FAOL qatorlar', async () => {
    // Omborchi BITTA yacheykani sanadi — boshqalari haqida hech narsa
    // aytmadi (F-reja «sanash faqat yacheyka kesimida» qoidasi).
    const t = makeTx({ existing: [], maxLabel: null });
    await applyPieceRecount(t.tx, SCOPE, entry('250'));
    expect(t.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accountId: ACC,
          storeId: 'store-1',
          cellId: 'cell-1',
          assortmentKind: 'product',
          assortmentId: 'prod-1',
          status: 'active',
        },
      }),
    );
  });

  it('uzunlik tuzatildi — MAVJUD qator yangilanadi, yangisi ochilmaydi', async () => {
    const t = makeTx({ existing, maxLabel: 'BLK-000042' });
    const out = await applyPieceRecount(t.tx, SCOPE, entry('250+BLK-000041:180+BLK-000042:150'));
    expect(out.adjusted).toBe(1);
    expect(t.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { length: '180' } });
    expect(t.createMany).not.toHaveBeenCalled();
    expect(out.labels).toEqual(['BLK-000041']);
  });

  it('yangi bo`lak ochiladi — yorliq raqami eng kattasidan keyin', async () => {
    const t = makeTx({ existing, maxLabel: 'BLK-000042' });
    const out = await applyPieceRecount(
      t.tx,
      SCOPE,
      entry('250+BLK-000041:200+BLK-000042:150+?:70'),
    );
    expect(out.created).toBe(1);
    expect(t.createMany).toHaveBeenCalledWith({
      data: [
        {
          accountId: ACC,
          storeId: 'store-1',
          cellId: 'cell-1',
          assortmentKind: 'product',
          assortmentId: 'prod-1',
          length: '70',
          whole: false,
          label: 'BLK-000043',
          status: 'active',
        },
      ],
    });
  });

  it('🔴 topilmagan qator `recount` sababi bilan yopiladi va BOG`LANISHI uziladi', async () => {
    const t = makeTx({ existing, maxLabel: 'BLK-000042' });
    const out = await applyPieceRecount(t.tx, SCOPE, entry('250+BLK-000041:200'));
    expect(out.closed).toBe(1);
    const call = t.updateMany.mock.calls[0]?.[0] as {
      where: { id: { in: string[] } };
      data: Record<string, unknown>;
    };
    expect(call.where.id.in).toEqual(['p2']);
    expect(call.data).toMatchObject({
      status: 'consumed',
      consumedReason: 'recount',
      // Javonda YO'Q bo'lak «mijoz oldida turibdi» bo'lolmaydi.
      reservedSaleId: null,
      reservedPositionId: null,
    });
  });

  it('yacheykasiz hovuz (`cellId = null`) ham to`liq qo`llanadi', async () => {
    // Jonlida qoldiqning ~94 % i hech bir yacheykaga biriktirilmagan (K1/E1).
    const t = makeTx({ existing: [], maxLabel: null });
    await applyPieceRecount(t.tx, { ...SCOPE, cellId: null }, entry('?:70'));
    expect(t.createMany.mock.calls[0]?.[0]).toMatchObject({ data: [{ cellId: null }] });
  });
});

// ---------------------------------------------------------------------------
describe('K5/2 — PRIYOMKA: faqat qo`shadi', () => {
  it('«250x5» → 5 ta yorliqsiz butun rulon', async () => {
    const t = makeTx({ maxLabel: null });
    const out = await applySupplyPieceIntake(t.tx, SCOPE, entry('250x5'));
    expect(out.created).toBe(5);
    const rows = (t.createMany.mock.calls[0]?.[0] as { data: unknown[] }).data as Array<{
      whole: boolean;
      label: string | null;
      length: string;
    }>;
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.whole && r.label === null && r.length === '250')).toBe(true);
  });

  it('🔴 mavjud qatorlarga UMUMAN tegmaydi (sanashdan asosiy farqi)', async () => {
    const t = makeTx({ maxLabel: null });
    await applySupplyPieceIntake(t.tx, SCOPE, entry('250x2'));
    expect(t.updateMany).not.toHaveBeenCalled();
    expect(t.update).not.toHaveBeenCalled();
    // Mavjud reyestrni o'qishga ham hojat yo'q.
    expect(t.findMany).not.toHaveBeenCalled();
  });

  it('bo`lak kiritilsa 400 — priyomkada yorliq bosish oqimi yo`q', async () => {
    const t = makeTx({ maxLabel: null });
    await expect(applySupplyPieceIntake(t.tx, SCOPE, entry('?:180'))).rejects.toThrow(
      BadRequestException,
    );
    expect(t.createMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('K5/3 — VOZVRAT: bo`lak reyestrga qaytadi', () => {
  it('🔴 yorlig`i tanilgan bo`lak AYNAN o`sha qator bilan tiklanadi', async () => {
    const t = makeTx({
      found: [{ id: 'p1', label: 'BLK-000041', status: 'consumed', length: dec('180') }],
      maxLabel: 'BLK-000041',
    });
    const out = await applyReturnPieceIntake(t.tx, SCOPE, entry('BLK-000041:180'));
    expect(out.restored).toBe(1);
    expect(out.created).toBe(0);
    const call = t.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(call.where.id).toBe('p1');
    expect(call.data).toMatchObject({
      status: 'active',
      consumedAt: null,
      consumedReason: null,
      length: '180',
      // Omborchi tovarni qayerga qo'ysa reyestr o'sha yerni ko'rsatadi.
      storeId: 'store-1',
      cellId: 'cell-1',
      reservedSaleId: null,
      reservedPositionId: null,
    });
    expect(t.createMany).not.toHaveBeenCalled();
  });

  it('yorliqsiz qaytdi — yangi qator + yangi yorliq', async () => {
    const t = makeTx({ maxLabel: 'BLK-000100' });
    const out = await applyReturnPieceIntake(t.tx, SCOPE, entry('?:180'));
    expect(out.created).toBe(1);
    expect(out.labels).toEqual(['BLK-000101']);
    expect(t.update).not.toHaveBeenCalled();
  });

  it('🔴 allaqachon FAOL yorliq qaytarilmaydi — ogohlantirish beriladi', async () => {
    const t = makeTx({
      found: [{ id: 'p1', label: 'BLK-000041', status: 'active', length: dec('180') }],
      maxLabel: 'BLK-000041',
    });
    const out = await applyReturnPieceIntake(t.tx, SCOPE, entry('BLK-000041:180'));
    expect(out.alreadyActive).toEqual(['BLK-000041']);
    expect(out.restored).toBe(0);
    expect(out.created).toBe(0);
    expect(t.update).not.toHaveBeenCalled();
    expect(t.createMany).not.toHaveBeenCalled();
  });

  it('yorliqsiz kiritishda reyestrga qidiruv UMUMAN ketmaydi', async () => {
    const t = makeTx({ maxLabel: null });
    await applyReturnPieceIntake(t.tx, SCOPE, entry('250x2'));
    expect(t.findMany).not.toHaveBeenCalled();
  });
});

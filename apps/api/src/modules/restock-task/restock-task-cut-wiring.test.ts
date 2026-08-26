import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { StockPieceCutService } from '../stock-piece/stock-piece-cut.service.js';
import { RestockTaskService } from './restock-task.service.js';

/**
 * K4 — KESIM OQIMINING SIMLARI (sof qarorlar `piece-cut-core.test.ts` da).
 *
 * O'lchanadigan to'rt zanjir:
 *  1. kesim `stock_pieces` ga yoziladi va QOLDIQQA umuman tegilmaydi;
 *  2. so'ralgan miqdor qoplansa qator O'ZI yopiladi (omborchi qo'shimcha
 *     tugma bosmaydi), qoplanmasa OCHIQ qoladi;
 *  3. bo'linadigan tovar qatori KESIMSIZ tasdiqlanmaydi — LEKIN reyestr
 *     bo'sh bo'lsa odatdagidek yopiladi (K3 `no-registry` qoidasi);
 *  4. `findById` bo'lak kontekstini qo'shadi va bayrog'i o'chiq tovarda
 *     javob shakli bir bayt ham o'zgarmaydi.
 */

const ACC = 'acc-1';
const USER = 'omborchi-1';
const TASK = 'task-1';
const LINE = 'line-1';
const POS = 'pos-1';
const SALE = 'sale-1';
const PROD = '11111111-1111-4111-8111-111111111111';
const STORE = 'store-1';
const SRC = '99999999-9999-4999-8999-999999999999';

const dec = (v: string) => ({ toString: () => v });

interface WorldOpts {
  /** Qator miqdori. */
  quantity?: string;
  pieceTracked?: boolean;
  /** Reyestrdagi FAOL bo'laklar (`reservedPositionId` bilan). */
  pieces?: Array<{
    id: string;
    length: string;
    reservedPositionId?: string | null;
    label?: string | null;
    whole?: boolean;
  }>;
  /** Kesim manbai (topilmasa `null`). */
  source?: unknown;
  positionId?: string | null;
  taskStatus?: string;
  confirmedAt?: Date | null;
}

function makeWorld(opts: WorldOpts = {}) {
  const quantity = opts.quantity ?? '180';
  const pieceTracked = opts.pieceTracked ?? true;
  const pieces = (opts.pieces ?? []).map((p) => ({
    id: p.id,
    assortmentId: PROD,
    label: p.label ?? `BLK-00000${p.id.slice(-1)}`,
    length: dec(p.length),
    whole: p.whole ?? false,
    cellId: 'cell-1',
    reservedPositionId: p.reservedPositionId ?? null,
    cell: { name: '07-01-01-01' },
    status: 'active',
  }));

  const line = {
    id: LINE,
    productId: PROD,
    productName: 'UzKabel VVG 2x2.5',
    quantity: dec(quantity),
    positionId: opts.positionId === undefined ? POS : opts.positionId,
    confirmedAt: opts.confirmedAt ?? (null as Date | null),
    shortageQty: null,
    binLocation: '07-01-01-01',
    position: 0,
  };

  const created: Array<Record<string, unknown>> = [];
  const createdMany: Array<Record<string, unknown>> = [];
  const pieceUpdates: Array<Record<string, unknown>> = [];
  const lineUpdates: Array<Record<string, unknown>> = [];
  const taskUpdates: Array<Record<string, unknown>> = [];

  const stockPieceFindFirst = vi.fn(async (args: { select?: Record<string, unknown> }) => {
    if (args.select && Object.keys(args.select).length === 1 && 'label' in args.select) {
      return { label: 'BLK-000040' };
    }
    return opts.source === undefined
      ? {
          id: SRC,
          storeId: STORE,
          cellId: 'cell-1',
          assortmentKind: 'product',
          assortmentId: PROD,
          length: dec('250'),
          whole: false,
          label: 'BLK-000001',
          status: 'active',
          reservedPositionId: null,
        }
      : opts.source;
  });

  const tx = {
    clientOperation: { create: vi.fn(async (a: { data: unknown }) => a.data) },
    stockPiece: {
      findFirst: stockPieceFindFirst,
      findMany: vi.fn(async () => pieces.filter((p) => p.reservedPositionId === POS)),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => {
        created.push(a.data);
        // Yangi mijoz bo'lagi darhol «band» ro'yxatiga tushadi — qator
        // yopilishi shu ro'yxatdan hisoblanadi.
        pieces.push({
          id: 'piece-new',
          assortmentId: PROD,
          label: String(a.data.label ?? ''),
          length: dec(String(a.data.length)),
          whole: false,
          cellId: 'cell-1',
          reservedPositionId: POS,
          cell: { name: '07-01-01-01' },
          status: 'active',
        });
        return { id: 'piece-new' };
      }),
      createMany: vi.fn(async (a: { data: Record<string, unknown>[] }) => {
        createdMany.push(...a.data);
        return { count: a.data.length };
      }),
      update: vi.fn(async (a: { where: { id: string }; data: Record<string, unknown> }) => {
        pieceUpdates.push({ id: a.where.id, ...a.data });
        return {};
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    restockTaskLine: {
      update: vi.fn(async (a: { where: { id: string }; data: Record<string, unknown> }) => {
        lineUpdates.push({ id: a.where.id, ...a.data });
        // Holat qayta hisobi (`syncTaskStatus`) qatorlarni QAYTA o'qiydi —
        // yozuv ko'rinmasa topshiriq hech qachon `done` bo'lmasdi.
        if ('confirmedAt' in a.data) line.confirmedAt = a.data.confirmedAt as Date;
        return {};
      }),
      findMany: vi.fn(async () => [line]),
    },
    restockTask: {
      findFirst: vi.fn(async () => ({ status: opts.taskStatus ?? 'pending' })),
      update: vi.fn(async (a: { data: Record<string, unknown> }) => {
        taskUpdates.push(a.data);
        return {};
      }),
    },
    employee: { findFirst: vi.fn(async () => ({ name: 'Omborchi Aka' })) },
  };

  const client = {
    clientOperation: { findFirst: vi.fn(async () => null) },
    restockTaskLine: {
      findFirst: vi.fn(async () => line),
      findMany: vi.fn(async () => [line]),
    },
    restockTask: {
      findFirst: vi.fn(async (a: { select?: Record<string, unknown> }) =>
        a.select && 'storeId' in a.select && !('lines' in a.select)
          ? {
              status: opts.taskStatus ?? 'pending',
              storeId: STORE,
              sourceType: 'retailsale',
              sourceId: SALE,
            }
          : { id: TASK, status: opts.taskStatus ?? 'pending', storeId: STORE, lines: [line] },
      ),
    },
    product: {
      findFirst: vi.fn(async () => ({ pieceTracked })),
      findMany: vi.fn(async () => [{ id: PROD, pieceTracked }]),
    },
    stockPiece: {
      findMany: vi.fn(async () => pieces),
      findFirst: stockPieceFindFirst,
    },
    retailSalePosition: {
      findMany: vi.fn(async (a: { select?: Record<string, unknown> }) =>
        a.select && 'pieceLengths' in a.select
          ? [{ id: POS, pieceLengths: '150+30' }]
          : [{ id: POS }],
      ),
    },
    employee: { findFirst: vi.fn(async () => ({ name: 'Omborchi Aka' })) },
    $transaction: vi.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
  };

  const svc = new RestockTaskService(
    { client } as never,
    { emit: vi.fn() } as never,
    new StockPieceCutService(),
  );
  return { svc, client, tx, created, createdMany, pieceUpdates, lineUpdates, taskUpdates };
}

describe('K4 — kesim yozuvi', () => {
  it('🔴 kesim QOLDIQQA tegmaydi: faqat `stock_pieces` yoziladi', async () => {
    const w = makeWorld({ pieces: [{ id: 'piece-1', length: '250' }] });
    await w.svc.cutPiece(ACC, USER, TASK, LINE, { pieceId: SRC, cutLength: '180' });

    // Fake klientda `stock`/`stockByCell` UMUMAN yo'q — chaqirilsa test
    // TypeError bilan yiqilardi. Ya'ni bu da'vo qattiq.
    expect(w.created[0]).toMatchObject({
      length: '180',
      reservedPositionId: POS,
      reservedSaleId: SALE,
      sourcePieceId: SRC,
    });
    expect(w.createdMany[0]).toMatchObject({ length: '70', reservedPositionId: null });
    expect(w.pieceUpdates.find((u) => u.id === SRC)).toMatchObject({ status: 'consumed' });
  });

  it("miqdor QOPLANSA qator O'ZI yopiladi va topshiriq holati qayta hisoblanadi", async () => {
    const w = makeWorld({ quantity: '180', pieces: [{ id: 'piece-1', length: '250' }] });
    const res = await w.svc.cutPiece(ACC, USER, TASK, LINE, { pieceId: SRC, cutLength: '180' });

    expect(res.coverage).toBe('covered');
    expect(w.lineUpdates[0]).toMatchObject({
      id: LINE,
      confirmedById: USER,
      confirmedByName: 'Omborchi Aka',
    });
    expect(w.taskUpdates).toEqual([{ status: 'done' }]);
  });

  it('QISMAN kesimda qator OCHIQ qoladi (kassir «150 + 30» deb kelishgan)', async () => {
    const w = makeWorld({ quantity: '180', pieces: [{ id: 'piece-1', length: '150' }] });
    const res = await w.svc.cutPiece(ACC, USER, TASK, LINE, { pieceId: SRC, cutLength: '150' });

    expect(res.coverage).toBe('partial');
    expect(w.lineUpdates).toEqual([]);
    expect(w.taskUpdates).toEqual([]);
  });

  it("bayrog'i O'CHIQ tovarda kesim RAD etiladi", async () => {
    const w = makeWorld({ pieceTracked: false });
    await expect(
      w.svc.cutPiece(ACC, USER, TASK, LINE, { pieceId: SRC, cutLength: '10' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('boshqa tovarning yoki boshqa ombordagi bo`lagi RAD etiladi', async () => {
    const other = makeWorld({
      source: {
        id: SRC,
        storeId: STORE,
        cellId: null,
        assortmentKind: 'product',
        assortmentId: 'boshqa-tovar',
        length: dec('250'),
        whole: false,
        label: 'BLK-000009',
        status: 'active',
        reservedPositionId: null,
      },
    });
    await expect(
      other.svc.cutPiece(ACC, USER, TASK, LINE, { pieceId: SRC, cutLength: '10' }),
    ).rejects.toThrow(/boshqa tovarniki/i);

    const otherStore = makeWorld({
      source: {
        id: SRC,
        storeId: 'boshqa-ombor',
        cellId: null,
        assortmentKind: 'product',
        assortmentId: PROD,
        length: dec('250'),
        whole: false,
        label: 'BLK-000009',
        status: 'active',
        reservedPositionId: null,
      },
    });
    await expect(
      otherStore.svc.cutPiece(ACC, USER, TASK, LINE, { pieceId: SRC, cutLength: '10' }),
    ).rejects.toThrow(/boshqa omborda/i);
  });

  it('boshqa chek uchun ajratilgan bo`lak manba BO`LOLMAYDI', async () => {
    const w = makeWorld({
      source: {
        id: SRC,
        storeId: STORE,
        cellId: null,
        assortmentKind: 'product',
        assortmentId: PROD,
        length: dec('250'),
        whole: false,
        label: 'BLK-000009',
        status: 'active',
        reservedPositionId: 'boshqa-pos',
      },
    });
    await expect(
      w.svc.cutPiece(ACC, USER, TASK, LINE, { pieceId: SRC, cutLength: '10' }),
    ).rejects.toThrow(/boshqa chek/i);
  });

  it('bekor qilingan topshiriqda kesim yozilmaydi', async () => {
    const w = makeWorld({ taskStatus: 'cancelled' });
    await expect(
      w.svc.cutPiece(ACC, USER, TASK, LINE, { pieceId: SRC, cutLength: '10' }),
    ).rejects.toThrow(/bekor/i);
  });

  it('idempotentlik: kalit allaqachon ishlatilgan bo`lsa kesim TAKRORLANMAYDI', async () => {
    const w = makeWorld({ pieces: [{ id: 'piece-1', length: '250' }] });
    w.client.clientOperation.findFirst = vi.fn(async () => ({
      id: 'op-1',
      route: 'restock-tasks/lines/cut',
    }));
    const res = await w.svc.cutPiece(ACC, USER, TASK, LINE, {
      pieceId: SRC,
      cutLength: '180',
      clientOpId: 'op-abc',
    });
    expect(res.labels).toEqual([]);
    expect(w.created).toEqual([]);
  });
});

describe('K4 — qator KESIMSIZ yopilmaydi (5-vazifa)', () => {
  it('reyestr TO`LA, kesim yo`q ⇒ tasdiqlash RAD etiladi', async () => {
    const w = makeWorld({ pieces: [{ id: 'piece-1', length: '250' }] });
    await expect(w.svc.confirmLine(ACC, USER, TASK, LINE, {})).rejects.toThrow(/kesimni yozing/i);
  });

  it('🔴 reyestr BO`SH bo`lsa qator ODATDAGIDEK yopiladi (savdo to`xtamaydi)', async () => {
    const w = makeWorld({ pieces: [] });
    await expect(w.svc.confirmLine(ACC, USER, TASK, LINE, {})).resolves.toBeDefined();
  });

  it('kesim QISMAN bo`lsa ham RAD etiladi (qolganini ham kesish kerak)', async () => {
    const w = makeWorld({
      quantity: '180',
      pieces: [{ id: 'piece-1', length: '150', reservedPositionId: POS }],
    });
    await expect(w.svc.confirmLine(ACC, USER, TASK, LINE, {})).rejects.toThrow(/qoplamaydi/i);
  });

  it('kesim TO`LIQ bo`lsa qator yopiladi', async () => {
    const w = makeWorld({
      quantity: '180',
      pieces: [{ id: 'piece-1', length: '180', reservedPositionId: POS }],
    });
    await expect(w.svc.confirmLine(ACC, USER, TASK, LINE, {})).resolves.toBeDefined();
  });

  it('SKAN yo`li ham himoyalangan (aks holda kesim chetlab o`tilardi)', async () => {
    const w = makeWorld({ pieces: [{ id: 'piece-1', length: '250' }] });
    await expect(w.svc.confirmScan(ACC, USER, TASK, { productId: PROD })).rejects.toThrow(
      /kesimni yozing/i,
    );
  });
});

describe('K4 — topshiriq detalidagi bo`lak konteksti', () => {
  it('bo`linadigan tovarda manbalar, kesilganlar va kelishuv qaytadi', async () => {
    const w = makeWorld({
      pieces: [
        { id: 'piece-1', length: '250' },
        { id: 'piece-2', length: '150', reservedPositionId: POS },
      ],
    });
    const task = (await w.svc.findById(ACC, TASK)) as {
      lines: Array<Record<string, unknown>>;
    };
    const line = task.lines[0] as Record<string, unknown>;
    expect(line.pieceTracked).toBe(true);
    expect(line.agreedLengths).toEqual(['150', '30']);
    // Boshqa qatorga band bo'lak manba sifatida KO'RSATILMAYDI.
    expect((line.pieceOptions as unknown[]).length).toBe(1);
    expect((line.cutPieces as Array<{ id: string }>)[0]?.id).toBe('piece-2');
    expect(line.cutCoverage).toBe('partial');
  });

  it("bayrog'i O'CHIQ tovarda javob shakli o'zgarmaydi va reyestrga so'rov KETMAYDI", async () => {
    const w = makeWorld({ pieceTracked: false });
    const task = (await w.svc.findById(ACC, TASK)) as {
      lines: Array<Record<string, unknown>>;
    };
    expect(task.lines[0]?.pieceTracked).toBe(false);
    expect(task.lines[0]).not.toHaveProperty('pieceOptions');
    expect(w.client.stockPiece.findMany).not.toHaveBeenCalled();
  });
});

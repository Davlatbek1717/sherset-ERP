import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { StockPieceCutService } from '../stock-piece/stock-piece-cut.service.js';
import { RestockTaskService } from './restock-task.service.js';

/**
 * G6 — TSD ish ekranlarining SIMLARI (sof qarorlar
 * `restock-task-progress.test.ts` da; bu fayl ulanish uchun).
 *
 * O'lchanadigan uchta zanjir:
 *  1. yetishmovchilik ustunlarga yoziladi va topshiriq holati QAYTA
 *     hisoblanadi (chek shu bilan kontrol navbatiga tushadi — G2 sharti);
 *  2. `confirm-scan` da idempotentlik kaliti — takror skan IKKINCHI qatorni
 *     yopmaydi (aynan shu yo'l qatorga manzillangan emas);
 *  3. `findById` qatorlarni YACHEYKA MARSHRUTI tartibida qaytaradi.
 */

const ACCOUNT = 'acc-1';
const USER = 'omborchi-1';
const TASK = 'task-1';
const LINE = 'line-1';
const P1 = '11111111-1111-4111-8111-111111111111';

interface LineRow {
  id: string;
  productId: string | null;
  productName?: string;
  quantity: { toString(): string };
  confirmedAt: Date | null;
  shortageQty: { toString(): string } | null;
  binLocation?: string | null;
  position?: number;
}

function makeWorld(opts: {
  lines: LineRow[];
  taskStatus?: string;
  existingOp?: { route: string } | null;
}) {
  const lineUpdates: Array<Record<string, unknown>> = [];
  const taskUpdates: Array<Record<string, unknown>> = [];
  const opCreates: Array<Record<string, unknown>> = [];
  let lines = opts.lines;

  const tx = {
    clientOperation: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        // Unikal indeksni taqlid qiladi: bir xil kalit ikkinchi marta
        // yozilmaydi (P2002) — bu testning butun ma'nosi shu.
        const key = String(args.data.clientOpId);
        if (opCreates.some((o) => o.clientOpId === key)) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        opCreates.push(args.data);
        return args.data;
      }),
    },
    restockTaskLine: {
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        lineUpdates.push({ id: args.where.id, ...args.data });
        lines = lines.map((l) =>
          l.id === args.where.id
            ? {
                ...l,
                confirmedAt: (args.data.confirmedAt as Date | undefined) ?? l.confirmedAt,
                shortageQty:
                  'shortageQty' in args.data
                    ? (args.data.shortageQty as { toString(): string } | null)
                    : l.shortageQty,
              }
            : l,
        );
        return {};
      }),
      findMany: vi.fn(async () => lines),
      findFirst: vi.fn(
        async (args: { where: { id: string } }) =>
          lines.find((l) => l.id === args.where.id) ?? null,
      ),
    },
    restockTask: {
      findFirst: vi.fn(async () => ({ status: opts.taskStatus ?? 'pending' })),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => {
        taskUpdates.push(args.data);
        return {};
      }),
    },
  };

  const client = {
    ...tx,
    clientOperation: {
      ...tx.clientOperation,
      findFirst: vi.fn(async () => opts.existingOp ?? null),
    },
    employee: { findFirst: vi.fn(async () => ({ name: 'Omborchi Aka' })) },
    restockTask: {
      ...tx.restockTask,
      findFirst: vi.fn(async (args: { select?: Record<string, unknown> }) =>
        // `findById` to'liq topshiriqni, `setShortage` faqat holatni so'raydi.
        args.select && 'status' in args.select
          ? { status: opts.taskStatus ?? 'pending' }
          : { id: TASK, status: opts.taskStatus ?? 'pending', lines },
      ),
    },
    $transaction: vi.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
  };

  // K4 — `findById` endi bo'linadigan tovar kontekstini ham qo'shadi
  // (`withPieceContext`). Bu dunyoda bayroq HECH BIR tovarda yoqilmagan, ya'ni
  // u birinchi so'rovdan keyin to'xtaydi va javob shakli G6 dagidek qoladi.
  const clientWithPieces = {
    ...client,
    product: {
      findMany: vi.fn(async () => lines.map((l) => ({ id: l.productId, pieceTracked: false }))),
      // `assertCutRecorded` — bayrog'i o'chiq tovarda darhol qaytadi
      // (kesim TALAB QILINMAYDI), ya'ni tasdiqlash yo'li G6 dagidek qoladi.
      findFirst: vi.fn(async () => ({ pieceTracked: false })),
    },
    stockPiece: { findMany: vi.fn(async () => []) },
  };

  const svc = new RestockTaskService(
    { client: clientWithPieces } as never,
    { emit: vi.fn() } as never,
    new StockPieceCutService(),
  );
  return {
    svc,
    lineUpdates,
    taskUpdates,
    opCreates,
    client: clientWithPieces,
    getLines: () => lines,
  };
}

const dec = (v: string) => ({ toString: () => v });

// ─── Yetishmovchilik ────────────────────────────────────────────────────────

describe('setShortage — ustunlar va topshiriq holati', () => {
  it('belgi yoziladi (KIM va QACHON bilan) va topshiriq `done` bo`ladi', async () => {
    const w = makeWorld({
      lines: [
        { id: LINE, productId: P1, quantity: dec('10'), confirmedAt: null, shortageQty: null },
      ],
    });

    await w.svc.setShortage(ACCOUNT, USER, TASK, LINE, { qty: '4', note: 'javon bo`sh' });

    expect(w.lineUpdates[0]).toMatchObject({
      id: LINE,
      shortageQty: '4',
      shortageNote: 'javon bo`sh',
      shortageById: USER,
      shortageByName: 'Omborchi Aka',
    });
    expect(w.lineUpdates[0]?.shortageAt).toBeInstanceOf(Date);
    // 🔴 ENG MUHIM QATOR: yagona qator yopildi ⇒ topshiriq `done` ⇒ chek
    // KONTROL navbatiga tushadi. Busiz kassa yopilmagan chek bilan qotardi.
    expect(w.taskUpdates).toEqual([{ status: 'done' }]);
  });

  it('chek QATORI (`quantity`) tegilmaydi — chekni faqat kontrol o`zgartiradi', async () => {
    const w = makeWorld({
      lines: [
        { id: LINE, productId: P1, quantity: dec('10'), confirmedAt: null, shortageQty: null },
      ],
    });
    await w.svc.setShortage(ACCOUNT, USER, TASK, LINE, { qty: '4' });
    expect(w.lineUpdates[0]).not.toHaveProperty('quantity');
  });

  it('qisman yopilganda `in_progress` (boshqa qator hali ochiq)', async () => {
    const w = makeWorld({
      lines: [
        { id: LINE, productId: P1, quantity: dec('10'), confirmedAt: null, shortageQty: null },
        { id: 'line-2', productId: 'p2', quantity: dec('1'), confirmedAt: null, shortageQty: null },
      ],
    });
    await w.svc.setShortage(ACCOUNT, USER, TASK, LINE, { qty: '10' });
    expect(w.taskUpdates).toEqual([{ status: 'in_progress' }]);
  });

  it('0 — belgi TOZALANADI (barcha ustunlar null)', async () => {
    const w = makeWorld({
      lines: [
        { id: LINE, productId: P1, quantity: dec('10'), confirmedAt: null, shortageQty: dec('4') },
      ],
    });
    await w.svc.setShortage(ACCOUNT, USER, TASK, LINE, { qty: '0' });
    expect(w.lineUpdates[0]).toMatchObject({
      shortageQty: null,
      shortageNote: null,
      shortageAt: null,
      shortageById: null,
      shortageByName: null,
    });
  });

  it('AYNI qiymat qayta yuborilsa YOZUV YO`Q (oflayn navbat takrori zararsiz)', async () => {
    const w = makeWorld({
      lines: [
        { id: LINE, productId: P1, quantity: dec('10'), confirmedAt: null, shortageQty: dec('4') },
      ],
    });
    await w.svc.setShortage(ACCOUNT, USER, TASK, LINE, { qty: '4' });
    expect(w.lineUpdates).toHaveLength(0);
    expect(w.taskUpdates).toHaveLength(0);
  });

  it('talabdan ko`p miqdor — 400 (sof modul rad etadi)', async () => {
    const w = makeWorld({
      lines: [
        { id: LINE, productId: P1, quantity: dec('10'), confirmedAt: null, shortageQty: null },
      ],
    });
    await expect(
      w.svc.setShortage(ACCOUNT, USER, TASK, LINE, { qty: '11' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(w.lineUpdates).toHaveLength(0);
  });

  it('BEKOR QILINGAN topshiriqqa yozilmaydi', async () => {
    const w = makeWorld({
      lines: [
        { id: LINE, productId: P1, quantity: dec('10'), confirmedAt: null, shortageQty: null },
      ],
      taskStatus: 'cancelled',
    });
    await expect(w.svc.setShortage(ACCOUNT, USER, TASK, LINE, { qty: '4' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

// ─── Idempotentlik kaliti ───────────────────────────────────────────────────

describe('confirm-scan — idempotentlik kaliti', () => {
  const twoLinesOfSameProduct = () => [
    {
      id: LINE,
      productId: P1,
      quantity: dec('1'),
      confirmedAt: null,
      shortageQty: null,
      position: 0,
    },
    {
      id: 'line-2',
      productId: P1,
      quantity: dec('1'),
      confirmedAt: null,
      shortageQty: null,
      position: 1,
    },
  ];

  it('🔴 takror skan IKKINCHI qatorni YOPMAYDI (kalit avval o`qiladi)', async () => {
    const w = makeWorld({
      lines: twoLinesOfSameProduct(),
      // Kalit allaqachon yozilgan — ya'ni bu so'rov QAYTA yuborilgan nusxa.
      existingOp: { route: 'restock-tasks/confirm-scan' },
    });

    await w.svc.confirmScan(ACCOUNT, USER, TASK, {
      productId: P1,
      clientOpId: 'op-1',
    });

    // Hech bir qator yopilmadi — effekt takrorlanmadi.
    expect(w.lineUpdates).toHaveLength(0);
  });

  it('kalitsiz takror skan IKKINCHI qatorni yopadi — kalit nega kerakligi', async () => {
    // Bu test kalitning NARXINI emas, QIYMATINI ko'rsatadi: kalit
    // bo'lmasa aynan shu xulq (olinmagan tovar «olindi» bo'lishi) qaytadi.
    const lines = twoLinesOfSameProduct();
    const w = makeWorld({ lines });
    const body = { productId: P1 };
    await w.svc.confirmScan(ACCOUNT, USER, TASK, body);
    await w.svc.confirmScan(ACCOUNT, USER, TASK, body);
    expect(w.lineUpdates.map((u) => u.id)).toEqual([LINE, 'line-2']);
  });

  it('kalit tranzaksiya ICHIDA yoziladi (marshrut va xodim bilan)', async () => {
    const w = makeWorld({ lines: twoLinesOfSameProduct() });
    await w.svc.confirmScan(ACCOUNT, USER, TASK, {
      productId: P1,
      clientOpId: 'op-9',
    });
    expect(w.opCreates[0]).toMatchObject({
      accountId: ACCOUNT,
      clientOpId: 'op-9',
      route: 'restock-tasks/confirm-scan',
      employeeId: USER,
    });
  });

  it('poyga (ikki nusxa ayni paytda) — effekt bir marta, xato YO`Q', async () => {
    const w = makeWorld({ lines: twoLinesOfSameProduct() });
    // Kalit tranzaksiya ichida ikkinchi marta yozilmoqchi bo'ladi (P2002)
    // ⇒ `DuplicateClientOpError` yutiladi va chaqiruvchi joriy holatni oladi.
    await w.svc.confirmLine(ACCOUNT, USER, TASK, LINE, { clientOpId: 'race-1' });
    await expect(
      w.svc.confirmLine(ACCOUNT, USER, TASK, 'line-2', { clientOpId: 'race-1' }),
    ).resolves.toBeTruthy();
    expect(w.lineUpdates.map((u) => u.id)).toEqual([LINE]);
  });
});

// ─── Marshrut tartibi ───────────────────────────────────────────────────────

describe('findById — qatorlar yacheyka marshrutida', () => {
  it('yacheyka kodi bo`yicha saralanadi, yacheykasizlar oxirida', async () => {
    const w = makeWorld({
      lines: [
        {
          id: 'a',
          productId: P1,
          quantity: dec('1'),
          confirmedAt: null,
          shortageQty: null,
          binLocation: null,
          position: 0,
        },
        {
          id: 'b',
          productId: P1,
          quantity: dec('1'),
          confirmedAt: null,
          shortageQty: null,
          binLocation: '01-02-03-04',
          position: 1,
        },
        {
          id: 'c',
          productId: P1,
          quantity: dec('1'),
          confirmedAt: null,
          shortageQty: null,
          binLocation: '01-01-01-01',
          position: 2,
        },
      ],
    });
    const task = (await w.svc.findById(ACCOUNT, TASK)) as { lines: Array<{ id: string }> };
    expect(task.lines.map((l) => l.id)).toEqual(['c', 'b', 'a']);
  });
});

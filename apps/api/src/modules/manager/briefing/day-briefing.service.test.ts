import { describe, expect, it, vi } from 'vitest';
import type { BriefingBlock, BriefingBlockKey } from './day-briefing.js';
import { DayBriefingService } from './day-briefing.service.js';

/**
 * MK19 — brifing I/O qatlami.
 *
 * Bu yerdagi test-mavzu uchta:
 *  (1) **har blok AYNAN o'z servisidan keladi** (yangi hisob ochilmagan);
 *  (2) **manba yiqilsa brifing yolg'on «tinch kun» bermaydi**;
 *  (3) **Telegram bir kunda ikki marta ketmaydi**.
 * Qoidalarning o'zi sof `day-briefing.ts` da (25 test).
 */

const ACCOUNT = 'acc-1';
/** 2026-08-10, Toshkentda 15:00 (UTC 10:00) — kun chegarasidan uzoq. */
const NOW = new Date('2026-08-10T10:00:00.000Z');

interface Over {
  slaBoard?: () => Promise<unknown>;
  acceptanceQueue?: () => Promise<unknown>;
  stockSignals?: () => Promise<unknown>;
  salesReport?: () => Promise<unknown>;
  shiftQueue?: (accountId: string, params: { states?: readonly string[] }) => Promise<unknown>;
  queueList?: () => Promise<unknown>;
  outboxRows?: Array<{ status: string }>;
  defaultChatId?: string | null;
  send?: () => Promise<{ id: string; status: string }>;
}

function makeService(over: Over = {}) {
  const sla = {
    board: vi.fn(
      over.slaBoard ??
        (async () => ({
          overdueCount: 0,
          truncated: false,
          sourceTruncated: false,
          stages: [
            { stage: 'ORDER_PICKING', total: 0, overdue: 0, worstOverdueHours: null },
            { stage: 'DOC_APPROVAL', total: 0, overdue: 0, worstOverdueHours: null },
          ],
          rows: [],
        })),
    ),
  };
  const acceptance = {
    queue: vi.fn(over.acceptanceQueue ?? (async () => ({ items: [], total: 0 }))),
  };
  const inventory = {
    stockSignals: vi.fn(
      over.stockSignals ??
        (async () => ({
          truncated: false,
          signals: {
            dead_money: { totalMinor: '0', measuredCount: 0, unmeasuredCount: 0, rowCount: 0 },
            stockout_risk: { totalMinor: '0', measuredCount: 0, unmeasuredCount: 0, rowCount: 0 },
            overstock: { totalMinor: '0', measuredCount: 0, unmeasuredCount: 0, rowCount: 0 },
          },
        })),
    ),
  };
  const reports = {
    salesReport: vi.fn(
      over.salesReport ??
        (async () => ({
          totals: { salesCount: 0, returnsCount: 0, sumMinor: '0' },
          unconvertedByCurrency: [],
        })),
    ),
  };
  const shifts = {
    queue: vi.fn(
      over.shiftQueue ??
        (async (_acc: string, _p: { states?: readonly string[] }) => ({ count: 0, rows: [] })),
    ),
  };
  const queue = {
    list: vi.fn(over.queueList ?? (async () => ({ count: 0, staleCount: 0, rows: [] }))),
  };
  const telegram = {
    send: vi.fn(over.send ?? (async () => ({ id: 'outbox-1', status: 'pending' }))),
  };
  const prisma = {
    client: {
      currency: {
        findMany: vi.fn(async () => [
          {
            code: '860',
            isoCode: 'UZS',
            default: true,
            rateValue: 100_000_000n,
            multiplicity: 1,
            indirect: false,
          },
        ]),
      },
      telegramOutbox: { findMany: vi.fn(async () => over.outboxRows ?? []) },
      telegramConfig: {
        findUnique: vi.fn(async () => ({
          defaultChatId: over.defaultChatId === undefined ? '-100500' : over.defaultChatId,
        })),
      },
    },
  };

  const svc = new DayBriefingService(
    prisma as never,
    sla as never,
    acceptance as never,
    inventory as never,
    reports as never,
    shifts as never,
    queue as never,
    telegram as never,
  );
  return { svc, sla, acceptance, inventory, reports, shifts, queue, telegram, prisma };
}

function block(blocks: BriefingBlock[], key: BriefingBlockKey): BriefingBlock {
  const b = blocks.find((x) => x.key === key);
  if (!b) throw new Error(`blok yo'q: ${key}`);
  return b;
}

describe('MK19 — ertalabki brifing manbalari', () => {
  it('bo‘sh kun: hamma manba o‘lchandi va nol ⇒ «tinch kun»', async () => {
    const { svc } = makeService();
    const res = await svc.morning(ACCOUNT, NOW);
    expect(res.summary.status).toBe('quiet');
    expect(res.summary.attentionCount).toBe(0);
    expect(res.businessDate).toBe('2026-08-10');
    expect(res.blocks.map((b) => b.key)).toEqual([
      'stuck',
      'sla_breach',
      'acceptance_pending',
      'stock_signal',
    ]);
  });

  it('`stuck` va `sla_breach` BITTA `board()` chaqiruvidan chiqadi', async () => {
    const { svc, sla } = makeService({
      slaBoard: async () => ({
        overdueCount: 3,
        truncated: false,
        sourceTruncated: false,
        stages: [
          { stage: 'ORDER_PICKING', total: 9, overdue: 3, worstOverdueHours: 12.5 },
          { stage: 'DOC_APPROVAL', total: 4, overdue: 0, worstOverdueHours: null },
        ],
        rows: [],
      }),
    });
    const res = await svc.morning(ACCOUNT, NOW);
    // Ikki blok — bitta so'rov: ikki marta chaqirilsa ikki xil `now` bilan
    // ikki xil son chiqardi.
    expect(sla.board).toHaveBeenCalledTimes(1);
    expect(block(res.blocks, 'stuck').count).toBe(13);
    expect(block(res.blocks, 'sla_breach').count).toBe(3);
    expect(block(res.blocks, 'sla_breach').context.worstOverdueHours).toBe(12.5);
    // 13 ta ochiq ish — bu OGOHLANTIRISH emas; faqat 3 ta oshgani signal.
    expect(block(res.blocks, 'stuck').attention).toBe(false);
    expect(res.summary.attentionBlocks).toEqual(['sla_breach']);
  });

  it('manba KESILGAN bo‘lsa blok «qisman» — «hammasi ko‘rildi» deyilmaydi', async () => {
    const { svc } = makeService({
      slaBoard: async () => ({
        overdueCount: 2,
        truncated: true,
        sourceTruncated: true,
        stages: [{ stage: 'ORDER_PICKING', total: 500, overdue: 2, worstOverdueHours: 1 }],
        rows: [],
      }),
    });
    const res = await svc.morning(ACCOUNT, NOW);
    expect(block(res.blocks, 'sla_breach').quality).toBe('partial');
  });

  it('🔴 manba YIQILSA blok o‘lchanmagan qoladi va kun «tinch» EMAS', async () => {
    const { svc } = makeService({
      stockSignals: async () => {
        throw new Error('stock down');
      },
    });
    const res = await svc.morning(ACCOUNT, NOW);
    expect(block(res.blocks, 'stock_signal').count).toBeNull();
    expect(block(res.blocks, 'stock_signal').quality).toBe('uncollected');
    // Qolgan bloklar ko'rinadi — panel butunlay qulamaydi.
    expect(block(res.blocks, 'sla_breach').count).toBe(0);
    expect(res.summary.status).toBe('incomplete');
    expect(res.summary.attentionCount).toBeNull();
  });

  it('zaxira signali PULni ham beradi, o‘lchanmagan qator «qisman» qiladi', async () => {
    const { svc } = makeService({
      stockSignals: async () => ({
        truncated: false,
        signals: {
          dead_money: { totalMinor: '700000', measuredCount: 2, unmeasuredCount: 1, rowCount: 3 },
          stockout_risk: {
            totalMinor: '300000',
            measuredCount: 1,
            unmeasuredCount: 0,
            rowCount: 1,
          },
          overstock: { totalMinor: '0', measuredCount: 0, unmeasuredCount: 0, rowCount: 0 },
        },
      }),
    });
    const res = await svc.morning(ACCOUNT, NOW);
    const b = block(res.blocks, 'stock_signal');
    expect(b.count).toBe(4);
    expect(b.amountMinor).toBe('1000000');
    // Bir qator pulsiz ⇒ ko'rsatilgan jami KAM.
    expect(b.quality).toBe('partial');
    expect(b.context.unmeasuredRows).toBe(1);
  });

  it('qabul navbati shiftga tegsa «qisman» bo‘ladi', async () => {
    const { svc } = makeService({ acceptanceQueue: async () => ({ items: [], total: 500 }) });
    const res = await svc.morning(ACCOUNT, NOW);
    expect(block(res.blocks, 'acceptance_pending').quality).toBe('partial');
  });
});

describe('MK19 — kechki yakun manbalari', () => {
  it('tushum mavjud sotuv hisobotidan, kun chegarasi bilan', async () => {
    const { svc, reports } = makeService({
      salesReport: async () => ({
        totals: { salesCount: 12, returnsCount: 1, sumMinor: '4500000' },
        unconvertedByCurrency: [],
      }),
    });
    const res = await svc.evening(ACCOUNT, NOW);
    const b = block(res.blocks, 'revenue');
    expect(b.count).toBe(12);
    expect(b.amountMinor).toBe('4500000');
    // Tushum — OGOHLANTIRISH emas.
    expect(b.attention).toBe(false);

    const [, filter] = reports.salesReport.mock.calls[0] as [string, Record<string, string>];
    // Toshkent yarim tuni = 2026-08-09T19:00Z.
    expect(filter.dateFrom).toBe('2026-08-09T19:00:00.000Z');
    expect(filter.dateTo).toBe('2026-08-10T19:00:00.000Z');
    expect(filter.groupBy).toBe('none');
  });

  it('kursi topilmagan valyuta bo‘lsa tushum «qisman»', async () => {
    const { svc } = makeService({
      salesReport: async () => ({
        totals: { salesCount: 3, returnsCount: 0, sumMinor: '100' },
        unconvertedByCurrency: [{ currency: 'EUR', amountMinor: '5000' }],
      }),
    });
    const res = await svc.evening(ACCOUNT, NOW);
    expect(block(res.blocks, 'revenue').quality).toBe('partial');
  });

  it('🔴 kassa farqi SUMMASI qo‘shilmaydi — faqat NECHTA ekani', async () => {
    const { svc } = makeService({
      shiftQueue: async (_acc, params) =>
        params.states
          ? {
              count: 3,
              rows: [
                { discrepancyMinor: '-5000', awaitsCashier: false },
                { discrepancyMinor: '0', awaitsCashier: false },
                { discrepancyMinor: '12000', awaitsCashier: false },
              ],
            }
          : { count: 1, rows: [{ discrepancyMinor: '-5000', awaitsCashier: true }] },
    });
    const res = await svc.evening(ACCOUNT, NOW);
    const b = block(res.blocks, 'cash_variance');
    expect(b.count).toBe(2);
    // Valyutalar aralashmasin (kassa TZ §8.4) — jamlangan summa YO'Q.
    expect(b.amountMinor).toBeNull();
    expect(b.quality).toBe('complete');
  });

  it('sanalmagan smena farqni «nol» qilmaydi — blok «qisman»', async () => {
    const { svc } = makeService({
      shiftQueue: async (_acc, params) =>
        params.states
          ? {
              count: 2,
              rows: [
                { discrepancyMinor: null, awaitsCashier: false },
                { discrepancyMinor: '0', awaitsCashier: false },
              ],
            }
          : { count: 0, rows: [] },
    });
    const res = await svc.evening(ACCOUNT, NOW);
    const b = block(res.blocks, 'cash_variance');
    expect(b.count).toBe(0);
    expect(b.quality).toBe('partial');
    expect(b.context.uncountedShifts).toBe(1);
  });

  it('smena qabuli va farq IKKI xil so‘rov: biri navbat, ikkinchisi barcha holat', async () => {
    const { svc, shifts } = makeService();
    await svc.evening(ACCOUNT, NOW);
    expect(shifts.queue).toHaveBeenCalledTimes(2);
    const withStates = shifts.queue.mock.calls.filter(
      (c) => (c[1] as { states?: unknown[] }).states !== undefined,
    );
    expect(withStates).toHaveLength(1);
  });

  it('ochiq navbat elementlari + eskirganlar konteksti', async () => {
    const { svc } = makeService({
      queueList: async () => ({ count: 6, staleCount: 2, rows: [] }),
    });
    const res = await svc.evening(ACCOUNT, NOW);
    const b = block(res.blocks, 'open_items');
    expect(b.count).toBe(6);
    expect(b.attention).toBe(true);
    expect(b.context.stale).toBe(2);
  });
});

describe('MK19 — Telegram yuborish (dublikatsiz)', () => {
  it('birinchi yuborish mavjud outbox navbatiga tushadi', async () => {
    const { svc, telegram } = makeService();
    const res = await svc.sendDigest(ACCOUNT, 'morning', { now: NOW });
    expect(res.sent).toBe(true);
    expect(res.skipped).toBeNull();
    expect(res.outboxId).toBe('outbox-1');
    expect(res.tag).toBe('#brifing_2026-08-10');

    const [, payload] = telegram.send.mock.calls[0] as [string, { chatId: string; text: string }];
    expect(payload.chatId).toBe('-100500');
    expect(payload.text).toContain('#brifing_2026-08-10');
  });

  it('🔴 shu kunning digesti navbatda/yuborilgan bo‘lsa IKKINCHISI ketmaydi', async () => {
    for (const status of ['pending', 'sending', 'sent']) {
      const { svc, telegram } = makeService({ outboxRows: [{ status }] });
      const res = await svc.sendDigest(ACCOUNT, 'morning', { now: NOW });
      expect(res.sent).toBe(false);
      expect(res.skipped).toBe('duplicate');
      expect(telegram.send).not.toHaveBeenCalled();
    }
  });

  it('yetkazilmagan (`dead`) xabar QAYTA yuborishga to‘sqinlik qilmaydi', async () => {
    const { svc, telegram } = makeService({ outboxRows: [{ status: 'dead' }] });
    const res = await svc.sendDigest(ACCOUNT, 'morning', { now: NOW });
    expect(res.sent).toBe(true);
    expect(telegram.send).toHaveBeenCalledTimes(1);
  });

  it('ertalabki digest kechki digestni BLOKLAMAYDI (yorliqlar kesishmaydi)', async () => {
    const { svc, prisma, telegram } = makeService();
    await svc.sendDigest(ACCOUNT, 'evening', { now: NOW });
    const where = prisma.client.telegramOutbox.findMany.mock.calls[0][0].where;
    expect(where.text.contains).toBe('#yakun_2026-08-10');
    expect(telegram.send).toHaveBeenCalledTimes(1);
  });

  it('chat sozlanmagan bo‘lsa ANIQ xato — soxta «yuborildi» yo‘q', async () => {
    const { svc, telegram } = makeService({ defaultChatId: null });
    await expect(svc.sendDigest(ACCOUNT, 'morning', { now: NOW })).rejects.toThrow(/chat/i);
    expect(telegram.send).not.toHaveBeenCalled();
  });

  it('so‘rovdagi `chatId` sukut sozlamasini yengadi', async () => {
    const { svc, telegram } = makeService();
    const res = await svc.sendDigest(ACCOUNT, 'morning', { now: NOW, chatId: '-100777' });
    expect(res.chatId).toBe('-100777');
    const [, payload] = telegram.send.mock.calls[0] as [string, { chatId: string }];
    expect(payload.chatId).toBe('-100777');
  });
});

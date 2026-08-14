import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CashierSessionService } from './cashier-session.service.js';

/**
 * F5 (POS redizayn) — `GET /cashier-sessions/:id/unresolved`.
 *
 * Smena yopilishini bloklovchi cheklar endi 400-xabar MATNI emas, STRUKTURA
 * bo'lib ham olinadi: POS «Smena» ekrani ro'yxatni kartalar qilib chizadi va
 * har chekka TO'LASH/BEKOR tugmasi qo'yadi. Tanlov-mezon `close()` bilan
 * AYNAN bitta — ikkalasi bitta yordamchidan o'qiydi, aks holda FSM'ga yangi
 * oraliq holat qo'shilgan kuni ro'yxat bilan to'siq bir-biridan ajralib
 * ketardi (ro'yxat bo'sh-u, yopish 400 berardi).
 */

const SRC = readFileSync(join(import.meta.dirname, 'cashier-session.service.ts'), 'utf8');

const ACC = 'acc-1';
const SESSION = '22222222-2222-4222-8222-222222222222';
const OTHER_SESSION = '33333333-3333-4333-8333-333333333333';

type Row = Record<string, unknown>;

interface Fixture {
  /** Sessiya holati — mezon holatga QARAMAYDI (yopiqda ro'yxat tabiiy bo'sh). */
  state?: 'open' | 'closed';
  sales?: Row[];
}

/**
 * Prisma dublyori — `where` haqiqiy qatorlar ustida baholanadi (modul
 * konvensiyasi: `z-report-frozen.test.ts` naqshi, bu yerda `orderBy` ham
 * bor, chunki tartib xulqning bir qismi — eng eski chek birinchi karta).
 */
function makeClient(f: Fixture = {}) {
  const session: Row = { id: SESSION, accountId: ACC, state: f.state ?? 'open' };
  const rows = f.sales ?? [];
  const client = {
    cashierSession: {
      findFirst: vi.fn(async (args: { where: Row }) =>
        args.where.id === SESSION && args.where.accountId === ACC ? { ...session } : null,
      ),
    },
    retailSale: {
      findMany: vi.fn(async (args: { where: Row; orderBy?: Row; select?: Row }) => {
        const where = args.where;
        const states = (where.state as { in: string[] }).in;
        const hit = rows.filter(
          (r) =>
            r.accountId === where.accountId &&
            r.sessionId === where.sessionId &&
            states.includes(r.state as string),
        );
        if ((args.orderBy as Row | undefined)?.createdAt === 'asc') {
          hit.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        }
        return hit.map((r) => ({
          id: r.id,
          name: r.name,
          state: r.state,
          sumMinor: r.sumMinor,
        }));
      }),
    },
  };
  return client;
}

const svcOf = (client: unknown) => new CashierSessionService({ client } as never, {} as never);

function sale(over: Row = {}): Row {
  return {
    id: 'sale-1',
    accountId: ACC,
    sessionId: SESSION,
    state: 'draft',
    name: 'ТРН-1',
    sumMinor: 100_000n,
    createdAt: '2026-08-14T08:00:00Z',
    ...over,
  };
}

describe('unresolved — tanlov mezoni', () => {
  it('draft, picking va ready qaytadi; posted/cancelled QAYTMAYDI', async () => {
    const client = makeClient({
      sales: [
        sale({ id: 's-d', name: 'ТРН-1', state: 'draft' }),
        sale({ id: 's-p', name: 'ТРН-2', state: 'picking', createdAt: '2026-08-14T08:01:00Z' }),
        sale({ id: 's-r', name: 'ТРН-3', state: 'ready', createdAt: '2026-08-14T08:02:00Z' }),
        sale({ id: 's-x', name: 'ТРН-4', state: 'posted', createdAt: '2026-08-14T08:03:00Z' }),
        sale({ id: 's-c', name: 'ТРН-5', state: 'cancelled', createdAt: '2026-08-14T08:04:00Z' }),
      ],
    });
    const out = await svcOf(client).unresolvedSales(ACC, SESSION);
    expect(out.sales.map((s: Row) => s.state)).toEqual(['draft', 'picking', 'ready']);
  });

  it('javob shakli: id · name · state · sumMinor (POS kartasi shunga quriladi)', async () => {
    const client = makeClient({
      sales: [sale({ id: 's-r', name: 'ТРН-7', state: 'ready', sumMinor: 8_430_000n })],
    });
    const out = await svcOf(client).unresolvedSales(ACC, SESSION);
    expect(out.sales).toEqual([{ id: 's-r', name: 'ТРН-7', state: 'ready', sumMinor: 8_430_000n }]);
  });

  it('boshqa sessiya cheki QAYTMAYDI', async () => {
    const client = makeClient({
      sales: [
        sale({ id: 's-1', state: 'ready' }),
        sale({ id: 's-2', sessionId: OTHER_SESSION, state: 'ready' }),
      ],
    });
    const out = await svcOf(client).unresolvedSales(ACC, SESSION);
    expect(out.sales.map((s: Row) => s.id)).toEqual(['s-1']);
  });

  it('eng eski chek birinchi (createdAt o‘sish tartibi — close xabari bilan bir xil)', async () => {
    const client = makeClient({
      sales: [
        sale({ id: 's-new', name: 'ТРН-9', createdAt: '2026-08-14T12:00:00Z' }),
        sale({ id: 's-old', name: 'ТРН-2', createdAt: '2026-08-14T07:00:00Z' }),
      ],
    });
    const out = await svcOf(client).unresolvedSales(ACC, SESSION);
    expect(out.sales.map((s: Row) => s.id)).toEqual(['s-old', 's-new']);
  });

  it('yopiq sessiyada bo‘sh ro‘yxat (yakunlanmagan chek yopiq smenada qolmaydi)', async () => {
    const client = makeClient({
      state: 'closed',
      sales: [sale({ id: 's-x', state: 'posted' })],
    });
    const out = await svcOf(client).unresolvedSales(ACC, SESSION);
    expect(out.sales).toEqual([]);
  });

  it('begona akkaunt sessiyasi — 404 (id taxmin qilib ma‘lumot olib bo‘lmaydi)', async () => {
    const client = makeClient();
    await expect(svcOf(client).unresolvedSales('acc-2', SESSION)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('unresolved — manba-qulf: mezon close() bilan YAGONA', () => {
  /**
   * `allowedFrom('cancel')` servis faylida AYNAN BIR marta — yagona yordamchi
   * ichida. Ikki marta paydo bo'lsa, kimdir mezonni nusxalagan: FSM'ga yangi
   * holat qo'shilganda ro'yxat bilan to'siq ajralib ketish xavfi qaytadi.
   */
  it("`allowedFrom('cancel')` faylda bir marta (yordamchida)", () => {
    expect(SRC.match(/allowedFrom\('cancel'\)/g)).toHaveLength(1);
  });

  it('yordamchini close() ham, endpoint ham chaqiradi', () => {
    // Ta'rif (`findUnresolvedSales(`) + kamida 2 chaqiruv.
    const calls = SRC.match(/findUnresolvedSales\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });
});

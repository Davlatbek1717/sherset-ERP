import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RetailSaleService } from './retail-sale.service.js';

/**
 * QA 2026-08-10 — update() POSTED chekni qayta yoza olmasin.
 *
 * update() holatni faqat tranzaksiya TASHQARISIDAGI (eskirgan) o'qishda
 * tekshirardi; tx ichidagi optimistic-lock WHERE esa {id, accountId, version}
 * — holat filtri YO'Q. post() flip'i versionni OSHIRMAYDI, ya'ni chek
 * o'qilgan va saqlangan on orasida post bo'lsa, version hamon mos keladi va
 * POSTED (pul olingan, stok yechilgan) chekning summasi/pozitsiyalari qayta
 * yozilardi — hujjat endi kassadagi pulga mos kelmay qoladi.
 *
 * Fix: tx ichidagi versioned update WHERE'ga `state: 'draft'` qo'shiladi.
 * Filtr mos kelmasa Prisma P2025 otadi → mapVersionedUpdateError uni 409
 * (OptimisticLockException) qiladi — mavjud optimistic-lock yo'li bilan bir
 * uslub.
 *
 * Dublyor Postgres semantikasini modellaydi: findFirst — DETACHED (eskirgan)
 * nusxa (chek hali 'draft' KO'RINADI), tx.update esa WHERE'ni JONLI qator
 * ustida baholaydi va mos kelmasa P2025 otadi.
 */

const ACCOUNT = 'acc-1';
const SALE_ID = 'sale-1';

type Row = Record<string, unknown>;

function p2025() {
  return Object.assign(new Error('Record to update not found.'), {
    code: 'P2025',
    meta: { cause: 'Record to update not found.' },
  });
}

function makeHarness(opts: { liveState?: string } = {}) {
  // JONLI qator — poyga oynasida post() uni flip qilgan bo'lishi mumkin
  // (version o'zgarmaydi!).
  const liveRow: Row = {
    id: SALE_ID,
    accountId: ACCOUNT,
    state: opts.liveState ?? 'draft',
    version: 1,
  };

  const tx = {
    retailSalePosition: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    retailSale: {
      update: vi.fn(async (args: { where: Row; data: Row }) => {
        const w = args.where;
        const miss =
          w.id !== liveRow.id ||
          w.accountId !== liveRow.accountId ||
          (w.version !== undefined && w.version !== liveRow.version) ||
          (w.state !== undefined && w.state !== liveRow.state);
        if (miss) throw p2025();
        liveRow.version = (liveRow.version as number) + 1;
        if (args.data.description !== undefined) liveRow.description = args.data.description;
        return { ...liveRow, positions: [] };
      }),
    },
  };

  const client = {
    retailSale: {
      // DETACHED nusxa: tashqi holat tekshiruvi doim 'draft' ko'radi —
      // aynan poyga oynasi.
      findFirst: vi.fn(async () => ({ ...liveRow, state: 'draft' })),
    },
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const svc = new RetailSaleService(
    { client } as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    // F8: CustomerOrderService — zakazsiz chekda chaqirilmaydi.
    { applyPayment: async () => {} } as never,
  );
  return { svc, tx, liveRow };
}

describe('update() — POSTED chek tx ichida ham qulflanadi', () => {
  it('o`qish bilan saqlash orasida chek POSTED bo`lsa → 409, qayta yozilmaydi', async () => {
    const { svc, liveRow } = makeHarness({ liveState: 'posted' });

    await expect(
      svc.update(ACCOUNT, SALE_ID, { description: 'hujum', version: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);

    // POSTED chek matni ham, versiyasi ham o'zgarmagan.
    expect(liveRow.description).toBeUndefined();
    expect(liveRow.version).toBe(1);
  });

  it('draft chek odatdagidek saqlanadi va WHERE holat filtrini o`z ichiga oladi', async () => {
    const { svc, tx } = makeHarness();

    await svc.update(ACCOUNT, SALE_ID, { description: 'ok', version: 1 });

    expect(tx.retailSale.update).toHaveBeenCalledTimes(1);
    expect(tx.retailSale.update.mock.calls[0]?.[0]?.where).toMatchObject({
      id: SALE_ID,
      accountId: ACCOUNT,
      version: 1,
      state: 'draft',
    });
  });
});

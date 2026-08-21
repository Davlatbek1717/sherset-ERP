import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RetailSaleService } from './retail-sale.service.js';

/**
 * CHEK IZOHI (2026-08-19, egasi: «kassada har bir chekka izoh ham qo'shish
 * funksiyasini qilish kerak»).
 *
 * Nega ALOHIDA yo'l: `update()` faqat `draft` chekni qabul qiladi — bu ataylab
 * qo'yilgan qulf (pul olingan va ombor yechilgan chekni qayta yozishdan
 * saqlaydi, `retail-sale-update-state-guard.test.ts`). Izoh esa summa/ombor/
 * holat/to'lovga UMUMAN tegmaydigan metama'lumot, ya'ni uni yozish uchun o'sha
 * qulfni yumshatish EMAS, faqat shu maydonni yozadigan tor metod kerak.
 *
 * Qulflanadigan shartnomalar:
 *  1. TO'LANGAN chekda ham izoh yoziladi (asosiy talab);
 *  2. `data` da FAQAT `description` bo'ladi — summa/holat qo'shilib ketmaydi;
 *  3. versiya eskirgan bo'lsa 409 (jimgina ustiga yozilmaydi);
 *  4. har o'zgarish `AuditLog` ga tushadi: eski matn → yangi matn;
 *  5. matn o'zgarmagan bo'lsa YOZUV ham, jurnal qatori ham YO'Q;
 *  6. bo'sh/probelli matn `null` bo'ladi — chekda bo'sh «Izoh:» qolmasin;
 *  7. o'chirilgan chek topilmaydi (404).
 */

const ACCOUNT = 'acc-1';
const SALE_ID = 'sale-1';
const USER = 'user-1';

type Row = Record<string, unknown>;

function p2025() {
  return Object.assign(new Error('Record to update not found.'), {
    code: 'P2025',
    meta: { cause: 'Record to update not found.' },
  });
}

function makeHarness(opts: { state?: string; description?: string | null; missing?: true } = {}) {
  const liveRow: Row = {
    id: SALE_ID,
    accountId: ACCOUNT,
    name: 'CHEK-1',
    state: opts.state ?? 'posted',
    version: 3,
    description: opts.description ?? null,
    deletedAt: null,
  };
  const auditRows: Row[] = [];

  const client = {
    retailSale: {
      findFirst: vi.fn(async () => (opts.missing ? null : { ...liveRow })),
      update: vi.fn(async (args: { where: Row; data: Row }) => {
        const w = args.where;
        if (
          w.id !== liveRow.id ||
          w.accountId !== liveRow.accountId ||
          w.version !== liveRow.version
        ) {
          throw p2025();
        }
        liveRow.description = args.data.description as string | null;
        liveRow.version = (liveRow.version as number) + 1;
        return { ...liveRow };
      }),
    },
    auditLog: {
      create: vi.fn(async (args: { data: Row }) => {
        auditRows.push(args.data);
        return args.data;
      }),
    },
  };

  const svc = new RetailSaleService(
    { client } as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    { applyPayment: async () => {} } as never,
  );
  return { svc, client, liveRow, auditRows };
}

describe('updateComment() — chek izohi', () => {
  it('🔴 TO`LANGAN chekda ham izoh saqlanadi', async () => {
    const h = makeHarness({ state: 'posted' });

    await h.svc.updateComment(ACCOUNT, USER, SALE_ID, {
      version: 3,
      description: 'Ertaga olib ketadi',
    });

    expect(h.liveRow.description).toBe('Ertaga olib ketadi');
  });

  it('FAQAT `description` yoziladi — boshqa maydon so`rovga qo`shilmaydi', async () => {
    const h = makeHarness();

    await h.svc.updateComment(ACCOUNT, USER, SALE_ID, { version: 3, description: 'izoh' });

    const data = h.client.retailSale.update.mock.calls[0]?.[0]?.data as Row;
    expect(Object.keys(data)).toEqual(['description']);
  });

  it('holat filtri YO`Q — «yig`ilmoqda» chekda ham ishlaydi', async () => {
    const h = makeHarness({ state: 'picking' });

    await h.svc.updateComment(ACCOUNT, USER, SALE_ID, { version: 3, description: 'shoshilinch' });

    expect(h.liveRow.description).toBe('shoshilinch');
  });

  it('🔴 eskirgan versiya ⇒ 409, matn o`zgarmaydi', async () => {
    const h = makeHarness({ description: 'eski' });

    await expect(
      h.svc.updateComment(ACCOUNT, USER, SALE_ID, { version: 1, description: 'yangi' }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(h.liveRow.description).toBe('eski');
    expect(h.auditRows).toHaveLength(0);
  });

  it('🔴 o`zgarish jurnalga tushadi: ESKI matn → YANGI matn', async () => {
    const h = makeHarness({ description: 'eski matn' });

    await h.svc.updateComment(ACCOUNT, USER, SALE_ID, { version: 3, description: 'yangi matn' });

    expect(h.auditRows).toHaveLength(1);
    expect(h.auditRows[0]).toMatchObject({
      accountId: ACCOUNT,
      userId: USER,
      entity: 'retailsale',
      entityId: SALE_ID,
      action: 'comment_change',
      fieldChanges: { description: { before: 'eski matn', after: 'yangi matn' } },
    });
  });

  it('matn O`ZGARMAGAN bo`lsa — na yozuv, na jurnal qatori', async () => {
    const h = makeHarness({ description: 'bir xil' });

    await h.svc.updateComment(ACCOUNT, USER, SALE_ID, { version: 3, description: 'bir xil' });

    expect(h.client.retailSale.update).not.toHaveBeenCalled();
    expect(h.auditRows).toHaveLength(0);
  });

  it('bo`sh/probelli matn `null` bo`ladi (chekda bo`sh «Izoh:» qolmasin)', async () => {
    const h = makeHarness({ description: 'bor edi' });

    await h.svc.updateComment(ACCOUNT, USER, SALE_ID, { version: 3, description: '   ' });

    expect(h.liveRow.description).toBeNull();
    expect(h.auditRows[0]).toMatchObject({
      fieldChanges: { description: { before: 'bor edi', after: null } },
    });
  });

  it('o`chirilgan/topilmagan chek ⇒ 404', async () => {
    const h = makeHarness({ missing: true });

    await expect(
      h.svc.updateComment(ACCOUNT, USER, SALE_ID, { version: 3, description: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

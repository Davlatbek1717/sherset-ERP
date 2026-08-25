import { describe, expect, it } from 'vitest';
import {
  type BalanceDocClient,
  docKey,
  resolveBalanceDocs,
} from './counterparty-balance-doc-resolver.js';
import { BALANCE_DOC_TYPE } from './counterparty-balance-doc-types.js';

/**
 * A1 (2026-08-25) — `customerPrepay` yorlig'i AYNAN `RetailDrawerCashIn`
 * jadvalidan o'qiladi.
 *
 * NEGA test: yangi tur mavjud `cashIn` (ПКО hujjati) bilan bitta harfgacha
 * yaqin, va ikkovi BOSHQA-BOSHQA jadval. Chalkashsa har avans qatori
 * akt-sverkada va POS tarixida RAQAMSIZ («—») chiqardi — saldo to'g'ri,
 * yorliq esa jimgina yo'q. Bu yerda ikkala tomon ham tekshiriladi:
 * avans kirim jadvalidan, vozvrat puli chiqim jadvalidan.
 */

const ACC = 'acc-1';
const D = (id: string, name: string) => ({ id, name, moment: new Date('2026-08-25T10:00:00Z') });

function makeClient(): { client: BalanceDocClient; asked: Record<string, string[]> } {
  const asked: Record<string, string[]> = {};
  const rows: Record<string, Array<{ id: string; name: string; moment: Date }>> = {
    retailDrawerCashIn: [D('in-1', 'АВ-2026-00001')],
    retailSale: [D('sale-1', 'ЧК-2026-00123')],
    retailDrawerCashOut: [D('out-1', 'ВВ-2026-00007')],
    cashIn: [D('pko-1', 'ПКО-2026-00042')],
  };
  const delegate = (key: string) => ({
    findMany: async ({ where }: { where: { accountId: string; id: { in: string[] } } }) => {
      asked[key] = where.id.in;
      expect(where.accountId).toBe(ACC);
      return (rows[key] ?? []).filter((r) => where.id.in.includes(r.id));
    },
  });

  // Resolver faqat kerakli delegatlarga tegadi — qolganlari `never` bilan
  // to'ldiriladi va tegilsa test yiqiladi (chaqiruv `undefined` da portlaydi).
  const client = {
    retailDrawerCashIn: delegate('retailDrawerCashIn'),
    retailDrawerCashOut: delegate('retailDrawerCashOut'),
    cashIn: delegate('cashIn'),
    retailSale: delegate('retailSale'),
  } as unknown as BalanceDocClient;
  return { client, asked };
}

describe('resolveBalanceDocs — A1 `customerPrepay`', () => {
  it('avans qatori АВ- raqami bilan `RetailDrawerCashIn` dan keladi', async () => {
    const { client, asked } = makeClient();
    const out = await resolveBalanceDocs(client, ACC, [
      { docType: BALANCE_DOC_TYPE.customerPrepay, docId: 'in-1' },
    ]);
    expect(out.get(docKey('customerPrepay', 'in-1'))).toMatchObject({
      number: 'АВ-2026-00001',
      contractId: null,
    });
    expect(asked.retailDrawerCashIn).toEqual(['in-1']);
    // 🔴 ПКО jadvaliga UMUMAN tegilmadi — turlar chalkashmagan.
    expect(asked.cashIn).toBeUndefined();
  });

  it('avans va vozvrat puli — BOSHQA-BOSHQA jadval, ikkalasi birga ishlaydi', async () => {
    const { client, asked } = makeClient();
    const out = await resolveBalanceDocs(client, ACC, [
      { docType: BALANCE_DOC_TYPE.customerPrepay, docId: 'in-1' },
      { docType: BALANCE_DOC_TYPE.returnPayout, docId: 'out-1' },
    ]);
    expect(out.get(docKey('customerPrepay', 'in-1'))?.number).toBe('АВ-2026-00001');
    expect(out.get(docKey('returnPayout', 'out-1'))?.number).toBe('ВВ-2026-00007');
    expect(asked.retailDrawerCashIn).toEqual(['in-1']);
    expect(asked.retailDrawerCashOut).toEqual(['out-1']);
  });

  it('hujjat topilmasa qator YO`QOLMAYDI — resolverda yozuv bo`lmaydi (raqamsiz chiqadi)', async () => {
    const { client } = makeClient();
    const out = await resolveBalanceDocs(client, ACC, [
      { docType: BALANCE_DOC_TYPE.customerPrepay, docId: 'yo`q-id' },
    ]);
    expect(out.has(docKey('customerPrepay', 'yo`q-id'))).toBe(false);
  });

  it('avans qatori bo`lmagan so`rovda kirim jadvaliga tegilmaydi', async () => {
    const { client, asked } = makeClient();
    await resolveBalanceDocs(client, ACC, [
      { docType: BALANCE_DOC_TYPE.returnPayout, docId: 'out-1' },
    ]);
    expect(asked.retailDrawerCashIn).toBeUndefined();
  });

  /**
   * A2 (2026-08-25) — `salePrepay` (avansdan to'lov) yorlig'i CHEK
   * jadvalidan keladi, `RetailDrawerCashIn` dan EMAS.
   *
   * A1 dagi chalkashlik xavfining ko'zgusi: ikkala tur ham «avans» so'zini
   * o'z ichiga oladi, lekin biri kassa hujjati (АВ-), ikkinchisi chek (ЧК-).
   * Chalkashsa POS tarixida avans sarfi raqamsiz chiqardi.
   */
  it('A2: avansdan to`lov qatori CHEK raqami bilan `RetailSale` dan keladi', async () => {
    const { client, asked } = makeClient();
    const out = await resolveBalanceDocs(client, ACC, [
      { docType: BALANCE_DOC_TYPE.salePrepay, docId: 'sale-1' },
    ]);
    expect(out.get(docKey('salePrepay', 'sale-1'))).toMatchObject({
      number: 'ЧК-2026-00123',
      contractId: null,
    });
    expect(asked.retailSale).toEqual(['sale-1']);
    // 🔴 Kassa kirim hujjati jadvaliga UMUMAN tegilmadi.
    expect(asked.retailDrawerCashIn).toBeUndefined();
  });

  it('A2: `retailsale` (qarz) va `salePrepay` (avans) BITTA so`rovda keladi', async () => {
    // Ikkala tur ham AYNI jadvaldan o'qiladi — resolver ularni bitta
    // `findMany` bilan yig'adi, lekin kalitlarni ALOHIDA yozadi.
    const { client, asked } = makeClient();
    const out = await resolveBalanceDocs(client, ACC, [
      { docType: BALANCE_DOC_TYPE.retailsale, docId: 'sale-1' },
      { docType: BALANCE_DOC_TYPE.salePrepay, docId: 'sale-1' },
    ]);
    expect(out.get(docKey('retailsale', 'sale-1'))?.number).toBe('ЧК-2026-00123');
    expect(out.get(docKey('salePrepay', 'sale-1'))?.number).toBe('ЧК-2026-00123');
    expect(asked.retailSale).toEqual(['sale-1']);
  });
});

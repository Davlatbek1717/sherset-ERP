import { describe, expect, it, vi } from 'vitest';
import { StoreAddressService } from './store-address.service.js';

/**
 * TZ v3 §2.1 vs §2.2.3 — sanashning IKKI semantikasi bitta endpointda:
 *
 *   · oddiy rejim (`mode:'set'`, default) — MUTLAQ: yacheyka qoldig'i aynan
 *     kiritilgan songa tenglashtiriladi (inventarizatsiya);
 *   · «Umumiy sanash» (`mode:'add'`) — QO'SHILADI: 26 + 100 = 126, avto-
 *     «Оприходование» AYNAN qo'shilgan miqdorga (100) yoziladi, 126 ga emas.
 *
 * Delta serverda hisoblanadi (FE «hozirgi» ni o'qib mutlaq qiymat yubormaydi) —
 * ikki omborchi bir vaqtda sanaganda yo'qolgan-yangilanish bo'lmasin.
 */
interface Captured {
  enters: Array<{ quantity: string; cellId: string | undefined }>;
  losses: Array<{ quantity: string; cellId: string | undefined }>;
}

function makeService(currentQty: number | null) {
  const captured: Captured = { enters: [], losses: [] };
  const client = {
    store: { findFirst: vi.fn(async () => ({ id: 'store-1' })) },
    storeCell: { findFirst: vi.fn(async () => ({ id: 'cell-1', name: '01-01-01-01' })) },
    product: { findFirst: vi.fn(async () => ({ id: 'prod-1', buyPrice: 1000n })) },
    organization: { findFirst: vi.fn(async () => ({ id: 'org-1' })) },
    stockByCell: {
      findFirst: vi.fn(async () => (currentQty === null ? null : { qty: currentQty })),
      upsert: vi.fn(async () => undefined),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  const enters = {
    create: vi.fn(
      async (_a: string, _u: string, doc: { positions: Array<Record<string, unknown>> }) => {
        const p = doc.positions[0] as { quantity: string; cellId?: string };
        captured.enters.push({ quantity: p.quantity, cellId: p.cellId });
        return { name: 'ENT-1' };
      },
    ),
  };
  const losses = {
    create: vi.fn(
      async (_a: string, _u: string, doc: { positions: Array<Record<string, unknown>> }) => {
        const p = doc.positions[0] as { quantity: string; cellId?: string };
        captured.losses.push({ quantity: p.quantity, cellId: p.cellId });
        return { name: 'LOS-1' };
      },
    ),
  };
  const svc = new StoreAddressService({ client } as never, enters as never, losses as never);
  return { svc, captured, client };
}

const CALL = { assortmentId: '11111111-1111-4111-8111-111111111111' };

describe('setCellStock — sanash semantikasi', () => {
  it('mode berilmasa MUTLAQ yozadi (eski xulq saqlanadi)', async () => {
    const { svc, captured } = makeService(26);
    const res = await svc.setCellStock(
      'acc-1',
      'store-1',
      'cell-1',
      { ...CALL, qty: '100' },
      'user-1',
    );
    // 26 → 100: farq 74 ta kirim
    expect(captured.enters).toEqual([{ quantity: '74', cellId: 'cell-1' }]);
    expect(res.qty).toBe('100');
    expect(res.previousQty).toBe('26');
  });

  it("mode:'add' — QO'SHADI va hujjat AYNAN qo'shilgan miqdorga yoziladi", async () => {
    const { svc, captured } = makeService(26);
    const res = await svc.setCellStock(
      'acc-1',
      'store-1',
      'cell-1',
      { ...CALL, qty: '100', mode: 'add' },
      'user-1',
    );
    expect(captured.enters).toEqual([{ quantity: '100', cellId: 'cell-1' }]);
    expect(res.qty).toBe('126');
    expect(res.previousQty).toBe('26');
  });

  it("mode:'add' bo'sh yacheykada ham ishlaydi (0 + 100 = 100)", async () => {
    const { svc, captured } = makeService(null);
    const res = await svc.setCellStock(
      'acc-1',
      'store-1',
      'cell-1',
      { ...CALL, qty: '100', mode: 'add' },
      'user-1',
    );
    expect(captured.enters).toEqual([{ quantity: '100', cellId: 'cell-1' }]);
    expect(res.qty).toBe('100');
  });

  it("mode:'set' kamaytirsa Списание yoziladi (kirim emas)", async () => {
    const { svc, captured } = makeService(26);
    await svc.setCellStock('acc-1', 'store-1', 'cell-1', { ...CALL, qty: '10' }, 'user-1');
    expect(captured.losses).toEqual([{ quantity: '16', cellId: 'cell-1' }]);
    expect(captured.enters).toEqual([]);
  });

  it("mode:'add' + qty 0 — hech qanday hujjat yozilmaydi", async () => {
    const { svc, captured } = makeService(26);
    const res = await svc.setCellStock(
      'acc-1',
      'store-1',
      'cell-1',
      { ...CALL, qty: '0', mode: 'add' },
      'user-1',
    );
    expect(captured.enters).toEqual([]);
    expect(captured.losses).toEqual([]);
    expect(res.qty).toBe('26');
  });

  /**
   * DEGENERAT YO'L (hujjat yozilmaydi: `userId` yo'q ⇒ `willPostDoc=false`) —
   * bu shoxda per-cell qoldiq TO'G'RIDAN-TO'G'RI yoziladi. `add` rejimida u ham
   * YAKUNIY qiymatni (26+100=126) yozishi shart; kiritilgan sonni (100) yozsa
   * qo'shish jimgina mutlaq yozuvga aylanadi va qoldiq kamayib ketadi.
   */
  it("mode:'add' hujjatsiz yo'lda ham YAKUNIY qoldiqni yozadi (26+100=126)", async () => {
    const { svc, captured, client } = makeService(26);
    const res = await svc.setCellStock('acc-1', 'store-1', 'cell-1', {
      ...CALL,
      qty: '100',
      mode: 'add',
    });
    expect(captured.enters).toEqual([]);
    expect(client.stockByCell.upsert).toHaveBeenCalledTimes(1);
    const args = client.stockByCell.upsert.mock.calls[0]?.[0] as unknown as {
      create: { qty: string };
      update: { qty: string };
    };
    expect(args.create.qty).toBe('126');
    expect(args.update.qty).toBe('126');
    expect(res.qty).toBe('126');
  });

  /**
   * Degenerat yo'lning nol-shoxi `finalQty` ga qarab qaror qilishi kerak:
   * `set` + qty 0 (hujjatsiz) ⇒ qator O'CHADI. `add` + qty 0 esa yakuniy
   * qoldiqni (26) saqlab qoladi — yuqoridagi test buni ushlaydi.
   */
  it("mode:'set' + qty 0 hujjatsiz yo'lda qatorni o'chiradi", async () => {
    const { svc, client } = makeService(26);
    const res = await svc.setCellStock('acc-1', 'store-1', 'cell-1', { ...CALL, qty: '0' });
    expect(client.stockByCell.deleteMany).toHaveBeenCalledTimes(1);
    expect(client.stockByCell.upsert).not.toHaveBeenCalled();
    expect(res.qty).toBe('0');
  });
});

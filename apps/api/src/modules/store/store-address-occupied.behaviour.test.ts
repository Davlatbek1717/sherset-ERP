import { describe, expect, it, vi } from 'vitest';
import { StoreAddressService } from './store-address.service.js';

/**
 * `getAddressStorage` occupied-flag XULQ testi.
 *
 * REGRESSIYA (2026-08-03, egasi topdi): omborchi yacheykaga tovarni biriktiradi
 * (`attributes.__yacheyka` = yacheyka nomi), lekin hali sanamaydi ⇒ `StockByCell`
 * qatori yo'q. Ro'yxat (`getAddressStorage`) yacheykani «Свободна» ko'rsatardi,
 * biroq detal «Ko'rish» (`getCellStock`) o'sha tovarni ko'rsatardi — ikki yuza
 * bir-biriga zid edi. Fix: ikkalasi ham biriktirilgan tovarni «Занята» sanaydi.
 *
 * DB kerak emas — soxta prisma client (`$queryRaw` biriktirilgan yacheyka
 * nomlarini, `stockByCell.findMany` sanoq qoldiqlarini qaytaradi).
 */

interface FakeOpts {
  cells: Array<{ id: string; name: string; zoneId: string | null; sortOrder: number }>;
  /** qty>0 sanoq qoldig'i bo'lgan cellId'lar. */
  stockedCellIds?: string[];
  /** `__yacheyka` biriktirilgan tovarlar joylashgan yacheyka NOMLARI (DISTINCT). */
  boundCellNames?: string[];
}

function makeService(opts: FakeOpts): StoreAddressService {
  const client = {
    store: { findFirst: vi.fn(async () => ({ id: 'store-1' })) },
    storeZone: { findMany: vi.fn(async () => [{ id: 'zone-1', name: 'Zona A', sortOrder: 0 }]) },
    storeCell: {
      findMany: vi.fn(async () =>
        opts.cells.map((c) => ({ ...c, createdAt: new Date(0), storeId: 'store-1' })),
      ),
    },
    stockByCell: {
      findMany: vi.fn(async (args: { distinct?: string[] }) => {
        // 1-chaqiruv: distinct occupied cellIds (qty>0). 2-chaqiruv (wantProduct)
        // — bu testda ishlatilmaydi, bo'sh massiv.
        if (args?.distinct) return (opts.stockedCellIds ?? []).map((cellId) => ({ cellId }));
        return [];
      }),
    },
    $queryRaw: vi.fn(async () => (opts.boundCellNames ?? []).map((name) => ({ name }))),
  };
  return new StoreAddressService({ client } as never, {} as never, {} as never);
}

describe('getAddressStorage — occupied flag', () => {
  it('marks a cell OCCUPIED when a product is bound to it even with no counted stock', async () => {
    const svc = makeService({
      cells: [
        { id: 'cell-A', name: '01-01-01-01', zoneId: 'zone-1', sortOrder: 0 },
        { id: 'cell-B', name: '01-01-01-02', zoneId: 'zone-1', sortOrder: 1 },
      ],
      stockedCellIds: [], // hali hech narsa sanalmagan
      boundCellNames: ['01-01-01-01'], // cell-A ga tovar biriktirilgan
    });

    const res = await svc.getAddressStorage('acc-1', 'store-1');
    const byId = new Map(res.cells.map((c) => [c.id, c]));

    // Bug: cell-A «Свободна» ko'rinardi. Fix: biriktirilgan ⇒ «Занята».
    expect(byId.get('cell-A')?.occupied).toBe(true);
    expect(byId.get('cell-B')?.occupied).toBe(false);
    // Zona hisobi ham biriktirilgan yacheykani sanaydi.
    expect(res.zones[0]?.occupiedCount).toBe(1);
    expect(res.zones[0]?.freeCount).toBe(1);
  });

  it('still marks a cell OCCUPIED from counted stock (existing behaviour preserved)', async () => {
    const svc = makeService({
      cells: [{ id: 'cell-A', name: '01-01-01-01', zoneId: 'zone-1', sortOrder: 0 }],
      stockedCellIds: ['cell-A'],
      boundCellNames: [],
    });
    const res = await svc.getAddressStorage('acc-1', 'store-1');
    expect(res.cells[0]?.occupied).toBe(true);
  });

  it('leaves a cell FREE when neither counted nor bound', async () => {
    const svc = makeService({
      cells: [{ id: 'cell-A', name: '01-01-01-01', zoneId: 'zone-1', sortOrder: 0 }],
      stockedCellIds: [],
      boundCellNames: ['09-09-09-09'], // boshqa (mavjud bo'lmagan) yacheyka
    });
    const res = await svc.getAddressStorage('acc-1', 'store-1');
    expect(res.cells[0]?.occupied).toBe(false);
  });
});

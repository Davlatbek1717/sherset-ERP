import { describe, expect, it, vi } from 'vitest';
import type { CellStockRow, StockRow } from './cell-migration.js';
import type { CellMigrationPort } from './cell-migration.runner.js';
import { rollbackCellMigration, runCellMigration } from './cell-migration.runner.js';

/**
 * F019 — migratsiya ORKESTRATSIYASI (soxta port, DB yo'q).
 *
 * Rejaning «Testlar (TDD)» bandidan:
 *   (1) DRY hech nima yozmaydi va sonlarni to'g'ri beradi;
 *   (3) backfilldan keyin `Σ StockByCell == Stock`;
 *   (4) rollback holatni tiklaydi.
 *
 * Soxta port haqiqiy jadval semantikasini (unique nom, qator qo'shilishi)
 * saqlaydi, shuning uchun «DRY nima va'da qilsa, APPLY shuni yozadi» xossasi
 * shu yerda O'LCHANADI, taxmin qilinmaydi.
 */

const ACC = 'acc-1';
const STORE = 'store-1';

interface FakeState {
  zones: Array<{ id: string; storeId: string; name: string; sortOrder: number }>;
  cells: Array<{
    id: string;
    storeId: string;
    name: string;
    sortOrder: number;
    zoneId: string | null;
  }>;
  homeCodes: Array<{ productId: string; code: string }>;
  stocks: StockRow[];
  byCell: CellStockRow[];
  inUse: Set<string>;
}

function emptyState(): FakeState {
  return { zones: [], cells: [], homeCodes: [], stocks: [], byCell: [], inUse: new Set() };
}

/** Soxta port + har yozuv metodining chaqiruv sanog'i (DRY tekshiruvi uchun). */
function makePort(state: FakeState) {
  let seq = 0;
  const id = (p: string) => `${p}-${++seq}`;

  const port: CellMigrationPort = {
    loadZones: vi.fn(async () => state.zones.map((z) => ({ ...z }))),
    loadCells: vi.fn(async () => state.cells.map((c) => ({ ...c }))),
    loadProductHomeCodes: vi.fn(async () => state.homeCodes.map((h) => ({ ...h }))),
    loadStocks: vi.fn(async () => state.stocks.map((s) => ({ ...s }))),
    loadStockByCell: vi.fn(async () => state.byCell.map((r) => ({ ...r }))),

    createZones: vi.fn(async (_a, rows) => {
      const out = rows.map((r) => ({ id: id('zone'), storeId: r.storeId, name: r.name }));
      for (const [i, r] of rows.entries()) {
        state.zones.push({
          id: out[i]!.id,
          storeId: r.storeId,
          name: r.name,
          sortOrder: r.sortOrder,
        });
      }
      return out;
    }),
    createCells: vi.fn(async (_a, rows) => {
      const out = rows.map((r) => ({ id: id('cell'), storeId: r.storeId, name: r.name }));
      for (const [i, r] of rows.entries()) {
        state.cells.push({
          id: out[i]!.id,
          storeId: r.storeId,
          name: r.name,
          sortOrder: r.sortOrder,
          zoneId: r.zoneId,
        });
      }
      return out;
    }),
    applyBackfill: vi.fn(async (_a, writes) => {
      for (const w of writes) {
        const row = state.byCell.find(
          (r) =>
            r.storeId === w.storeId &&
            r.cellId === w.cellId &&
            r.assortmentKind === w.assortmentKind &&
            r.assortmentId === w.assortmentId,
        );
        if (row) row.qty = String(Number(row.qty) + Number(w.deltaQty));
        else {
          state.byCell.push({
            storeId: w.storeId,
            cellId: w.cellId,
            assortmentKind: w.assortmentKind,
            assortmentId: w.assortmentId,
            qty: w.deltaQty,
          });
        }
      }
    }),

    deleteStockByCell: vi.fn(async (_a, rows) => {
      for (const r of rows) {
        const i = state.byCell.findIndex(
          (x) =>
            x.storeId === r.storeId &&
            x.cellId === r.cellId &&
            x.assortmentKind === r.assortmentKind &&
            x.assortmentId === r.assortmentId,
        );
        if (i >= 0) state.byCell.splice(i, 1);
      }
    }),
    decrementStockByCell: vi.fn(async (_a, rows) => {
      for (const r of rows) {
        const row = state.byCell.find(
          (x) =>
            x.storeId === r.storeId &&
            x.cellId === r.cellId &&
            x.assortmentKind === r.assortmentKind &&
            x.assortmentId === r.assortmentId,
        );
        if (row) row.qty = String(Number(row.qty) - Number(r.qty));
      }
    }),
    deleteCells: vi.fn(async (_a, ids) => {
      state.cells = state.cells.filter((c) => !ids.includes(c.id));
    }),
    deleteZones: vi.fn(async (_a, ids) => {
      state.zones = state.zones.filter((z) => !ids.includes(z.id));
    }),
    cellsInUse: vi.fn(async (_a, ids) => new Set(ids.filter((i) => state.inUse.has(i)))),
    zoneCellCounts: vi.fn(
      async (_a, ids) =>
        new Map(ids.map((z) => [z, state.cells.filter((c) => c.zoneId === z).length])),
    ),
  };
  return port;
}

function seeded(): FakeState {
  const s = emptyState();
  s.homeCodes = [
    { productId: 'p1', code: '01-02-03-05' },
    { productId: 'p2', code: '01-02-03-06' },
    { productId: 'p3', code: 'buzuq kod' },
  ];
  s.stocks = [
    { storeId: STORE, assortmentKind: 'product', assortmentId: 'p1', qty: '10' },
    { storeId: STORE, assortmentKind: 'product', assortmentId: 'p2', qty: '2.5' },
    { storeId: STORE, assortmentKind: 'product', assortmentId: 'p3', qty: '7' },
    { storeId: STORE, assortmentKind: 'product', assortmentId: 'p4', qty: '4' },
  ];
  return s;
}

const opts = { accountId: ACC, defaultStoreId: STORE };

describe('runCellMigration — DRY', () => {
  it('hech narsa YOZMAYDI (har yozuv metodi 0 marta chaqiriladi)', async () => {
    const state = seeded();
    const port = makePort(state);

    await runCellMigration(port, { ...opts, apply: false });

    expect(port.createZones).not.toHaveBeenCalled();
    expect(port.createCells).not.toHaveBeenCalled();
    expect(port.applyBackfill).not.toHaveBeenCalled();
    expect(state.zones).toHaveLength(0);
    expect(state.cells).toHaveLength(0);
    expect(state.byCell).toHaveLength(0);
  });

  it("sonlarni to'g'ri beradi: 1 zona · 2 yacheyka · 2 backfill qatori · 1 buzuq kod", async () => {
    const r = await runCellMigration(makePort(seeded()), { ...opts, apply: false });

    expect(r.mode).toBe('dry');
    expect(r.generation.zonesToCreate).toHaveLength(1);
    expect(r.generation.cellsToCreate.map((c) => c.name)).toEqual(['01-02-03-05', '01-02-03-06']);
    expect(r.generation.invalid).toHaveLength(1);
    expect(r.generation.invalid[0]?.productIds).toEqual(['p3']);

    expect(r.backfill.writes.map((w) => w.deltaQty)).toEqual(['10', '2.5']);
    // p3 — kod buzuq, p4 — kod umuman yo'q.
    expect(r.backfill.unaddressed.map((u) => u.reason).sort()).toEqual([
      'invalid-code',
      'no-home-code',
    ]);
    expect(r.manifest).toBeNull();
  });

  it('DRY simulyatsiyasi APPLY dan keyingi HAQIQIY farqni oldindan aytadi', async () => {
    const dryState = seeded();
    const dry = await runCellMigration(makePort(dryState), { ...opts, apply: false });

    const applyState = seeded();
    const applied = await runCellMigration(makePort(applyState), { ...opts, apply: true });

    expect(dry.diffAfter.totalAbsDiff).toBe(applied.diffAfter.totalAbsDiff);
    expect(dry.diffAfter.mismatches).toBe(applied.diffAfter.mismatches);
    // `cellId` dan tashqari hammasi bir xil: DRY da yacheykalar hali yaratilmagan,
    // shuning uchun u sun'iy («dry:») id ishlatadi — miqdorlar esa aynan bir xil.
    const shape = ({ cellId: _c, ...rest }: (typeof dry.backfill.writes)[number]) => rest;
    expect(dry.backfill.writes.map(shape)).toEqual(applied.backfill.writes.map(shape));
  });
});

describe('runCellMigration — APPLY', () => {
  it("zona/yacheyka yaratadi va yacheykani ZONAGA bog'laydi", async () => {
    const state = seeded();
    const r = await runCellMigration(makePort(state), { ...opts, apply: true });

    expect(state.zones.map((z) => z.name)).toEqual(['01']);
    expect(state.cells.map((c) => c.name)).toEqual(['01-02-03-05', '01-02-03-06']);
    expect(new Set(state.cells.map((c) => c.zoneId))).toEqual(new Set([state.zones[0]?.id]));
    expect(r.writes).toEqual({ zones: 1, cells: 2, stockRows: 2 });
  });

  it("biriktirilgan tovarlar bo'yicha `Σ StockByCell == Stock`", async () => {
    const state = seeded();
    await runCellMigration(makePort(state), { ...opts, apply: true });

    for (const productId of ['p1', 'p2']) {
      const stock = state.stocks.find((s) => s.assortmentId === productId)?.qty;
      const sum = state.byCell
        .filter((c) => c.assortmentId === productId)
        .reduce((a, c) => a + Number(c.qty), 0);
      expect(sum, productId).toBe(Number(stock));
    }
  });

  it('qolgan farq FAQAT biriktirilmagan tovarlar (p3 + p4 = 11), jim yashirilmaydi', async () => {
    const state = seeded();
    const r = await runCellMigration(makePort(state), { ...opts, apply: true });

    expect(r.diffBefore.totalAbsDiff).toBe('23.5');
    expect(r.diffAfter.totalAbsDiff).toBe('11');
    expect(r.diffAfter.rows.map((x) => x.assortmentId).sort()).toEqual(['p3', 'p4']);
  });

  it('IDEMPOTENT: ikkinchi yugurtirish hech narsa yozmaydi', async () => {
    const state = seeded();
    await runCellMigration(makePort(state), { ...opts, apply: true });
    const port2 = makePort(state);
    const second = await runCellMigration(port2, { ...opts, apply: true });

    expect(second.writes).toEqual({ zones: 0, cells: 0, stockRows: 0 });
    expect(port2.createZones).not.toHaveBeenCalled();
    expect(port2.applyBackfill).not.toHaveBeenCalled();
    expect(state.byCell).toHaveLength(2);
  });

  it('manifest yaratilgan hamma narsani qayd etadi', async () => {
    const state = seeded();
    const r = await runCellMigration(makePort(state), { ...opts, apply: true });

    expect(r.manifest).not.toBeNull();
    expect(r.manifest?.zones).toHaveLength(1);
    expect(r.manifest?.cells).toHaveLength(2);
    expect(r.manifest?.stock).toHaveLength(2);
    expect(r.manifest?.stock.every((s) => s.created)).toBe(true);
  });
});

describe('rollbackCellMigration', () => {
  it('holatni AYNAN migratsiyadan oldingi holga qaytaradi', async () => {
    const state = seeded();
    const before = JSON.stringify({ z: state.zones, c: state.cells, s: state.byCell });

    const applied = await runCellMigration(makePort(state), { ...opts, apply: true });
    expect(state.cells).toHaveLength(2);

    const manifest = applied.manifest;
    if (!manifest) throw new Error('manifest kutilgan edi');
    const rb = await rollbackCellMigration(makePort(state), manifest, { apply: true });

    expect(rb.blocked).toHaveLength(0);
    expect(JSON.stringify({ z: state.zones, c: state.cells, s: state.byCell })).toBe(before);
  });

  it('DRY rollback hech narsa o‘chirmaydi', async () => {
    const state = seeded();
    const applied = await runCellMigration(makePort(state), { ...opts, apply: true });
    const manifest = applied.manifest;
    if (!manifest) throw new Error('manifest kutilgan edi');

    const port = makePort(state);
    const rb = await rollbackCellMigration(port, manifest, { apply: false });

    expect(rb.plan.cellDeletes).toHaveLength(2);
    expect(port.deleteCells).not.toHaveBeenCalled();
    expect(port.deleteStockByCell).not.toHaveBeenCalled();
    expect(state.cells).toHaveLength(2);
  });

  it("migratsiyadan keyin qoldiq o'zgargan bo'lsa — TO'XTAYDI, yarim o'chirmaydi", async () => {
    const state = seeded();
    const applied = await runCellMigration(makePort(state), { ...opts, apply: true });
    const manifest = applied.manifest;
    if (!manifest) throw new Error('manifest kutilgan edi');

    // Migratsiyadan keyin real sotuv bo'ldi: p1 yacheykasidan 3 dona ketdi.
    const row = state.byCell.find((r) => r.assortmentId === 'p1');
    if (!row) throw new Error('qator kutilgan edi');
    row.qty = '7';

    const rb = await rollbackCellMigration(makePort(state), manifest, { apply: true });

    // p2 yacheykasi bo'shab o'chadi; p1 niki qoldiq bilan qoladi ⇒ zona ham qoladi.
    expect(rb.plan.blocked.map((b) => b.reason)).toEqual([
      'stock-drifted',
      'cell-not-empty',
      'zone-not-empty',
    ]);
    // p1 qatori ham, uning yacheykasi ham TEGILMAYDI; zona ham qoladi.
    expect(state.byCell.some((r) => r.assortmentId === 'p1')).toBe(true);
    expect(state.cells.map((c) => c.name)).toEqual(['01-02-03-05']);
    expect(state.zones).toHaveLength(1);
  });

  it("hujjat ushlab turgan yacheyka o'chirilmaydi", async () => {
    const state = seeded();
    const applied = await runCellMigration(makePort(state), { ...opts, apply: true });
    const manifest = applied.manifest;
    if (!manifest) throw new Error('manifest kutilgan edi');

    const held = state.cells[0]?.id;
    if (!held) throw new Error('yacheyka kutilgan edi');
    state.inUse.add(held);

    const rb = await rollbackCellMigration(makePort(state), manifest, { apply: true });

    expect(rb.plan.blocked.map((b) => b.reason)).toEqual(['cell-in-use', 'zone-not-empty']);
    expect(state.cells.map((c) => c.id)).toEqual([held]);
    expect(state.zones).toHaveLength(1);
    // Qoldiq baribir qaytarilgan — yacheyka bo'sh turadi.
    expect(state.byCell).toHaveLength(0);
  });
});

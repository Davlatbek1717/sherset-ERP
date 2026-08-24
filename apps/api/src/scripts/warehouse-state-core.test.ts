import { describe, expect, it } from 'vitest';
import {
  BRAK_STORE_KEY,
  type Registry,
  type StateCellRow,
  type StateStoreRow,
  UNASSIGNED_SOURCE_KEY,
  type WarehouseStateInput,
  buildWarehouseState,
  diffAgainstRegistry,
  exitCodeFor,
  parseRegistry,
  readPosPriority,
} from '../../../../packages/db/scripts/warehouse-state-core.js';

/**
 * H2 (2026-08-24 split-kassa hodisasi) — jonli holat yadrosining qulf-testlari.
 *
 * Bu testlarning maqsadi bitta: 06:46 hodisasining SHAKLI (tovar bor, lekin POS
 * unga yeta olmaydi) yadro tomonidan ALBATTA ushlanishi. Shuning uchun asosiy
 * keys hodisaning o'zi raqamlari bilan qayta tiklangan.
 */

const POOL = 'store-pool';
const W01 = 'store-01';
const W02 = 'store-02';

function store(id: string, name: string, attributes: unknown = {}): StateStoreRow {
  return { id, name, archived: false, attributes };
}

function cell(
  id: string,
  storeId: string,
  name: string,
  zoneId: string | null = null,
): StateCellRow {
  return { id, storeId, zoneId, name };
}

function input(over: Partial<WarehouseStateInput> = {}): WarehouseStateInput {
  return {
    stores: over.stores ?? [store(POOL, 'Taqsimlanmagan', { __posPriority: 1 })],
    cells: over.cells ?? [],
    storeStock: over.storeStock ?? [],
    cellStock: over.cellStock ?? [],
    openSessions: over.openSessions ?? [{ storeId: POOL, sessions: 1 }],
  };
}

describe('readPosPriority — apps/api dagi kaskad qoidasi bilan bir xil', () => {
  it('faqat musbat butun son ma’noli', () => {
    expect(readPosPriority({ __posPriority: 1 })).toBe(1);
    expect(readPosPriority({ __posPriority: 7 })).toBe(7);
    expect(readPosPriority({ __posPriority: 0 })).toBeNull();
    expect(readPosPriority({ __posPriority: -1 })).toBeNull();
    expect(readPosPriority({ __posPriority: 1.5 })).toBeNull();
    expect(readPosPriority({ __posPriority: '1' })).toBeNull();
    expect(readPosPriority({})).toBeNull();
    expect(readPosPriority(null)).toBeNull();
    expect(readPosPriority([1])).toBeNull();
  });
});

describe('yetuvchanlik — 06:46 hodisasining shakli', () => {
  it('kaskadda bor, lekin birinchi EMAS ombordagi qoldiq «yetib bo‘lmaydigan» deb sanaladi', () => {
    // Aynan 2026-08-23 split holati: tovar «Ombor 02» ga ko'chgan, POS esa
    // hovuzdan (pp=1) sotadi ⇒ 2 949 007 dona sotib bo'lmaydi.
    const report = buildWarehouseState(
      input({
        stores: [
          store(POOL, 'Taqsimlanmagan', { __posPriority: 1 }),
          store(W02, 'Ombor 02', { __posPriority: 2 }),
        ],
        storeStock: [
          { storeId: POOL, qty: '49570000' },
          { storeId: W02, qty: '2949007' },
        ],
      }),
    );
    expect(report.unreachableQty).toBe('2949007');
    expect(report.unreachable).toEqual([
      { storeId: W02, storeName: 'Ombor 02', qty: '2949007', reach: 'needs_approval' },
    ]);
    expect(report.stores.find((s) => s.id === POOL)?.reach).toBe('reachable');
  });

  it('kaskadda umuman yo‘q ombor — «outside_cascade»', () => {
    const report = buildWarehouseState(
      input({
        stores: [store(POOL, 'Taqsimlanmagan', { __posPriority: 1 }), store(W01, 'Ombor 01')],
        storeStock: [{ storeId: W01, qty: '10' }],
      }),
    );
    expect(report.unreachable[0]?.reach).toBe('outside_cascade');
    expect(report.unreachableQty).toBe('10');
  });

  it('BRAK ombori ISTISNO — u ataylab yopiq, xavf emas', () => {
    // G3 hisobotidagi ogohlantirish: busiz birinchi brak qabulidan keyin
    // har deploy bloklanardi va signal «bo'ri keldi» bo'lib qolardi.
    const report = buildWarehouseState(
      input({
        stores: [
          store(POOL, 'Taqsimlanmagan', { __posPriority: 1 }),
          store('store-brak', 'BRAK', { [BRAK_STORE_KEY]: true }),
        ],
        storeStock: [{ storeId: 'store-brak', qty: '500' }],
      }),
    );
    expect(report.unreachableQty).toBe('0');
    expect(report.unreachable).toHaveLength(0);
    expect(report.stores.find((s) => s.name === 'BRAK')?.reach).toBe('brak');
  });

  it('qoldig‘i 0 bo‘lgan yetib bo‘lmaydigan ombor shovqin qilmaydi', () => {
    // Hozirgi jonli holat: «Ombor 02» da pp=2 qolgan (R1), lekin u BO'SH.
    const report = buildWarehouseState(
      input({
        stores: [
          store(POOL, 'Taqsimlanmagan', { __posPriority: 1 }),
          store(W02, 'Ombor 02', { __posPriority: 2 }),
        ],
        storeStock: [{ storeId: POOL, qty: '100' }],
      }),
    );
    expect(report.unreachableQty).toBe('0');
    expect(report.unreachable).toHaveLength(0);
  });

  it('kaskad sozlanmagan bo‘lsa POS smena omboridan ishlaydi (F6 zaxira yo‘li)', () => {
    const report = buildWarehouseState(
      input({
        stores: [store(POOL, 'Taqsimlanmagan'), store(W01, 'Ombor 01')],
        storeStock: [
          { storeId: POOL, qty: '100' },
          { storeId: W01, qty: '7' },
        ],
        openSessions: [{ storeId: POOL, sessions: 2 }],
      }),
    );
    expect(report.cascadeConfigured).toBe(false);
    expect(report.stores.find((s) => s.id === POOL)?.reach).toBe('reachable');
    expect(report.unreachableQty).toBe('7');
  });

  it('kaskad tartibi: prioritet ↑, tenglikda nom bo‘yicha', () => {
    const report = buildWarehouseState(
      input({
        stores: [
          store(W02, 'Ombor 02', { __posPriority: 2 }),
          store('b', 'Bbb', { __posPriority: 1 }),
          store('a', 'Aaa', { __posPriority: 1 }),
        ],
      }),
    );
    expect(report.cascade.map((c) => c.name)).toEqual(['Aaa', 'Bbb', 'Ombor 02']);
    // birinchi — «Aaa», ya'ni faqat u «reachable»
    expect(report.stores.find((s) => s.id === 'a')?.reach).toBe('reachable');
    expect(report.stores.find((s) => s.id === 'b')?.reach).toBe('needs_approval');
  });
});

describe('split holati — yacheyka prefiksi ↔ ombor', () => {
  it('hammasi bitta omborda, prefiks mos emas ⇒ «qaytarilgan»', () => {
    const report = buildWarehouseState(
      input({
        stores: [
          store(POOL, 'Taqsimlanmagan', { __posPriority: 1 }),
          store(W01, 'Ombor 01'),
          store(W02, 'Ombor 02'),
        ],
        cells: [cell('c1', POOL, '01-04-02-13'), cell('c2', POOL, '02-01-01-01')],
      }),
    );
    expect(report.split.state).toBe('qaytarilgan');
    expect(report.split.mismatched).toBe(2);
    expect(report.split.matched).toBe(0);
    expect(report.split.missingStores).toEqual([]);
  });

  it('har yacheyka o‘z omborida ⇒ «bajarilgan»', () => {
    const report = buildWarehouseState(
      input({
        stores: [store(W01, 'Ombor 01'), store(W02, 'Ombor 02', { __posPriority: 1 })],
        cells: [cell('c1', W01, '01-04-02-13'), cell('c2', W02, '02-01-01-01')],
        openSessions: [{ storeId: W02, sessions: 1 }],
      }),
    );
    expect(report.split.state).toBe('bajarilgan');
    expect(report.split.mismatched).toBe(0);
  });

  it('aralash ⇒ «qisman», yetishmayotgan ombor nomi ko‘rinadi', () => {
    const report = buildWarehouseState(
      input({
        stores: [store(POOL, 'Taqsimlanmagan', { __posPriority: 1 }), store(W01, 'Ombor 01')],
        cells: [
          cell('c1', W01, '01-04-02-13'), // mos
          cell('c2', POOL, '07-01-01-01'), // «Ombor 07» hali yo'q
        ],
      }),
    );
    expect(report.split.state).toBe('qisman');
    expect(report.split.missingStores).toEqual(['Ombor 07']);
  });

  it('kodi o‘qilmaydigan yacheykalar alohida sanaladi va holatga ta’sir qilmaydi', () => {
    const report = buildWarehouseState(
      input({
        stores: [store(POOL, 'Taqsimlanmagan', { __posPriority: 1 })],
        cells: [cell('c1', POOL, 'ESKI-JAVON')],
      }),
    );
    expect(report.split.unparsed).toBe(1);
    expect(report.split.state).toBe('bajarilgan'); // mos emas qatori yo'q
  });
});

describe('ombor kesimi — yacheykasiz qoldiq va zonalar', () => {
  it('yacheykasiz qoldiq = ombor jamisi − yacheykalardagi', () => {
    const report = buildWarehouseState(
      input({
        stores: [
          store(POOL, 'Taqsimlanmagan', { __posPriority: 1, [UNASSIGNED_SOURCE_KEY]: true }),
        ],
        cells: [cell('c1', POOL, '01-01-01-01', 'z1'), cell('c2', POOL, '01-01-01-02')],
        storeStock: [{ storeId: POOL, qty: '52513521' }],
        cellStock: [{ storeId: POOL, qty: '2948688' }],
      }),
    );
    const s = report.stores[0];
    expect(s?.unassignedQty).toBe('49564833');
    expect(s?.cells).toBe(2);
    expect(s?.zones).toBe(1);
    expect(s?.cellsWithoutZone).toBe(1);
    expect(s?.isUnassignedSource).toBe(true);
  });

  it('Decimal(20,6) kasrlari float’siz yig‘iladi', () => {
    const report = buildWarehouseState(
      input({
        storeStock: [
          { storeId: POOL, qty: '0.1' },
          { storeId: POOL, qty: '0.2' },
        ],
      }),
    );
    expect(report.stores[0]?.storeQty).toBe('0.3');
  });
});

describe('reyestr — parse', () => {
  const md = [
    '# sarlavha',
    'matn',
    '```json',
    '{"split":"qaytarilgan","posSessionStore":"Taqsimlanmagan","stores":[{"name":"Taqsimlanmagan","posPriority":1}]}',
    '```',
    'yana matn',
  ].join('\n');

  it('md ichidagi json blokini o‘qiydi', () => {
    const r = parseRegistry(md);
    expect(r.split).toBe('qaytarilgan');
    expect(r.posSessionStore).toBe('Taqsimlanmagan');
    expect(r.stores).toHaveLength(1);
  });

  it('blok yo‘q / maydon yo‘q bo‘lsa OCHIQ yiqiladi (jimgina 0 emas)', () => {
    expect(() => parseRegistry('json bloki yo‘q')).toThrow(/json bloki topilmadi/);
    expect(() => parseRegistry('```json\n{"split":"x"}\n```')).toThrow(/stores/);
    expect(() => parseRegistry('```json\n{"stores":[]}\n```')).toThrow(/posSessionStore/);
  });
});

describe('reyestr bilan solishtirish', () => {
  const registry: Registry = {
    split: 'qaytarilgan',
    posSessionStore: 'Taqsimlanmagan',
    allowUnreachableQty: '0',
    stores: [
      { name: 'Taqsimlanmagan', posPriority: 1, brak: false },
      { name: 'Ombor 02', posPriority: 2 },
    ],
  };

  const okReport = () =>
    buildWarehouseState(
      input({
        stores: [
          store(POOL, 'Taqsimlanmagan', { __posPriority: 1 }),
          store(W02, 'Ombor 02', { __posPriority: 2 }),
        ],
        cells: [cell('c1', POOL, '01-04-02-13')],
        storeStock: [{ storeId: POOL, qty: '100' }],
      }),
    );

  it('mos holatda farq yo‘q, chiqish kodi 0', () => {
    const drifts = diffAgainstRegistry(okReport(), registry);
    expect(drifts).toEqual([]);
    expect(exitCodeFor(drifts)).toBe(0);
  });

  it('prioritet o‘zgarsa xato beradi', () => {
    const report = buildWarehouseState(
      input({
        stores: [
          store(POOL, 'Taqsimlanmagan', { __posPriority: 1 }),
          store(W02, 'Ombor 02', { __posPriority: 3 }),
        ],
        cells: [cell('c1', POOL, '01-04-02-13')],
      }),
    );
    const drifts = diffAgainstRegistry(report, registry);
    expect(drifts.map((d) => d.code)).toContain('prioritet');
    expect(exitCodeFor(drifts)).toBe(2);
  });

  it('reyestrdagi ombor yo‘qolsa xato', () => {
    const report = buildWarehouseState(
      input({
        stores: [store(POOL, 'Taqsimlanmagan', { __posPriority: 1 })],
        cells: [cell('c1', POOL, '01-04-02-13')],
      }),
    );
    const drifts = diffAgainstRegistry(report, registry);
    expect(drifts.map((d) => d.code)).toContain('ombor-yoq');
  });

  it('yangi ombor faqat OGOHLANTIRISH beradi (kodni 2 ga o‘zgartirmaydi)', () => {
    const report = buildWarehouseState(
      input({
        stores: [
          store(POOL, 'Taqsimlanmagan', { __posPriority: 1 }),
          store(W02, 'Ombor 02', { __posPriority: 2 }),
          store('store-brak', 'BRAK', { [BRAK_STORE_KEY]: true }),
        ],
        cells: [cell('c1', POOL, '01-04-02-13')],
      }),
    );
    const drifts = diffAgainstRegistry(report, registry);
    expect(drifts.map((d) => d.code)).toEqual(['reyestrda-yoq']);
    expect(exitCodeFor(drifts)).toBe(0);
  });

  it('🔴 06:46 hodisasi: yetib bo‘lmaydigan qoldiq ⇒ chiqish kodi 2', () => {
    const report = buildWarehouseState(
      input({
        stores: [
          store(POOL, 'Taqsimlanmagan', { __posPriority: 1 }),
          store(W02, 'Ombor 02', { __posPriority: 2 }),
        ],
        cells: [cell('c1', POOL, '01-04-02-13')],
        storeStock: [{ storeId: W02, qty: '2949007' }],
      }),
    );
    const drifts = diffAgainstRegistry(report, registry);
    const hit = drifts.find((d) => d.code === 'yetib-bolmaydigan-qoldiq');
    expect(hit?.severity).toBe('xato');
    expect(hit?.message).toContain('2949007');
    expect(hit?.message).toContain('G4');
    expect(exitCodeFor(drifts)).toBe(2);
  });

  it('POS smena ombori kaskad boshi bo‘lmasa xato (hodisaning aynan shakli)', () => {
    const report = buildWarehouseState(
      input({
        stores: [
          store(POOL, 'Taqsimlanmagan', { __posPriority: 2 }),
          store(W02, 'Ombor 02', { __posPriority: 1 }),
        ],
        cells: [cell('c1', POOL, '01-04-02-13')],
      }),
    );
    const drifts = diffAgainstRegistry(report, {
      ...registry,
      stores: [
        { name: 'Taqsimlanmagan', posPriority: 2 },
        { name: 'Ombor 02', posPriority: 1 },
      ],
    });
    expect(drifts.map((d) => d.code)).toContain('pos-ombori-yetib-bolmaydi');
    expect(exitCodeFor(drifts)).toBe(2);
  });

  it('boshqa omborda ochiq smena — ogohlantirish', () => {
    const report = buildWarehouseState(
      input({
        stores: [
          store(POOL, 'Taqsimlanmagan', { __posPriority: 1 }),
          store(W02, 'Ombor 02', { __posPriority: 2 }),
        ],
        cells: [cell('c1', POOL, '01-04-02-13')],
        openSessions: [
          { storeId: POOL, sessions: 1 },
          { storeId: W02, sessions: 1 },
        ],
      }),
    );
    const drifts = diffAgainstRegistry(report, registry);
    expect(drifts.map((d) => d.code)).toContain('smena-boshqa-omborda');
    expect(exitCodeFor(drifts)).toBe(0);
  });

  it('split holati o‘zgarsa xato (drift ko‘rinadi — IS-7 ning yopilishi)', () => {
    const report = buildWarehouseState(
      input({
        stores: [
          store(POOL, 'Taqsimlanmagan', { __posPriority: 1 }),
          store(W02, 'Ombor 02', { __posPriority: 2 }),
        ],
        cells: [cell('c1', W02, '02-01-01-01')],
      }),
    );
    const drifts = diffAgainstRegistry(report, registry);
    const hit = drifts.find((d) => d.code === 'split-holati');
    expect(hit?.message).toContain('bajarilgan');
    expect(exitCodeFor(drifts)).toBe(2);
  });
});

describe('haqiqiy reyestr fayli (docs/ops/jonli-holat.md)', () => {
  it('parse bo‘ladi va hozirgi jonli holatni ifodalaydi', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    const path = join(here, '..', '..', '..', '..', 'docs', 'ops', 'jonli-holat.md');
    const registry = parseRegistry(readFileSync(path, 'utf8'));
    expect(registry.split).toBe('qaytarilgan');
    expect(registry.posSessionStore).toBe('Taqsimlanmagan');
    expect(registry.allowUnreachableQty).toBe('0');
    // Reyestrdagi POS ombori kaskad boshi (pp=1) bo'lishi SHART.
    expect(registry.stores.find((s) => s.name === registry.posSessionStore)?.posPriority).toBe(1);
  });
});

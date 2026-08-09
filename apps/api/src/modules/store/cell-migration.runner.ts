/**
 * F019 — ombor migratsiyasi 1–2-qadam ORKESTRATSIYASI.
 *
 * Sof matematika `cell-migration.ts` da; bu yerda faqat «o'qish → rejalash →
 * (ixtiyoriy) yozish → qayta o'lchash» ketma-ketligi. Baza bilan gaplashish
 * `CellMigrationPort` orqali — shuning uchun butun oqim DBsiz testlanadi va
 * CLI (`scripts/migrate-cells-step1-2.ts`) faqat Prisma adapteri bo'lib qoladi.
 *
 * KALIT XOSSA: DRY va APPLY AYNAN bir kod yo'lidan yuradi, farq faqat oxirgi
 * yozuv qadamida. DRY dagi «keyingi farq» soni simulyatsiya orqali, APPLY
 * dagisi esa bazadan QAYTA O'QIB o'lchanadi — ikkalasi teng chiqishi testda
 * qulflangan. Aks holda «400 ta yaratiladi» deb ko'rsatib boshqacha ish
 * qilish mumkin bo'lardi (yacheyka-generatori spec'ining o'sha darsi).
 */
import { formatDecimalScaled, parseDecimalScaled } from '../demand/fifo-consumer.js';
import type {
  BackfillPlan,
  CellMigrationManifest,
  CellNeed,
  CellStockRow,
  GenerationPlan,
  RollbackPlan,
  StockDiffReport,
  StockRow,
} from './cell-migration.js';
import {
  diffStockVsCells,
  planCellGeneration,
  planRollback,
  planStockBackfill,
} from './cell-migration.js';

export interface CellMigrationPort {
  loadZones(
    accountId: string,
  ): Promise<Array<{ id: string; storeId: string; name: string; sortOrder: number }>>;
  loadCells(
    accountId: string,
  ): Promise<
    Array<{ id: string; storeId: string; name: string; sortOrder: number; zoneId: string | null }>
  >;
  /** `Product.attributes.__yacheyka` — faqat o'chirilmagan tovarlar. */
  loadProductHomeCodes(accountId: string): Promise<Array<{ productId: string; code: string }>>;
  loadStocks(accountId: string): Promise<StockRow[]>;
  loadStockByCell(accountId: string): Promise<CellStockRow[]>;

  createZones(
    accountId: string,
    rows: Array<{ storeId: string; name: string; sortOrder: number }>,
  ): Promise<Array<{ id: string; storeId: string; name: string }>>;
  createCells(
    accountId: string,
    rows: Array<{ storeId: string; name: string; zoneId: string | null; sortOrder: number }>,
  ): Promise<Array<{ id: string; storeId: string; name: string }>>;
  applyBackfill(accountId: string, writes: BackfillPlan['writes']): Promise<void>;

  deleteStockByCell(accountId: string, rows: RollbackPlan['stockDeletes']): Promise<void>;
  decrementStockByCell(accountId: string, rows: RollbackPlan['stockDecrements']): Promise<void>;
  deleteCells(accountId: string, ids: string[]): Promise<void>;
  deleteZones(accountId: string, ids: string[]): Promise<void>;
  /** Hujjat pozitsiyasi yoki tovar-biriktirmasi ushlab turgan yacheykalar. */
  cellsInUse(accountId: string, cellIds: string[]): Promise<Set<string>>;
  zoneCellCounts(accountId: string, zoneIds: string[]): Promise<Map<string, number>>;
}

export interface CellMigrationOptions {
  accountId: string;
  /**
   * Kodi bor, lekin qoldig'i yo'q tovar uchun yacheyka QAYSI omborda yaratiladi.
   * CLI buni akkauntning yagona `Store` idan oladi; bir nechta bo'lsa `STORE_ID`
   * majburiy (fail-closed — noto'g'ri omborga 400 yacheyka yaratish qimmat xato).
   */
  defaultStoreId: string;
  apply: boolean;
}

export interface CellMigrationResult {
  mode: 'dry' | 'apply';
  accountId: string;
  defaultStoreId: string;
  generation: GenerationPlan;
  backfill: BackfillPlan;
  /** Migratsiyadan OLDINGI `Σ StockByCell` vs `Stock` farqi. */
  diffBefore: StockDiffReport;
  /** APPLY — bazadan qayta o'qilgan; DRY — rejadan simulyatsiya qilingan. */
  diffAfter: StockDiffReport;
  manifest: CellMigrationManifest | null;
  writes: { zones: number; cells: number; stockRows: number };
}

const storeKey = (storeId: string, name: string) => `${storeId}|${name}`;

/**
 * Har tovar-kodi uchun QAYSI omborlarda yacheyka kerakligini aniqlaydi:
 * tovar qoldig'i turgan har ombor + `defaultStoreId`. Qoldiq bo'lmasa ham
 * yacheyka default omborda yaratiladi — manzil hujjatlarda tanlanadigan
 * bo'lishi kerak, aks holda 1-qadam faqat qoldiqli tovarlarni ko'chirib,
 * qolganini jimgina tashlab ketardi.
 */
function deriveNeeds(
  homeCodes: Array<{ productId: string; code: string }>,
  stocks: StockRow[],
  defaultStoreId: string,
): CellNeed[] {
  const storesByProduct = new Map<string, Set<string>>();
  for (const s of stocks) {
    if (s.assortmentKind !== 'product') continue;
    const set = storesByProduct.get(s.assortmentId) ?? new Set<string>();
    set.add(s.storeId);
    storesByProduct.set(s.assortmentId, set);
  }

  const needs: CellNeed[] = [];
  for (const { productId, code } of homeCodes) {
    const stores = new Set(storesByProduct.get(productId) ?? []);
    stores.add(defaultStoreId);
    for (const storeId of stores) needs.push({ storeId, code, productId });
  }
  return needs;
}

/** Reja qatorlarini joriy yacheyka-qoldiqlariga qo'llaydi (DRY simulyatsiyasi). */
function simulate(byCell: CellStockRow[], writes: BackfillPlan['writes']): CellStockRow[] {
  const out = byCell.map((r) => ({ ...r }));
  for (const w of writes) {
    const row = out.find(
      (r) =>
        r.storeId === w.storeId &&
        r.cellId === w.cellId &&
        r.assortmentKind === w.assortmentKind &&
        r.assortmentId === w.assortmentId,
    );
    if (row) row.qty = addQty(row.qty, w.deltaQty);
    else {
      out.push({
        storeId: w.storeId,
        cellId: w.cellId,
        assortmentKind: w.assortmentKind,
        assortmentId: w.assortmentId,
        qty: w.deltaQty,
      });
    }
  }
  return out;
}

/**
 * Ikki `Decimal(20,6)` satrini `Number` ga tushirmasdan qo'shadi.
 * `fifo-consumer` ning shkalasidan foydalanadi — o'nlik arifmetikaning IKKINCHI
 * implementatsiyasi shu loyihada takrorlangan bug-klass.
 */
const addQty = (a: string, b: string): string =>
  formatDecimalScaled(parseDecimalScaled(a) + parseDecimalScaled(b));

export async function runCellMigration(
  port: CellMigrationPort,
  opts: CellMigrationOptions,
): Promise<CellMigrationResult> {
  const { accountId, defaultStoreId, apply } = opts;

  const [existingZones, existingCells, homeCodes, stocks, byCell] = await Promise.all([
    port.loadZones(accountId),
    port.loadCells(accountId),
    port.loadProductHomeCodes(accountId),
    port.loadStocks(accountId),
    port.loadStockByCell(accountId),
  ]);

  const diffBefore = diffStockVsCells(stocks, byCell);

  // ── 1-qadam: zona + yacheyka ─────────────────────────────────────────────
  const generation = planCellGeneration({
    needs: deriveNeeds(homeCodes, stocks, defaultStoreId),
    existingZones,
    existingCells,
  });

  const zoneIdByStoreName = new Map<string, string>();
  for (const z of existingZones) zoneIdByStoreName.set(storeKey(z.storeId, z.name), z.id);
  const cellIdByStoreCode = new Map<string, string>();
  for (const c of existingCells) cellIdByStoreCode.set(storeKey(c.storeId, c.name), c.id);

  const createdZones: Array<{ id: string; storeId: string; name: string }> = [];
  const createdCells: Array<{ id: string; storeId: string; name: string }> = [];

  if (apply && generation.zonesToCreate.length > 0) {
    const rows = await port.createZones(accountId, generation.zonesToCreate);
    for (const z of rows) {
      zoneIdByStoreName.set(storeKey(z.storeId, z.name), z.id);
      createdZones.push(z);
    }
  }
  if (apply && generation.cellsToCreate.length > 0) {
    const rows = await port.createCells(
      accountId,
      generation.cellsToCreate.map((c) => ({
        storeId: c.storeId,
        name: c.name,
        zoneId: zoneIdByStoreName.get(storeKey(c.storeId, c.zoneName)) ?? null,
        sortOrder: c.sortOrder,
      })),
    );
    for (const c of rows) {
      cellIdByStoreCode.set(storeKey(c.storeId, c.name), c.id);
      createdCells.push(c);
    }
  }

  // ── 2-qadam: backfill ────────────────────────────────────────────────────
  //
  // DRY da yangi yacheykalarning id'lari hali yo'q. Ularsiz backfill rejasi
  // hamma narsani `cell-missing` deb ko'rsatardi va DRY hisoboti YOLG'ON
  // bo'lardi. Shuning uchun DRY yaratilajak yacheykalarga sun'iy («dry:»)
  // id beradi — sonlar aynan APPLY dagidek chiqadi, hech narsa yozilmaydi.
  if (!apply) {
    for (const c of generation.cellsToCreate) {
      cellIdByStoreCode.set(storeKey(c.storeId, c.name), `dry:${c.storeId}|${c.name}`);
    }
  }

  const homeCodeByProduct = new Map(homeCodes.map((h) => [h.productId, h.code]));
  const backfill = planStockBackfill({ stocks, homeCodeByProduct, cellIdByStoreCode, byCell });

  if (apply && backfill.writes.length > 0) {
    await port.applyBackfill(accountId, backfill.writes);
  }

  // ── Tekshiruv hisoboti ───────────────────────────────────────────────────
  const afterRows = apply
    ? await port.loadStockByCell(accountId)
    : simulate(byCell, backfill.writes);
  const diffAfter = diffStockVsCells(stocks, afterRows);

  const manifest: CellMigrationManifest | null = apply
    ? {
        version: 1,
        appliedAt: new Date().toISOString(),
        accountId,
        zones: createdZones,
        cells: createdCells,
        stock: backfill.writes.map((w) => ({
          storeId: w.storeId,
          cellId: w.cellId,
          assortmentKind: w.assortmentKind,
          assortmentId: w.assortmentId,
          deltaQty: w.deltaQty,
          created: !w.existing,
        })),
      }
    : null;

  return {
    mode: apply ? 'apply' : 'dry',
    accountId,
    defaultStoreId,
    generation,
    backfill,
    diffBefore,
    diffAfter,
    manifest,
    writes: {
      zones: apply ? createdZones.length : 0,
      cells: apply ? createdCells.length : 0,
      stockRows: apply ? backfill.writes.length : 0,
    },
  };
}

export interface RollbackResult {
  mode: 'dry' | 'apply';
  plan: RollbackPlan;
  blocked: RollbackPlan['blocked'];
  /** Rollbackdan keyingi (APPLY) yoki hozirgi (DRY) farq hisoboti. */
  diffAfter: StockDiffReport;
}

/**
 * Migratsiyani manifest bo'yicha bekor qiladi.
 *
 * TARTIB MAJBURIY: `StockByCell` → `StoreCell` → `StoreZone`. Teskarisi
 * sxemadagi `onDelete: Restrict` ga urilardi (qoldiq turgan yacheykani
 * o'chirib bo'lmaydi) — ya'ni yarim bajarilgan rollback.
 */
export async function rollbackCellMigration(
  port: CellMigrationPort,
  manifest: CellMigrationManifest,
  opts: { apply: boolean },
): Promise<RollbackResult> {
  const { accountId } = manifest;
  const [currentByCell, cellsInUse, zoneCellCounts] = await Promise.all([
    port.loadStockByCell(accountId),
    port.cellsInUse(
      accountId,
      manifest.cells.map((c) => c.id),
    ),
    port.zoneCellCounts(
      accountId,
      manifest.zones.map((z) => z.id),
    ),
  ]);

  const plan = planRollback({ manifest, currentByCell, cellsInUse, zoneCellCounts });

  if (opts.apply) {
    if (plan.stockDeletes.length > 0) await port.deleteStockByCell(accountId, plan.stockDeletes);
    if (plan.stockDecrements.length > 0) {
      await port.decrementStockByCell(accountId, plan.stockDecrements);
    }
    if (plan.cellDeletes.length > 0) await port.deleteCells(accountId, plan.cellDeletes);
    if (plan.zoneDeletes.length > 0) await port.deleteZones(accountId, plan.zoneDeletes);
  }

  const [stocks, after] = await Promise.all([
    port.loadStocks(accountId),
    opts.apply ? port.loadStockByCell(accountId) : Promise.resolve(currentByCell),
  ]);

  return {
    mode: opts.apply ? 'apply' : 'dry',
    plan,
    blocked: plan.blocked,
    diffAfter: diffStockVsCells(stocks, after),
  };
}

/**
 * F4 (2026-08-23 ombor-restrukturizatsiya) — ombor-split rejasining SOF yadro
 * hisobi. SQL/Prisma YO'Q: kirish — xom qatorlar, chiqish — deterministik
 * ijro rejasi (`SplitPlan`). Shu tufayli butun mantiq unit-test bilan
 * qulflanadi (apps/api/src/scripts/warehouse-split-core.test.ts), CLI
 * (`warehouse-split.ts`) esa faqat o'qish/yozish qobig'i.
 *
 * Qoida (reja 3-bo'lim, maqsad-arxitektura):
 *   yacheyka kodi `NN-SS-QQ-OO` → NN = fizik ombor (Store «Ombor NN»),
 *   SS = stelaj (StoreZone nomi «SS»), qolgani kod ichida qoladi.
 *
 * Idempotentlik: reja FAQAT «yacheyka hozir turgan Store ≠ prefiksi ko'rsatgan
 * Store» juftliklardan quriladi. Split o'tgan bazada bunday juftlik qolmaydi
 * ⇒ ikkinchi yugurish bo'sh reja (no-op) beradi.
 *
 * Cost-basis: apps/api/shared/move-cost-basis.ts dagi computeTransferCost
 * bilan AYNAN bir xil arifmetika (o'rtacha tortilgan qiymat, manba bo'shaganda
 * qoldiq tiyinlar to'liq ketadi). packages/db app qatlamiga qaray olmagani
 * uchun mikro-birlik primitivlar shu yerda takrorlangan — manba:
 * apps/api/src/modules/shared/decimal.ts (o'zgartirsangiz ikkalasini birga).
 */

// ---------------------------------------------------------------------------
// Decimal(20,6) ↔ 1e6-scaled bigint (float YO'Q)
// ---------------------------------------------------------------------------

const SCALE = 1_000_000n;

export function parseDecimalScaled(value: string): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed;
  const [intPart = '0', fracPart = ''] = body.split('.');
  const fracPadded = (fracPart + '000000').slice(0, 6);
  const scaled = BigInt(intPart) * SCALE + BigInt(fracPadded || '0');
  return negative ? -scaled : scaled;
}

export function formatDecimalScaled(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const intPart = abs / SCALE;
  const fracPart = abs % SCALE;
  const fracStr = fracPart.toString().padStart(6, '0').replace(/0+$/, '');
  return (negative ? '-' : '') + intPart.toString() + (fracStr ? `.${fracStr}` : '');
}

function roundHalfUp(scaled: bigint, divisor: bigint): bigint {
  if (divisor === 0n) return scaled;
  const half = divisor / 2n;
  if (scaled >= 0n) return (scaled + half) / divisor;
  return -((-scaled + half) / divisor);
}

/** qty × perUnitMinor, tiyinga yarim-yuqoriga yaxlitlab. */
function lineCost(qtyMicro: bigint, perUnitMinor: bigint): bigint {
  return roundHalfUp(qtyMicro * perUnitMinor, SCALE);
}

// ---------------------------------------------------------------------------
// Yacheyka kodi
// ---------------------------------------------------------------------------

export interface ParsedCellCode {
  /** 2 xonaga normallashgan ombor raqami: '1-…' ham '01' bo'ladi. */
  warehouseNo: string;
  /** Stelaj (2-segment) 2 xonaga normallashgan; segment bo'lmasa null. */
  stelaj: string | null;
}

/**
 * `01-02-03-04` → { warehouseNo: '01', stelaj: '02' }.
 * F1 dagi warehousePrefixOf bilan bir semantika (^\d+-), lekin 2 xonadan uzun
 * «prefiks» ombor emas (masalan `123-…`) — null, yacheyka joyida qoladi.
 */
export function parseCellCode(name: string): ParsedCellCode | null {
  const m = /^(\d{1,2})-(\d{1,2})?/.exec(name.trim());
  if (!m || !m[1]) return null;
  const no = Number(m[1]);
  if (no < 1) return null; // «00-…» ombor emas
  const warehouseNo = String(no).padStart(2, '0');
  const stelaj = m[2] ? String(Number(m[2])).padStart(2, '0') : null;
  return { warehouseNo, stelaj };
}

/** Ombor raqamidan Store nomi — bitta joyda, hisobot/UI bir xil ko'rsin. */
export function storeNameFor(warehouseNo: string): string {
  return `Ombor ${warehouseNo}`;
}

/** Yacheykasiz qoldiq qoladigan eski Store'ning yangi nomi (reja F4.1). */
export const UNALLOCATED_STORE_NAME = 'Taqsimlanmagan';

// ---------------------------------------------------------------------------
// Kirish qatorlari (CLI Prisma'dan o'qib beradi)
// ---------------------------------------------------------------------------

export interface CellRow {
  id: string;
  storeId: string;
  name: string;
  zoneId: string | null;
}

export interface StoreRow {
  id: string;
  name: string;
  archived: boolean;
}

export interface StockByCellRow {
  storeId: string;
  cellId: string;
  assortmentKind: string;
  assortmentId: string;
  /** Decimal string. */
  qty: string;
}

export interface StockRow {
  storeId: string;
  assortmentKind: string;
  assortmentId: string;
  qty: string;
  costBalanceMinor: bigint;
}

// ---------------------------------------------------------------------------
// Reja (chiqish)
// ---------------------------------------------------------------------------

export interface CellMovePlan {
  cellId: string;
  cellName: string;
  fromStoreId: string;
  /** Maqsad ombor raqami — Store id'si CLI'da hal bo'ladi (bor/yaratiladi). */
  warehouseNo: string;
  /** Maqsad zonasi nomi (stelaj, «SS») yoki null. */
  zoneName: string | null;
}

/** Bitta (yacheyka × assortiment) uchun ledger juftligi + Stock siljishi. */
export interface QtyMovePlan {
  cellId: string;
  cellName: string;
  fromStoreId: string;
  warehouseNo: string;
  assortmentKind: string;
  assortmentId: string;
  /** Imzoli Decimal string — StockByCell qatoridagi qty aynan shu. */
  qty: string;
  /** Ko'chib o'tayotgan qiymat (tiyin); manfiy bo'lmaydi. */
  costMinor: bigint;
}

export interface SplitAnomaly {
  kind:
    | 'unparsed-cell' // kod NN- bilan boshlanmaydi — joyida qoladi
    | 'target-name-clash' // maqsad omborda shu nomli BOSHQA yacheyka bor
    | 'negative-cell-qty' // StockByCell qty < 0 — imzoli ko'chadi, halol
    | 'cell-exceeds-stock'; // Σyacheyka > Stock.qty — manba Stock manfiyga ketadi
  detail: string;
}

export interface WarehouseSummaryRow {
  warehouseNo: string;
  cells: number;
  zones: number;
  sbcRows: number;
  /** Σ qty (Decimal string, imzoli). */
  qty: string;
  costMinor: bigint;
}

export interface SplitPlan {
  /** Yaratilishi kerak bo'lgan (hali yo'q) omborlar raqamlari, tartibda. */
  warehousesNeeded: string[];
  cellMoves: CellMovePlan[];
  qtyMoves: QtyMovePlan[];
  /** Ko'chishda qatnashgan manba Store id'lari (rename nomzodlari). */
  sourceStoreIds: string[];
  summary: WarehouseSummaryRow[];
  anomalies: SplitAnomaly[];
}

/**
 * Reja quruvchi. Deterministik: kirish tartibidan qat'i nazar chiqish
 * (ombor raqami, yacheyka nomi) bo'yicha saralangan.
 *
 * Maqsad-Store aniqlash: nomi `Ombor NN` bo'lgan arxivlanmagan Store bo'lsa —
 * o'sha (id'si `existingStores` orqali CLI'га ma'lum); bo'lmasa yaratiladi.
 * Yacheyka allaqachon o'z omborida bo'lsa — reja unga TEGMAYDI (idempotentlik).
 */
export function buildSplitPlan(input: {
  cells: CellRow[];
  stores: StoreRow[];
  stockByCell: StockByCellRow[];
  stocks: StockRow[];
}): SplitPlan {
  const anomalies: SplitAnomaly[] = [];

  // Nomi bo'yicha maqsad Store'lar (arxivlanmaganlar).
  const storeByName = new Map<string, StoreRow>();
  for (const s of input.stores) {
    if (!s.archived) storeByName.set(s.name, s);
  }
  const storeById = new Map(input.stores.map((s) => [s.id, s]));

  // Maqsad ombordagi mavjud yacheyka nomlari (name-clash guard).
  const cellNamesByStore = new Map<string, Set<string>>();
  for (const c of input.cells) {
    let set = cellNamesByStore.get(c.storeId);
    if (!set) {
      set = new Set();
      cellNamesByStore.set(c.storeId, set);
    }
    set.add(c.name);
  }

  // 1) Yacheyka ko'chishlari.
  const cellMoves: CellMovePlan[] = [];
  const movingCellIds = new Set<string>();
  const warehousesNeededSet = new Set<string>();
  const sourceStoreIds = new Set<string>();
  // Bir maqsad omborga KETAYOTGAN nomlar — ikki manba Store'da bir xil nomli
  // yacheyka bo'lsa (unique faqat store ichida) ikkinchisi to'qnashadi.
  const claimedNames = new Map<string, Set<string>>();
  for (const cell of [...input.cells].sort((a, b) => a.name.localeCompare(b.name))) {
    const parsed = parseCellCode(cell.name);
    if (!parsed) {
      anomalies.push({
        kind: 'unparsed-cell',
        detail: `yacheyka «${cell.name}» (${cell.id}) — kod NN- formatida emas, joyida qoladi`,
      });
      continue;
    }
    const targetName = storeNameFor(parsed.warehouseNo);
    const target = storeByName.get(targetName);
    if (target && target.id === cell.storeId) continue; // allaqachon o'z omborida
    let claimed = claimedNames.get(parsed.warehouseNo);
    if (!claimed) {
      claimed = new Set();
      claimedNames.set(parsed.warehouseNo, claimed);
    }
    const clash =
      claimed.has(cell.name) || (target ? cellNamesByStore.get(target.id)?.has(cell.name) : false);
    if (clash) {
      anomalies.push({
        kind: 'target-name-clash',
        detail: `yacheyka «${cell.name}»: «${targetName}» omborida shu nomli boshqa yacheyka bor — joyida qoladi, qo'lda hal qilinadi`,
      });
      continue;
    }
    claimed.add(cell.name);
    if (!target) warehousesNeededSet.add(parsed.warehouseNo);
    sourceStoreIds.add(cell.storeId);
    movingCellIds.add(cell.id);
    cellMoves.push({
      cellId: cell.id,
      cellName: cell.name,
      fromStoreId: cell.storeId,
      warehouseNo: parsed.warehouseNo,
      zoneName: parsed.stelaj,
    });
  }
  const moveByCellId = new Map(cellMoves.map((m) => [m.cellId, m]));

  // 2) Miqdor ko'chishlari — yacheykasi bilan birga ketadigan StockByCell
  //    qatorlari. Cost sequential: har (manba Store, assortiment) bo'yicha
  //    qoldiq qty/cost yuritiladi, har qator o'z ulushini oladi; oxirgi birlik
  //    manbani bo'shatsa qoldiq tiyin to'liq ketadi (move-cost-basis semantikasi).
  const stockByKey = new Map<string, StockRow>();
  for (const s of input.stocks) {
    stockByKey.set(`${s.storeId}|${s.assortmentKind}|${s.assortmentId}`, s);
  }

  // Har (manba, assortiment) uchun yuruvchi qoldiq (qtyMicro, costMinor).
  const running = new Map<string, { qtyMicro: bigint; costMinor: bigint }>();
  // Σyacheyka > Stock tekshiruvi uchun ko'chayotgan jami (per manba-assortiment).
  const movingTotals = new Map<string, bigint>();

  const sbcMoving = input.stockByCell
    .filter((r) => movingCellIds.has(r.cellId))
    .sort((a, b) => {
      const ma = moveByCellId.get(a.cellId)!;
      const mb = moveByCellId.get(b.cellId)!;
      return (
        ma.warehouseNo.localeCompare(mb.warehouseNo) ||
        ma.cellName.localeCompare(mb.cellName) ||
        a.assortmentKind.localeCompare(b.assortmentKind) ||
        a.assortmentId.localeCompare(b.assortmentId)
      );
    });

  const qtyMoves: QtyMovePlan[] = [];
  for (const row of sbcMoving) {
    const move = moveByCellId.get(row.cellId)!;
    const qtyMicro = parseDecimalScaled(row.qty);
    if (qtyMicro === 0n) continue; // bo'sh qator — yacheyka bilan jim ko'chadi
    if (qtyMicro < 0n) {
      anomalies.push({
        kind: 'negative-cell-qty',
        detail: `«${move.cellName}» ${row.assortmentKind}:${row.assortmentId} qty=${row.qty} < 0 — imzoli ko'chirildi`,
      });
    }

    const key = `${row.storeId}|${row.assortmentKind}|${row.assortmentId}`;
    let run = running.get(key);
    if (!run) {
      const stock = stockByKey.get(key);
      run = {
        qtyMicro: stock ? parseDecimalScaled(stock.qty) : 0n,
        costMinor: stock ? stock.costBalanceMinor : 0n,
      };
      running.set(key, run);
    }
    movingTotals.set(key, (movingTotals.get(key) ?? 0n) + qtyMicro);

    let costMinor = 0n;
    if (qtyMicro > 0n && run.qtyMicro > 0n && run.costMinor !== 0n) {
      if (qtyMicro >= run.qtyMicro) {
        costMinor = run.costMinor; // manba bo'shadi — qoldiq tiyin to'liq ketadi
      } else {
        const perUnit = roundHalfUp(run.costMinor * SCALE, run.qtyMicro);
        costMinor = lineCost(qtyMicro, perUnit);
        if (costMinor > run.costMinor) costMinor = run.costMinor;
      }
    }
    run.qtyMicro -= qtyMicro;
    run.costMinor -= costMinor;

    qtyMoves.push({
      cellId: row.cellId,
      cellName: move.cellName,
      fromStoreId: row.storeId,
      warehouseNo: move.warehouseNo,
      assortmentKind: row.assortmentKind,
      assortmentId: row.assortmentId,
      qty: row.qty,
      costMinor,
    });
  }

  // Σyacheyka > Stock — manba Stock manfiyga ketadi (halol, lekin ko'rinsin).
  for (const [key, movingMicro] of movingTotals) {
    const stock = stockByKey.get(key);
    const haveMicro = stock ? parseDecimalScaled(stock.qty) : 0n;
    if (movingMicro > haveMicro) {
      const [storeId, kind, id] = key.split('|');
      const storeName = storeById.get(storeId ?? '')?.name ?? storeId;
      anomalies.push({
        kind: 'cell-exceeds-stock',
        detail:
          `«${storeName}» ${kind}:${id}: yacheykalardagi ${formatDecimalScaled(movingMicro)} > ` +
          `ombor qoldig'i ${formatDecimalScaled(haveMicro)} — manba Stock manfiy bo'ladi`,
      });
    }
  }

  // 3) Xulosa (ombor kesimida).
  const summaryMap = new Map<string, WarehouseSummaryRow & { qtyMicro: bigint }>();
  for (const m of cellMoves) {
    let row = summaryMap.get(m.warehouseNo);
    if (!row) {
      row = {
        warehouseNo: m.warehouseNo,
        cells: 0,
        zones: 0,
        sbcRows: 0,
        qty: '0',
        qtyMicro: 0n,
        costMinor: 0n,
      };
      summaryMap.set(m.warehouseNo, row);
    }
    row.cells += 1;
  }
  const zoneSets = new Map<string, Set<string>>();
  for (const m of cellMoves) {
    if (!m.zoneName) continue;
    let set = zoneSets.get(m.warehouseNo);
    if (!set) {
      set = new Set();
      zoneSets.set(m.warehouseNo, set);
    }
    set.add(m.zoneName);
  }
  for (const [no, set] of zoneSets) summaryMap.get(no)!.zones = set.size;
  for (const q of qtyMoves) {
    const row = summaryMap.get(q.warehouseNo)!;
    row.sbcRows += 1;
    row.qtyMicro += parseDecimalScaled(q.qty);
    row.costMinor += q.costMinor;
  }
  const summary = [...summaryMap.values()]
    .sort((a, b) => a.warehouseNo.localeCompare(b.warehouseNo))
    .map(({ qtyMicro, ...row }) => ({ ...row, qty: formatDecimalScaled(qtyMicro) }));

  return {
    warehousesNeeded: [...warehousesNeededSet].sort(),
    cellMoves,
    qtyMoves,
    sourceStoreIds: [...sourceStoreIds].sort(),
    summary,
    anomalies,
  };
}

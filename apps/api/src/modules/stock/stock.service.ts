import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { formatDecimalScaled, parseDecimalScaled } from '../shared/decimal.js';

/**
 * Stock service — centralizes ledger writes + balance reads.
 *
 * Design (Sprint 3.2):
 *   - StockOperation is append-only (source of truth).
 *   - Stock is a materialized row per (store, assortment) for O(1) lookup.
 *   - Dual-write inside the caller's $transaction.
 *   - Pessimistic lock (SELECT ... FOR UPDATE) on Stock rows before posting,
 *     ordered by assortmentId to avoid deadlocks.
 */

export interface StockDelta {
  storeId: string;
  assortmentKind: string;
  assortmentId: string;
  qtyDelta: Prisma.Decimal | string; // signed: negative for outflow, positive for inflow
  costDeltaMinor?: bigint | null;
  docType: string; // 'demand' | 'demand_unpost' | 'demand_cancel' | ...
  docId: string;
  docPositionId?: string | null;
  reason: 'post' | 'unpost' | 'cancel';
  /**
   * Address-storage cell (Адресное хранение, Phase 4). When set, applyDeltas ALSO
   * moves the materialized per-cell balance (StockByCell) by qtyDelta and records
   * the cellId on the ledger row. Null/omitted ⇒ store-level only (the 99% case) —
   * zero per-cell write, byte-identical to the pre-cell behaviour.
   */
  cellId?: string | null;
  /**
   * Yacheyka-inferensiya rejimi (2026-07-29 drift-fix).
   *   undefined/'auto' — no-cell delta uchun IMPLICIT joylash: KIRIMda tovarning
   *     uy-yacheykasiga (resolveHomeCells), CHIQIMda band yacheykalardan avtomat-
   *     yechish (real sotuv/qabul — tovar jismonan yacheykadan chiqadi/kiradi).
   *   'store-only' — FAQAT store-darajasidagi Stock siljiydi; HECH QANDAY
   *     StockByCell ga tegilmaydi. Chaqiruvchi per-cell balansni O'ZI boshqaradigan
   *     holatlar uchun: `place` (yacheykasiz «остаток» dan chiqim) va `setCellStock`
   *     (count true-up — cellId'li hujjat orqali yoziladi). Bularsiz avtomat-
   *     inferensiya IKKI-YOZUVGA olib kelardi ⇒ Σ StockByCell store jamidan
   *     oshib/kamayib ketardi (fantom «Занята» / noto'g'ri «С этим товаром»).
   */
  cellMode?: 'auto' | 'store-only';
}

export interface StockBalance {
  storeId: string;
  assortmentKind: string;
  assortmentId: string;
  qty: string; // decimal as string
  reservedQty: string;
  /** Aggregate cost-of-goods for the on-hand qty (BigInt as string). */
  costBalanceMinor?: string;
}

export interface Shortage {
  assortmentKind: string;
  assortmentId: string;
  requested: string;
  available: string;
  shortage: string;
}

/**
 * Round-4 unit 2 (§114) — a reservation delta. Positive qtyDelta =
 * reserve (raise Stock.reservedQty), negative = release. Does NOT move
 * Stock.qty (reservation is the soft-hold axis, separate from the
 * StockOperation hard-movement axis).
 */
export interface ReservationDelta {
  storeId: string;
  assortmentKind: string;
  assortmentId: string;
  qtyDelta: Prisma.Decimal | string; // signed: + reserve, - release
  docType: string; // 'production' (first adopter), 'customerorder' (manual reserve)
  docId: string;
  reason: 'reserve' | 'release_unpost' | 'release_cancel' | 'release_consume' | 'release_manual';
}

/**
 * Decimal(20,6) → exact integer micro-units (×1e6) — no float drift.
 *
 * Faza 34: this file used to carry its OWN copy of the parse/format pair.
 * There is now exactly ONE implementation (`shared/decimal.ts`, a
 * dependency-free leaf module) shared by every quantity/cost call site;
 * the local names are kept because `micro` is this file's vocabulary.
 */
const toMicro = parseDecimalScaled;
/** Exact integer micro-units → trimmed Decimal(20,6) string. */
const fromMicro = formatDecimalScaled;

/**
 * «Доступно» for POSTING purposes = on-hand − reserved, exact Decimal(20,6).
 *
 * THE single definition of that formula (STK-12): it was hand-rolled with
 * `Math.max(0, Number(qty) - Number(reservedQty))` in customer-order and
 * internal-order shortfall while `assertAvailable` used the exact BigInt
 * path here — three copies that could disagree on fractional Decimal(20,6)
 * quantities and would drift apart the moment the formula changes.
 *
 * ⚠️ NOT moysklad's DISPLAYED «Доступно» (= Остаток − Резерв + Ожидание).
 * In-transit must never relax a posting check — see assertAvailable's §2c
 * note and StockBalanceService for the displayed variant.
 *
 * Two shapes over ONE subtraction:
 *   availableMicroOf — raw, SIGNED micro-units. `assertAvailable` needs the
 *     signed value: on an already-negative balance the shortage is
 *     `requested − (−5)`, and clamping would understate it.
 *   availableOf — clamped-at-zero Decimal string, the «how much can this
 *     order cover» reading the shortfall endpoints want (their old
 *     `Math.max(0, …)`).
 */
export function availableMicroOf(
  balance: { qty: string; reservedQty: string } | null | undefined,
): bigint {
  if (!balance) return 0n;
  return parseDecimalScaled(balance.qty) - parseDecimalScaled(balance.reservedQty);
}

export function availableOf(
  balance: { qty: string; reservedQty: string } | null | undefined,
): string {
  const micro = availableMicroOf(balance);
  return micro > 0n ? formatDecimalScaled(micro) : '0';
}

/**
 * Pure: collapse a doc's reservation ledger rows to the OUTSTANDING net
 * per (store, assortment) — exact via BigInt micro-units. Only entries
 * with a positive net are still "held"; <=0 means already fully
 * released (idempotent double-release ⇒ nothing to do). Exported for
 * adversarial unit tests (no DB).
 */
export function netOutstandingReservations(
  rows: Array<{
    storeId: string;
    assortmentKind: string;
    assortmentId: string;
    qtyDelta: string;
  }>,
): Array<{ storeId: string; assortmentKind: string; assortmentId: string; net: string }> {
  const acc = new Map<
    string,
    { storeId: string; assortmentKind: string; assortmentId: string; micro: bigint }
  >();
  for (const r of rows) {
    const key = `${r.storeId}|${r.assortmentKind}|${r.assortmentId}`;
    const cur = acc.get(key);
    if (cur) cur.micro += toMicro(r.qtyDelta);
    else
      acc.set(key, {
        storeId: r.storeId,
        assortmentKind: r.assortmentKind,
        assortmentId: r.assortmentId,
        micro: toMicro(r.qtyDelta),
      });
  }
  const out: Array<{
    storeId: string;
    assortmentKind: string;
    assortmentId: string;
    net: string;
  }> = [];
  for (const v of acc.values()) {
    if (v.micro > 0n) {
      out.push({
        storeId: v.storeId,
        assortmentKind: v.assortmentKind,
        assortmentId: v.assortmentId,
        net: fromMicro(v.micro),
      });
    }
  }
  return out;
}

/** Uy-yacheyka keshi uchun kalit: bitta (ombor × tovar) juftligi. */
function homeKey(d: { storeId: string; assortmentKind: string; assortmentId: string }): string {
  return `${d.storeId}|${d.assortmentKind}|${d.assortmentId}`;
}

@Injectable()
export class StockService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Read balances for a set of (store × assortment) pairs. Returns a map keyed by assortmentId. */
  async getBalances(
    accountId: string,
    storeId: string,
    assortments: Array<{ kind: string; id: string }>,
  ): Promise<Map<string, StockBalance>> {
    if (assortments.length === 0) return new Map();

    const rows = await this.prisma.client.stock.findMany({
      where: {
        accountId,
        storeId,
        OR: assortments.map((a) => ({
          assortmentKind: a.kind,
          assortmentId: a.id,
        })),
      },
    });

    const map = new Map<string, StockBalance>();
    for (const r of rows) {
      map.set(r.assortmentId, {
        storeId: r.storeId,
        assortmentKind: r.assortmentKind,
        assortmentId: r.assortmentId,
        qty: r.qty.toString(),
        reservedQty: r.reservedQty.toString(),
        costBalanceMinor: r.costBalanceMinor.toString(),
      });
    }
    return map;
  }

  /**
   * Apply a batch of stock deltas inside the caller's transaction.
   *
   * Contract:
   *   - Every delta writes one StockOperation row.
   *   - Every (store, kind, assortment) also upserts its Stock row (increment qty by delta).
   *   - Caller MUST have locked the affected Stock rows via `lockBalances` first
   *     when stock sufficiency matters (posting).
   */
  async applyDeltas(
    tx: Prisma.TransactionClient,
    accountId: string,
    createdById: string | null,
    deltas: StockDelta[],
  ): Promise<void> {
    if (deltas.length === 0) return;

    // 1. Ledger inserts (createMany for efficiency, but we need the IDs only if
    //    we expose them back — skip for now).
    await tx.stockOperation.createMany({
      data: deltas.map((d) => ({
        accountId,
        storeId: d.storeId,
        assortmentKind: d.assortmentKind,
        assortmentId: d.assortmentId,
        cellId: d.cellId ?? null,
        qtyDelta: d.qtyDelta as Prisma.Decimal,
        costDeltaMinor: d.costDeltaMinor ?? null,
        docType: d.docType,
        docId: d.docId,
        docPositionId: d.docPositionId ?? null,
        reason: d.reason,
        createdById,
      })),
    });

    // 2. Materialized balance upserts. Must be sequential per (store, assortment) key.
    //    When the caller passes `costDeltaMinor`, we also mirror that into
    //    Stock.costBalanceMinor so the weighted-average per-unit cost stays
    //    accurate. Docs that don't track cost (e.g. Inventory variance qty-
    //    only adjustments) pass null and the cost balance is left untouched.
    for (const d of deltas) {
      const costInc =
        d.costDeltaMinor !== null && d.costDeltaMinor !== undefined ? d.costDeltaMinor : null;
      await tx.stock.upsert({
        where: {
          accountId_storeId_assortmentKind_assortmentId: {
            accountId,
            storeId: d.storeId,
            assortmentKind: d.assortmentKind,
            assortmentId: d.assortmentId,
          },
        },
        create: {
          accountId,
          storeId: d.storeId,
          assortmentKind: d.assortmentKind,
          assortmentId: d.assortmentId,
          qty: d.qtyDelta as Prisma.Decimal,
          reservedQty: 0,
          costBalanceMinor: costInc ?? 0n,
        },
        update: {
          qty: { increment: d.qtyDelta as Prisma.Decimal },
          ...(costInc !== null ? { costBalanceMinor: { increment: costInc } } : {}),
        },
      });
    }

    // 3. Per-cell balance (Адресное хранение, Phase 4).
    //
    //    a) EXPLICIT cell (d.cellId set — Supply/Enter/Loss/returns): mirror the
    //       Stock upsert exactly on the (…, cellId) row.
    //    b) OUTBOUND with NO cell (Demand sale, Move-out, Inventory shortage —
    //       whose position models carry no cellId): the goods still physically
    //       leave the cells they occupy. Without this, cells only ever get
    //       INCREMENTED (by supply/enter) and never decremented → StockByCell
    //       drifts permanently ABOVE the store total, cells show phantom
    //       occupancy and render «Занята» forever (the owner's exact complaint).
    //       So we auto-deduct the outflow from the SKU's occupied cells,
    //       largest-first, capped per cell (never negative). Any remainder means
    //       the SKU also held un-celled stock — that part stays store-level only.
    //       Safe under concurrency: every outbound caller lockBalances/Serializable
    //       -serializes same-SKU postings before reaching here, so two demands
    //       can't both read+decrement the same cell.
    //    c) INBOUND with no cell (positive delta, no cellId): can't be
    //       auto-placed into a specific cell → store-level only (unchanged).
    // Yacheykasiz KIRIM uchun tovarning «uy» yacheykasi (2026-07-29).
    // Ilgari yacheykasiz kirim ombor darajasida qolib ketardi va hech qaysi
    // yacheykada ko'rinmasdi — omborchi qabulda yacheykani tanlashni unutsa,
    // tovar «yo'qolardi» (izoh: c-band). Endi tovarga BIRIKTIRILGAN uy-yacheykasi
    // bo'lsa (Product.attributes.__yacheyka — `bindProductIfEmpty` yozadi),
    // kirim o'sha yacheykaga tushadi. Biriktirma yo'q bo'lsa xulq o'zgarmaydi.
    const homeCells = await this.resolveHomeCells(tx, accountId, deltas);

    for (const d of deltas) {
      // 'store-only' — chaqiruvchi StockByCell'ni O'ZI yozadi (yoki bu yacheykasiz
      // «остаток» chiqimi): avtomat uy-joylash / band-yacheyka yechishни BUTUNLAY
      // o'tkazib yubor, aks holda ikki-yozuv → Σcell drift (2026-07-29 fix).
      if (d.cellMode === 'store-only') continue;
      const targetCell =
        d.cellId ?? (toMicro(String(d.qtyDelta)) > 0n ? homeCells.get(homeKey(d)) : undefined);
      if (targetCell) {
        await tx.stockByCell.upsert({
          where: {
            accountId_storeId_cellId_assortmentKind_assortmentId: {
              accountId,
              storeId: d.storeId,
              cellId: targetCell,
              assortmentKind: d.assortmentKind,
              assortmentId: d.assortmentId,
            },
          },
          create: {
            accountId,
            storeId: d.storeId,
            cellId: targetCell,
            assortmentKind: d.assortmentKind,
            assortmentId: d.assortmentId,
            qty: d.qtyDelta as Prisma.Decimal,
          },
          update: {
            qty: { increment: d.qtyDelta as Prisma.Decimal },
          },
        });
        continue;
      }

      const micro = toMicro(String(d.qtyDelta));
      // Kirim/nol bu yerga faqat uy-yacheykasi TOPILMAGANDA yetib keladi
      // ⇒ joylashtiradigan yacheyka yo'q, ombor darajasida qoladi.
      if (micro >= 0n) continue;

      let remaining = -micro; // positive amount still to remove from cells
      const occupied = await tx.stockByCell.findMany({
        where: {
          accountId,
          storeId: d.storeId,
          assortmentKind: d.assortmentKind,
          assortmentId: d.assortmentId,
          qty: { gt: 0 },
        },
        orderBy: { qty: 'desc' },
      });
      for (const c of occupied) {
        if (remaining <= 0n) break;
        const have = toMicro(c.qty.toString());
        const take = have < remaining ? have : remaining;
        if (take <= 0n) continue;
        await tx.stockByCell.update({
          where: {
            accountId_storeId_cellId_assortmentKind_assortmentId: {
              accountId,
              storeId: d.storeId,
              cellId: c.cellId,
              assortmentKind: d.assortmentKind,
              assortmentId: d.assortmentId,
            },
          },
          data: { qty: { decrement: fromMicro(take) as unknown as Prisma.Decimal } },
        });
        remaining -= take;
      }
    }
  }

  /**
   * Guard: every non-null cellId must be a real StoreCell of THIS (account, store).
   * The picker only offers in-store cells, but a buggy/malicious client could post a
   * foreign cellId — that would credit/debit a cell in another warehouse. Reject it.
   */
  /**
   * Yacheykasiz KIRIM deltalari uchun tovarning «uy» yacheykasini topadi.
   *
   * Manba — `Product.attributes.__yacheyka` (yacheyka NOMI, `bindProductIfEmpty`
   * yozadi). Nom o'sha ombordagi `StoreCell` ga xaritalanadi; topilmasa juftlik
   * natijaga kirmaydi va chaqiruvchi eski xulqni saqlaydi (ombor darajasi).
   *
   * Ikkita qo'shimcha so'rov FAQAT yacheykasiz kirim bo'lganda yuriladi ⇒
   * yacheykasiz ishlaydigan akkauntlarga (99% holat) qo'shimcha yuk yo'q.
   */
  private async resolveHomeCells(
    tx: Prisma.TransactionClient,
    accountId: string,
    deltas: StockDelta[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const need = deltas.filter(
      (d) =>
        !d.cellId &&
        d.cellMode !== 'store-only' &&
        d.assortmentKind === 'product' &&
        toMicro(String(d.qtyDelta)) > 0n,
    );
    if (need.length === 0) return out;

    const productIds = [...new Set(need.map((d) => d.assortmentId))];
    const products = await tx.product.findMany({
      where: { accountId, id: { in: productIds } },
      select: { id: true, attributes: true },
    });
    const cellNameByProduct = new Map<string, string>();
    for (const p of products) {
      const attrs =
        p.attributes && typeof p.attributes === 'object' && !Array.isArray(p.attributes)
          ? (p.attributes as Record<string, unknown>)
          : {};
      const name = typeof attrs.__yacheyka === 'string' ? attrs.__yacheyka.trim() : '';
      if (name) cellNameByProduct.set(p.id, name);
    }
    if (cellNameByProduct.size === 0) return out;

    const storeIds = [...new Set(need.map((d) => d.storeId))];
    const cells = await tx.storeCell.findMany({
      where: {
        accountId,
        storeId: { in: storeIds },
        name: { in: [...cellNameByProduct.values()] },
      },
      select: { id: true, name: true, storeId: true },
    });
    const cellByStoreName = new Map<string, string>();
    for (const c of cells) cellByStoreName.set(`${c.storeId}|${c.name}`, c.id);

    for (const d of need) {
      const name = cellNameByProduct.get(d.assortmentId);
      if (!name) continue;
      const cellId = cellByStoreName.get(`${d.storeId}|${name}`);
      if (cellId) out.set(homeKey(d), cellId);
    }
    return out;
  }

  async assertCellsInStore(
    accountId: string,
    storeId: string,
    cellIds: Array<string | null | undefined>,
  ): Promise<void> {
    const ids = [...new Set(cellIds.filter((c): c is string => !!c))];
    if (ids.length === 0) return;
    const found = await this.prisma.client.storeCell.count({
      where: { id: { in: ids }, accountId, storeId },
    });
    if (found !== ids.length) {
      throw new BadRequestException('Tanlangan yacheyka bu omborga tegishli emas');
    }
  }

  /**
   * «С этим товаром» — cells in this store that currently HOLD the given assortment
   * (qty > 0). Backed by @@index([accountId, storeId, assortmentKind, assortmentId]).
   */
  async getCellsHoldingProduct(
    accountId: string,
    storeId: string,
    assortmentKind: string,
    assortmentId: string,
  ): Promise<Array<{ cellId: string; qty: string }>> {
    const rows = await this.prisma.client.stockByCell.findMany({
      where: { accountId, storeId, assortmentKind, assortmentId, qty: { gt: 0 } },
      select: { cellId: true, qty: true },
    });
    return rows.map((r) => ({ cellId: r.cellId, qty: r.qty.toString() }));
  }

  /**
   * «Свободна/Занята» — the set of cellIds in this store that hold ANY stock
   * (qty > 0 for some assortment). A cell NOT in the set is «Свободна».
   * Backed by @@index([cellId]).
   */
  async getOccupiedCellIds(accountId: string, storeId: string): Promise<Set<string>> {
    const rows = await this.prisma.client.stockByCell.findMany({
      where: { accountId, storeId, qty: { gt: 0 } },
      select: { cellId: true },
      distinct: ['cellId'],
    });
    return new Set(rows.map((r) => r.cellId));
  }

  /**
   * Pessimistic lock on Stock rows for the given (store × assortment) list.
   * Ensures concurrent demand postings against the same SKU cannot both pass
   * the sufficiency check. Lock order is assortmentId asc to prevent deadlocks
   * between multi-line concurrent transactions.
   *
   * Returns the locked rows; missing rows are NOT inserted here (caller can
   * treat them as qty=0 then upsert inside applyDeltas).
   */
  async lockBalances(
    tx: Prisma.TransactionClient,
    accountId: string,
    storeId: string,
    assortments: Array<{ kind: string; id: string }>,
  ): Promise<Map<string, StockBalance>> {
    if (assortments.length === 0) return new Map();

    // Sort for deadlock avoidance.
    const sorted = [...assortments].sort((a, b) => a.id.localeCompare(b.id));
    // We use (kind, id) tuple match. Build a predicate expression safely.
    // Prisma's $queryRaw supports parameterization. Since Postgres only allows
    // FOR UPDATE with plain SELECT (no JOIN/AGG), we keep it simple.
    const ids = sorted.map((a) => a.id);
    const kinds = Array.from(new Set(sorted.map((a) => a.kind)));

    const rows: Array<{
      account_id: string;
      store_id: string;
      assortment_kind: string;
      assortment_id: string;
      qty: string;
      reserved_qty: string;
      cost_balance_minor: string;
    }> = await tx.$queryRaw`
      SELECT account_id, store_id, assortment_kind, assortment_id,
             qty::text AS qty,
             reserved_qty::text AS reserved_qty,
             cost_balance_minor::text AS cost_balance_minor
      FROM stocks
      WHERE account_id = ${accountId}::uuid
        AND store_id = ${storeId}::uuid
        AND assortment_kind = ANY(${kinds}::varchar[])
        AND assortment_id = ANY(${ids}::uuid[])
      ORDER BY assortment_id ASC
      FOR UPDATE
    `;

    const map = new Map<string, StockBalance>();
    for (const r of rows) {
      map.set(r.assortment_id, {
        storeId: r.store_id,
        assortmentKind: r.assortment_kind,
        assortmentId: r.assortment_id,
        qty: r.qty,
        reservedQty: r.reserved_qty,
        costBalanceMinor: r.cost_balance_minor,
      });
    }
    return map;
  }

  /**
   * Ensure requested quantities are available. If store.allowNegativeStock,
   * returns silently. Otherwise throws BadRequestException with shortage detail.
   */
  assertAvailable(
    allowNegativeStock: boolean,
    requests: Array<{
      assortmentKind: string;
      assortmentId: string;
      name?: string;
      requested: string | number;
    }>,
    balances: Map<string, StockBalance>,
  ): void {
    if (allowNegativeStock) return;

    // AGGREGATE duplicate lines for the SAME assortment BEFORE checking —
    // otherwise two 60-unit lines against a 100-unit balance would EACH pass
    // the per-line check (60 ≤ 100 twice) and oversell to −20, silently
    // slipping past the no-negative guard. Sum in exact Decimal(20,6)
    // micro-units (BigInt) so fractional quantities never drift on float
    // (`Number()` on a Decimal(20,6) loses precision past ~15 significant
    // digits → spurious block OR sub-unit oversell).
    const agg = new Map<string, { kind: string; id: string; name?: string; micro: bigint }>();
    for (const r of requests) {
      const m = toMicro(String(r.requested));
      const cur = agg.get(r.assortmentId);
      if (cur) cur.micro += m;
      else
        agg.set(r.assortmentId, {
          kind: r.assortmentKind,
          id: r.assortmentId,
          name: r.name,
          micro: m,
        });
    }

    const shortages: Array<Shortage & { name?: string }> = [];
    for (const want of agg.values()) {
      const bal = balances.get(want.id);
      // §2c — POSTING SUFFICIENCY = PHYSICAL on-hand − reserved.
      // ⚠️ This is DELIBERATELY *not* moysklad's displayed «Доступно»
      // (= Остаток − Резерв + Ожидание). Expected-incoming (in-transit)
      // must NOT relax this block — you cannot ship goods that have not
      // physically arrived. The displayed «Доступно» (which DOES add
      // in-transit) lives in StockBalanceService; keep the two separate.
      // See `_IN-TRANSIT-OZHIDANIE-DESIGN-2026-06-12.md` §6 — conflating
      // them would let a Demand ship unarrived stock (silent integrity bug).
      // Zero-regression: reservedQty is 0 in every pre-§115 flow
      // (only Production reservation writes it), so qty − 0 === qty
      // ⇒ byte-identical unless a reservation actually exists; then
      // it correctly blocks other documents from the held stock.
      const availMicro = availableMicroOf(bal);
      if (want.micro > availMicro) {
        shortages.push({
          assortmentKind: want.kind,
          assortmentId: want.id,
          name: want.name,
          requested: fromMicro(want.micro),
          available: fromMicro(availMicro),
          shortage: fromMicro(want.micro - availMicro),
        });
      }
    }
    if (shortages.length > 0) {
      throw new BadRequestException({
        error: 'InsufficientStock',
        message: "Omborda yetarli miqdor yo'q",
        details: { shortages },
      });
    }
  }

  // =========================================================================
  // Reservation primitive (round-4 unit 2 / §114)
  // =========================================================================

  /**
   * Apply reservation deltas — dual-write the StockReservation ledger +
   * Stock.reservedQty, mirroring applyDeltas (which does the qty axis).
   *
   * Concurrency contract is IDENTICAL to applyDeltas: the caller MUST
   * `lockBalances(tx, …)` the affected (store × assortment) rows first,
   * inside the same `tx`, so two concurrent reservers cannot lost-update
   * reservedQty. Over-reservation is allowed by design (moysklad parity:
   * you may reserve goods you will produce/receive — available =
   * qty − reservedQty is permitted to go negative); there is no
   * sufficiency block here.
   *
   * `Stock.reservedQty` stays == SUM(StockReservation.qtyDelta) for the
   * (store, assortment) — the ledger is the rebuildable source of truth.
   */
  async applyReservationDeltas(
    tx: Prisma.TransactionClient,
    accountId: string,
    createdById: string | null,
    deltas: ReservationDelta[],
  ): Promise<void> {
    if (deltas.length === 0) return;

    await tx.stockReservation.createMany({
      data: deltas.map((d) => ({
        accountId,
        storeId: d.storeId,
        assortmentKind: d.assortmentKind,
        assortmentId: d.assortmentId,
        qtyDelta: d.qtyDelta as Prisma.Decimal,
        docType: d.docType,
        docId: d.docId,
        reason: d.reason,
        createdById,
      })),
    });

    for (const d of deltas) {
      await tx.stock.upsert({
        where: {
          accountId_storeId_assortmentKind_assortmentId: {
            accountId,
            storeId: d.storeId,
            assortmentKind: d.assortmentKind,
            assortmentId: d.assortmentId,
          },
        },
        create: {
          accountId,
          storeId: d.storeId,
          assortmentKind: d.assortmentKind,
          assortmentId: d.assortmentId,
          qty: 0,
          reservedQty: d.qtyDelta as Prisma.Decimal,
          costBalanceMinor: 0n,
        },
        update: {
          reservedQty: { increment: d.qtyDelta as Prisma.Decimal },
        },
      });
    }
  }

  /**
   * Release a document's OUTSTANDING reservation exactly — reverses the
   * net recorded qtyDelta per (store, assortment), NEVER recomputed from
   * a BOM that may have changed (materialsSnapshot exact-reversal
   * discipline). Idempotent: a doc whose net is already ≤0 (already
   * released / never reserved) is a clean no-op, so a double
   * unpost/cancel cannot drive reservedQty negative.
   *
   * Caller MUST have lockBalances'd the affected rows in the same tx.
   *
   * Qaytaradi: rostdan ham BO'SHATILDIMI. Chaqiruvchiga bu kerak, chunki
   * bo'shatish `Stock.reservedQty` ni o'zgartiradi — ya'ni undan keyin
   * qulflangan balanslar ESKIRADI va `assertAvailable` eski rezerv bilan
   * hisoblardi. Javob `false` bo'lsa (rezervi yo'q hujjat — masalan
   * picking'siz sotilgan chek) qayta o'qish KERAK EMAS, va bu yo'l bitta
   * ortiqcha qulflovchi SELECT ham qilmaydi (P3, 2026-08-12).
   */
  async releaseReservationByDoc(
    tx: Prisma.TransactionClient,
    accountId: string,
    createdById: string | null,
    docType: string,
    docId: string,
    reason: 'release_unpost' | 'release_cancel' | 'release_consume' | 'release_manual',
  ): Promise<boolean> {
    const rows = await tx.stockReservation.findMany({
      where: { accountId, docType, docId },
      select: { storeId: true, assortmentKind: true, assortmentId: true, qtyDelta: true },
    });
    if (rows.length === 0) return false;

    const nets = netOutstandingReservations(
      rows.map((r) => ({
        storeId: r.storeId,
        assortmentKind: r.assortmentKind,
        assortmentId: r.assortmentId,
        qtyDelta: r.qtyDelta.toString(),
      })),
    );
    if (nets.length === 0) return false; // already fully released — idempotent

    await this.applyReservationDeltas(
      tx,
      accountId,
      createdById,
      nets.map((n) => ({
        storeId: n.storeId,
        assortmentKind: n.assortmentKind,
        assortmentId: n.assortmentId,
        qtyDelta: `-${n.net}`,
        docType,
        docId,
        reason,
      })),
    );
    return true;
  }
}

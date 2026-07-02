import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

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

/** Decimal(20,6) → exact integer micro-units (×1e6) — no float drift. */
function toMicro(v: string): bigint {
  const neg = v.trim().startsWith('-');
  const abs = neg ? v.trim().slice(1) : v.trim();
  const [whole, frac = ''] = abs.split('.');
  const micro = `${whole}${frac.padEnd(6, '0').slice(0, 6)}`;
  const n = BigInt(micro || '0');
  return neg ? -n : n;
}

/** Exact integer micro-units → trimmed Decimal(20,6) string. */
function fromMicro(micro: bigint): string {
  const neg = micro < 0n;
  const abs = (neg ? -micro : micro).toString().padStart(7, '0');
  const whole = abs.slice(0, -6);
  const frac = abs.slice(-6).replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
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

    const shortages: Array<Shortage & { name?: string }> = [];
    for (const r of requests) {
      const bal = balances.get(r.assortmentId);
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
      const avail = bal ? Number(bal.qty) - Number(bal.reservedQty) : 0;
      const want = Number(r.requested);
      if (want > avail) {
        shortages.push({
          assortmentKind: r.assortmentKind,
          assortmentId: r.assortmentId,
          name: r.name,
          requested: String(want),
          available: String(avail),
          shortage: String(want - avail),
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
   */
  async releaseReservationByDoc(
    tx: Prisma.TransactionClient,
    accountId: string,
    createdById: string | null,
    docType: string,
    docId: string,
    reason: 'release_unpost' | 'release_cancel' | 'release_consume' | 'release_manual',
  ): Promise<void> {
    const rows = await tx.stockReservation.findMany({
      where: { accountId, docType, docId },
      select: { storeId: true, assortmentKind: true, assortmentId: true, qtyDelta: true },
    });
    if (rows.length === 0) return;

    const nets = netOutstandingReservations(
      rows.map((r) => ({
        storeId: r.storeId,
        assortmentKind: r.assortmentKind,
        assortmentId: r.assortmentId,
        qtyDelta: r.qtyDelta.toString(),
      })),
    );
    if (nets.length === 0) return; // already fully released — idempotent

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
  }
}

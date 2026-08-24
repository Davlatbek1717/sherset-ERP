import type { Prisma } from '@moysklad/db';
import { UNASSIGNED_SOURCE_KEY } from '../shared/pool-placement.js';

/**
 * F7 — hovuz-omborni topadi: `attributes.__unassignedSource === true` belgisi
 * qo'yilgan, arxivlanmagan Store (odatda «Taqsimlanmagan»). Belgisi bor bir
 * nechta ombor bo'lsa nom bo'yicha birinchisi olinadi (deterministik).
 * Hovuz belgilanmagan akkauntda `null` — chaqiruvchilar eski xulqni saqlaydi.
 */
export async function findPoolStore(
  db: Prisma.TransactionClient,
  accountId: string,
  opts?: { excludeStoreId?: string },
): Promise<{ id: string; name: string } | null> {
  const rows = await db.store.findMany({
    where: {
      accountId,
      archived: false,
      attributes: { path: [UNASSIGNED_SOURCE_KEY], equals: true },
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const filtered = opts?.excludeStoreId ? rows.filter((r) => r.id !== opts.excludeStoreId) : rows;
  return filtered[0] ?? null;
}

/**
 * Manba holatini yig'ish uchun yordamchi: (ombor × tovarlar) bo'yicha
 * Σ StockByCell. Chaqiruvchi Stock qatorlarini `lockBalances` bilan qulf ostida
 * o'qigan bo'ladi — bu yig'indi o'sha tranzaksiya ichida chaqiriladi.
 */
export async function sumAssignedByAssortment(
  db: Prisma.TransactionClient,
  accountId: string,
  storeId: string,
  assortments: Array<{ kind: string; id: string }>,
): Promise<Map<string, string>> {
  if (assortments.length === 0) return new Map();
  const rows = await db.stockByCell.groupBy({
    by: ['assortmentKind', 'assortmentId'],
    where: {
      accountId,
      storeId,
      OR: assortments.map((a) => ({ assortmentKind: a.kind, assortmentId: a.id })),
    },
    _sum: { qty: true },
  });
  const out = new Map<string, string>();
  for (const r of rows) {
    out.set(`${r.assortmentKind}|${r.assortmentId}`, (r._sum.qty ?? 0).toString());
  }
  return out;
}

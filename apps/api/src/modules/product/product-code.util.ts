import type { Prisma } from '@moysklad/db';
import { allocateDocumentNumber } from '../../prisma/document-number.js';

/**
 * moysklad shares ONE «Код» sequence across products AND their variants
 * (Скоч маляр = 00001 → its modifications 00002, 00003), so both tables are read
 * for the seed and both are probed for collisions. The counter key is `'product'`
 * for the product create-form, the variant module and the cut/remnant flow alike.
 */
const KEY = 'product';

/** Both the full client and a transaction client can allocate an assortment code. */
type AssortmentClient = Pick<Prisma.TransactionClient, 'product' | 'variant' | 'documentSequence'>;

/** moysklad displays codes 5-digit zero-padded (e.g. 07758). */
export const padProductCode = (n: number): string => String(n).padStart(5, '0');

/**
 * Seed value for the shared 'product' counter: the MAX existing numeric code
 * across products AND variants (NOT the row count — `code` is UNIQUE per account
 * and gaps/manual entries push real codes above the count). Non-numeric codes
 * parse to 0. The counter's first allocation is this + 1.
 */
export async function maxAssortmentCode(
  client: AssortmentClient,
  accountId: string,
): Promise<number> {
  const [products, variants] = await Promise.all([
    client.product.findMany({ where: { accountId, code: { not: null } }, select: { code: true } }),
    client.variant.findMany({ where: { accountId, code: { not: null } }, select: { code: true } }),
  ]);
  let max = 0;
  for (const r of [...products, ...variants]) {
    const n = Number.parseInt(r.code ?? '', 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/**
 * Is this number already used as a product/variant «Код»?
 *
 * Codes are stored zero-padded, so the probe compares the padded form — the same
 * string the caller is about to INSERT into the `(account_id, code)` unique index.
 */
async function assortmentCodeTaken(
  client: AssortmentClient,
  accountId: string,
  n: number,
): Promise<boolean> {
  const code = padProductCode(n);
  const [product, variant] = await Promise.all([
    client.product.findFirst({ where: { accountId, code }, select: { id: true } }),
    client.variant.findFirst({ where: { accountId, code }, select: { id: true } }),
  ]);
  return product !== null || variant !== null;
}

/**
 * Allocate the next FREE assortment «Код», 5-digit zero-padded.
 *
 * The collision probe is what makes this safe after a bulk import: `code` is
 * written by things the counter never sees (the MoySklad catalog import, manual
 * entry), and the counter row is seeded only once — so without the probe it stays
 * behind forever and every create dies on `Duplicate value on unique field:
 * account_id, code`. Measured in prod 2026-08-22: counter 4953 vs max code 05106,
 * 153 consecutive doomed creates, zero products created in six days.
 */
export async function allocateAssortmentCode(
  client: AssortmentClient,
  accountId: string,
): Promise<string> {
  const n = await allocateDocumentNumber(
    client,
    accountId,
    KEY,
    () => maxAssortmentCode(client, accountId),
    { isTaken: (v) => assortmentCodeTaken(client, accountId, v) },
  );
  return padProductCode(n);
}

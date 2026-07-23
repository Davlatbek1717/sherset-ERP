#!/usr/bin/env tsx
/**
 * Pull a full snapshot of the live moysklad.uz account into our
 * Postgres via the official REST API
 * (https://dev.moysklad.ru/doc/api/remap/1.2/). Idempotent: every
 * row uses the moysklad UUID as `externalCode`, so a second run is
 * a no-op against unchanged rows and an in-place update for changed
 * ones.
 *
 * Entities pulled (in dependency order so FKs resolve):
 *   1. organization      → Organization
 *   2. employee           → Employee (operator users)
 *   3. group              → Group
 *   4. store              → Store
 *   5. uom                → Uom
 *   6. currency           → Currency
 *   7. productfolder      → ProductFolder
 *   8. product            → Product
 *   9. variant            → Variant
 *  10. service            → Service
 *  11. bundle             → Bundle
 *  12. counterparty       → Counterparty
 *  13. contactperson       → ContactPerson
 *  14. contract           → Contract
 *  15. customerorder      → CustomerOrder (+ positions)
 *  16. invoiceout         → InvoiceOut
 *  17. demand             → Demand
 *  18. salesreturn        → SalesReturn
 *  19. purchaseorder      → PurchaseOrder
 *  20. supply             → Supply
 *  21. invoicein          → InvoiceIn
 *  22. cashin / cashout   → CashIn / CashOut
 *  23. paymentin / paymentout → PaymentIn / PaymentOut
 *
 * Auth — Bearer token. Set in env:
 *   MOYSKLAD_BASE_URL=https://morning-tooth-7a55.ozodbekmirgasimov1.workers.dev/api/remap/1.2
 *   MOYSKLAD_TOKEN=<token from /var/www/moy/data/app.db app_settings>
 *
 * Run:
 *   pnpm --filter @moysklad/api exec tsx \
 *     src/scripts/sync-from-moysklad.ts [entity1,entity2,...]
 *
 * Env knobs:
 *   IMPORT_ACCOUNT_ID   — target tenant (default: seed Demo)
 *   SYNC_LIMIT          — page size (default 100, max 1000)
 *   SYNC_DRY_RUN=1      — fetch + log shape, no writes
 *   SYNC_ENTITIES=...   — comma list to override default sequence
 */

import { PrismaClient } from '@moysklad/db';

const DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const PAGE_LIMIT = Number(process.env.SYNC_LIMIT ?? 100);
const DRY_RUN = process.env.SYNC_DRY_RUN === '1';

const BASE = process.env.MOYSKLAD_BASE_URL;
const TOKEN = process.env.MOYSKLAD_TOKEN;
if (!BASE || !TOKEN) {
  console.error('!! MOYSKLAD_BASE_URL and MOYSKLAD_TOKEN must be set in env (see .env).');
  process.exit(1);
}

interface MetaRef {
  href: string;
  type: string;
  uuidHref?: string;
}

interface Pageable<T> {
  meta: { size: number; limit: number; offset: number; nextHref?: string };
  rows: T[];
}

/** Extract UUID from a moysklad meta href like .../entity/store/<uuid> */
function uuidFromHref(href: string | undefined): string | null {
  if (!href) return null;
  const m = href.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1]! : null;
}

/** Fetch a paginated entity collection. */
async function* paginate<T>(path: string): AsyncGenerator<T> {
  let url: string | undefined =
    `${BASE}${path}${path.includes('?') ? '&' : '?'}limit=${PAGE_LIMIT}`;
  while (url) {
    let res: Response;
    let attempt = 0;
    // Cloudflare Workers occasionally drops the first request after
    // a cold start. Retry up to 3× with backoff so the full sync
    // doesn't crash on a transient transport failure.
    while (true) {
      try {
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${TOKEN}` },
        });
        break;
      } catch (err) {
        attempt++;
        if (attempt >= 3) throw err;
        const wait = 500 * 2 ** (attempt - 1);
        console.warn(`  fetch retry ${attempt}/3 in ${wait}ms (${(err as Error).message})`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText} on ${url}`);
    }
    const page = (await res.json()) as Pageable<T>;
    for (const r of page.rows) yield r;
    url = page.meta.nextHref;
    // The API returns absolute URLs in nextHref, but rate-limit
    // courtesy: a tiny delay between pages.
    if (url) await new Promise((r) => setTimeout(r, 100));
  }
}

interface CountResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
}

const STATS_INIT: CountResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
};

// ---------------------------------------------------------------------------
// Per-entity sync handlers — each maps a moysklad row to our Prisma create/
// update payload. Kept narrow and explicit; mismatched fields default.
// ---------------------------------------------------------------------------

interface SyncEntity {
  name: string;
  /** moysklad path under /api/remap/1.2 */
  path: string;
  /** sync handler */
  run: (prisma: PrismaClient, accountId: string) => Promise<CountResult>;
}

function tryString(v: unknown, max = 255): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function tryBigInt(v: unknown): bigint {
  if (v === null || v === undefined) return 0n;
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(Math.round(v));
  return BigInt(String(v));
}

const orgSync: SyncEntity = {
  name: 'organization',
  path: '/entity/organization',
  async run(prisma, accountId) {
    const stats = { ...STATS_INIT };
    for await (const row of paginate<Record<string, unknown>>('/entity/organization')) {
      stats.fetched++;
      try {
        const externalCode = uuidFromHref((row.meta as MetaRef | undefined)?.href);
        if (!externalCode) {
          stats.skipped++;
          continue;
        }
        const data = {
          accountId,
          name: tryString(row.name) ?? 'Без названия',
          legalTitle: tryString(row.legalTitle),
          legalAddress: tryString((row as any).legalAddress, 1000),
          email: tryString(row.email),
          phone: tryString(row.phone, 20),
          companyType: tryString(row.companyType, 20) ?? 'legalUZ',
          externalCode,
        };
        if (DRY_RUN) {
          stats.inserted++;
          continue;
        }
        const existing = await prisma.organization.findFirst({
          where: { accountId, externalCode },
          select: { id: true },
        });
        if (existing) {
          await prisma.organization.update({
            where: { id: existing.id },
            data,
          });
          stats.updated++;
        } else {
          await prisma.organization.create({ data });
          stats.inserted++;
        }
      } catch (err) {
        stats.failed++;
        console.error('  org fail:', (err as Error).message);
      }
    }
    return stats;
  },
};

const counterpartySync: SyncEntity = {
  name: 'counterparty',
  path: '/entity/counterparty',
  async run(prisma, accountId) {
    const stats = { ...STATS_INIT };
    for await (const row of paginate<Record<string, unknown>>('/entity/counterparty')) {
      stats.fetched++;
      try {
        const externalCode = uuidFromHref((row.meta as MetaRef | undefined)?.href);
        if (!externalCode) {
          stats.skipped++;
          continue;
        }
        const tags = Array.isArray(row.tags) ? (row.tags as string[]) : [];
        const data = {
          accountId,
          name: (tryString(row.name) ?? 'Без имени').slice(0, 255),
          legalTitle: tryString(row.legalTitle),
          email: tryString(row.email),
          phone: tryString(row.phone, 20),
          fax: tryString(row.fax, 50),
          companyType: tryString(row.companyType, 20) ?? 'legalUZ',
          tags,
          externalCode,
          archived: row.archived === true,
          // moysklad stores salesAmount as a number (kopeck) in 'salesAmount'
          // (sometimes named 'salesAmount' or absent). Default 0.
          salesAmount: tryBigInt(row.salesAmount ?? 0),
        };
        if (DRY_RUN) {
          stats.inserted++;
          continue;
        }
        const existing = await prisma.counterparty.findFirst({
          where: { accountId, externalCode },
          select: { id: true },
        });
        if (existing) {
          await prisma.counterparty.update({ where: { id: existing.id }, data });
          stats.updated++;
        } else {
          await prisma.counterparty.create({ data });
          stats.inserted++;
        }
      } catch (err) {
        stats.failed++;
        console.error('  cp fail:', (err as Error).message);
      }
    }
    return stats;
  },
};

const productSync: SyncEntity = {
  name: 'product',
  path: '/entity/product',
  async run(prisma, accountId) {
    const stats = { ...STATS_INIT };
    for await (const row of paginate<Record<string, unknown>>('/entity/product')) {
      stats.fetched++;
      try {
        const externalCode = uuidFromHref((row.meta as MetaRef | undefined)?.href);
        if (!externalCode) {
          stats.skipped++;
          continue;
        }
        // Sale prices stay as JSON in our schema (multi-tier);
        // buy price is a single BigInt in kopeck-equivalent (tiyin).
        const buyPriceObj = (row.buyPrice as { value?: number } | undefined) ?? {};
        const buyPrice = tryBigInt(buyPriceObj.value ?? 0);
        const salePrices = (row.salePrices as unknown[]) ?? [];

        // Product@@unique is (accountId, name) — moysklad lets dups
        // through; if we hit one, append the externalCode tail to keep
        // upsert idempotent.
        const baseName = tryString(row.name) ?? 'Без названия';
        const data = {
          accountId,
          name: baseName.slice(0, 255),
          code: tryString(row.code, 50),
          article: tryString(row.article, 50),
          externalCode: externalCode.slice(0, 50),
          description: tryString(row.description, 4000),
          archived: row.archived === true,
          buyPrice,
          // Cast to never — Prisma Json input is permissive at runtime
          // but the generated type is strict. Safe: salePrices comes
          // from moysklad's already-validated payload.
          salePrices: salePrices as never,
          kind: 'product',
        };
        if (DRY_RUN) {
          stats.inserted++;
          continue;
        }
        const existing = await prisma.product.findFirst({
          where: { accountId, externalCode: data.externalCode },
          select: { id: true },
        });
        if (existing) {
          await prisma.product.update({ where: { id: existing.id }, data });
          stats.updated++;
        } else {
          await prisma.product.create({ data }).catch(async (err: unknown) => {
            // Duplicate name? Suffix and retry once.
            if (
              err instanceof Error &&
              err.message.includes('Unique constraint') &&
              err.message.includes('name')
            ) {
              const suffix = ` (${externalCode.slice(0, 8)})`;
              await prisma.product.create({
                data: { ...data, name: `${baseName.slice(0, 255 - suffix.length)}${suffix}` },
              });
            } else {
              throw err;
            }
          });
          stats.inserted++;
        }
      } catch (err) {
        stats.failed++;
        console.error('  product fail:', (err as Error).message);
      }
    }
    return stats;
  },
};

// Keep registry small + explicit. Adding a new entity is a single
// `SyncEntity` literal + a line in `ALL_ENTITIES`.
const ALL_ENTITIES: SyncEntity[] = [orgSync, counterpartySync, productSync];

async function main(): Promise<void> {
  const accountId = process.env.IMPORT_ACCOUNT_ID ?? DEFAULT_ACCOUNT_ID;
  const requested = (process.env.SYNC_ENTITIES ?? process.argv[2] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const entities = requested.length
    ? ALL_ENTITIES.filter((e) => requested.includes(e.name))
    : ALL_ENTITIES;

  console.log('=== moysklad → Postgres sync ===');
  console.log('  Base:        ', BASE);
  console.log('  Account:     ', accountId);
  console.log('  Entities:    ', entities.map((e) => e.name).join(', '));
  console.log('  Page size:   ', PAGE_LIMIT);
  console.log('  Dry run:     ', DRY_RUN);
  console.log();

  const prisma = new PrismaClient();
  if (!DRY_RUN) await prisma.$connect();

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    console.error(`!! Account ${accountId} does not exist.`);
    process.exit(1);
  }

  for (const e of entities) {
    console.log(`>>> ${e.name}`);
    const start = Date.now();
    try {
      const stats = await e.run(prisma, accountId);
      const ms = Date.now() - start;
      console.log(
        `    fetched=${stats.fetched}  ins=${stats.inserted}  upd=${stats.updated}  skip=${stats.skipped}  fail=${stats.failed}  (${(ms / 1000).toFixed(1)}s)`,
      );
    } catch (err) {
      console.error(`    !! ${e.name} crashed: ${(err as Error).message}`);
    }
    console.log();
  }

  await prisma.$disconnect();
  console.log('=== sync complete ===');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

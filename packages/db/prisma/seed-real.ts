/**
 * Real-data importer — populates the local DB with production-shaped
 * data from two sources:
 *
 *  1. `tools/old-counterparties.json` — 2,678 counterparties exported
 *     from the legacy Python clone (always available, no token needed).
 *  2. moysklad.ru REST API — fetched live when MOYSKLAD_TOKEN is set
 *     in the environment. Pulls organizations, stores, products,
 *     counterparties, and customer-orders. Skipped silently when the
 *     token is absent.
 *
 * Strategy:
 *   - Demo account (00000000-...0001) is the import target so the
 *     existing admin@demo.local user keeps owning everything.
 *   - Every row is upserted by externalCode (set to the source's
 *     stable id), so re-running is idempotent.
 *   - Phone numbers run through the existing UZ E.164 normaliser
 *     before insert.
 *
 * Run:
 *   pnpm --filter @moysklad/db tsx prisma/seed-real.ts
 *
 * Optional env:
 *   MOYSKLAD_TOKEN=eyJ…    enables the live API fetch
 *   MOYSKLAD_BASE_URL      defaults to https://api.moysklad.ru/api/remap/1.2
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '../src/generated/index.js';
import { mapSalePriceTiers } from '../src/sale-price-tiers.js';

const prisma = new PrismaClient();

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const COUNTERPARTIES_JSON = resolve(ROOT, 'tools', 'old-counterparties.json');

const MOYSKLAD_TOKEN = process.env.MOYSKLAD_TOKEN ?? '';
const MOYSKLAD_BASE_URL = process.env.MOYSKLAD_BASE_URL ?? 'https://api.moysklad.ru/api/remap/1.2';

interface OldCounterparty {
  name: string;
  phone: string | null;
  email: string | null;
  externalCode: string;
  tags: string[];
  telegram: Record<string, unknown> | null;
  balanceFloat: number;
  createdAt: string;
}

async function importLegacyCounterparties(): Promise<number> {
  let raw: string;
  try {
    raw = await readFile(COUNTERPARTIES_JSON, 'utf-8');
  } catch {
    console.log('  ↳ tools/old-counterparties.json not found — skipping legacy import');
    return 0;
  }
  const rows: OldCounterparty[] = JSON.parse(raw);

  // No FSM state lookup — the unified State table is keyed by
  // entityType and counterparty's stateId is nullable, so we leave
  // it null and let the user pick a state via the detail page.

  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    if (!r.name || !r.externalCode) {
      skipped++;
      continue;
    }
    try {
      // No @@unique([accountId, externalCode]) on Counterparty, so we
      // dedupe with a findFirst → update/create dance instead of upsert.
      const existing = await prisma.counterparty.findFirst({
        where: { accountId: ACCOUNT_ID, externalCode: r.externalCode },
        select: { id: true },
      });
      if (existing) {
        await prisma.counterparty.update({
          where: { id: existing.id },
          data: {
            name: r.name,
            phone: r.phone,
            email: r.email,
            attributes: r.telegram ? { telegram: r.telegram } : {},
          },
        });
      } else {
        await prisma.counterparty.create({
          data: {
            accountId: ACCOUNT_ID,
            name: r.name,
            phone: r.phone,
            email: r.email,
            externalCode: r.externalCode,
            companyType: 'individual',
            tags: r.tags ?? [],
            attributes: r.telegram ? { telegram: r.telegram } : {},
          },
        });
      }
      inserted++;
      if (inserted % 250 === 0) {
        console.log(`  ↳ legacy counterparties: ${inserted}/${rows.length}`);
      }
    } catch (e) {
      skipped++;
      if (skipped <= 5) {
        console.warn(`  ! skipped ${r.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  console.log(`  ↳ Inserted/updated ${inserted} counterparties (${skipped} skipped)`);
  return inserted;
}

async function fetchMoyskladPaged<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const url = `${MOYSKLAD_BASE_URL}${path}?limit=${limit}&offset=${offset}`;

    // Up-to-5 retry loop with exponential backoff on 429s. Moysklad's
    // rate limit is 5 req/sec per token + 45 simultaneous; with paged
    // fetches this is plenty if we sleep ~250ms between batches.
    // Resilient page fetch — retry the SAME page on transient network drops
    // ("terminated" from the proxy) + 429, so paging resumes instead of losing
    // the batch; return partial on persistent failure (a re-run upserts the rest).
    let body: { rows?: T[]; meta?: { size?: number } } | null = null;
    let attempt = 0;
    for (;;) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${MOYSKLAD_TOKEN}`, 'Accept-Encoding': 'gzip' },
        });
        if (res.status === 429) {
          attempt++;
          if (attempt > 8) throw new Error('rate-limited 8×');
          const wait = 1000 * 2 ** Math.min(attempt, 5);
          console.log(`    ⚠ 429 rate-limited, retry ${attempt}/8 after ${wait}ms`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} — ${await res.text().catch(() => '')}`);
        }
        body = (await res.json()) as { rows?: T[]; meta?: { size?: number } };
        break;
      } catch (e) {
        attempt++;
        const msg = e instanceof Error ? e.message : String(e);
        const transient =
          /terminated|fetch failed|ECONNRESET|ETIMEDOUT|socket|network|aborted|EAI_AGAIN|rate-limited/i.test(
            msg,
          );
        if (!transient || attempt > 8) {
          console.warn(
            `    ! ${path}: page@${offset} failed after ${attempt} tries (${msg.slice(0, 80)}) — keeping ${out.length} partial`,
          );
          return out;
        }
        const wait = Math.min(30000, 1000 * 2 ** attempt);
        console.log(
          `    ⚠ ${path} page@${offset} transient (${msg.slice(0, 40)}), retry ${attempt}/8 in ${wait}ms`,
        );
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    const rows = body?.rows ?? [];
    out.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
    console.log(`    … fetched ${out.length} from ${path}`);
    // Pace ourselves so we never tickle the 5 req/sec ceiling.
    await new Promise((r) => setTimeout(r, 250));
  }
  return out;
}

/**
 * Same retry/backoff/pacing loop as fetchMoyskladPaged, but expands a nested
 * collection (e.g. `positions`). moysklad caps the page `limit` at 100 when an
 * `expand` is present, so the default pageLimit is 100 and paging stops as soon
 * as a page returns fewer than pageLimit rows.
 */
async function fetchMoyskladPagedExpanded<T>(
  path: string,
  expand: string,
  pageLimit = 100,
): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const url = `${MOYSKLAD_BASE_URL}${path}?expand=${expand}&limit=${pageLimit}&offset=${offset}`;
    // Resilient single-page fetch. The Cloudflare-worker proxy drops long fetch
    // sessions mid-stream ("terminated"); retry the SAME page (offset unchanged)
    // on transient network errors + 429 so the paging RESUMES instead of losing
    // the whole batch. On persistent failure, return the partial `out` (a re-run
    // upserts the rest) rather than throwing everything away.
    let body: { rows?: T[] } | null = null;
    let attempt = 0;
    for (;;) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${MOYSKLAD_TOKEN}`, 'Accept-Encoding': 'gzip' },
        });
        if (res.status === 429) {
          attempt++;
          if (attempt > 8) throw new Error('rate-limited 8×');
          const wait = 1000 * 2 ** Math.min(attempt, 5);
          console.log(`    ⚠ 429 rate-limited, retry ${attempt}/8 after ${wait}ms`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} — ${await res.text().catch(() => '')}`);
        }
        body = (await res.json()) as { rows?: T[] };
        break;
      } catch (e) {
        attempt++;
        const msg = e instanceof Error ? e.message : String(e);
        const transient =
          /terminated|fetch failed|ECONNRESET|ETIMEDOUT|socket|network|aborted|EAI_AGAIN|rate-limited/i.test(
            msg,
          );
        if (!transient || attempt > 8) {
          console.warn(
            `    ! ${path}: page@${offset} failed after ${attempt} tries (${msg.slice(0, 80)}) — keeping ${out.length} partial`,
          );
          return out;
        }
        const wait = Math.min(30000, 1000 * 2 ** attempt);
        console.log(
          `    ⚠ ${path} page@${offset} transient (${msg.slice(0, 40)}), retry ${attempt}/8 in ${wait}ms`,
        );
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    const rows = body?.rows ?? [];
    out.push(...rows);
    if (rows.length < pageLimit) break;
    offset += pageLimit;
    console.log(`    … fetched ${out.length} from ${path} (expanded)`);
    await new Promise((r) => setTimeout(r, 250));
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// Position import primitives (shared by every doc importer)
// ──────────────────────────────────────────────────────────────

/** A single position row as moysklad returns it with `expand=positions`. */
interface MsPosition {
  quantity?: number;
  price?: number;
  discount?: number;
  vat?: number | null;
  // Inventory positions carry the expected (system) count here.
  calculatedQuantity?: number;
  assortment?: { meta?: { href?: string; type?: string } };
}

/** Resolved assortment reference, or null when the uuid maps to nothing local. */
interface ResolvedAssortment {
  assortmentId: string;
  productId: string | null;
  assortmentKind: string;
}

type AssortmentResolver = (msId: string | null, type?: string) => ResolvedAssortment | null;

/**
 * Build a resolver that maps a moysklad assortment uuid (+ its meta `type`) to
 * a local assortment reference. Products, services and bundles all live in the
 * `product` table (externalCode `ms:<uuid>`) → kind 'product'. Variants live in
 * the `variant` table (externalCode `ms:<uuid>` if importLiveVariants set it).
 * Unknown uuid → null (caller SKIPs the position — never fabricate an id).
 */
async function buildAssortmentResolver(): Promise<AssortmentResolver> {
  const products = await prisma.product.findMany({
    where: { accountId: ACCOUNT_ID, externalCode: { startsWith: 'ms:' } },
    select: { id: true, externalCode: true },
  });
  const productByMs = new Map(
    products.map((p) => [(p.externalCode ?? '').replace(/^ms:/, ''), p.id]),
  );
  const variants = await prisma.variant.findMany({
    where: { accountId: ACCOUNT_ID, externalCode: { startsWith: 'ms:' } },
    select: { id: true, externalCode: true },
  });
  const variantByMs = new Map(
    variants.map((v) => [(v.externalCode ?? '').replace(/^ms:/, ''), v.id]),
  );

  return (msId: string | null, type?: string): ResolvedAssortment | null => {
    if (!msId) return null;
    // Prefer the meta type when present, but fall back to a table lookup so a
    // missing/unknown type still resolves.
    if (type === 'variant') {
      const vid = variantByMs.get(msId);
      return vid ? { assortmentId: vid, productId: null, assortmentKind: 'variant' } : null;
    }
    const pid = productByMs.get(msId);
    if (pid) return { assortmentId: pid, productId: pid, assortmentKind: 'product' };
    const vid = variantByMs.get(msId);
    if (vid) return { assortmentId: vid, productId: null, assortmentKind: 'variant' };
    return null;
  };
}

/** Clamp a discount percent into the 0–100 range the schema's Decimal(5,2) allows. */
function clampDiscount(v: number | undefined): number {
  if (v === undefined || Number.isNaN(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

/**
 * Map moysklad position rows → the sales/purchase position create shape shared
 * by CustomerOrderPosition / DemandPosition / SupplyPosition / SalesReturnPosition
 * / PurchaseOrderPosition / PurchaseReturnPosition / InvoiceInPosition /
 * InvoiceOutPosition. Unresolved assortments are skipped; `position` is 1-based.
 */
interface SalesPositionCreate {
  accountId: string;
  position: number;
  assortmentKind: string;
  assortmentId: string;
  productId: string | null;
  quantity: string;
  priceMinor: bigint;
  discount: string;
  vat: number | null;
}

function buildSalesPositions(
  msPositions: MsPosition[] | undefined,
  resolve: AssortmentResolver,
): SalesPositionCreate[] {
  const out: SalesPositionCreate[] = [];
  let pos = 0;
  for (const p of msPositions ?? []) {
    const ref = resolve(extractMsId(p.assortment?.meta?.href), p.assortment?.meta?.type);
    if (!ref) continue;
    pos++;
    out.push({
      accountId: ACCOUNT_ID,
      position: pos,
      assortmentKind: ref.assortmentKind,
      assortmentId: ref.assortmentId,
      productId: ref.productId,
      quantity: String(p.quantity ?? 0),
      priceMinor: BigInt(Math.round(p.price ?? 0)),
      discount: String(clampDiscount(p.discount)),
      vat: p.vat ?? null,
    });
  }
  return out;
}

/**
 * Create a document, falling back to a disambiguated name on the
 * `@@unique([accountId, name])` collision that moysklad's duplicate document
 * numbers trigger (e.g. seven orders all named "00007"). The FIRST occurrence
 * keeps the exact moysklad name; later duplicates get a ` (<msId8>)` suffix so
 * no rows are lost. `msId` is the moysklad uuid (the row's `id`). Returns the
 * created record, or rethrows any non-name unique error.
 */
// biome-ignore lint/suspicious/noExplicitAny: generic prisma model + data
async function createDocWithNameFallback(model: any, data: any, msId: string): Promise<unknown> {
  try {
    return await model.create({ data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Unique constraint/i.test(msg) && /\bname\b/i.test(msg) && typeof data?.name === 'string') {
      const suffix = ` (${msId.slice(0, 8)})`;
      const name = `${data.name.slice(0, 100 - suffix.length)}${suffix}`;
      return await model.create({ data: { ...data, name } });
    }
    throw e;
  }
}

interface MsCounterparty {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  legalTitle?: string;
  inn?: string;
  description?: string;
  archived?: boolean;
}

async function importLiveCounterparties(): Promise<number> {
  if (!MOYSKLAD_TOKEN) {
    console.log('  ↳ MOYSKLAD_TOKEN not set — skipping live API import');
    return 0;
  }
  console.log('  ↳ fetching counterparties from moysklad.ru …');
  const rows = await fetchMoyskladPaged<MsCounterparty>('/entity/counterparty');

  let inserted = 0;
  for (const r of rows) {
    if (!r.id || !r.name) continue;
    try {
      const externalCode = `ms:${r.id}`;
      const existing = await prisma.counterparty.findFirst({
        where: { accountId: ACCOUNT_ID, externalCode },
        select: { id: true },
      });
      if (existing) {
        await prisma.counterparty.update({
          where: { id: existing.id },
          data: {
            name: r.name,
            phone: r.phone ?? null,
            email: r.email ?? null,
            legalTitle: r.legalTitle ?? null,
            description: r.description ?? null,
            archived: r.archived ?? false,
            uzRequisites: r.inn ? { inn: r.inn } : undefined,
          },
        });
      } else {
        await prisma.counterparty.create({
          data: {
            accountId: ACCOUNT_ID,
            externalCode,
            name: r.name,
            phone: r.phone ?? null,
            email: r.email ?? null,
            legalTitle: r.legalTitle ?? null,
            description: r.description ?? null,
            archived: r.archived ?? false,
            companyType: r.legalTitle ? 'legal' : 'individual',
            uzRequisites: r.inn ? { inn: r.inn } : undefined,
            tags: [],
            attributes: {},
          },
        });
      }
      inserted++;
      if (inserted % 250 === 0) console.log(`    … upserted ${inserted}/${rows.length}`);
    } catch (e) {
      console.warn(`    ! ${r.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`  ↳ Live moysklad counterparties: ${inserted}/${rows.length} upserted`);
  return inserted;
}

// ──────────────────────────────────────────────────────────────
// Organizations (юр. лица) — moysklad's legal entities
// ──────────────────────────────────────────────────────────────

interface MsOrganization {
  id: string;
  name: string;
  legalTitle?: string;
  legalAddress?: string;
  inn?: string;
  phone?: string;
  email?: string;
  archived?: boolean;
}

async function importLiveOrganizations(): Promise<number> {
  if (!MOYSKLAD_TOKEN) return 0;
  console.log('  ↳ fetching organizations …');
  const rows = await fetchMoyskladPaged<MsOrganization>('/entity/organization');
  let inserted = 0;
  for (const r of rows) {
    if (!r.id || !r.name) continue;
    try {
      const externalCode = `ms:${r.id}`;
      const existing = await prisma.organization.findFirst({
        where: { accountId: ACCOUNT_ID, externalCode },
        select: { id: true },
      });
      const data = {
        name: r.name.slice(0, 255),
        legalTitle: r.legalTitle?.slice(0, 255) ?? null,
        legalAddress: r.legalAddress ?? null,
        phone: r.phone ?? null,
        email: r.email ?? null,
        archived: r.archived ?? false,
        uzRequisites: r.inn ? { inn: r.inn } : undefined,
      };
      if (existing) {
        await prisma.organization.update({ where: { id: existing.id }, data });
      } else {
        await prisma.organization.create({
          data: {
            ...data,
            accountId: ACCOUNT_ID,
            externalCode,
            companyType: r.legalTitle ? 'legalUZ' : 'individualUZ',
          },
        });
      }
      inserted++;
    } catch (e) {
      console.warn(`    ! org ${r.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`  ↳ Organizations: ${inserted}/${rows.length} upserted`);
  return inserted;
}

// ──────────────────────────────────────────────────────────────
// Stores (склады)
// ──────────────────────────────────────────────────────────────

interface MsStore {
  id: string;
  name: string;
  address?: string;
  description?: string;
  code?: string;
  archived?: boolean;
}

async function importLiveStores(): Promise<number> {
  if (!MOYSKLAD_TOKEN) return 0;
  console.log('  ↳ fetching stores …');
  const rows = await fetchMoyskladPaged<MsStore>('/entity/store');
  let inserted = 0;
  for (const r of rows) {
    if (!r.id || !r.name) continue;
    try {
      const externalCode = `ms:${r.id}`;
      const existing = await prisma.store.findFirst({
        where: { accountId: ACCOUNT_ID, externalCode },
        select: { id: true },
      });
      const data = {
        name: r.name.slice(0, 255),
        code: r.code?.slice(0, 50) ?? null,
        address: r.address ?? null,
        description: r.description ?? null,
        archived: r.archived ?? false,
      };
      if (existing) {
        await prisma.store.update({ where: { id: existing.id }, data });
      } else {
        await prisma.store.create({
          data: { ...data, accountId: ACCOUNT_ID, externalCode },
        });
      }
      inserted++;
    } catch (e) {
      console.warn(`    ! store ${r.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`  ↳ Stores: ${inserted}/${rows.length} upserted`);
  return inserted;
}

// ──────────────────────────────────────────────────────────────
// Products
// ──────────────────────────────────────────────────────────────

interface MsProduct {
  id: string;
  name: string;
  code?: string;
  article?: string;
  description?: string;
  archived?: boolean;
  buyPrice?: { value: number };
  minPrice?: { value: number };
  salePrices?: Array<{ value: number; priceType?: { name: string } }>;
}

/**
 * Account price types in POSITION order (default first) for stamping
 * salePrices; falls back to the legacy 'default' sentinel when price types
 * aren't imported yet.
 *
 * 🔴 P12 fix: this used to return only the default id and EVERY moysklad tier
 * was stamped with it, so the wholesale tier never landed on its own type
 * (measured in prod: 3960 of 4905 products had no wholesale price). The
 * mapping now lives in one place — `packages/db/src/sale-price-tiers.ts` —
 * shared with `scripts/ops-import-products.ts`.
 */
async function resolveSeedPriceTypes(): Promise<Array<{ id: string; name: string }>> {
  const rows = await prisma.priceType.findMany({
    where: { accountId: ACCOUNT_ID, archived: false },
    orderBy: [{ isDefault: 'desc' }, { position: 'asc' }],
    select: { id: true, name: true },
  });
  return rows.length > 0 ? rows : [{ id: 'default', name: 'default' }];
}

async function importLiveProducts(): Promise<number> {
  if (!MOYSKLAD_TOKEN) return 0;
  console.log('  ↳ fetching products (this may take a while) …');
  const rows = await fetchMoyskladPaged<MsProduct>('/entity/product');
  const seedPriceTypes = await resolveSeedPriceTypes();
  let inserted = 0;
  for (const r of rows) {
    if (!r.id || !r.name) continue;
    try {
      const externalCode = `ms:${r.id}`;
      const existing = await prisma.product.findFirst({
        where: { accountId: ACCOUNT_ID, externalCode },
        select: { id: true },
      });
      // moysklad ships prices ALREADY in MINOR units (×100, e.g. 1000000 = 10000
      // som). Our schema stores BigInt minor 1:1 — NO extra ×100. Round to guard
      // against any fractional minor value before the BigInt cast.
      const toMinor = (v: number | undefined): bigint | null =>
        v === undefined ? null : BigInt(Math.round(v));
      const data = {
        name: r.name.slice(0, 255),
        code: r.code?.slice(0, 50) ?? null,
        article: r.article?.slice(0, 100) ?? null,
        description: r.description ?? null,
        archived: r.archived ?? false,
        buyPrice: toMinor(r.buyPrice?.value),
        minPrice: toMinor(r.minPrice?.value),
        salePrices: mapSalePriceTiers(r.salePrices, seedPriceTypes),
      };
      if (existing) {
        await prisma.product.update({ where: { id: existing.id }, data });
      } else {
        await prisma.product.create({
          data: { ...data, accountId: ACCOUNT_ID, externalCode, kind: 'product' },
        });
      }
      inserted++;
      if (inserted % 250 === 0) console.log(`    … products ${inserted}/${rows.length}`);
    } catch (e) {
      console.warn(`    ! product ${r.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`  ↳ Products: ${inserted}/${rows.length} upserted`);
  return inserted;
}

// ──────────────────────────────────────────────────────────────
// Currencies
// ──────────────────────────────────────────────────────────────

interface MsCurrency {
  id: string;
  name: string;
  fullName?: string;
  code: string;
  isoCode?: string;
  rate?: number;
  archived?: boolean;
}

async function importLiveCurrencies(): Promise<number> {
  if (!MOYSKLAD_TOKEN) return 0;
  console.log('  ↳ fetching currencies …');
  const rows = await fetchMoyskladPaged<MsCurrency>('/entity/currency');
  let inserted = 0;
  for (const r of rows) {
    if (!r.id || !r.code) continue;
    try {
      const existing = await prisma.currency.findFirst({
        where: { accountId: ACCOUNT_ID, code: r.code.slice(0, 3) },
        select: { id: true },
      });
      const data = {
        name: r.name.slice(0, 100),
        fullName: r.fullName?.slice(0, 255) ?? null,
        isoCode: r.isoCode?.slice(0, 3) ?? null,
        archived: r.archived ?? false,
      };
      if (existing) {
        await prisma.currency.update({ where: { id: existing.id }, data });
      } else {
        await prisma.currency.create({
          data: { ...data, accountId: ACCOUNT_ID, code: r.code.slice(0, 3) },
        });
      }
      inserted++;
    } catch (e) {
      console.warn(`    ! currency ${r.code}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`  ↳ Currencies: ${inserted}/${rows.length} upserted`);
  return inserted;
}

// ──────────────────────────────────────────────────────────────
// Price types (only `default` exists in our schema by name; we
// upsert by external code so re-imports are safe)
// ──────────────────────────────────────────────────────────────

interface MsPriceType {
  id: string;
  name: string;
  externalCode?: string;
}

async function importLivePriceTypes(): Promise<number> {
  if (!MOYSKLAD_TOKEN) return 0;
  console.log('  ↳ fetching price types …');
  // moysklad returns price types nested in /context/companysettings, but
  // /entity/companysettings/pricetype is the modern endpoint.
  let rows: MsPriceType[] = [];
  try {
    rows = await fetchMoyskladPaged<MsPriceType>('/context/companysettings/pricetype');
  } catch {
    return 0;
  }
  let inserted = 0;
  for (const r of rows) {
    if (!r.id || !r.name) continue;
    try {
      const existing = await prisma.priceType.findFirst({
        where: { accountId: ACCOUNT_ID, externalCode: `ms:${r.id}` },
        select: { id: true },
      });
      if (existing) {
        await prisma.priceType.update({
          where: { id: existing.id },
          data: { name: r.name.slice(0, 100) },
        });
      } else {
        await prisma.priceType.create({
          data: {
            accountId: ACCOUNT_ID,
            name: r.name.slice(0, 100),
            externalCode: `ms:${r.id}`,
          },
        });
      }
      inserted++;
    } catch (e) {
      console.warn(`    ! priceType ${r.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`  ↳ Price types: ${inserted}/${rows.length} upserted`);
  return inserted;
}

// ──────────────────────────────────────────────────────────────
// Product folders (categories)
// ──────────────────────────────────────────────────────────────

interface MsProductFolder {
  id: string;
  name: string;
  code?: string;
  description?: string;
  pathName?: string;
  archived?: boolean;
}

async function importLiveProductFolders(): Promise<number> {
  if (!MOYSKLAD_TOKEN) return 0;
  console.log('  ↳ fetching product folders …');
  const rows = await fetchMoyskladPaged<MsProductFolder>('/entity/productfolder');
  let inserted = 0;
  for (const r of rows) {
    if (!r.id || !r.name) continue;
    try {
      const externalCode = `ms:${r.id}`;
      const existing = await prisma.productFolder.findFirst({
        where: { accountId: ACCOUNT_ID, externalCode },
        select: { id: true },
      });
      const data = {
        name: r.name.slice(0, 255),
        code: r.code?.slice(0, 50) ?? null,
        description: r.description ?? null,
        pathName: r.pathName?.slice(0, 500) ?? null,
        archived: r.archived ?? false,
      };
      if (existing) {
        await prisma.productFolder.update({ where: { id: existing.id }, data });
      } else {
        await prisma.productFolder.create({
          data: { ...data, accountId: ACCOUNT_ID, externalCode },
        });
      }
      inserted++;
    } catch (e) {
      console.warn(`    ! folder ${r.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`  ↳ Product folders: ${inserted}/${rows.length} upserted`);
  return inserted;
}

// ──────────────────────────────────────────────────────────────
// Contact persons
// ──────────────────────────────────────────────────────────────

interface MsContactPerson {
  id: string;
  name: string;
  position?: string;
  phone?: string;
  email?: string;
  agent?: { meta: { href: string } };
}

async function importLiveContactPersons(): Promise<number> {
  if (!MOYSKLAD_TOKEN) return 0;
  console.log('  ↳ fetching contact persons …');
  // Contact persons are nested under counterparty in moysklad; the flat
  // collection lives at /entity/counterparty/contactpersons (paged).
  // We iterate over imported counterparties and fetch each one's
  // contacts. Slow but correct.
  const counterparties = await prisma.counterparty.findMany({
    where: { accountId: ACCOUNT_ID, externalCode: { startsWith: 'ms:' } },
    select: { id: true, externalCode: true },
    take: 500, // cap so first run finishes in reasonable time
  });
  let inserted = 0;
  let scanned = 0;
  for (const cp of counterparties) {
    if (!cp.externalCode) continue;
    const msId = cp.externalCode.replace(/^ms:/, '');
    try {
      const url = `${MOYSKLAD_BASE_URL}/entity/counterparty/${msId}/contactpersons`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${MOYSKLAD_TOKEN}`, 'Accept-Encoding': 'gzip' },
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { rows?: MsContactPerson[] };
      const contacts = body.rows ?? [];
      for (const r of contacts) {
        if (!r.id || !r.name) continue;
        try {
          const externalCode = `ms:${r.id}`;
          const existing = await prisma.contactPerson.findFirst({
            where: { accountId: ACCOUNT_ID, externalCode },
            select: { id: true },
          });
          const data = {
            name: r.name.slice(0, 255),
            position: r.position?.slice(0, 255) ?? null,
            phone: r.phone?.slice(0, 20) ?? null,
            email: r.email?.slice(0, 255) ?? null,
          };
          if (existing) {
            await prisma.contactPerson.update({ where: { id: existing.id }, data });
          } else {
            await prisma.contactPerson.create({
              data: {
                ...data,
                accountId: ACCOUNT_ID,
                counterpartyId: cp.id,
                externalCode,
              },
            });
          }
          inserted++;
        } catch {
          // skip individual failures silently — log volume would explode
        }
      }
      scanned++;
      if (scanned % 100 === 0) console.log(`    … scanned ${scanned} counterparties`);
    } catch {
      // network glitch on a single counterparty — keep going
    }
  }
  console.log(`  ↳ Contact persons: ${inserted} added (scanned ${scanned} counterparties)`);
  return inserted;
}

// ──────────────────────────────────────────────────────────────
// CRM Tasks
// ──────────────────────────────────────────────────────────────

interface MsTask {
  id: string;
  description?: string;
  done?: boolean;
  dueToDate?: string;
  agent?: { meta: { href: string } };
  archived?: boolean;
}

async function importLiveTasks(): Promise<number> {
  if (!MOYSKLAD_TOKEN) return 0;
  console.log('  ↳ fetching CRM tasks …');
  let rows: MsTask[] = [];
  try {
    rows = await fetchMoyskladPaged<MsTask>('/entity/task');
  } catch {
    return 0;
  }
  // Find an existing employee (admin) to set as authorId so the task
  // doesn't fail FK checks. We don't try to map the agent (counterparty)
  // back to ours — that needs the meta.href cross-reference and our
  // schema's agentId is optional anyway.
  const admin = await prisma.employee.findFirstOrThrow({
    where: { accountId: ACCOUNT_ID },
    select: { id: true },
  });
  let inserted = 0;
  for (const r of rows) {
    if (!r.id) continue;
    try {
      // Task model has no externalCode column; we re-use the polymorphic
      // entity/entityId pair (designed for "task linked to document X")
      // by tagging entity='moysklad-task' + entityId=<msUuid>. Since
      // moysklad IDs are valid UUIDs, the @db.Uuid constraint is met.
      const existing = await prisma.task.findFirst({
        where: { accountId: ACCOUNT_ID, entity: 'moysklad-task', entityId: r.id },
        select: { id: true },
      });
      const data = {
        title: (r.description ?? 'Task').slice(0, 255),
        description: r.description ?? null,
        status: r.done ? 'done' : 'open',
        dueAt: r.dueToDate ? new Date(r.dueToDate) : null,
        archived: r.archived ?? false,
      };
      if (existing) {
        await prisma.task.update({ where: { id: existing.id }, data });
      } else {
        await prisma.task.create({
          data: {
            ...data,
            accountId: ACCOUNT_ID,
            authorId: admin.id,
            entity: 'moysklad-task',
            entityId: r.id,
          },
        });
      }
      inserted++;
    } catch (e) {
      console.warn(`    ! task ${r.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`  ↳ Tasks: ${inserted}/${rows.length} upserted`);
  return inserted;
}

// ──────────────────────────────────────────────────────────────
// Customer orders (top-of-funnel sales doc)
// ──────────────────────────────────────────────────────────────

interface MsCustomerOrder {
  id: string;
  name: string;
  description?: string;
  moment?: string;
  applicable?: boolean;
  // moysklad «Напечатано» / «Отправлено» per-document flags.
  printed?: boolean;
  published?: boolean;
  state?: { meta: { href: string } };
  agent?: { meta: { href: string } };
  organization?: { meta: { href: string } };
  store?: { meta: { href: string } };
  sum?: number;
  vatSum?: number;
  payedSum?: number;
  shippedSum?: number;
  invoicedSum?: number;
  deliveryPlannedMoment?: string;
  positions?: { rows?: MsPosition[] };
}

function extractMsId(href?: string): string | null {
  if (!href) return null;
  const m = href.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0] : null;
}

async function importLiveCustomerOrders(): Promise<number> {
  if (!MOYSKLAD_TOKEN) return 0;
  console.log('  ↳ fetching customer orders …');
  const rows = await fetchMoyskladPagedExpanded<MsCustomerOrder>(
    '/entity/customerorder',
    'positions',
  );
  const resolve = await buildAssortmentResolver();
  // Pre-load lookup maps so we can resolve agent/org/store FKs without
  // hitting Prisma per-row.
  const cps = await prisma.counterparty.findMany({
    where: { accountId: ACCOUNT_ID, externalCode: { startsWith: 'ms:' } },
    select: { id: true, externalCode: true },
  });
  const cpByMsId = new Map(cps.map((c) => [(c.externalCode ?? '').replace(/^ms:/, ''), c.id]));
  const orgs = await prisma.organization.findMany({
    where: { accountId: ACCOUNT_ID, externalCode: { startsWith: 'ms:' } },
    select: { id: true, externalCode: true },
  });
  const orgByMsId = new Map(orgs.map((o) => [(o.externalCode ?? '').replace(/^ms:/, ''), o.id]));
  const stores = await prisma.store.findMany({
    where: { accountId: ACCOUNT_ID, externalCode: { startsWith: 'ms:' } },
    select: { id: true, externalCode: true },
  });
  const storeByMsId = new Map(
    stores.map((s) => [(s.externalCode ?? '').replace(/^ms:/, ''), s.id]),
  );

  // Fallback to first org/store/cp if a row references something outside
  // our import set (rare — moysklad sometimes archives the source).
  const fallbackCp = cps[0]?.id;
  const fallbackOrg = orgs[0]?.id;
  const fallbackStore = stores[0]?.id;
  if (!fallbackCp || !fallbackOrg || !fallbackStore) {
    console.warn('  ! Cannot import customer orders: missing fallback agent/org/store refs');
    return 0;
  }

  let inserted = 0;
  for (const r of rows) {
    if (!r.id || !r.name) continue;
    try {
      const externalCode = `ms:${r.id}`;
      const existing = await prisma.customerOrder.findFirst({
        where: { accountId: ACCOUNT_ID, externalCode },
        select: { id: true },
      });
      const agentId = cpByMsId.get(extractMsId(r.agent?.meta.href) ?? '') ?? fallbackCp;
      const organizationId =
        orgByMsId.get(extractMsId(r.organization?.meta.href) ?? '') ?? fallbackOrg;
      const storeId = storeByMsId.get(extractMsId(r.store?.meta.href) ?? '') ?? fallbackStore;

      // FSM state for customer orders has its own bucket set; map
      // applicable → 'fully_shipped' (the closest match to "done") so
      // posted-filter dashboard reports still pick them up. Unposted
      // stays 'draft'.
      const data = {
        name: r.name.slice(0, 100),
        description: r.description ?? null,
        moment: r.moment ? new Date(r.moment) : new Date(),
        deliveryPlannedMoment: r.deliveryPlannedMoment ? new Date(r.deliveryPlannedMoment) : null,
        applicable: r.applicable ?? false,
        state: r.applicable ? 'fully_shipped' : 'draft',
        // «Отправлено» / «Напечатано» columns — moysklad's real per-doc flags.
        published: r.published ?? false,
        printed: r.printed ?? false,
        sumMinor: BigInt(Math.round(r.sum ?? 0)),
        vatSumMinor: BigInt(Math.round(r.vatSum ?? 0)),
        payedSumMinor: BigInt(Math.round(r.payedSum ?? 0)),
        shippedSumMinor: BigInt(Math.round(r.shippedSum ?? 0)),
        invoicedSumMinor: BigInt(Math.round(r.invoicedSum ?? 0)),
      };
      if (existing) {
        await prisma.customerOrder.update({ where: { id: existing.id }, data });
      } else {
        await createDocWithNameFallback(
          prisma.customerOrder,
          {
            ...data,
            accountId: ACCOUNT_ID,
            externalCode,
            agentId,
            organizationId,
            storeId,
            positions: { create: buildSalesPositions(r.positions?.rows, resolve) },
          },
          r.id,
        );
      }
      inserted++;
      if (inserted % 250 === 0) console.log(`    … customer orders ${inserted}/${rows.length}`);
    } catch (e) {
      // Single-row failures are common (positions missing, FK mismatch).
      // Log only first 5 to avoid noise.
      if (inserted < 5) {
        console.warn(`    ! customer order ${r.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  console.log(`  ↳ Customer orders: ${inserted}/${rows.length} upserted`);
  return inserted;
}

// ──────────────────────────────────────────────────────────────
// Document pipeline (demands, invoices, supplies)
// ──────────────────────────────────────────────────────────────
// All four entity types share the same shape on moysklad's side
// (name + agent/org/store references + money sum fields), so they
// share an importer parameterised by endpoint and prisma accessor.

interface MsDocument {
  id: string;
  name: string;
  description?: string;
  moment?: string;
  applicable?: boolean;
  // moysklad's «Напечатано» / «Отправлено» per-document flags (every moysklad
  // document carries them) — imported so the list columns reflect real status.
  printed?: boolean;
  published?: boolean;
  agent?: { meta: { href: string } };
  organization?: { meta: { href: string } };
  store?: { meta: { href: string } };
  sum?: number;
  vatSum?: number;
  payedSum?: number;
  positions?: { rows?: MsPosition[] };
}

interface DocImportSpec {
  label: string;
  endpoint: string;
  // Prisma model accessor — typed wide to keep the importer generic.
  // Each model exposes findFirst / create / update with the same shape.
  // biome-ignore lint/suspicious/noExplicitAny: generic model
  model: any;
  needsStore: boolean;
}

const DOC_SPECS: DocImportSpec[] = [
  { label: 'demands', endpoint: '/entity/demand', model: null, needsStore: true },
  { label: 'invoices-out', endpoint: '/entity/invoiceout', model: null, needsStore: false },
  { label: 'invoices-in', endpoint: '/entity/invoicein', model: null, needsStore: false },
  { label: 'supplies', endpoint: '/entity/supply', model: null, needsStore: true },
  { label: 'sales-returns', endpoint: '/entity/salesreturn', model: null, needsStore: true },
  { label: 'purchase-orders', endpoint: '/entity/purchaseorder', model: null, needsStore: true },
  { label: 'purchase-returns', endpoint: '/entity/purchasereturn', model: null, needsStore: true },
];

async function importLiveDocuments(spec: DocImportSpec): Promise<number> {
  if (!MOYSKLAD_TOKEN) return 0;
  console.log(`  ↳ fetching ${spec.label} …`);
  let rows: MsDocument[] = [];
  try {
    rows = await fetchMoyskladPagedExpanded<MsDocument>(spec.endpoint, 'positions');
  } catch (e) {
    console.warn(`    ! ${spec.label} fetch failed: ${e instanceof Error ? e.message : e}`);
    return 0;
  }

  const resolve = await buildAssortmentResolver();
  const cps = await prisma.counterparty.findMany({
    where: { accountId: ACCOUNT_ID, externalCode: { startsWith: 'ms:' } },
    select: { id: true, externalCode: true },
  });
  const cpByMs = new Map(cps.map((c) => [(c.externalCode ?? '').replace(/^ms:/, ''), c.id]));
  const orgs = await prisma.organization.findMany({
    where: { accountId: ACCOUNT_ID, externalCode: { startsWith: 'ms:' } },
    select: { id: true, externalCode: true },
  });
  const orgByMs = new Map(orgs.map((o) => [(o.externalCode ?? '').replace(/^ms:/, ''), o.id]));
  const stores = await prisma.store.findMany({
    where: { accountId: ACCOUNT_ID, externalCode: { startsWith: 'ms:' } },
    select: { id: true, externalCode: true },
  });
  const storeByMs = new Map(stores.map((s) => [(s.externalCode ?? '').replace(/^ms:/, ''), s.id]));
  const fbCp = cps[0]?.id;
  const fbOrg = orgs[0]?.id;
  const fbStore = stores[0]?.id;
  if (!fbCp || !fbOrg || (spec.needsStore && !fbStore)) {
    console.warn(`    ! ${spec.label}: missing fallback FK refs, skipping`);
    return 0;
  }

  // Resolve model accessor at runtime by spec.label so we don't hard-
  // code the prisma client tree in the spec list (avoids type pain).
  const modelMap: Record<string, unknown> = {
    demands: prisma.demand,
    'invoices-out': prisma.invoiceOut,
    'invoices-in': prisma.invoiceIn,
    supplies: prisma.supply,
    'sales-returns': prisma.salesReturn,
    'purchase-orders': prisma.purchaseOrder,
    'purchase-returns': prisma.purchaseReturn,
  };
  // biome-ignore lint/suspicious/noExplicitAny: dynamic dispatch on model accessor
  const model = modelMap[spec.label] as any;
  if (!model) return 0;

  let inserted = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!r.id || !r.name) continue;
    try {
      const externalCode = `ms:${r.id}`;
      const existing = await model.findFirst({
        where: { accountId: ACCOUNT_ID, externalCode },
        select: { id: true },
      });
      const agentId = cpByMs.get(extractMsId(r.agent?.meta.href) ?? '') ?? fbCp;
      const organizationId = orgByMs.get(extractMsId(r.organization?.meta.href) ?? '') ?? fbOrg;
      const storeId = spec.needsStore
        ? (storeByMs.get(extractMsId(r.store?.meta.href) ?? '') ?? fbStore)
        : undefined;

      // Map moysklad's `applicable` to our `state`. Reports + dashboard
      // filter by state='posted' so unposted (draft) docs vanish from
      // every aggregate. Match the convention: applicable → 'posted',
      // otherwise leave it as the schema default 'draft'.
      const data: Record<string, unknown> = {
        name: r.name.slice(0, 100),
        description: r.description ?? null,
        moment: r.moment ? new Date(r.moment) : new Date(),
        applicable: r.applicable ?? false,
        state: r.applicable ? 'posted' : 'draft',
        // «Отправлено» / «Напечатано» columns — carry moysklad's real per-doc flags.
        published: r.published ?? false,
        printed: r.printed ?? false,
        sumMinor: BigInt(Math.round(r.sum ?? 0)),
        vatSumMinor: BigInt(Math.round(r.vatSum ?? 0)),
      };
      if (existing) {
        await model.update({ where: { id: existing.id }, data });
      } else {
        await createDocWithNameFallback(
          model,
          {
            ...data,
            accountId: ACCOUNT_ID,
            externalCode,
            agentId,
            organizationId,
            ...(storeId ? { storeId } : {}),
            positions: { create: buildSalesPositions(r.positions?.rows, resolve) },
          },
          r.id,
        );
      }
      inserted++;
      if (inserted % 500 === 0) console.log(`    … ${spec.label} ${inserted}/${rows.length}`);
    } catch {
      skipped++;
    }
  }
  console.log(`  ↳ ${spec.label}: ${inserted} upserted (${skipped} skipped of ${rows.length})`);
  return inserted;
}

// ──────────────────────────────────────────────────────────────
// Variants (sub-products with attribute values)
// ──────────────────────────────────────────────────────────────

interface MsVariant {
  id: string;
  name: string;
  code?: string;
  description?: string;
  archived?: boolean;
  product?: { meta: { href: string } };
}

async function importLiveVariants(): Promise<number> {
  if (!MOYSKLAD_TOKEN) return 0;
  console.log('  ↳ fetching variants …');
  let rows: MsVariant[] = [];
  try {
    rows = await fetchMoyskladPaged<MsVariant>('/entity/variant');
  } catch {
    return 0;
  }
  const products = await prisma.product.findMany({
    where: { accountId: ACCOUNT_ID, externalCode: { startsWith: 'ms:' } },
    select: { id: true, externalCode: true },
  });
  const productByMs = new Map(
    products.map((p) => [(p.externalCode ?? '').replace(/^ms:/, ''), p.id]),
  );
  let inserted = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!r.id || !r.name) continue;
    const productId = productByMs.get(extractMsId(r.product?.meta.href) ?? '');
    if (!productId) {
      skipped++;
      continue;
    }
    try {
      const externalCode = `ms:${r.id}`;
      const existing = await prisma.variant.findFirst({
        where: { accountId: ACCOUNT_ID, externalCode },
        select: { id: true },
      });
      const data = {
        name: r.name.slice(0, 255),
        code: r.code?.slice(0, 50) ?? null,
        description: r.description ?? null,
        archived: r.archived ?? false,
      };
      if (existing) {
        await prisma.variant.update({ where: { id: existing.id }, data });
      } else {
        await prisma.variant.create({
          data: { ...data, accountId: ACCOUNT_ID, externalCode, productId },
        });
      }
      inserted++;
    } catch {
      skipped++;
    }
  }
  console.log(`  ↳ Variants: ${inserted} upserted (${skipped} skipped of ${rows.length})`);
  return inserted;
}

// ──────────────────────────────────────────────────────────────
// Bundles + Services — sub-types of Product (kind='bundle' / 'service')
// ──────────────────────────────────────────────────────────────

async function importLiveProductsByKind(
  endpoint: string,
  kind: string,
  label: string,
): Promise<number> {
  if (!MOYSKLAD_TOKEN) return 0;
  console.log(`  ↳ fetching ${label} …`);
  let rows: MsProduct[] = [];
  try {
    rows = await fetchMoyskladPaged<MsProduct>(endpoint);
  } catch {
    return 0;
  }
  // moysklad money is ALREADY minor (×100) — store 1:1, NO extra ×100.
  const toMinor = (v: number | undefined): bigint | null =>
    v === undefined ? null : BigInt(Math.round(v));
  const seedPriceTypes = await resolveSeedPriceTypes();
  let inserted = 0;
  for (const r of rows) {
    if (!r.id || !r.name) continue;
    try {
      const externalCode = `ms:${r.id}`;
      const existing = await prisma.product.findFirst({
        where: { accountId: ACCOUNT_ID, externalCode },
        select: { id: true },
      });
      const data = {
        name: r.name.slice(0, 255),
        code: r.code?.slice(0, 50) ?? null,
        article: r.article?.slice(0, 100) ?? null,
        description: r.description ?? null,
        archived: r.archived ?? false,
        buyPrice: toMinor(r.buyPrice?.value),
        minPrice: toMinor(r.minPrice?.value),
        salePrices: mapSalePriceTiers(r.salePrices, seedPriceTypes),
        kind, // override on existing rows too — moysklad source-of-truth
      };
      if (existing) {
        await prisma.product.update({ where: { id: existing.id }, data });
      } else {
        await prisma.product.create({
          data: { ...data, accountId: ACCOUNT_ID, externalCode },
        });
      }
      inserted++;
      if (inserted % 250 === 0) console.log(`    … ${label} ${inserted}/${rows.length}`);
    } catch (e) {
      console.warn(`    ! ${label} ${r.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`  ↳ ${label}: ${inserted}/${rows.length} upserted`);
  return inserted;
}

// ──────────────────────────────────────────────────────────────
// Money documents — cash-in/out + payment-in/out
// ──────────────────────────────────────────────────────────────

interface MsMoneyDoc {
  id: string;
  name: string;
  description?: string;
  moment?: string;
  applicable?: boolean;
  agent?: { meta: { href: string } };
  organization?: { meta: { href: string } };
  sum?: number;
  vatSum?: number;
  paymentPurpose?: string;
}

async function importLiveMoneyDocs(
  endpoint: string,
  modelKey: 'cashIn' | 'cashOut' | 'paymentIn' | 'paymentOut',
  label: string,
): Promise<number> {
  if (!MOYSKLAD_TOKEN) return 0;
  console.log(`  ↳ fetching ${label} …`);
  let rows: MsMoneyDoc[] = [];
  try {
    rows = await fetchMoyskladPaged<MsMoneyDoc>(endpoint);
  } catch {
    return 0;
  }

  const cps = await prisma.counterparty.findMany({
    where: { accountId: ACCOUNT_ID, externalCode: { startsWith: 'ms:' } },
    select: { id: true, externalCode: true },
  });
  const cpByMs = new Map(cps.map((c) => [(c.externalCode ?? '').replace(/^ms:/, ''), c.id]));
  const orgs = await prisma.organization.findMany({
    where: { accountId: ACCOUNT_ID, externalCode: { startsWith: 'ms:' } },
    select: { id: true, externalCode: true },
  });
  const orgByMs = new Map(orgs.map((o) => [(o.externalCode ?? '').replace(/^ms:/, ''), o.id]));
  const fbCp = cps[0]?.id;
  const fbOrg = orgs[0]?.id;
  // Cash docs need a CashDesk; payments need an OrganizationAccount.
  const cashDesk = await prisma.cashDesk.findFirst({
    where: { accountId: ACCOUNT_ID },
    select: { id: true },
  });
  const orgAccount = await prisma.organizationAccount.findFirst({
    where: { accountId: ACCOUNT_ID },
    select: { id: true },
  });
  if (!fbCp || !fbOrg) return 0;
  const isCash = modelKey === 'cashIn' || modelKey === 'cashOut';
  if (isCash && !cashDesk) {
    console.warn(`    ! ${label}: no CashDesk in DB, skipping`);
    return 0;
  }
  if (!isCash && !orgAccount) {
    console.warn(`    ! ${label}: no OrganizationAccount in DB, skipping`);
    return 0;
  }

  // biome-ignore lint/suspicious/noExplicitAny: dynamic dispatch
  const model = (prisma as any)[modelKey];
  let inserted = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!r.id || !r.name) continue;
    try {
      const externalCode = `ms:${r.id}`;
      const existing = await model.findFirst({
        where: { accountId: ACCOUNT_ID, externalCode },
        select: { id: true },
      });
      const agentId = cpByMs.get(extractMsId(r.agent?.meta.href) ?? '') ?? fbCp;
      const organizationId = orgByMs.get(extractMsId(r.organization?.meta.href) ?? '') ?? fbOrg;
      const data: Record<string, unknown> = {
        name: r.name.slice(0, 100),
        description: r.description ?? null,
        moment: r.moment ? new Date(r.moment) : new Date(),
        applicable: r.applicable ?? false,
        state: r.applicable ? 'posted' : 'draft',
        sumMinor: BigInt(Math.round(r.sum ?? 0)),
        vatSumMinor: BigInt(Math.round(r.vatSum ?? 0)),
        paymentPurpose: r.paymentPurpose?.slice(0, 500) ?? null,
      };
      if (existing) {
        await model.update({ where: { id: existing.id }, data });
      } else {
        await createDocWithNameFallback(
          model,
          {
            ...data,
            accountId: ACCOUNT_ID,
            externalCode,
            agentId,
            organizationId,
            ...(isCash ? { cashDeskId: cashDesk?.id } : { organizationAccountId: orgAccount?.id }),
          },
          r.id,
        );
      }
      inserted++;
      if (inserted % 500 === 0) console.log(`    … ${label} ${inserted}/${rows.length}`);
    } catch {
      skipped++;
    }
  }
  console.log(`  ↳ ${label}: ${inserted} upserted (${skipped} skipped of ${rows.length})`);
  return inserted;
}

// ──────────────────────────────────────────────────────────────
// Default money accounts — ensure ONE CashDesk + ONE OrganizationAccount
// exist so the money importers don't skip cash/payment docs wholesale.
// ──────────────────────────────────────────────────────────────

async function ensureDefaultMoneyAccounts(): Promise<void> {
  if (!MOYSKLAD_TOKEN) return;
  const firstOrg = await prisma.organization.findFirst({
    where: { accountId: ACCOUNT_ID },
    select: { id: true },
  });
  if (!firstOrg) {
    console.warn('    ! ensureDefaultMoneyAccounts: no organization imported, skipping');
    return;
  }
  const cashDesk = await prisma.cashDesk.findFirst({
    where: { accountId: ACCOUNT_ID },
    select: { id: true },
  });
  if (!cashDesk) {
    await prisma.cashDesk.create({
      data: { accountId: ACCOUNT_ID, name: 'Основная касса', currency: 'UZS' },
    });
    console.log('    ↳ created default CashDesk «Основная касса»');
  }
  const orgAccount = await prisma.organizationAccount.findFirst({
    where: { accountId: ACCOUNT_ID },
    select: { id: true },
  });
  if (!orgAccount) {
    await prisma.organizationAccount.create({
      data: {
        accountId: ACCOUNT_ID,
        organizationId: firstOrg.id,
        name: 'Основной счёт',
        isDefault: true,
        currency: 'UZS',
      },
    });
    console.log('    ↳ created default OrganizationAccount «Основной счёт»');
  }
}

// ──────────────────────────────────────────────────────────────
// Warehouse documents — Move / Loss / Enter / Inventory.
// Internal stock docs (NO agent). Each carries positions; the position
// shape differs per doc type (see the schema models).
// ──────────────────────────────────────────────────────────────

/** moysklad warehouse-doc header shape (only the fields we map). */
interface MsWarehouseDoc {
  id: string;
  name: string;
  description?: string;
  moment?: string;
  applicable?: boolean;
  printed?: boolean;
  published?: boolean;
  organization?: { meta: { href: string } };
  store?: { meta: { href: string } };
  sourceStore?: { meta: { href: string } };
  targetStore?: { meta: { href: string } };
  sum?: number;
  positions?: { rows?: MsPosition[] };
}

/** Common org/store lookup maps + fallbacks shared by the warehouse importers. */
async function loadWarehouseRefs(): Promise<{
  orgByMs: Map<string, string>;
  storeByMs: Map<string, string>;
  fbOrg?: string;
  fbStore?: string;
}> {
  const orgs = await prisma.organization.findMany({
    where: { accountId: ACCOUNT_ID, externalCode: { startsWith: 'ms:' } },
    select: { id: true, externalCode: true },
  });
  const orgByMs = new Map(orgs.map((o) => [(o.externalCode ?? '').replace(/^ms:/, ''), o.id]));
  const stores = await prisma.store.findMany({
    where: { accountId: ACCOUNT_ID, externalCode: { startsWith: 'ms:' } },
    select: { id: true, externalCode: true },
  });
  const storeByMs = new Map(stores.map((s) => [(s.externalCode ?? '').replace(/^ms:/, ''), s.id]));
  return { orgByMs, storeByMs, fbOrg: orgs[0]?.id, fbStore: stores[0]?.id };
}

async function importLiveMove(): Promise<number> {
  if (!MOYSKLAD_TOKEN) return 0;
  console.log('  ↳ fetching moves …');
  let rows: MsWarehouseDoc[] = [];
  try {
    rows = await fetchMoyskladPagedExpanded<MsWarehouseDoc>('/entity/move', 'positions');
  } catch (e) {
    console.warn(`    ! moves fetch failed: ${e instanceof Error ? e.message : e}`);
    return 0;
  }
  const resolve = await buildAssortmentResolver();
  const { orgByMs, storeByMs, fbOrg, fbStore } = await loadWarehouseRefs();
  if (!fbOrg || !fbStore) {
    console.warn('    ! moves: missing fallback org/store refs, skipping');
    return 0;
  }
  let inserted = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!r.id || !r.name) continue;
    try {
      const externalCode = `ms:${r.id}`;
      const existing = await prisma.move.findFirst({
        where: { accountId: ACCOUNT_ID, externalCode },
        select: { id: true },
      });
      const organizationId = orgByMs.get(extractMsId(r.organization?.meta.href) ?? '') ?? fbOrg;
      const sourceStoreId = storeByMs.get(extractMsId(r.sourceStore?.meta.href) ?? '') ?? fbStore;
      const destinationStoreId =
        storeByMs.get(extractMsId(r.targetStore?.meta.href) ?? '') ?? fbStore;
      const data = {
        name: r.name.slice(0, 100),
        description: r.description ?? null,
        moment: r.moment ? new Date(r.moment) : new Date(),
        applicable: r.applicable ?? false,
        state: r.applicable ? 'posted' : 'draft',
        published: r.published ?? false,
        printed: r.printed ?? false,
        sumMinor: BigInt(Math.round(r.sum ?? 0)),
      };
      const positionCreate = buildSalesPositions(r.positions?.rows, resolve).map((p) => ({
        accountId: ACCOUNT_ID,
        position: p.position,
        assortmentKind: p.assortmentKind,
        assortmentId: p.assortmentId,
        productId: p.productId,
        quantity: p.quantity,
        costMinor: null,
      }));
      if (existing) {
        await prisma.move.update({ where: { id: existing.id }, data });
      } else {
        await createDocWithNameFallback(
          prisma.move,
          {
            ...data,
            accountId: ACCOUNT_ID,
            externalCode,
            organizationId,
            sourceStoreId,
            destinationStoreId,
            positions: { create: positionCreate },
          },
          r.id,
        );
      }
      inserted++;
      if (inserted % 500 === 0) console.log(`    … moves ${inserted}/${rows.length}`);
    } catch {
      skipped++;
    }
  }
  console.log(`  ↳ moves: ${inserted} upserted (${skipped} skipped of ${rows.length})`);
  return inserted;
}

async function importLiveLoss(): Promise<number> {
  if (!MOYSKLAD_TOKEN) return 0;
  console.log('  ↳ fetching losses …');
  let rows: MsWarehouseDoc[] = [];
  try {
    rows = await fetchMoyskladPagedExpanded<MsWarehouseDoc>('/entity/loss', 'positions');
  } catch (e) {
    console.warn(`    ! losses fetch failed: ${e instanceof Error ? e.message : e}`);
    return 0;
  }
  const resolve = await buildAssortmentResolver();
  const { orgByMs, storeByMs, fbOrg, fbStore } = await loadWarehouseRefs();
  if (!fbOrg || !fbStore) {
    console.warn('    ! losses: missing fallback org/store refs, skipping');
    return 0;
  }
  let inserted = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!r.id || !r.name) continue;
    try {
      const externalCode = `ms:${r.id}`;
      const existing = await prisma.loss.findFirst({
        where: { accountId: ACCOUNT_ID, externalCode },
        select: { id: true },
      });
      const organizationId = orgByMs.get(extractMsId(r.organization?.meta.href) ?? '') ?? fbOrg;
      const storeId = storeByMs.get(extractMsId(r.store?.meta.href) ?? '') ?? fbStore;
      const data = {
        name: r.name.slice(0, 100),
        description: r.description ?? null,
        moment: r.moment ? new Date(r.moment) : new Date(),
        applicable: r.applicable ?? false,
        state: r.applicable ? 'posted' : 'draft',
        published: r.published ?? false,
        printed: r.printed ?? false,
        sumMinor: BigInt(Math.round(r.sum ?? 0)),
      };
      const positionCreate = buildSalesPositions(r.positions?.rows, resolve).map((p) => ({
        accountId: ACCOUNT_ID,
        position: p.position,
        assortmentKind: p.assortmentKind,
        assortmentId: p.assortmentId,
        productId: p.productId,
        quantity: p.quantity,
        costMinor: null,
        reason: null,
      }));
      if (existing) {
        await prisma.loss.update({ where: { id: existing.id }, data });
      } else {
        await createDocWithNameFallback(
          prisma.loss,
          {
            ...data,
            accountId: ACCOUNT_ID,
            externalCode,
            organizationId,
            storeId,
            positions: { create: positionCreate },
          },
          r.id,
        );
      }
      inserted++;
      if (inserted % 500 === 0) console.log(`    … losses ${inserted}/${rows.length}`);
    } catch {
      skipped++;
    }
  }
  console.log(`  ↳ losses: ${inserted} upserted (${skipped} skipped of ${rows.length})`);
  return inserted;
}

async function importLiveEnter(): Promise<number> {
  if (!MOYSKLAD_TOKEN) return 0;
  console.log('  ↳ fetching enters …');
  let rows: MsWarehouseDoc[] = [];
  try {
    rows = await fetchMoyskladPagedExpanded<MsWarehouseDoc>('/entity/enter', 'positions');
  } catch (e) {
    console.warn(`    ! enters fetch failed: ${e instanceof Error ? e.message : e}`);
    return 0;
  }
  const resolve = await buildAssortmentResolver();
  const { orgByMs, storeByMs, fbOrg, fbStore } = await loadWarehouseRefs();
  if (!fbOrg || !fbStore) {
    console.warn('    ! enters: missing fallback org/store refs, skipping');
    return 0;
  }
  let inserted = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!r.id || !r.name) continue;
    try {
      const externalCode = `ms:${r.id}`;
      const existing = await prisma.enter.findFirst({
        where: { accountId: ACCOUNT_ID, externalCode },
        select: { id: true },
      });
      const organizationId = orgByMs.get(extractMsId(r.organization?.meta.href) ?? '') ?? fbOrg;
      const storeId = storeByMs.get(extractMsId(r.store?.meta.href) ?? '') ?? fbStore;
      const data = {
        name: r.name.slice(0, 100),
        description: r.description ?? null,
        moment: r.moment ? new Date(r.moment) : new Date(),
        applicable: r.applicable ?? false,
        state: r.applicable ? 'posted' : 'draft',
        published: r.published ?? false,
        printed: r.printed ?? false,
        sumMinor: BigInt(Math.round(r.sum ?? 0)),
      };
      // EnterPosition.costMinor is REQUIRED (non-null) — use the moysklad price.
      const positionCreate = (r.positions?.rows ?? [])
        .map((p) => {
          const ref = resolve(extractMsId(p.assortment?.meta?.href), p.assortment?.meta?.type);
          return ref ? { p, ref } : null;
        })
        .filter((x): x is { p: MsPosition; ref: ResolvedAssortment } => x !== null)
        .map(({ p, ref }, i) => ({
          accountId: ACCOUNT_ID,
          position: i + 1,
          assortmentKind: ref.assortmentKind,
          assortmentId: ref.assortmentId,
          productId: ref.productId,
          quantity: String(p.quantity ?? 0),
          costMinor: BigInt(Math.round(p.price ?? 0)),
        }));
      if (existing) {
        await prisma.enter.update({ where: { id: existing.id }, data });
      } else {
        await createDocWithNameFallback(
          prisma.enter,
          {
            ...data,
            accountId: ACCOUNT_ID,
            externalCode,
            organizationId,
            storeId,
            positions: { create: positionCreate },
          },
          r.id,
        );
      }
      inserted++;
      if (inserted % 500 === 0) console.log(`    … enters ${inserted}/${rows.length}`);
    } catch {
      skipped++;
    }
  }
  console.log(`  ↳ enters: ${inserted} upserted (${skipped} skipped of ${rows.length})`);
  return inserted;
}

async function importLiveInventory(): Promise<number> {
  if (!MOYSKLAD_TOKEN) return 0;
  console.log('  ↳ fetching inventories …');
  let rows: MsWarehouseDoc[] = [];
  try {
    rows = await fetchMoyskladPagedExpanded<MsWarehouseDoc>('/entity/inventory', 'positions');
  } catch (e) {
    console.warn(`    ! inventories fetch failed: ${e instanceof Error ? e.message : e}`);
    return 0;
  }
  const resolve = await buildAssortmentResolver();
  const { orgByMs, storeByMs, fbOrg, fbStore } = await loadWarehouseRefs();
  if (!fbOrg || !fbStore) {
    console.warn('    ! inventories: missing fallback org/store refs, skipping');
    return 0;
  }
  let inserted = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!r.id || !r.name) continue;
    try {
      const externalCode = `ms:${r.id}`;
      const existing = await prisma.inventory.findFirst({
        where: { accountId: ACCOUNT_ID, externalCode },
        select: { id: true },
      });
      const organizationId = orgByMs.get(extractMsId(r.organization?.meta.href) ?? '') ?? fbOrg;
      const storeId = storeByMs.get(extractMsId(r.store?.meta.href) ?? '') ?? fbStore;
      const data = {
        name: r.name.slice(0, 100),
        description: r.description ?? null,
        moment: r.moment ? new Date(r.moment) : new Date(),
        applicable: r.applicable ?? false,
        state: r.applicable ? 'posted' : 'draft',
        published: r.published ?? false,
        printed: r.printed ?? false,
        sumMinor: BigInt(Math.round(r.sum ?? 0)),
      };
      // InventoryPosition has NO quantity field — it needs expected/actual/variance.
      // moysklad: quantity = counted (actual), calculatedQuantity = system (expected).
      const positionCreate = (r.positions?.rows ?? [])
        .map((p) => {
          const ref = resolve(extractMsId(p.assortment?.meta?.href), p.assortment?.meta?.type);
          return ref ? { p, ref } : null;
        })
        .filter((x): x is { p: MsPosition; ref: ResolvedAssortment } => x !== null)
        .map(({ p, ref }, i) => {
          const actual = p.quantity ?? 0;
          const expected = p.calculatedQuantity ?? p.quantity ?? 0;
          return {
            accountId: ACCOUNT_ID,
            position: i + 1,
            assortmentKind: ref.assortmentKind,
            assortmentId: ref.assortmentId,
            productId: ref.productId,
            actualQty: String(actual),
            expectedQty: String(expected),
            varianceQty: String(actual - (p.calculatedQuantity ?? 0)),
            costMinor: null,
          };
        });
      if (existing) {
        await prisma.inventory.update({ where: { id: existing.id }, data });
      } else {
        await createDocWithNameFallback(
          prisma.inventory,
          {
            ...data,
            accountId: ACCOUNT_ID,
            externalCode,
            organizationId,
            storeId,
            positions: { create: positionCreate },
          },
          r.id,
        );
      }
      inserted++;
      if (inserted % 500 === 0) console.log(`    … inventories ${inserted}/${rows.length}`);
    } catch {
      skipped++;
    }
  }
  console.log(`  ↳ inventories: ${inserted} upserted (${skipped} skipped of ${rows.length})`);
  return inserted;
}

async function main(): Promise<void> {
  console.log('🌱 Real-data import starting…');
  console.log(`  Target account: ${ACCOUNT_ID}`);
  console.log(`  Token configured: ${MOYSKLAD_TOKEN ? 'yes' : 'no (legacy JSON only)'}`);

  const legacyCount = await importLegacyCounterparties();
  const liveCounterparties = await importLiveCounterparties();
  const liveOrgs = await importLiveOrganizations();
  const liveStores = await importLiveStores();
  // Price types BEFORE products so product salePrices can reference the real
  // default PriceType id (not the legacy 'default' sentinel).
  const livePriceTypes = await importLivePriceTypes();
  const liveProducts = await importLiveProducts();
  const liveCurrencies = await importLiveCurrencies();
  const liveFolders = await importLiveProductFolders();
  const liveContacts = await importLiveContactPersons();
  const liveTasks = await importLiveTasks();
  const liveCustomerOrders = await importLiveCustomerOrders();

  const docTotals: Record<string, number> = {};
  for (const spec of DOC_SPECS) {
    docTotals[spec.label] = await importLiveDocuments(spec);
  }

  // Sub-types of Product (kind discriminator)
  docTotals.bundles = await importLiveProductsByKind('/entity/bundle', 'bundle', 'bundles');
  docTotals.services = await importLiveProductsByKind('/entity/service', 'service', 'services');
  docTotals.variants = await importLiveVariants();

  // Warehouse documents (internal stock — no agent)
  docTotals.moves = await importLiveMove();
  docTotals.losses = await importLiveLoss();
  docTotals.enters = await importLiveEnter();
  docTotals.inventories = await importLiveInventory();

  // Ensure a CashDesk + OrganizationAccount exist so cash/payment docs import.
  await ensureDefaultMoneyAccounts();

  // Money documents (cash + bank)
  docTotals['cash-in'] = await importLiveMoneyDocs('/entity/cashin', 'cashIn', 'cash-in');
  docTotals['cash-out'] = await importLiveMoneyDocs('/entity/cashout', 'cashOut', 'cash-out');
  docTotals['payments-in'] = await importLiveMoneyDocs(
    '/entity/paymentin',
    'paymentIn',
    'payments-in',
  );
  docTotals['payments-out'] = await importLiveMoneyDocs(
    '/entity/paymentout',
    'paymentOut',
    'payments-out',
  );

  const totals = {
    counterparties: await prisma.counterparty.count({ where: { accountId: ACCOUNT_ID } }),
    organizations: await prisma.organization.count({ where: { accountId: ACCOUNT_ID } }),
    stores: await prisma.store.count({ where: { accountId: ACCOUNT_ID } }),
    products: await prisma.product.count({ where: { accountId: ACCOUNT_ID } }),
    currencies: await prisma.currency.count({ where: { accountId: ACCOUNT_ID } }),
    priceTypes: await prisma.priceType.count({ where: { accountId: ACCOUNT_ID } }),
    productFolders: await prisma.productFolder.count({ where: { accountId: ACCOUNT_ID } }),
    contactPersons: await prisma.contactPerson.count({ where: { accountId: ACCOUNT_ID } }),
    tasks: await prisma.task.count({ where: { accountId: ACCOUNT_ID } }),
    customerOrders: await prisma.customerOrder.count({ where: { accountId: ACCOUNT_ID } }),
  };

  console.log('---');
  console.log('✓ Done. Imported this run:');
  console.log(`  legacy counterparties: ${legacyCount}`);
  console.log(`  live counterparties:   ${liveCounterparties}`);
  console.log(`  live organizations:    ${liveOrgs}`);
  console.log(`  live stores:           ${liveStores}`);
  console.log(`  live products:         ${liveProducts}`);
  console.log(`  live currencies:       ${liveCurrencies}`);
  console.log(`  live price types:      ${livePriceTypes}`);
  console.log(`  live product folders:  ${liveFolders}`);
  console.log(`  live contact persons:  ${liveContacts}`);
  console.log(`  live CRM tasks:        ${liveTasks}`);
  console.log(`  live customer orders:  ${liveCustomerOrders}`);
  for (const [label, n] of Object.entries(docTotals)) {
    console.log(`  live ${label}: ${n}`);
  }
  console.log(`Totals in DB (account ${ACCOUNT_ID.slice(0, 8)}…):`);
  console.log(`  counterparties:  ${totals.counterparties}`);
  console.log(`  organizations:   ${totals.organizations}`);
  console.log(`  stores:          ${totals.stores}`);
  console.log(`  products:        ${totals.products}`);
  console.log(`  currencies:      ${totals.currencies}`);
  console.log(`  price types:     ${totals.priceTypes}`);
  console.log(`  product folders: ${totals.productFolders}`);
  console.log(`  contact persons: ${totals.contactPersons}`);
  console.log(`  tasks:           ${totals.tasks}`);
  console.log(`  customer orders: ${totals.customerOrders}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

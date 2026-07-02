/**
 * One-shot importer that re-fetches customer orders with the
 * `deliveryPlannedMoment` field, so the dashboard's overdue-orders
 * count works (filters on applicable=false AND
 * deliveryPlannedMoment < now).
 *
 * Run:
 *   pnpm --filter @moysklad/db exec tsx prisma/import-co-only.ts
 */
import { PrismaClient } from '../src/generated/index.js';

const prisma = new PrismaClient();
const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const TOKEN = process.env.MOYSKLAD_TOKEN ?? '';
const BASE = process.env.MOYSKLAD_BASE_URL ?? 'https://api.moysklad.ru/api/remap/1.2';

if (!TOKEN) {
  console.error('MOYSKLAD_TOKEN required');
  process.exit(1);
}

interface MsRow {
  id: string;
  name: string;
  description?: string;
  moment?: string;
  applicable?: boolean;
  agent?: { meta: { href: string } };
  organization?: { meta: { href: string } };
  store?: { meta: { href: string } };
  sum?: number;
  vatSum?: number;
  payedSum?: number;
  shippedSum?: number;
  invoicedSum?: number;
  deliveryPlannedMoment?: string;
}

async function fetchPaged(path: string): Promise<MsRow[]> {
  const out: MsRow[] = [];
  let offset = 0;
  for (;;) {
    const url = `${BASE}${path}?limit=1000&offset=${offset}`;
    let r: Response;
    let attempt = 0;
    for (;;) {
      r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
      if (r.status !== 429) break;
      attempt++;
      if (attempt > 5) throw new Error(`rate-limited ${path}`);
      await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
    }
    if (!r.ok) throw new Error(`HTTP ${r.status} on ${path}`);
    const body = (await r.json()) as { rows?: MsRow[] };
    const rows = body.rows ?? [];
    out.push(...rows);
    if (rows.length < 1000) break;
    offset += 1000;
    if (offset % 5000 === 0) console.log(`    fetched ${out.length}…`);
    await new Promise((r) => setTimeout(r, 250));
  }
  return out;
}

const extractId = (href?: string): string | null => {
  if (!href) return null;
  const m = href.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0] : null;
};

async function main(): Promise<void> {
  console.log('Customer orders re-import (with deliveryPlannedMoment)');
  const rows = await fetchPaged('/entity/customerorder');
  console.log(`Total: ${rows.length}`);

  const cps = await prisma.counterparty.findMany({
    where: { accountId: ACCOUNT_ID, externalCode: { startsWith: 'ms:' } },
    select: { id: true, externalCode: true },
  });
  const cpByMs = new Map(cps.map((c) => [c.externalCode!.replace(/^ms:/, ''), c.id]));
  const orgs = await prisma.organization.findMany({
    where: { accountId: ACCOUNT_ID, externalCode: { startsWith: 'ms:' } },
    select: { id: true, externalCode: true },
  });
  const orgByMs = new Map(orgs.map((o) => [o.externalCode!.replace(/^ms:/, ''), o.id]));
  const stores = await prisma.store.findMany({
    where: { accountId: ACCOUNT_ID, externalCode: { startsWith: 'ms:' } },
    select: { id: true, externalCode: true },
  });
  const storeByMs = new Map(stores.map((s) => [s.externalCode!.replace(/^ms:/, ''), s.id]));
  const fbCp = cps[0]?.id;
  const fbOrg = orgs[0]?.id;
  const fbStore = stores[0]?.id;
  if (!fbCp || !fbOrg || !fbStore) {
    console.warn('missing fallback FK refs');
    return;
  }

  let inserted = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!r.id || !r.name) continue;
    try {
      const externalCode = `ms:${r.id}`;
      const existing = await prisma.customerOrder.findFirst({
        where: { accountId: ACCOUNT_ID, externalCode },
        select: { id: true },
      });
      const agentId = cpByMs.get(extractId(r.agent?.meta.href) ?? '') ?? fbCp;
      const organizationId = orgByMs.get(extractId(r.organization?.meta.href) ?? '') ?? fbOrg;
      const storeId = storeByMs.get(extractId(r.store?.meta.href) ?? '') ?? fbStore;

      const data = {
        name: r.name.slice(0, 100),
        description: r.description ?? null,
        moment: r.moment ? new Date(r.moment) : new Date(),
        deliveryPlannedMoment: r.deliveryPlannedMoment
          ? new Date(r.deliveryPlannedMoment)
          : null,
        applicable: r.applicable ?? false,
        state: r.applicable ? 'fully_shipped' : 'draft',
        sumMinor: BigInt(Math.round(r.sum ?? 0)),
        vatSumMinor: BigInt(Math.round(r.vatSum ?? 0)),
        payedSumMinor: BigInt(Math.round(r.payedSum ?? 0)),
        shippedSumMinor: BigInt(Math.round(r.shippedSum ?? 0)),
        invoicedSumMinor: BigInt(Math.round(r.invoicedSum ?? 0)),
      };
      if (existing) {
        await prisma.customerOrder.update({ where: { id: existing.id }, data });
      } else {
        await prisma.customerOrder.create({
          data: { ...data, accountId: ACCOUNT_ID, externalCode, agentId, organizationId, storeId },
        });
      }
      inserted++;
      if (inserted % 1000 === 0) console.log(`  ${inserted}/${rows.length}`);
    } catch {
      skipped++;
    }
  }
  console.log(`✓ ${inserted} updated/inserted, ${skipped} skipped`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

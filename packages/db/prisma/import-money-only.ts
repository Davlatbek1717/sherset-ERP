/**
 * One-shot importer that re-fetches the 4 money document types
 * (paymentin, paymentout, cashin, cashout) with the now-corrected
 * OrganizationAccount lookup. The earlier seed-real.ts run silently
 * skipped these because no OrgAccount existed; we just inserted one
 * default OrgAccount per Organization, so this re-run should succeed.
 *
 *   pnpm --filter @moysklad/db exec tsx prisma/import-money-only.ts
 */
import { PrismaClient } from '../src/generated/index.js';

const prisma = new PrismaClient();
const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const TOKEN = process.env.MOYSKLAD_TOKEN ?? '';
const BASE = process.env.MOYSKLAD_BASE_URL ?? 'https://api.moysklad.ru/api/remap/1.2';

if (!TOKEN) {
  console.error('MOYSKLAD_TOKEN env var required');
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
  sum?: number;
  vatSum?: number;
  paymentPurpose?: string;
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

async function importMoney(
  endpoint: string,
  // biome-ignore lint/suspicious/noExplicitAny: dynamic dispatch
  modelKey: 'paymentIn' | 'paymentOut' | 'cashIn' | 'cashOut',
  isCash: boolean,
): Promise<void> {
  console.log(`\n→ ${endpoint}`);
  const rows = await fetchPaged(endpoint);
  console.log(`  total in source: ${rows.length}`);

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
  const cashDesks = await prisma.cashDesk.findMany({
    where: { accountId: ACCOUNT_ID },
    select: { id: true },
  });
  const orgAccs = await prisma.organizationAccount.findMany({
    where: { accountId: ACCOUNT_ID, isDefault: true },
    select: { id: true, organizationId: true },
  });
  const orgAccByOrg = new Map(orgAccs.map((a) => [a.organizationId, a.id]));
  const fbCp = cps[0]?.id;
  const fbOrg = orgs[0]?.id;
  const fbCash = cashDesks[0]?.id;
  const fbAcc = orgAccs[0]?.id;
  if (!fbCp || !fbOrg) {
    console.warn('  ! no counterparties or orgs imported, skip');
    return;
  }
  if (isCash && !fbCash) {
    console.warn('  ! no CashDesk in DB, skip');
    return;
  }
  if (!isCash && !fbAcc) {
    console.warn('  ! no OrgAccount in DB, skip');
    return;
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
      const agentId = cpByMs.get(extractId(r.agent?.meta.href) ?? '') ?? fbCp;
      const organizationId = orgByMs.get(extractId(r.organization?.meta.href) ?? '') ?? fbOrg;
      const orgAccountId = orgAccByOrg.get(organizationId) ?? fbAcc;
      const data = {
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
        await model.create({
          data: {
            ...data,
            accountId: ACCOUNT_ID,
            externalCode,
            agentId,
            organizationId,
            ...(isCash ? { cashDeskId: fbCash! } : { organizationAccountId: orgAccountId! }),
          },
        });
      }
      inserted++;
      if (inserted % 1000 === 0) console.log(`    inserted ${inserted}/${rows.length}`);
    } catch {
      skipped++;
    }
  }
  console.log(`  ✓ ${inserted} inserted, ${skipped} skipped`);
}

async function main(): Promise<void> {
  console.log('Money documents re-import (with proper OrgAccount/CashDesk FK)');
  await importMoney('/entity/paymentin', 'paymentIn', false);
  await importMoney('/entity/paymentout', 'paymentOut', false);
  await importMoney('/entity/cashin', 'cashIn', true);
  await importMoney('/entity/cashout', 'cashOut', true);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

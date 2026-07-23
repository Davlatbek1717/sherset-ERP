#!/usr/bin/env tsx
/**
 * BE smoke (2026-07-03) — /supplies create with «Статус» (custom State) + owner bits:
 *   1) create a supply custom status → POST /supplies with statusId → 201, status persisted
 *   2) bogus statusId → 400 (tenant/entityType-validated before FK-connect)
 *   3) shared/ownerId honored (owner check skipped when no alt employee in the DB)
 * Self-cleaning (draft supply hard-deleted, smoke status deleted).
 *
 * Run: `API_BASE=http://localhost:4021/api/v1 npx tsx src/scripts/smoke-supply-status-create.ts`
 * (from apps/api, against an isolated dev API; needs admin@demo.local seed user).
 */
import { PrismaClient } from '@moysklad/db';

interface RefItem {
  id: string;
  name?: string;
}
interface SupplyDetail {
  id: string;
  shared?: boolean;
  status?: { id: string; name: string } | null;
  owner?: { id: string } | null;
}

const prisma = new PrismaClient();
const API = process.env.API_BASE ?? 'http://localhost:4021/api/v1';
const login = (await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
}).then((r) => r.json())) as { accessToken: string };
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.accessToken}` };
const get = <T>(p: string): Promise<T> =>
  fetch(`${API}${p}`, { headers: H }).then((r) => r.json() as Promise<T>);
const post = async (p: string, body: unknown) => {
  const r = await fetch(`${API}${p}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  return {
    status: r.status,
    body: (await r.json().catch(() => null)) as { id?: string } | null,
  };
};
const out: Record<string, unknown> = {};

const org = (await get<{ items: RefItem[] }>('/organizations?limit=1')).items?.[0];
const agent = (await get<{ items: RefItem[] }>('/counterparties?limit=1')).items?.[0];
const storesRes = await get<{ items?: RefItem[] } | RefItem[]>('/admin/stores?limit=1');
const store = (Array.isArray(storesRes) ? storesRes : (storesRes.items ?? []))[0];
// NOTE: GET /products list may 500 on drifted dev DBs (client/schema drift) —
// fetch a product id via raw SQL instead of the list endpoint.
const prod = await prisma.$queryRaw<
  { id: string }[]
>`SELECT id FROM products WHERE deleted_at IS NULL LIMIT 1`;
const prodId = prod[0]?.id;
out.refs = { org: !!org, agent: !!agent, store: !!store, prod: prod.length };
if (!org || !agent || !store || !prodId) {
  console.error('missing refs, aborting', out.refs);
  process.exit(1);
}

const employees = (await get<{ items?: RefItem[] }>('/hr/employees?limit=5')).items ?? [];
const altOwner = employees.find((e) => e.id) ?? null;

// 1. supply custom status
const st = await post('/states', {
  entityType: 'supply',
  name: 'SMOKE-Кирилди',
  color: '#f57c00',
});
out.createStatus = st.status;
const statusId = st.body?.id;

// 2. create supply WITH statusId + shared (+ownerId when available)
const sup = await post('/supplies', {
  organizationId: org.id,
  agentId: agent.id,
  storeId: store.id,
  applicable: false,
  shared: true,
  ...(altOwner ? { ownerId: altOwner.id } : {}),
  statusId,
  positions: [
    { assortmentKind: 'product', assortmentId: prodId, quantity: '2', priceMinor: '150000' },
  ],
});
out.createWithStatus = sup.status;
const supplyId = sup.body?.id;
if (supplyId) {
  const fetched = await get<SupplyDetail>(`/supplies/${supplyId}`);
  out.persisted = {
    statusOk: fetched.status?.id === statusId && fetched.status?.name === 'SMOKE-Кирилди',
    shared: fetched.shared === true,
    owner: altOwner ? fetched.owner?.id === altOwner.id : 'skipped',
  };
}

// 3. bogus statusId → 400
const bogus = await post('/supplies', {
  organizationId: org.id,
  agentId: agent.id,
  storeId: store.id,
  applicable: false,
  statusId: '00000000-0000-4000-8000-00000000dead',
  positions: [
    { assortmentKind: 'product', assortmentId: prodId, quantity: '1', priceMinor: '1000' },
  ],
});
out.bogusStatus = bogus.status;

// 4. cleanup (draft supply hard-delete + status)
if (supplyId) {
  const del = await fetch(`${API}/supplies/${supplyId}`, { method: 'DELETE', headers: H });
  out.cleanupSupply = del.status;
}
if (statusId) {
  const delSt = await fetch(`${API}/states/${statusId}`, { method: 'DELETE', headers: H });
  out.cleanupStatus = delSt.status;
}
console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();

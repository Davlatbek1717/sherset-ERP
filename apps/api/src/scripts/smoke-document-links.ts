#!/usr/bin/env tsx
/**
 * BE smoke — /document-links (moysklad «Привязать документ»):
 *   1) link Supply A → Supply B (bidirectional) → 201
 *   2) GET for A returns B's snapshot; GET for B returns A's snapshot
 *   3) duplicate link → 400; self-link → 400
 *   4) DELETE → gone from both sides
 * Self-cleaning. Run from apps/api: `npx tsx src/scripts/smoke-document-links.ts`
 */
const API = process.env.API_BASE ?? 'http://localhost:4000/api/v1';
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
  return { status: r.status, body: (await r.json().catch(() => null)) as { id?: string } | null };
};
const out: Record<string, unknown> = {};

const supplies = (await get<{ items: { id: string; name: string }[] }>('/supplies?limit=2')).items;
out.refs = supplies?.length ?? 0;
if (!supplies || supplies.length < 2) {
  console.error('need 2 supplies', out.refs);
  process.exit(1);
}
const [A, B] = supplies as [{ id: string; name: string }, { id: string; name: string }];

const link = await post('/document-links', {
  sourceType: 'Supply',
  sourceId: A.id,
  sourceName: A.name,
  sourceMoment: new Date().toISOString(),
  sourceSumMinor: '0',
  sourceState: 'draft',
  targetType: 'Supply',
  targetId: B.id,
  targetName: B.name,
  targetMoment: new Date().toISOString(),
  targetSumMinor: '150000',
  targetState: 'draft',
});
out.create = link.status;
const linkId = link.body?.id;

const forA = await get<{ items: { linkId: string; id: string; name: string }[] }>(
  `/document-links?entityType=Supply&entityId=${A.id}`,
);
const forB = await get<{ items: { linkId: string; id: string; name: string }[] }>(
  `/document-links?entityType=Supply&entityId=${B.id}`,
);
out.aSeesB = forA.items.some((x) => x.id === B.id && x.name === B.name);
out.bSeesA = forB.items.some((x) => x.id === A.id && x.name === A.name);

const dup = await post('/document-links', {
  sourceType: 'Supply',
  sourceId: A.id,
  sourceName: A.name,
  sourceMoment: new Date().toISOString(),
  sourceSumMinor: '0',
  targetType: 'Supply',
  targetId: B.id,
  targetName: B.name,
  targetMoment: new Date().toISOString(),
  targetSumMinor: '0',
});
out.duplicate = dup.status; // expect 400

const self = await post('/document-links', {
  sourceType: 'Supply',
  sourceId: A.id,
  sourceName: A.name,
  sourceMoment: new Date().toISOString(),
  sourceSumMinor: '0',
  targetType: 'Supply',
  targetId: A.id,
  targetName: A.name,
  targetMoment: new Date().toISOString(),
  targetSumMinor: '0',
});
out.selfLink = self.status; // expect 400

if (linkId) {
  const del = await fetch(`${API}/document-links/${linkId}`, { method: 'DELETE', headers: H });
  out.delete = del.status;
  const afterA = await get<{ items: unknown[] }>(
    `/document-links?entityType=Supply&entityId=${A.id}`,
  );
  out.goneAfterDelete = afterA.items.length === 0;
}
console.info(JSON.stringify(out, null, 2));

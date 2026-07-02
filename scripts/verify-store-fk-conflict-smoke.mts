/**
 * Runtime verification (11y): a reference/catalog hard-delete blocked by an
 * `onDelete: Restrict` foreign key now returns a friendly HTTP 409 (or 400 on a
 * write), NOT a raw 500.
 *
 * Bug class: ~35 unmapped `delete()` services hard-delete a row and let any
 * un-pre-checked FK reference blow up as a raw `PrismaClientKnownRequestError`
 * P2003. Only `ZodExceptionFilter` was registered globally (no Prisma filter),
 * so the P2003 fell through to a 500. The new global `PrismaExceptionFilter`
 * maps P2003/P2014 → 409 (DELETE) / 400 (write).
 *
 * Store is the documented instance. Its `delete()` pre-checks only block stock
 * rows with qty != 0 and child stores — a SETTLED-TO-ZERO Stock row (qty = 0,
 * `Stock.store` is Restrict) slips past the pre-check and used to 500. This
 * exercises the FULL live path: HTTP DELETE → controller → service → Prisma →
 * the Restrict FK → mapped back to 409 at the HTTP boundary.
 *
 * Run: pnpm --filter @moysklad/db exec tsx ../../scripts/verify-store-fk-conflict-smoke.mts
 *   env: API_BASE (default http://localhost:4000/api/v1), LOGIN_EMAIL, LOGIN_PASSWORD
 * Requires: dev stack up (pnpm dev). Creates + cleans up its own store + Stock row.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../packages/db/src/index.ts';

const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';
const EMAIL = process.env.LOGIN_EMAIL ?? 'admin@demo.local';
const PASSWORD = process.env.LOGIN_PASSWORD ?? 'admin123';

// Must match PrismaExceptionFilter.IN_USE_MESSAGE — asserting on it proves the
// 409 came from the FILTER (escaped P2003), not the store pre-check (which has
// its own "Omborda … qoldig'i bor" message and only fires for qty != 0).
const IN_USE_MESSAGE = "Yozuv ishlatilmoqda — avval bog'liqliklarni uzing";

let TOKEN = '';

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

const results: boolean[] = [];
const pass = (m: string) => {
  results.push(true);
  console.log('  ✓ ' + m);
};
const fail = (m: string) => {
  results.push(false);
  console.log('  ✗ ' + m);
};

const tag = Date.now();

async function main() {
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  TOKEN = login.json?.accessToken;
  if (!TOKEN) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.json)}`);
  console.log('logged in');

  let storeId: string | null = null;
  let controlId: string | null = null;
  try {
    // ── A) Negative control: a CLEAN store (no references) still hard-deletes (200).
    //    Guards against the filter / change accidentally blocking normal deletes.
    const c = await api('POST', '/admin/stores', { name: `SMOKE-FK-CTRL-${tag}` });
    controlId = c.json?.id ?? null;
    if (c.status !== 201 || !controlId) throw new Error(`control create: ${c.status}`);
    const cd = await api('DELETE', `/admin/stores/${controlId}`);
    if (cd.status === 200 && cd.json?.ok === true) {
      pass('clean store (no refs) → DELETE 200 {ok:true} (no regression)');
      controlId = null; // deleted
    } else {
      fail(`clean store DELETE → ${cd.status} ${JSON.stringify(cd.json)} (expected 200)`);
    }

    // ── set up the store-under-test
    const s = await api('POST', '/admin/stores', { name: `SMOKE-FK-${tag}` });
    storeId = s.json?.id ?? null;
    if (s.status !== 201 || !storeId) throw new Error(`store create: ${s.status}`);
    const row = await prisma.store.findUnique({
      where: { id: storeId },
      select: { accountId: true },
    });
    const accountId = row?.accountId;
    if (!accountId) throw new Error('could not read accountId for created store');

    // ── B) HEADLINE: a SETTLED-TO-ZERO Stock row (qty=0) slips past the store
    //    pre-check (`qty: { not: 0 }`) → store.delete() hits the Restrict FK →
    //    P2003. Was raw 500; now the global filter maps it to 409 "in use".
    await prisma.stock.create({
      data: {
        accountId,
        storeId,
        assortmentKind: 'product',
        assortmentId: randomUUID(), // Stock.assortmentId has no FK — any uuid is fine
        qty: 0,
        reservedQty: 0,
      },
    });
    const d = await api('DELETE', `/admin/stores/${storeId}`);
    if (d.status === 409) pass('store w/ settled-to-zero Stock row → DELETE 409 (was raw 500)');
    else fail(`store DELETE (qty=0 stock) → ${d.status} ${JSON.stringify(d.json)} (expected 409)`);
    if (d.status !== 500) pass('explicitly NOT 500 (the bug is fixed)');
    else fail('still 500 — filter not active / API not reloaded');
    if (d.json?.message === IN_USE_MESSAGE)
      pass('409 came from the FILTER (generic in-use message), not the store pre-check');
    else fail(`unexpected message: ${JSON.stringify(d.json?.message)} (expected filter message)`);

    // ── C) Layering check: with qty != 0 the store PRE-CHECK still owns the case
    //    (specific 400 message), so the filter only handles what the pre-check misses.
    await prisma.stock.updateMany({
      where: { accountId, storeId },
      data: { qty: 5 },
    });
    const d2 = await api('DELETE', `/admin/stores/${storeId}`);
    if (
      d2.status === 400 &&
      typeof d2.json?.message === 'string' &&
      d2.json.message.includes('qoldi')
    )
      pass('store w/ qty=5 stock → DELETE 400 via pre-check (specific message preserved)');
    else
      fail(
        `store DELETE (qty=5) → ${d2.status} ${JSON.stringify(d2.json)} (expected 400 pre-check)`,
      );
  } finally {
    // ── cleanup (Prisma — bypasses the Restrict FK by removing the Stock row first)
    if (storeId) {
      await prisma.stock.deleteMany({ where: { storeId } }).catch(() => {});
      await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
    }
    if (controlId) await prisma.store.delete({ where: { id: controlId } }).catch(() => {});
    await prisma.$disconnect();
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (passed !== results.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

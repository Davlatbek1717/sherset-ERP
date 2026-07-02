# Concurrency audit — document auto-numbering race (2026-06-10)

**Class:** data-integrity / concurrency (global `CLAUDE.md` adversarial QA: *"Agar 2 yoki N ta
foydalanuvchi parallel bajarsa? Lost update? Parallel bir xil SKU/ID create qilinsa unique
constraint ishlaydimi?"*). **Severity: HIGH** — silent document loss under concurrent creates.
**Phase: runtime-verified** (live api+db burst, not just gate-green).

Commits: `d8c41c5d` (foundation + customer-order) · `7b8bccff` (rollout to all 32 generators).

---

## The bug

Every document service auto-numbered with a **read-max-then-insert**:

```ts
const last = await this.prisma.client.<doc>.findFirst({
  where: { accountId, name: { startsWith: prefix } },
  orderBy: { name: 'desc' }, select: { name: true },
});
const lastN = last ? Number.parseInt(last.name.slice(prefix.length), 10) || 0 : 0;
return `${prefix}${String(lastN + 1).padStart(5, '0')}`;   // ← RACE
```

Two concurrent creates `findFirst` the same max, both compute `lastN + 1`, both `INSERT` the
same `name`. The loser hits the `(account_id, name)` unique constraint; `handlePrisma` maps the
P2002 to a **409 with NO retry** → the document is **silently dropped**. The caller sees a generic
conflict, not "your order wasn't saved."

**Who it bites (not theoretical):** multi-user document entry (two cashiers/managers saving at
once), **e-commerce order sync** (a channel webhook batch posts N orders in parallel), and **bulk
import** (the AvtoFix-class workload from the global CLAUDE.md — 2000-row Excel → parallel creates).

**Why every gate was green:** typecheck/biome/unit never run two inserts concurrently; the existing
e2e specs create one document at a time. Only a real concurrent burst surfaces it.

### Live repro (foundation, real DB)

```
12-way concurrent POST /customer-orders:
  BEFORE: 3 created / 9 × HTTP 409 "…allaqachon mavjud: account_id, name"
  AFTER:  12 created / 0 × 409, names ЗП-2026-00051..00062 (distinct, gapless)
```

---

## The fix

A per-account atomic counter `DocumentSequence(accountId, key, value)` (migration
`20260610000000_add_document_sequence`, `@@id([accountId, key])`), allocated via:

```ts
allocateDocumentNumber(client, accountId, prefix, seed): Promise<number>
```

(`apps/api/src/prisma/document-number.ts`). It does an atomic
`update … { value: { increment: 1 } }` — Postgres takes a **row lock**, so concurrent callers
serialise onto distinct values. The counter is lazily seeded from the current max via the `seed`
closure (the old read-max logic, returning the max **as-is**, not max+1) on first use, so existing
documents keep their numbering with **zero backfill**. The create flow is otherwise untouched —
only the isolated number-gen call changed; the prefix string and `padStart` width are preserved
verbatim per service (`ПКО-`, `ОТ-`, `СФ-`, `ВН-`, `ТРН-`, `СД-`, … all intact).

### Second race the rollout exposed (and fixed)

The lazy first-seed originally used `prisma.upsert`, which Prisma compiles to **SELECT-then-INSERT**
— so a 12-way burst on a *fresh* key (no counter row yet) hit P2002 *inside the upsert* → 500
(live: 8/12 then 9/12 created). Replaced with
`createMany({ data: [...], skipDuplicates: true })` = `INSERT … ON CONFLICT DO NOTHING`: the
concurrent first-seed keeps the winner's row, all callers then take distinct increments.

### Live repro (rollout, fresh counter rows so first-seed race is exercised)

```
cash-in  12/12 created, 0 failed, names ПКО-2026-00012..00023 (unique, gapless)
demands  12/12 created, 0 failed, names ОТ-2026-00046..00057 (unique, gapless)
(test docs deleted after; counters intentionally persist — sequences never reuse numbers)
```

---

## Coverage — 32 generators across 30 services

Found by a **`padStart(5` source sweep**, not the agent reports (the rollout workflow's agent list
missed `opportunity`; the sweep caught it — discipline: *verify rollout with an exhaustive scan, not
an enumeration*, the `08h` lesson). cashier-session has two (drawer-in `ВН-` / drawer-out `ИЗ-`);
purchase-order has two (`ЗП-` order name + the `create:cashout` `РО-` block).

cash-in · cash-out · customer-order · demand · supply · move · enter · loss · inventory ·
internal-order · invoice-in · invoice-out · payment-in · payment-out · sales-return ·
purchase-return · purchase-order(×2) · prepayment · prepayment-return · counterparty-adjustment ·
facture-in · facture-out · processing · processing-order · production · work-order · payroll ·
retail-sale · cashier-session(×2) · opportunity · service-request.

### Intentionally exempt
`analitika/order.service.ts` — numbers from `count()+1` with **no `startsWith` query** and retries
on P2002 in a loop (`MAX_NUMBER_RETRIES`). A collision **self-heals** there instead of surfacing a
409, so it's a different (acceptable) shape. The guard excludes it by detector shape, and the
exemption is documented in-test.

---

## Guards

- **`document-number.test.ts`** (+6) — pins the helper's orchestration (seed once, increment every
  call, per-account/key isolation). In-memory mock → **does not** prove DB atomicity; the live burst
  does. Secondary to the runtime proof.
- **`document-number-rollout.test.ts`** (+3) — **self-maintaining source-scan** (the `08m` lesson:
  guards derive truth from source, no hand list). Walks `apps/api/src/modules`, and for every
  generator-shaped service (`startsWith: prefix` query + `padStart(5)`) asserts it calls
  `allocateDocumentNumber`; bans the raced `+ 1).padStart(5` shape outright; floor ≥ 31. A future
  service written with the old pattern **fails CI immediately**. Non-vacuous: during development it
  correctly flagged `opportunity` before it was wired.
- **`document-sequence.mock.ts`** — not a test; a stateful stub so the 10 hand-rolled Prisma-mock
  unit suites keep their exact existing name expectations.

## Gate
db tc0 · api tc0 · biome 0/0 (changed) · api Vitest **2814** (+9 vs 2805: 6 helper + 3 rollout,
0 regress) · live burst **24/24** with zero 409/500.

## Residual / not done
- **FE 409-on-conflict UX** is unchanged — it's now far rarer (numbering no longer the cause), but a
  genuine `(account_id, name)` clash from a user-supplied `externalCode`/manual name would still
  surface the generic 409. Out of scope (numbering was the systemic source).
- Browser-smoke not added (the race is a pure-API concurrency property; the live multi-request burst
  is the correct verification surface, and a single-session browser can't reproduce it).

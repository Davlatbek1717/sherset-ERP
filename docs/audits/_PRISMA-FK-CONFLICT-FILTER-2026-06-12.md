# Prisma FK / required-relation violation → 409/400 (global filter) — 2026-06-12 (11y)

**Status: Phase-2 VERIFIED** (live API :4000 + DB smoke 5/5 + filter unit tests 8/8). BE-only error-mapping; no UI label surface → browser-QA N/A (same class as 11u/11t).

**Commit:** _(see NEXT.md 11y entry)_

---

## 0. Bug class (real, documented, groundable without capture)

A reference/catalog **hard-delete** blocked by an `onDelete: Restrict` foreign key surfaced to the user as a **raw HTTP 500**. Only `ZodExceptionFilter` was registered globally — there was **no Prisma exception filter** — so any `PrismaClientKnownRequestError` that escaped a service's own try/catch fell through to NestJS's default 500.

Sized the class deterministically (`grep "async delete(" --include=*.service.ts`, then classify hard-delete vs P2003-mapped vs soft-delete):

- **~35 services hard-delete a row with NO P2003 mapping** — store, product-folder, project, organization, organization-account, price-type, tax-rate, region, counterparty, custom-entity, discount, expense-item, opportunity, pipeline, task-type, task, tracking-code, variant, reason-code, contact-person, roles, webhook(-stock), notification, attachment, attribute-metadata, call, help, hr-role, hr-task-template, hr-attendance, cash-desk, …
- **Only 2 mapped it ad-hoc** (`currency.service.ts:300`, `uom.service.ts:147`) — `if (code === 'P2003' || 'P2014') → ConflictException`, with divergent hand-written messages → a shared chokepoint is wanted (DRY).
- The rest of the document modules (cash-in/out, demand, supply, invoice-in/out, move, …) **soft-delete** (`deletedAt`), so they don't hit this — lower priority, not the bug.

**Documented instance — store** ([store.service.ts:214](../../apps/api/src/modules/store/store.service.ts)): `delete()` pre-checks only `Stock` rows with `qty != 0` and child stores. A **settled-to-zero** `Stock` row (`qty = 0`, `Stock.store` is `onDelete: Restrict`) slips past the pre-check → `store.delete()` → P2003 → raw 500. Store has ~20 `Restrict` document FKs (InternalOrder, CustomerOrder, Production, ProcessingOrder, Processing, Move×2, …) — any of those references reproduces it too.

## 1. Fix — one global filter, not 35 catch blocks

`apps/api/src/modules/shared/prisma-exception.filter.ts` — `@Catch(Prisma.PrismaClientKnownRequestError)`:

- **DELETE** + `P2003`/`P2014` → **409 Conflict** ("Yozuv ishlatilmoqda — avval bog'liqliklarni uzing") — the row is still referenced.
- **write** (POST/PATCH/PUT) + `P2003`/`P2014` → **400 Bad Request** ("Bog'langan yozuv topilmadi yoki noto'g'ri") — the referenced row doesn't exist. (HTTP-method-aware so the message is correct in both FK directions.)
- **any other code** (P2025, P2002, unknown) → **500 preserved** + `Sentry.captureException` + `logger.error` (never silently swallowed).

Registered in `main.ts` alongside `ZodExceptionFilter` (disjoint `@Catch` targets → order irrelevant).

### Why a global filter is the *higher-quality* fix (not scope creep)

A global exception filter **only transforms the HTTP response — it never alters in-process error propagation.** This is the key safety property:

- `currency`/`uom` catch P2003 **in-service** and throw their own `ConflictException` (an `HttpException`, not a raw Prisma error) → they reach Nest's default handler with **their specific messages, unchanged**. The global filter is a pure safety-net for everything they don't pre-handle.
- `runBulk` (`shared/bulk.ts`) wraps each item in `Promise.allSettled` → per-item rejections are captured **in-process**, so `/bulk-delete` never reaches the filter and still returns its per-id outcome list.
- Only a genuinely-unhandled Prisma error reaching the controller boundary is mapped. **No currently-working response changes** — purely 500 → 4xx for already-broken paths.

So one tested chokepoint fixes the entire present + future class, where 35 scattered catch blocks would drift (future delete endpoints would forget them). This is the 11b "central > scattered" lesson applied to error-mapping.

### Deliberately NARROW

P2025 (not-found) and P2002 (unique) are **left as-is**: the per-site optimistic-lock (`isRecordNotFound` → `OptimisticLockException`, 409 + `OPTIMISTIC_LOCK` code) and employee-unique (`throwIfEmployeeUniqueViolation`, 409 with email/login message) handlers own those 409 semantics. A blanket global mapping would either lose their specificity or collide with the optimistic-lock dialog contract. P2003/P2014 have **no per-site semantic variation** — always "FK conflict" — making them the safe global-default candidates.

## 2. Tests

- **`prisma-exception.filter.test.ts` (+8):** P2003/P2014 on DELETE → 409 + exact body; P2003 on POST/PATCH → 400; case-insensitive method; P2025/P2002/unknown → 500 (not swallowed).
- **`verify-store-fk-conflict-smoke.mts` (live, 5/5):**
  1. clean store (no refs) → DELETE **200** `{ok:true}` (no regression).
  2. store + settled-to-zero Stock row → DELETE **409** (was raw 500).
  3. explicitly **NOT 500**.
  4. the 409 carries the **filter's** generic message (not the store pre-check message) → proves it's the filter, not the pre-check.
  5. store + `qty=5` Stock row → DELETE **400** via the store **pre-check** (specific "…qoldig'i bor" message preserved) → proves the layering (pre-check owns qty≠0; filter owns the escaped qty=0 / document-FK cases).

## 3. Gate

api tc0 · biome 0 err (7 warns: `any`/`console.log` in the smoke script — tolerated, same as existing `verify-*`/`probe-*`) · **api Vitest 2935 (+8, 0 regress)** (was 2927) · web/ds/db untouched.

## 4. Honest coverage

- The filter is **entity-agnostic by construction** (keyed on the Prisma error class, references no entity) — the unit tests prove the mapping for any P2003/P2014, and the store smoke proves the end-to-end wiring (registered → reached → response transformed). The other ~34 reference-delete instances are **covered by construction** at the single chokepoint; they were **not each individually runtime-smoked** (one representative + boundary unit tests is sufficient because every route shares the identical, entity-independent boundary path).
- **Write-direction (P2003 → 400)** is unit-tested but not live-smoked (creates mostly pre-validate FKs, so it's a rare-but-better-than-500 path).
- **No UI surface** (error→toast only) → browser-QA N/A.

## 5. Lessons

- "Fix store's 500" was an instance of a 35-wide class → the adversarial "which pattern, where else?" lens turned a one-off catch into a single global chokepoint that's both **more complete and less code**.
- A global exception filter is safe precisely because it's response-only: in-process catches (currency/uom service-level, `runBulk`'s allSettled) are untouched, so the blast radius is exactly "already-500 responses → 4xx".
- Ground the repro in the realistic gap: the store **pre-check** explicitly ignores `qty=0`, so settled-to-zero ledger rows (an everyday state) were the silent 500 — not an exotic edge.

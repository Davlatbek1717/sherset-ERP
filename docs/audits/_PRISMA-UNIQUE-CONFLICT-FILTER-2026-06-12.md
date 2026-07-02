# Prisma unique-violation (P2002) → 409 via the global filter — 2026-06-12 (11aa)

**Status: Phase-2 VERIFIED** (live API smoke 7/7 + filter unit 13/13). API-only change, no UI surface.
Commit (feat): _see NEXT.md top entry_.

## TL;DR

`PrismaExceptionFilter` (added in 11y for P2003/P2014) now also maps **P2002**
(unique-constraint violation) → **409 Conflict**, method-independent. Closes the
remaining raw-500 class: reference creates **without** a duplicate pre-check
(pipeline, price-list, document-state) used to 500 on a sequential duplicate
name, and pre-checked creates (store, employee) used to 500 on a **TOCTOU race**
past the pre-check. Natural continuation of 11y (P2003/P2014) and 11u (employee
P2002 per-site).

## Why this, and why now (basis measured — 11z handoff said "measure before reopening")

11y deliberately left P2002 NARROW. Grounding the basis (not blindly reopening):

1. **The stated reason for NARROW does not actually conflict with a global net.**
   The 11y comment said P2002 was left alone so "optimistic-lock and
   employee-unique handlers keep ownership of their 409 semantics." But:
   - optimistic-lock uses **P2025**, not P2002 — untouched by a P2002 net;
   - employee-unique (11u) catches P2002 **in-service** and throws a
     `ConflictException` (an `HttpException`, ≠ `PrismaClientKnownRequestError`)
     **before** the error escapes — so a global `@Catch(PrismaClientKnownRequestError)`
     never sees it.
   A global P2002→409 net therefore only catches **unhandled** P2002 — exactly
   the same response-only safety argument 11y used for P2003.

2. **There IS a real unhandled raw-500 class** (self-grounded, not assumed):
   - 28 services already map P2002 per-site with a field-specific 409 (currency
     "Bu kodli valyuta…", roles "Bu nomdagi rol…", counterparty, invoice-*,
     payment-*, demand, custom-entity, expense-item, discount, label, payroll,
     inventory, reason-code, attribute-metadata, …).
   - But several user-facing reference creates have **no** P2002 handling:
     | service | unique key | pre-check? | duplicate → before |
     |---|---|---|---|
     | **pipeline** | `(accountId, name)` | none | sequential → **raw 500** |
     | **price-list** | `(accountId, name)` | none | sequential → **raw 500** |
     | **document-state** | `(accountId, entityType, name)` | none | sequential → **raw 500** |
     | **store** | `(accountId, code)` | findFirst on `code` | TOCTOU race → **raw 500** |
   - Self-healing upsert races (`analitika/order` retry, `analitika/count`
     fallback, atomic document numbering) catch P2002 **in-process** → never
     escape → unaffected.

3. **Capture-free, product-decision-free, real bug-class** → the right flagship
   among the 11z candidates (the "Тип" capture is gated; box-grounding/Phase-3
   ship no code).

## The fix (one global chokepoint, not N per-site catches — 11y "central > scattered")

`apps/api/src/modules/shared/prisma-exception.filter.ts`:

- New constant `DUPLICATE_VALUE_MESSAGE = 'Bunday qiymatli yozuv allaqachon mavjud'`
  (generic on purpose — no DB column-name leak; per-site handlers keep their
  field-specific wording).
- New branch, evaluated **before** the method-aware FK branch so P2002 never
  depends on the HTTP verb:
  ```ts
  if (exception.code === 'P2002') {
    reply.status(409).send({ statusCode: 409, error: 'Conflict', message: DUPLICATE_VALUE_MESSAGE });
    return;
  }
  ```
- A unique violation is definitionally a conflict (RFC 7231 §6.5.8) on POST or
  PATCH → **method-independent 409**.
- **Still NARROW for P2025** (not-found) — optimistic-lock owns it per-site; an
  escaped P2025 stays 500 + Sentry. P2002/P2003/P2014 are expected client
  conditions and, like the per-site handlers, are **not** forwarded to Sentry
  (no observability regression — they were already swallowed to 409 by 28
  per-site handlers).

## Safety (why the global net can't break the 28 per-site handlers)

`@Catch(Prisma.PrismaClientKnownRequestError)` only fires on that exact class. A
per-site handler throws `ConflictException` (an `HttpException`) which Nest's
built-in HttpException filter handles — it is **never** a
`PrismaClientKnownRequestError`, so this filter cannot see it. Structurally
guaranteed; also live-proven (smoke case E). Bulk creates via `runBulk`
(`Promise.allSettled`) capture rejections in-process → `/bulk-*` unaffected.

## Verification

**Unit** — `prisma-exception.filter.test.ts` (the prior `P2002 → 500` test was
flipped to 409; +3 new): P2002 on POST/PATCH/PUT → 409 + `DUPLICATE_VALUE_MESSAGE`;
P2025/unknown still 500. Full api suite **2937 passed** (was 2935; +3 −1 = +2),
0 regressions; typecheck 0, biome 0.

**Live smoke** — `scripts/verify-prisma-unique-conflict-smoke.mts`, api:4000 + DB, **7/7**:
- A) pipeline SEQUENTIAL dup name → **409 generic** (was raw 500), explicitly NOT 500.
- B) pipeline PARALLEL ×6 dup name → **exactly 1×201 + 5×409, ZERO 5xx** (no
  pre-check → deterministic filter path = the concurrency headline).
- C) store SEQUENTIAL dup code → **400 via pre-check** (specific "…ishlatilgan"
  preserved → filter did not grab the pre-checked path = layering proof).
- D) store PARALLEL ×6 dup code → **exactly 1×201, ZERO 5xx, 5×4xx** — and all 5
  losers were **filter-race 409** (0 pre-check 400): the TOCTOU window that used
  to 500 now deterministically routes through the filter.
- E) roles SEQUENTIAL dup name → **409 with the PER-SITE specific message**
  ("Bu nomdagi rol allaqachon mavjud", NOT the generic) → proves per-site
  handlers short-circuit before the global filter.

Self-cleaning (deleteMany by `SMOKE-UNIQ-<tag>` prefix; PipelineStage cascades);
post-run leftover count 0/0/0.

**UI surface:** none (API error mapping) → browser-QA N/A.

## Scope / NARROW (deliberate)

- Only the global filter changed. Did **not** add pre-checks to
  pipeline/price-list/document-state (a generic 409 is a strict improvement over
  500; a friendly field-specific message there is an optional follow-up).
- P2025 left narrow (per-site optimistic-lock ownership).
- The 28 per-site P2002 handlers left exactly as-is.

## Lesson

"Measure the basis before reopening a deliberate NARROW" paid off: the *reason*
11y gave for NARROW (lock/employee "ownership") didn't actually conflict with a
global net (different code/exception classes), and grounding found a real,
easily-reproduced sequential raw-500 on common reference creates. A unique
violation is always a 409 (verb-independent) — map it before the method-aware FK
branch. Pipeline (no pre-check, no per-site handler) is the cleanest
demonstrator for BOTH the sequential and the concurrency filter path.

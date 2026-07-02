# Prisma record-not-found (`P2025`) → 404 / 400 via the global filter — 2026-06-12 (11ab)

**Status: Phase-2 VERIFIED** (live API smoke 6/6 + filter unit 18/18). Commit: _(see NEXT.md)_.

Completes the global `PrismaExceptionFilter` family: **P2002** (unique, 11aa) · **P2003/P2014**
(FK / required-relation, 11y) · **P2025** (record-not-found, this session). The same single
HTTP-boundary chokepoint now maps every reachable Prisma client/race condition off a raw 500.

---

## 0. Why this — and measuring the basis of the deliberate narrow (11aa's lesson, applied)

11y and 11aa both **deliberately left P2025 NARROW**, documenting it as "optimistic-lock owns its
409 semantics." 11aa's parting lesson was explicit: *measure the BASIS of a deliberate narrow before
reopening it.* I measured, and the narrow's premise does **not** conflict with a response-only net:

- **Optimistic-lock catches a version-conflict P2025 IN-SERVICE** → `OptimisticLockException` (409 +
  `OPTIMISTIC_LOCK` code). That is an `HttpException`, **not** a `PrismaClientKnownRequestError` — so
  the global `@Catch(Prisma.PrismaClientKnownRequestError)` never sees it. (Identical structural
  argument to 11aa's: per-site `ConflictException` ≠ Prisma class.)
- **`bom.service.handlePrisma` already maps P2025 → 404** in-service (`NotFoundException`,
  "Yozuv topilmadi"). Also an `HttpException` → also invisible to the filter, and the same 404 result.
- **Everyone else rethrows P2025 raw** (`counterparty`/`customer-order`/… `handlePrisma` map ONLY
  P2002; `counterparty.delete` doesn't even wrap it) → it escaped to the filter's fall-through → **raw
  500**. P2025 handling was therefore *inconsistent* (bom 404 vs the rest 500); a global net unifies it.

So a global P2025 mapping only ever catches a **genuinely-unhandled** P2025 — never a lock conflict,
never bom's already-404. The narrow was over-cautious.

### The reachable surface is the TOCTOU race (measured, not assumed)

A surprising, important measurement: **every direct delete/update pre-checks existence via
`findById`** (store, counterparty, expense-item, discount, region, project, tax-rate, price-type,
custom-entity [+ sub-resource `deleteValue`], counterparty `deleteBankAccount`, call, attachment,
opportunity, pipeline, …). A naive "delete a non-existent id" therefore returns a clean **404 from
the pre-check already** — that is NOT the gap.

The *escaping* P2025 is the **TOCTOU race**: two concurrent deletes of the SAME row both pass the
existence pre-check, one wins, and the **loser's** `delete`/`update` matches zero rows → `P2025` →
(pre-fix) **raw 500** for the losing request. This is the concurrency bug-class the global CLAUDE.md
adversarial-QA "what if N users run in parallel?" lens targets. It is rare per-request but a real,
user-facing production 500 under concurrency.

---

## 1. The fix (`apps/api/src/modules/shared/prisma-exception.filter.ts`)

New `NOT_FOUND_MESSAGE = "So'ralgan yozuv topilmadi"` + a method-aware P2025 branch (evaluated after
P2002 and the FK branch; the `method` is now computed once and shared with the FK branch):

| Verb | P2025 → | Message | Rationale |
|---|---|---|---|
| DELETE / PATCH / PUT / … | **404 Not Found** | `NOT_FOUND_MESSAGE` | the target row is gone (TOCTOU race past the pre-check) |
| POST | **400 Bad Request** | `BAD_REFERENCE_MESSAGE` | a nested `connect` referenced a missing record — same semantic as P2003-on-create |

`P2002 → 409` stays method-independent (a unique violation is a conflict on any verb). FK
(`P2003/P2014`) stays method-aware (DELETE→409 in-use, write→400 bad-reference). Note the deliberate
asymmetry on DELETE: **P2003-on-DELETE → 409** (row exists but is referenced) vs **P2025-on-DELETE →
404** (row is gone) — different conditions, different correct codes.

**Observability:** P2002/P2003/P2014/P2025 are expected client/race conditions → NOT forwarded to
Sentry (mapping a TOCTOU 404 trades a noisy non-bug 500 alert for a quiet, correct response; matches
bom's in-service `NotFoundException` and the 28 per-site handlers). Any OTHER known code (P2000
value-too-long, P2011 null-constraint, …) **stays 500 + Sentry + log** — a real server fault is never
silently swallowed.

**Not touched (correctly):** no per-service `handlePrisma` was changed — the global net handles the
escaping case centrally (11b "central > scattered"); bom's in-service 404 and the optimistic-lock 409
short-circuit before the filter and keep their behaviour. **NARROW now = truly-unknown codes only.**

---

## 2. Verification

### Unit — `prisma-exception.filter.test.ts` (10 → 18 tests, deterministic mapping proof)
P2025 on DELETE→404, PATCH→404, PUT→404, POST→400 (asserting `NOT_FOUND_MESSAGE` / `BAD_REFERENCE_MESSAGE`);
P2011 + P2000 still→500. (P2002 / P2003 / P2014 cases unchanged.)

### Live smoke — `scripts/verify-prisma-not-found-conflict-smoke.mts` (6/6, live api:4000 + DB)
- **A) sequential double-delete** → 200, then **404 via the PRE-CHECK** (entity-specific
  "Counterparty … not found", NOT the filter message) — the naive-path baseline / layering.
- **B) PARALLEL delete ×10** → **exactly 1×200 + 9×404, ZERO 5xx** (each loser was a raw 500 before);
  **9/9 losers carried the FILTER message** (`NOT_FOUND_MESSAGE`) → the global P2025→404 wiring fires
  deterministically under the real TOCTOU trigger (all 10 reads complete before the deletes serialise).
- **C) PARALLEL stale-version PATCH ×4** → **exactly 1×200 + 3×409 `OPTIMISTIC_LOCK`, ZERO 5xx** — the
  lock's in-service P2025→409 is preserved; the global net did NOT downgrade it to 404. Same entity as
  B ⇒ the **layering headline**: DELETE race → 404 (filter) vs UPDATE race → 409 (lock).

**Regression-sensitive by construction:** pre-fix, B's 9 escaping P2025s hit the fall-through 500
branch → `serv5xx===0` and the filter-message assertions would both fail. (Not reverted to avoid a
mid-session stash; the construction argument is airtight.)

### Gate (all green)
api `tsc` 0 · biome 0 (changed source; `.mts` smoke uses `any`/`console`, outside the lint-staged glob
like the existing `verify-*` scripts) · **api Vitest 2941 (+4, 0 regress)** (was 2937) · web/ds/db untouched.

**No UI surface** (HTTP-status robustness only) → browser-QA N/A.

---

## 3. Adversarial observations (deferred — not this flagship's scope)

- **`counterparty.update` misclassifies a bad-`connect` P2025 as `OptimisticLockException`.** Its
  nested `group/priceType/state/bonusProgram: { connect: { id } }` throws P2025 when the referenced id
  doesn't exist; the `catch` does `if (isRecordNotFound(e)) throw new OptimisticLockException(...)` —
  so PATCHing a counterparty with an invalid `groupId` returns *"modified by another user, reload"*
  instead of a 400/404 bad-reference. Caught in-service (never a 500, never reaches the filter), so
  out of scope here, but it is a real **per-service P2025-overload** quirk: `isRecordNotFound` can't
  tell a version-miss from a bad-connect. A future sweep could pre-validate connect targets or narrow
  the lock-catch. (Same pattern likely in other locked services that use nested `connect`.)

---

## 4. Files

- `apps/api/src/modules/shared/prisma-exception.filter.ts` — NOT_FOUND_MESSAGE + P2025 branch + doc.
- `apps/api/src/modules/shared/prisma-exception.filter.test.ts` — P2025 cases (+P2000); 10→18.
- `scripts/verify-prisma-not-found-conflict-smoke.mts` — new live smoke (6/6).

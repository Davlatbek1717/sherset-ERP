# Employee uniqueness violations → 409 (not raw 500) — 2026-06-12 (11u)

**Commit:** `72d796cd` · **Type:** `fix(api)` · **Status:** Phase-2 VERIFIED
(live API runtime-proven, incl. concurrent TOCTOU; no UI label surface → browser-QA N/A
beyond the existing toast).

## The gap (data-integrity-adjacent UX / silent 500)

11t verified that the Employee table DB-enforces **both** uniqueness constraints:
`@@unique([accountId, email])` (plain index, email is NOT NULL) and
`Employee_account_username_uk` (PARTIAL, `WHERE username IS NOT NULL`). The app's
write paths, however, did **not** translate a violation of those indexes into a
friendly HTTP 409:

- **`hr-employee.create` / `hr-employee.update`** have **NO app-level pre-check** →
  even a **sequential** duplicate email goes straight to the index → Prisma `P2002`.
- **`staff.create` / `staff.update` / `hr-employee.setPassword`** pre-check with a
  `findFirst`, but check→write is a **TOCTOU window**: two concurrent requests with
  the same email/username both pass the check, then race into the index → `P2002`.

Only `ZodExceptionFilter` is registered globally (`main.ts:66`) — there is **no
global Prisma exception filter** — so an unmapped `P2002` falls through NestJS to a
raw **HTTP 500**. Data integrity was always intact (the index rejects the dup); the
defect was the 500 + the unactionable error for the user.

This is the codebase's own established bug-class: ~10 services already hand-roll a
`handlePrisma(e)` mapping `P2002 → ConflictException` (bom, cash-in/out, counterparty,
currency, reason-code, attribute-metadata, …). The Employee write surface was the gap.

## Grounding (§2 — verify, don't assume)

The 11t probe used `$executeRawUnsafe` → surfaced the raw Postgres `23505`, **not**
Prisma's mapped `P2002`. A fresh probe (`scripts/probe-employee-p2002-shape.mts`)
triggered both indexes through the typed Prisma client (`.update`, rolled back) and
captured the exact shape the mapping needs:

| index | `err.code` | `err.meta.target` |
|---|---|---|
| email plain | `P2002` | `["account_id","email"]` |
| username **partial** | `P2002` | `["account_id","username"]` |

So Prisma reports a clean field-array `meta.target` for **both** indexes — including
the partial username one, despite its DB name (`Employee_account_username_uk`)
differing from Prisma's generated expectation. A `target.join(',').includes('email' |
'username')` discriminator is therefore robust.

## Fix

New shared helper `apps/api/src/modules/shared/employee-unique.ts`:
`throwIfEmployeeUniqueViolation(e): void` — maps `P2002` → a **plain**
`ConflictException` (email vs login message from `meta.target`); returns (does not
throw) for anything else so the caller can still map `P2025 → OptimisticLockException`
and rethrow the rest. Shared (not per-service) because **both** Employee services map
the **same** two constraints — mirroring the existing shared `optimistic-lock.ts`
Employee helper. Deliberately plain (no `OPTIMISTIC_LOCK` code) so the web client
shows a normal conflict toast, not the "reload the record" lock dialog — exactly the
distinction `optimistic-lock.ts:26-29` anticipates.

Applied as a catch-rethrow net (AFTER the lock check) in all five write paths:
`staff.create`, `staff.update`, `hr-employee.create`, `hr-employee.update`,
`hr-employee.setPassword`. Existing pre-checks stay (fast precise message for the
common sequential case); the net is the safety layer for the race + the no-pre-check
HR paths. (`hr-employee.create` also changed `return this.prisma…create(…)` →
`return await …` so the `try/catch` actually intercepts the async rejection.)

## Gate (all green)
- api `tsc --noEmit` 0 · biome 0 (changed files) · **api Vitest 2914 (+19, 0 regress)**
  (was 2895 at 11t): 6 helper + 8 staff (new `staff.service.test.ts`, the service had
  none) + 5 hr-employee.
- web/ds/db untouched.

## Runtime (Phase-2 — live API :4000, `verify-employee-unique-smoke.mjs`, 9/9)
- HR create unique email → 201 · HR create **DUPLICATE** email (no pre-check) → **409**
  (was 500).
- Staff create dup email (pre-check) → 409 · Staff create dup username (pre-check) → 409.
- **HEADLINE (TOCTOU):** 6× parallel same-email HR create → **exactly 1×201 + 5×409,
  ZERO 5xx** — every concurrent loser mapped, none fell through to 500.
- set-password dup username → 409.
- Explicit anti-500 across all duplicate paths: 0 × 5xx.
- Self-cleaning (hard-deletes its 4 created employees; verified 0 `uniq-*@smoke.local`
  residue). Note: a pre-existing unrelated `SMOKE-HREMP-…@smoke.local` archived orphan
  from an earlier session was observed and left as-is (not this session's artifact).

## Lessons
- App-assumed uniqueness must be **enforced AND mapped**: 11t proved the index
  enforces; without the P2002→409 mapping the enforcement surfaced as a raw 500.
- A pre-check is not a substitute for mapping the DB constraint — it is a TOCTOU
  window. Map the constraint as the safety net; keep the pre-check only for the fast
  precise message.
- Ground the *mapped* error shape with the actual client method, not raw SQL — `23505`
  (raw) and `P2002` (Prisma-mapped) are different surfaces and only the latter reaches
  the service catch.
- Related: 11t `_EMPLOYEE-USERNAME-UNIQUE-INDEX-2026-06-12.md` (the indexes this
  relies on); the existing `handlePrisma` pattern across ~10 services.

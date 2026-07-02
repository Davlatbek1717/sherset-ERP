# Employee `(account_id, username)` uniqueness — drift correction (2026-06-12, 11t)

**Status: Phase-2 VERIFIED (DB runtime-proven).** No UI surface — schema/migration
integrity + live-DB enforcement. Commit: see `fix(db): …username partial-unique index…`.

## TL;DR

The 11s hand-off flagged backlog **(F)**: *"schema declares `@@unique([accountId,
username])` but neither migrations nor the live DB have the index → username
uniqueness is NOT DB-enforced."* **That claim is FALSE.** Ground-truthing the live
DB proved the index **exists and enforces**. The "drift" 11s saw in `prisma migrate
diff` is a **benign Prisma representation gap** (partial index + a leftover
timestamp default), not a missing constraint. This session disproves the claim,
eliminates the one *genuine* drift, and documents + guards the benign one so it can
never be misdiagnosed again.

## What 11s saw vs. what is true

`prisma migrate diff --from-url <live DB> --to-schema-datamodel` emitted two lines:

```sql
ALTER TABLE "document_sequences" ALTER COLUMN "updated_at" DROP DEFAULT;
CREATE UNIQUE INDEX "employees_account_id_username_key" ON "employees"("account_id","username");
```

11s read line 2 as "the unique index is missing." It is not. Migration
`20260520095826_hr_module_foundation` (lines 475-481) **drops** Prisma's generated
plain index and **creates a PARTIAL one**:

```sql
DROP INDEX IF EXISTS "employees_account_id_username_key";
CREATE UNIQUE INDEX "Employee_account_username_uk"
  ON "employees"("account_id", "username")
  WHERE "username" IS NOT NULL;
```

Prisma 5.x **cannot model a partial/filtered unique index**, so it can neither see
the partial index nor express it from `@@unique`. Result: `migrate diff`
**permanently** wants to (re)create the plain index. The index is present the whole
time — just partial, under a different name.

## Ground truth (live `moysklad_dev`) — `scripts/probe-employee-username-index.mts`

1. **Index exists:** `Employee_account_username_uk ON public.employees USING btree
   (account_id, username) WHERE (username IS NOT NULL)`.
2. **0 duplicate** non-null `(account_id, username)` groups.
3. **Enforced ✓ (empirical):** stamping an existing username onto a second employee
   in the same account is rejected with Postgres **23505**
   (`Key (account_id, username)=(…, wizard_smoke) already exists`), inside a
   rolled-back tx.
4. `document_sequences.updated_at` default = `CURRENT_TIMESTAMP`.

Partial-on-nullable is the **correct** semantics: `username` is an optional HR
opt-in field; many employees keep it NULL (those rows don't collide), while any
non-null username is unique per account. The app does friendly app-level checks
(`findFirst where {accountId, username}` → `ConflictException`,
`staff.service.ts:126`, `hr-employee.service.ts:251`) and the partial DB index is
the **race backstop** behind them.

## Changes

1. **`document_sequences.updatedAt` → `@default(now()) @updatedAt`** (schema). This
   is the one *genuine* accidental drift: the creating migration set a DB-level
   `DEFAULT CURRENT_TIMESTAMP`, but the schema had dropped the `@default`. Re-adding
   it aligns schema↔DB (the `DROP DEFAULT` diff line disappears) and is defensively
   correct (column never NULL even on a raw insert). No migration needed — the DB
   already has the default; this only stops `migrate diff` from wanting to remove it.
2. **Schema doc-comment** above `@@unique([accountId, username])` explaining the
   partial-index representation gap, that the index IS enforced (with the probe as
   proof), and **DO NOT "fix" the diff** by adding a plain index. `@@unique` is kept
   (intent + Prisma Client `where`) — and the deliberate partial override the
   migration author wrote is respected. `map:` was tried and rejected: it makes
   `migrate diff` regenerate a *same-named* index → would error on apply.
3. **Guard** `apps/api/src/modules/hr/hr-employee/employee-username-unique-index.test.ts`
   (+4) pins: schema keeps the `@@unique` (no colliding `map:`); the migration keeps
   the PARTIAL index with `WHERE "username" IS NOT NULL`; `document_sequences`
   keeps `@default(now())`. Non-vacuous (the document_sequences assertion fails on
   the pre-fix schema; the `WHERE` assertion fails if the index is made plain).
4. **`scripts/probe-employee-username-index.mts`** — reproducible runtime proof.

## Residual `migrate diff` after this session

```sql
CREATE UNIQUE INDEX "employees_account_id_username_key" ON "employees"("account_id","username");
```

Irreducible while keeping `@@unique` + a partial index (Prisma limitation). Now
**documented at the declaration site + guarded**, so it reads as "known benign gap,"
not "missing constraint." The `document_sequences` line is gone.

## Gate

api tc 0 · db tc 0 · web tc 0 (web does not import `@moysklad/db`) · biome 0 err
(test file 0/0; probe 0 err, console.log warnings tolerated as for the existing
`scripts/verify-*.mjs`) · **api Vitest 2895 (+4, 0 regress)** · `pnpm prisma generate`
re-run (generated client in sync) · ds untouched.

## Honest status

**Phase-2 VERIFIED (DB runtime-proven):** the partial unique index exists and
rejects duplicates with 23505 on the live DB; `migrate diff` reduced to a single
documented benign line. No browser surface (the constraint has no UI) → browser-QA
N/A; the probe + guard are the complete verification.

## Deferred (noted, not in scope)

- **P2002-on-race UX:** a *concurrent* create that passes both app-level findFirst
  checks then hits the partial index surfaces as a raw 500, not a friendly 409
  (no `P2002` catch in `staff.service.create` / `hr-employee` create). Data
  integrity is intact (the index correctly rejects the duplicate); only the
  error-mapping is rough. Rare race; a small follow-up (map P2002 → ConflictException
  on the two create paths).

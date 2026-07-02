# Locked-update bad nested `connect` → 400, not a misleading 409 reload — 2026-06-12 (11ac)

**Status: Phase-2 VERIFIED** (live API smoke 6/6 + classifier unit 12/12). Commit: _(see NEXT.md)_.

Closes the in-service follow-up the 11ab Prisma-not-found filter deferred in its
audit §3: every version-guarded `update()` that performs a nested `connect`
overloads Prisma's `P2025`, and the old catch mapped **both** failure modes to a
409 "modified by another user, reload". The boundary filter family (11y/11aa/11ab)
fixed the *escaping* Prisma errors that reached the HTTP boundary as raw 500s;
this fixes the *in-service caught* P2025 that was answered with the wrong message.

---

## 0. The bug — P2025 is overloaded on a locked update

A version-guarded update looks like:

```ts
const updated = await this.prisma.client.counterparty.update({
  where: { id, accountId, version: parsed.version },          // the lock guard
  data: { ...data, group: { connect: { id: parsed.groupId } } }, // a nested connect
});
// ...
} catch (e) {
  if (isRecordNotFound(e)) throw new OptimisticLockException('Counterparty'); // ← overloaded
  this.handlePrisma(e);
}
```

`isRecordNotFound` only tests `e.code === 'P2025'`. But **two different conditions
throw P2025**:

1. **version-guard miss** — `where: { …, version }` matched zero rows (a concurrent
   write bumped the version, or a concurrent delete removed the row). This is a
   genuine optimistic-lock conflict → the form is stale → 409 reload is correct.
2. **bad nested connect** — `group: { connect: { id } }` referenced a non-existent
   id. This is a **bad foreign reference**, semantically a 400 — the same class the
   global filter maps for a create-path P2025/P2003. The old code answered it with
   *"modified by another user, reload"* (409), which is actively misleading: nobody
   modified the row, and reloading won't help — the user must fix the reference.

It is caught in-service (never a 500, never reaches the filter), so it was out of
11ab's scope, but it is a real per-service correctness defect: a PATCH with an
invalid `groupId` / `priceTypeId` / `stateId` / `bonusProgramId` on counterparty —
and the same shape on every other locked service that writes a relation.

---

## 1. Grounding — `meta.cause` distinguishes them (probe, not assumption)

A throwaway probe (`counterparty.update` inside a rolled-back transaction,
PostgreSQL via the typed Prisma 5.x client, 2026-06-12) captured the exact shapes:

| Case | `meta.cause` |
|---|---|
| version-guard miss (`where { version: WRONG }`) | `Record to update not found.` |
| main record absent (`where { id: BAD }`) | `Record to update not found.` |
| **bad nested connect** (`group.connect.id = BAD`) | `No 'Group' record(s) (…) was found for a **nested connect** on one-to-many relation 'CounterpartyToGroup'.` |

So a bad connect is **positively identifiable** — its `cause` contains
`"nested connect"`; a version/existence miss never does. Matching the positive
signal (not the negative) means an unrecognised future Prisma wording degrades
**safely** to the optimistic-lock path (today's behaviour), never the reverse.
The grounded `cause` strings are locked in `prisma-not-found-classification.test.ts`
so a Prisma upgrade that changes them fails loudly.

---

## 2. The fix — a shared classifier + helper, swept across all 56 locked services

`apps/api/src/modules/shared/optimistic-lock.ts`:

- `isNestedConnectNotFound(e)` — `isRecordNotFound(e)` AND `meta.cause` contains
  `"nested connect"`.
- `mapVersionedUpdateError(e, entity)` — bad connect → **400** `BadRequestException`
  with `BAD_REFERENCE_MESSAGE` (imported from `prisma-exception.filter.ts` so a bad
  reference reads identically whether it surfaced on the create-path boundary or
  this update-path catch); any other P2025 → **409** `OptimisticLockException`;
  non-P2025 → returns void so the caller's `handlePrisma(e)` still maps P2002 etc.

A deterministic codemod (`scripts/codemod-versioned-update-error.mjs`) replaced the
identical one-liner at **all 56** `*.service.ts` locked-update call-sites:

```diff
- if (isRecordNotFound(e)) throw new OptimisticLockException('Counterparty');
+ mapVersionedUpdateError(e, 'Counterparty');
```

and rewrote each import (dropping the now-unused `OptimisticLockException` /
`isRecordNotFound`, adding `mapVersionedUpdateError`, preserving the relative
depth). The helper is **behaviour-preserving** for the ~30 connect-less scalar
updates (no connect ⇒ `isNestedConnectNotFound` is never true ⇒ identical to the
old one-liner), so applying it everywhere is consistent + future-proof, not a
behaviour change for those. A **source-scan guard** asserts no `*.service.ts` still
contains the raw `isRecordNotFound(e)) throw new OptimisticLockException` pattern,
so the bug-class cannot silently return via a copy-pasted new entity.

### Precedence (grounded by the smoke, corrected a wrong guess)

The original guess was "bad connect + stale version → 409 (staleness wins)". The
smoke **refuted** it: Prisma validates the nested `connect` target INDEPENDENTLY of
the version-filtered write, so a bad reference raises the connect-P2025 even when
the version is also stale → **400**. Intended and defensible: a missing reference
is a bad reference regardless of staleness. A *valid* connect with a stale version
still yields the version-miss P2025 → 409 (smoke case D proves this).

---

## 3. Verification

### Unit — `prisma-not-found-classification.test.ts` (12 tests)
Classifier over the grounded `cause` strings (bad-connect → true; update-miss /
delete-miss / no-meta / non-P2025 → false); `mapVersionedUpdateError` → 400
BAD_REFERENCE / 409 OPTIMISTIC_LOCK / void; **source-scan guard** (>50 services
scanned, zero bypass-pattern offenders).

### Live smoke — `scripts/verify-bad-connect-vs-lock-smoke.mts` (6/6, live api:4000 + DB)
- **A) PATCH bad `groupId`** (valid version) → **400 BAD_REFERENCE** (was a 409 reload) — the headline.
- **B) PATCH bad `priceTypeId`** → 400 BAD_REFERENCE (not group-specific).
- **C) PATCH valid edit** → 200, version bumps (happy path intact).
- **D) PATCH stale version** (no bad ref) → 409 OPTIMISTIC_LOCK (the lock is untouched).
- **E) ADVERSARIAL bad `groupId` + STALE version** → 400 BAD_REFERENCE (connect validated independent of the version filter; valid-connect+stale still 409 per D).
- **F) explicitly ZERO 5xx** across all requests.

### Gate (all green)
api `tsc` 0 · biome 0 (changed source; `.mts`/`.mjs` scripts outside the lint-staged
glob, like the existing `verify-*`) · **api Vitest 2953 (+12, 0 regress)** (was 2941;
the two `employee-optimistic-lock.test.ts` source-contract assertions were updated
from the old literal to the new `mapVersionedUpdateError(e, 'Employee')` wiring) ·
web/ds/db untouched.

**UI:** no new surface — the web client already renders `OPTIMISTIC_LOCK` (reload
dialog) vs a plain 400 (error toast) off the existing contract; this only stops a
bad reference from triggering the *wrong* one. Browser-QA N/A.

---

## 4. Files

- `apps/api/src/modules/shared/optimistic-lock.ts` — `isNestedConnectNotFound` + `mapVersionedUpdateError` + the `BAD_REFERENCE_MESSAGE` import.
- `apps/api/src/modules/shared/prisma-not-found-classification.test.ts` — new (classifier unit + source-scan guard).
- `apps/api/src/modules/shared/employee-optimistic-lock.test.ts` — updated 2 source-contract assertions to the new helper wiring.
- 56 × `apps/api/src/modules/**/*.service.ts` — one-liner + import swapped to the helper.
- `scripts/codemod-versioned-update-error.mjs` — the deterministic sweep (idempotent; audit trail).
- `scripts/verify-bad-connect-vs-lock-smoke.mts` — the live smoke (6/6).

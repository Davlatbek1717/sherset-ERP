# RFC — H4: per-record (OWN / OWN_GROUP) document scope enforcement

> **Status:** P0 DONE + P1/P1-cont/P2/batch-3 BUILT (foundation, 38 services stamp
> `groupId`). **W4 STARTED — demand read-path enforcement wired behind the per-account
> `recordScopeEnforced` flag (default OFF); RFC §4 manager-visibility live test passes
> 9/9.** Behaviour unchanged until an account opts in. Remaining: extend W4 to the rest
> of the cohort, then write-path scopes + staging soak. Multi-session. (approved 2026-06-14.)
> **Author:** 1:1 campaign · **Grounded:** 2026-06-14 (live source + schema).
> **Why an RFC and not a fix:** naive enforcement BREAKS the app (proven below).
> This document is the contract a later session executes phase-by-phase.

---

## 1. Problem

moysklad roles scope each permission to a **visibility level**:

`NO < OWN < OWN_GROUP < OWN_AND_GROUP < ALL`
(`permissions.types.ts:8`).

So a role can be "see/edit only **my** documents" (OWN), "see/edit my **department's**
documents" (OWN_GROUP), or "see **all**" (ALL). The default role matrix already
encodes per-entity scopes — e.g. demand `view: OWN_GROUP`, `update: OWN`
(`permissions.types.ts:185–205`).

**Current reality: NONE of it is enforced.** Every authenticated user reads and
writes **every** document in the tenant (account), regardless of role scope. A
salesperson scoped to OWN can open and edit the director's Отгрузка.

### Grounding (verified 2026-06-14)

| Claim | Evidence |
|---|---|
| The enforcement helpers are **dead code** | `grep '\.(scopedWhere\|canAccessRecord)\(' apps/api/src` outside the permissions module → **0 callers**. Defined at `permissions.service.ts:75,93`, never invoked by any document service. |
| Documents carry a `groupId` column but it is **never written** | `Demand.groupId` (`schema.prisma:249`, nullable) is referenced only in the **filter** WHERE (`demand.service.ts:1263`) — `create()`/`update()` never set it. Always NULL. Same for supply et al. |
| `scopedWhere` already *expects* the model shape | `permissions.service.ts:107–127` builds `OR: [{ ownerId }, { groupId }, { shared }]` — the design anticipated `ownerId` + `groupId` + `shared` on every scoped document. |

### Why naive enforcement is a regression (do NOT just "turn it on")

If we call `scopedWhere(...)` in the list/findById of document services **today**:

- For **OWN_GROUP** roles: `scopedWhere` returns `OR: [{ groupId: actor.groupId }, { shared: true }]`
  (`:117`). But every document's `groupId` is **NULL** → a manager would match
  **zero** documents → the department head sees an **empty** list. That is the
  exact opposite of the feature. (`scopedWhere` has a `!actor.groupId` fallback
  at `:112`, but the *document* side is the hole — there is no fallback there.)
- For **OWN** roles: `OR: [{ ownerId: actor.employeeId }, { shared: true }]`
  (`:109`). `ownerId` IS written (= creator), so OWN would *mostly* work — but it
  silently hides documents created by colleagues that were legitimately shared
  via a non-`shared` mechanism, and there's no `shared` write-path either.

So the data model is the blocker, not the where-clause. The fix is cross-cutting.

---

## 2. Design

Four workstreams, sequenced so each is independently shippable and **read-only-safe
behind a feature flag** until the data is correct.

### W1 — Data model: stamp `groupId` + `shared` at create

1. Confirm every scoped document model has `ownerId` (it does — used everywhere),
   `groupId String?` (present on the doc models checked), and a `shared Boolean`
   flag. **Add `shared Boolean @default(false)`** to any scoped model missing it
   (migration). `shared=true` = "visible to everyone regardless of scope" (mirrors
   moysklad's «Общий доступ»; we already have an editors/«Доступ» concept on some
   cards — reconcile, don't duplicate).
2. At **create**, stamp `groupId` from the actor's employee group:
   `data.groupId = actor.groupId ?? null`. Requires threading the **employeeId →
   group** through the request context (see W3). Stamp once; do not rewrite on edit
   (moysklad keeps the creating department).
3. The owner is already the creator (`ownerId = userId`); keep it.

### W2 — Backfill migration for existing rows

Existing documents have `groupId = NULL`. Backfill: `UPDATE <doc> SET group_id =
(SELECT group_id FROM employees WHERE employees.id = <doc>.owner_id)` per scoped
table, guarded by `WHERE group_id IS NULL`. Idempotent, reversible (set back to
NULL). Run as a data migration **after** W1 ships so new rows are already stamped.
**Without the backfill, OWN_GROUP would still hide all historical documents.**

### W3 — Request context: employeeId + groupId

The services need the acting **employee** (not just userId) and their groupId.
`permissions.service.getActorContext(employeeId)` already resolves
`{ employeeId, groupId }`. Wire the resolved actor into a request-scoped context
(or pass `employeeId` down from the controller, as the optimistic-lock `userId`
is threaded today). Decision point: request-scoped provider vs explicit param —
prefer **explicit param** (matches the existing `userId` threading, no DI magic).

### W4 — Adoption: call `scopedWhere` / `canAccessRecord`, READ-PATH FIRST

Behind a per-account feature flag `RECORD_SCOPE_ENFORCED` (default **off**):

1. **list()** — `AND: [ existing where, await scopedWhere(employeeId, entity, 'view') ]`.
2. **findById()** — after load, `if (!await canAccessRecord(...)) throw NotFound` (404,
   not 403 — don't leak existence; mirrors the tenant-guard pattern).
3. Only after read-path is proven across the cohort, extend to **write** actions
   (update/delete/post use `update`/`delete` scopes from the matrix).

Roll out entity-by-entity (the ~60 doc/catalog entities), same cohort discipline
as the audit conveyor. Each entity: wire → unit guard → **manager-visibility live
test** (see §4) → flip nothing (flag stays off until the whole cohort + backfill
are verified in staging).

---

## 3. Phased plan (each phase = one session, gated + committed)

| Phase | Deliverable | Gate |
|---|---|---|
| P0 | ✅ This RFC + the `shared`-vs-editors decision — **RESOLVED, see §8** (reuse the existing `{ownerId, groupId, shared}` triple; no new model) | DONE 2026-06-14 |
| P1 | W1 schema (`shared` where missing) + `groupId` create-stamp on the **demand** cohort (Отгрузка + siblings) + W3 employeeId threading | tsc/biome/vitest + live: new doc has groupId |
| P2 | W2 backfill migration (all scoped tables) | live: historical rows get owner's group |
| P3 | W4 read-path adoption on cohort A behind flag + **manager-visibility test** | ✅ STARTED 2026-06-14 — **demand** done (machinery + live test 9/9); rest of cohort pending |
| P4… | W4 across remaining cohorts (catalog, money, production…) | per-cohort live |
| Pn | Write-path scopes (update/delete/post) + staging soak + flag default-on | adversarial QA |

---

## 4. Test strategy (the test that proves it's NOT a regression)

A single **manager-visibility** live test, run per cohort:

1. Seed: employees `mgr` (group G, role view=OWN_GROUP) and `sub` (group G) and
   `other` (group H). Docs: `dSub` (owner sub), `dOther` (owner other), `dShared`
   (shared=true, owner other).
2. Flag **off** → `mgr` sees all three (today's behavior, unchanged). ✅ no regression.
3. Flag **on** → `mgr` sees `dSub` (same group) + `dShared`, NOT `dOther`. `sub`
   (OWN) sees only own + shared. `other` does not see `dSub`.
4. findById of `dOther` by `mgr` with flag on → **404**.

This is the gate that the deferred-naive-build would have **failed at step 3**
(manager would see *nothing* because groupId was NULL) — encode it first.

---

## 5. Risks & open questions

- ~~**`shared` semantics**~~ — **RESOLVED (P0, §8).** There is no separate editors
  model to reconcile. The «Доступ» feature (B6 `fc9833ac`) IS the
  `{ownerId, groupId, shared}` triple `scopedWhere` already reads; `shared` is
  moysklad's «Общий доступ». No new column or reconciliation is needed — the
  boolean already exists on all 55 scoped models.
- **Reports & aggregates** — many reports query documents directly (raw SQL). Scope
  must reach them too, or a scoped user sees unscoped totals (leak). Out of P1–P4
  scope; track as a follow-up cohort.
- **Cross-entity reach-through** — a Demand links a CustomerOrder; if CO is out of
  scope but Demand is in, does the detail leak CO fields? Define reach-through rules.
- **Impersonation / API tokens** — service-to-service and impersonated sessions need
  a scope bypass (ALL) or they break automation. Audit the bypass.
- **Performance** — `scopedWhere` adds an `OR` to every list; ensure `@@index([accountId, groupId])` (already present on some models, `schema.prisma:390`) covers it.

---

## 6. Decision log

- 2026-06-14 — user: per-department isolation **IS** wanted → build (this RFC).
- 2026-06-14 — naive single-session build rejected (grounding §1: breaks manager
  visibility). Committed to the phased plan above.
- 2026-06-14 — P1 re-grounded (data model is ready; build is turnkey, see §7).
- 2026-06-14 — **P1 create-stamp BUILT** (`ae1ce994`) for the 8-doc cohort (demand,
  supply, customer-order, invoice-out/in, sales-return, purchase-return,
  purchase-order) via shared `resolveCreatorGroupId` + `group-stamp.ts`. Read-only-
  safe (NO enforcement). Guard +29, live cert `verify-group-stamp-smoke` 4/4.
- 2026-06-14 — **P1-cont + P2 BUILT** (`1d49b5bc`): create-stamp extended to the
  money+stock cohort (cash-in/out, payment-in/out, prepayment, prepayment-return,
  counterparty-adjustment, internal-order, move, enter, loss, inventory) → **20 core
  transactional docs** stamped (actor param userId|ownerId both handled). **P2 backfill
  migration** `20260614130000` fills existing rows from owner's group (idempotent,
  applied to dev). Guard now 20 svc; live cert 6/6 (incl. backfill of a NULL row).
  **Remaining:** P1-cont batch-3 (production/retail/facture/special + catalog) · **P0
  `shared`-vs-editors decision (before any W4 enforcement)** · W4 read-path behind flag.
- 2026-06-14 — **P1-cont batch-3 BUILT** (`052f4fbf`): create-stamp extended to 17
  more services → **38 total**. Documents: production, processing, processing-order,
  payroll, price-list, facture-out/in (generators), loyalty, service-request,
  retail-sale (sale + refund), cashier-session (open + drawers). Scoped catalog:
  product, counterparty, project, product-folder, processing-process, processing-stage.
  counterparty + product use a NULL-only coalesce (never overwrite a user-picked
  «Отдел»/«Группа»). Guard = 38-service flexible class-lock (114 assertions). Live
  `verify-group-stamp-smoke` 8/8 (now also asserts product + project). Read-only-safe.
- 2026-06-14 — **P0 RESOLVED (§8): reuse the existing `{ownerId, groupId, shared}`
  triple — no new model, no reconciliation.** Grounding: the «Доступ» feature
  (`fc9833ac`) IS that triple; there is no separate editors join-table; the `shared`
  boolean already exists on all 55 scoped models (W1's "add shared" is already done).
  Unblocks W4 (enforcement) — the only remaining gate before W4 is the staging soak,
  not a data-model decision.
- 2026-06-14 — **W4 STARTED: demand read-path enforcement** (`8e173a8d`). Added the
  per-account `Account.recordScopeEnforced` flag (default off, migration
  20260614140000) + reusable `PermissionsService.isRecordScopeEnforced` /
  `recordScopeWhere` / `assertRecordAccess`. Wired demand `list()` (ANDs the scope
  where) + `findByIdScoped()` (404 on out-of-scope; used by GET /:id + bulk-print).
  Read-only-safe (flag default off). Unit guard +11; live `verify-record-scope-smoke`
  **9/9** (RFC §4: flag off → manager sees all; flag on → own-group only, foreign 404;
  ALL admin bypass intact). **Remaining:** apply the same `recordScopeWhere` /
  `findByIdScoped` pattern to the rest of the cohort (sales/purchase/money/stock →
  catalog/production), then write-path scopes (update/delete/post), then staging soak
  before any account's flag is flipped on.

## 7. P1 grounding (2026-06-14) — turnkey for the next focused session

Confirmed against live source so P1 can execute without re-discovery:

- **`Employee.groupId` exists** (`schema.prisma:216` model; the field is on the
  employee). `PermissionsService.getActorContext(employeeId)` returns
  `{ employeeId, groupId }` (`permissions.service.ts:140-178`, 5-min cache).
- **`Demand.groupId` column already exists** (`schema.prisma:249`, nullable,
  `@@index([accountId, groupId])` at :390) — **no migration needed to add it**;
  only a backfill (W2). Same for the sibling money/stock docs (supply, cash-in/
  out, prepayment, etc. — grep `group_id` in schema shows ~20 doc tables already
  carry it).
- **The actor IS the employee.** Services already receive `userId = user.sub =
  employee id` (the same value used for `ownerId` and the optimistic-lock
  stamp). So the W3 "thread employeeId" is **already satisfied** — `create()`
  can resolve the group with a single `employee.findUnique({ where: { id:
  userId }, select: { groupId } })` (or `getActorContext(userId)`), no new DI or
  controller change.
- **`scopedWhere`/`canAccessRecord` are ready** (`permissions.service.ts:93-127`)
  — they already build the `OR:[{groupId},{shared}]` clause. Enforcement (W4) is
  the ONLY part that needs them; it stays behind the `RECORD_SCOPE_ENFORCED` flag
  (default off) until the cohort backfill is verified in staging.

**Exact P1 build (one focused session):**
1. `create()` on the demand cohort sets `data.groupId = (creator's
   employee.groupId) ?? null` (stamp once; never on edit). Start with `demand`,
   then the siblings sharing the `group_id` column.
2. Backfill migration (W2): `UPDATE <doc> SET group_id = (SELECT group_id FROM
   employees WHERE employees.id = <doc>.owner_id) WHERE group_id IS NULL` per
   scoped table. Idempotent, reversible.
3. Guard + **live cert**: a freshly-created demand carries the creator's
   `groupId`; a backfilled historical row gets its owner's group. **No
   enforcement yet** → zero behaviour change (read-only-safe), so this ships
   without risk.

**P0 is now RESOLVED (§8):** reuse the existing `{ownerId, groupId, shared}` triple
— no separate editors model exists, and `shared` already lives on every scoped model.
So nothing about the data model blocks W4 any more; the only remaining gate before
flipping enforcement on is the staging soak + the manager-visibility live test (§4).

---

## 8. P0 resolution (2026-06-14) — `shared` vs «Доступ»/editors

**Decision: reuse the existing `{ownerId, groupId, shared}` triple. Do NOT add a new
column or a separate editors table.**

Grounded against live source:

| Question | Finding |
|---|---|
| Is there a separate per-record "editors" join-table to reconcile? | **No.** `grep -iE 'editor\|RecordEditor'` over `schema.prisma` finds only unrelated HR relations. The «Доступ» card section (B6 `fc9833ac`) is exactly **«Сотрудник» = `ownerId`**, **«Отдел» = `groupId`**, **«Общий доступ» = `shared`** — the same three columns `scopedWhere`/`canAccessRecord` read (`permissions.service.ts:107-127`, `permissions.types.ts:147-171`). |
| Does the `shared` boolean already exist where W1 needs it? | **Yes** — `shared Boolean @default(false)` is present on all **55** scoped models (verified by awk over `schema.prisma`). W1's "add `shared` where missing" is therefore already satisfied; no migration is needed. |
| Does `shared` duplicate the «Доступ» feature? | **No** — it *is* the «Общий доступ» half of «Доступ». The counterparty «Доступ» editor (`fc9833ac`) already writes `ownerId`/`groupId`/`shared`; `scopedWhere` reads the same three. One model, one source of truth. |
| Does moysklad's «Доступ» need a *multi*-editor list? | The standard moysklad «Доступ» on documents/catalog is owner + group + public-flag (what we have). The advanced multi-editor ACL is a separate, later feature — out of scope for H4 enforcement; not required for OWN/OWN_GROUP/ALL. |

**Consequence for W4:** enforcement can read `scopedWhere`'s existing `OR:[{ownerId},{groupId},{shared}]`
unchanged. The remaining work is purely (a) extend the counterparty-style «Доступ» UI
section to other entity cards as a convenience (optional, not required for enforcement),
and (b) the staging soak + manager-visibility test before the `RECORD_SCOPE_ENFORCED`
flag is flipped on per cohort.

# Phase-2 — Optimistic concurrency lock (catalog cohort) — lost-update guard

Session: 2026-06-07 (`davom et`, local Opus, ultracode). The 2026-06-06e catalog
browser-QA flagged **product edit has no optimistic-lock (lost-update)** as a real
defect and deferred it as "app-wide architectural — needs a focused design pass".
This session is that pass. Stack live: web :3100 · api :4000 · db `moysklad_dev`
:5433 — so the backend half is **runtime-verified (Phase-2)**, not just structural.

No Playwright MCP this session → the FE conflict **dialog** is implemented + unit-
tested but its pixel/interaction smoke is browser-owed (Phase-2 FE).

---

## The bug (real, silent, money-adjacent)

Two users open the same product's edit form (both load the row), user A saves, then
user B saves on top. The service did a blind `prisma.product.update({ where: {id,
accountId}, data })` — last-write-wins — so B's stale copy **silently overwrote A's
changes with no warning**. On catalog master data (prices, VAT, MXIK, tracking,
min-balance) a lost update is a data-integrity defect. Invisible to typecheck / lint
/ unit tests (it's a runtime concurrency property), and to Phase-1 structural audit
(which never runs two concurrent writers).

## Design decision — integer `version`, not `updatedAt`

- **Integer `version` column**, `@default(1)`, checked + incremented on every field-
  edit save. The schema author already carried `version Int @default(1)` on `Region`
  with the comment "Optimistic concurrency version (moysklad parity)" — this is the
  intended design; it was just never wired or applied elsewhere.
- **Rejected `updatedAt`-based locking**: Postgres `timestamptz` stores microseconds
  but a JSON round-trip truncates to milliseconds, so `WHERE updatedAt = <client
  value>` would essentially never match → *every* save would 409. An integer compares
  exactly. (moysklad itself versions on a numeric token.)
- **Scope = catalog cohort** (where it was flagged): `Product` (covers product /
  service / bundle — all `kind` rows of one model, all PATCH `/products/:id`) +
  `Variant` (own service, PATCH `/variants/:id`). The **mechanism is reusable** — the
  shared exception + the `WHERE id AND version` + increment pattern + the FE
  `isOptimisticConflict` / `onConflict` / `useConflictReload` rollout to any other
  entity is mechanical (add column → add `version` to its Update schema → version the
  repo update → thread `version` in its form). Rollout to the ~55 other editable
  entities is **DEFERRED** and documented (NEXT.md) — not silently implied.

## Backend

- **Migration** `20260607155651_optimistic_lock_product_variant`: `ALTER TABLE
  products / variants ADD COLUMN version INTEGER NOT NULL DEFAULT 1` (additive, safe;
  existing rows → 1). Applied to dev DB via `prisma migrate deploy` (migrate dev needs
  a TTY); client regenerated.
- **Shared `modules/shared/optimistic-lock.ts`**: `OptimisticLockException extends
  ConflictException` → HTTP **409** with body `{ statusCode, code: 'OPTIMISTIC_LOCK',
  message }` (machine-readable `code` so the web client distinguishes it from any
  other 409, e.g. a unique-constraint clash). `isRecordNotFound(e)` = Prisma `P2025`.
- **`Update{Product,Variant}Schema`**: `version: z.number().int().nonnegative()`,
  **REQUIRED** (a forgetful caller cannot silently bypass the lock). Create schemas do
  NOT require it (a new row has no prior version). Single-purpose actions
  (archive / restore / delete) don't carry it — moysklad doesn't version-guard those.
- **Repo / service update**: `findById` first (→ 404 if the row is gone), then
  `update({ where: { id, accountId, version: expectedVersion }, data: { ...data,
  version: { increment: 1 } } })`. The `version` filter is an extra scalar predicate on
  the unique `id` selector — the same mechanism the repo already used for the
  `accountId` tenant filter. A stale version matches zero rows → Prisma `P2025` →
  mapped to `OptimisticLockException` (409). Because `findById` just proved existence,
  a P2025 here can only be a version conflict. The product update + its pack rewrite
  run in one `$transaction` so a conflict rolls back the packs too. `version` is
  excluded from the audit diff (it bumps every save — not a user-meaningful change).

## Frontend

- **`lib/optimistic-lock.ts`** `isOptimisticConflict(err)` = `err.status === 409 &&
  err.body.code === 'OPTIMISTIC_LOCK'` (off the error shape `api-client.ts` attaches).
- **Shared hooks** (`useApiMutation` + `useSaveMutation`) gain `onConflict?`: on a
  conflict it runs `onConflict` INSTEAD of the generic toast; with no `onConflict` it
  still shows a **conflict-specific** toast (never the generic "action/save failed",
  never silent) — so the lost-update is loud everywhere, including future entities
  that haven't wired the dialog.
- **`hooks/use-conflict-reload.ts`** `useConflictReload(queryKey)` — the premium UX:
  a localized warning `confirm()` ("record changed — reload?") that, on confirm,
  invalidates the detail query so the form re-hydrates from the server. Shared so all
  catalog forms get the identical conflict dialog from one place.
- **4 catalog forms** (`products/[id]`, `services/[id]`, `variants/[id]`,
  `bundles/[id]`): `version: number` added to the detail interface; `version:
  data.version` threaded into the save payload; `onConflict = useConflictReload([...])`;
  conflict errors filtered out of the inline error banner (the dialog owns them). The
  bundle's product PATCH 409s before its components PUT runs, so the version guard
  protects the whole bundle save.
- **i18n** (ru+uz, `common`): `conflict_title`, `conflict_body`, `conflict_reload`.

## Verification

**Backend — RUNTIME (Phase-2, live API+DB), all assertions passed:**
- Product: create → version 1; GET returns version; PATCH(version=1) → 200, version→2;
  PATCH(**stale** version=1) → **409 `OPTIMISTIC_LOCK`**; **stale write did NOT leak**
  (name stayed `v2`, version stayed 2 — the actual lost-update prevention); PATCH(2) →
  200, version→3; PATCH(**no version**) → **400** (can't bypass the lock); cleanup.
- Variant: same flow → 409 on stale, write blocked.
- **Concurrency race (gold-standard adversarial):** two PATCHes fired in parallel with
  the same version → **exactly one 200 + one 409**, final version = 2 (single
  increment, exactly one winner — no double-write, no lost update).

**Unit + gates:** `Update{Product,Variant}Schema` version-contract tests (required /
int / non-negative / absent-on-Create) · FE `optimistic-lock` util tests (only the
coded 409 is a conflict; a plain 409 is not) · shared-hook conflict-routing tests
(routes to onConflict + suppresses generic toast; conflict-specific toast without
onConflict; plain 409 not treated as conflict). Gates: **tc0** (api+web) · **biome 0
error** on changed files (1 pre-existing `useTemplate` warning on an untouched line) ·
**i18n** ru+uz parity + no-hardcoded · **web Vitest 1432 (+9, 0 regress)** · **api
Vitest 2652 (+5, 0 regress)**.

## Status & owed

- **Backend optimistic-lock for Product + Variant: Phase-2 runtime-verified.**
- **FE conflict dialog: implemented + unit-tested; pixel/interaction browser-smoke
  OWED** (no Playwright MCP this session). Low risk (ConfirmDialog + toast are
  established primitives; the routing is unit-tested).
- **DEFER (documented, mechanical rollout):** the same lock for the other ~55 editable
  entities (counterparties, documents, settings, …) — the mechanism is built and
  reusable; each entity needs column + schema + repo + form threading. Bundle
  component-list-only concurrent edits aren't version-guarded (the parent product
  version covers the common case).

---

## Tier-1 ROLLOUT (2026-06-07b, multi-agent) — 17 simple-CRUD entities

Same session, accelerated via workflow fan-out (the user asked to speed up without any
quality loss → parallelize the *typing*, centralize the *review/verification* with one
Opus reviewer). Three workflows: **recon** (50 agents classify all 49 editable entities
→ 17 Tier-1 mechanical-safe / 32 Tier-2 needing design, each ground-truthed with a
caveat), **wiring** (17 Sonnet agents, one per entity, mirror the proven pattern +
respect the caveat, code-only), **test-fix** (12 Sonnet agents repair the
version-required schema tests + add a version-contract guard each). Quality enforced
centrally by Opus: migration, client regen, typecheck, biome, full suites, runtime
smoke, diff-review.

**Tier-1 entities (17):** cash-desk · contact-person · counterparty · custom-entity ·
discount · expense-item · label-template · opportunity · organization · price-type ·
project · publication · region · sales-channel · tax-rate · tracking-code · uom.

**Caveats the recon caught + the wiring respected (each verified):**
- **cash-desk** — `balanceMinor` is mutated by a SEPARATE money-posting path
  (money.service.ts); the version bump is scoped to the settings `update()` only, so
  money posts don't falsely 409 the settings form.
- **discount** — its error handler rethrows non-P2002 raw; an explicit P2025→409 mapping
  was added before that fall-through (else a conflict would surface as 500).
- **label-template / publication / sales-channel** — their `update()` keyed on `id`
  only (tenant guard via a prior findById); `accountId` AND `version` were folded into
  the `where` together.
- **opportunity** — FSM lives in a separate `transition()`; only `update()` is locked
  (verified: exactly one versioned-where in the service, transition/archive/restore
  untouched).
- **price-type** — `isDefault` clears the flag on OTHER rows via updateMany; the version
  increment sits only on the target.
- **region** — the `version` column already existed (decorative); only the logic was
  wired.

**Migration** `20260607182855_optimistic_lock_tier1_entities`: additive `ADD COLUMN
version INTEGER NOT NULL DEFAULT 1` on 16 tables (region already had it). One migration,
authored centrally, applied via `migrate deploy`; client regenerated (after a clean
api restart — the running api locks the engine DLL on Windows).

**Verification:**
- **Runtime smoke (live api+db) — 12 entities PASS**, covering every caveat type:
  counterparty · cash-desk · discount · region · sales-channel · organization · uom ·
  project · tax-rate · expense-item · price-type · custom-entity. Each: create→version 1
  → PATCH(v1) 200/bump → PATCH(stale) **409 OPTIMISTIC_LOCK** → **stale write did NOT
  leak**. The 3 with a parallel race (counterparty, discount, cash-desk): two
  simultaneous PATCH(same version) → **exactly one 200 + one 409**.
- The 5 not smoked (contact-person, tracking-code, label-template, publication,
  opportunity — FK/enum/complex creates) verified by typecheck + the aggregate
  service-pattern grep (versioned where + increment + P2025→409 present in all 17) +
  deep-read of label (accountId-fold) and opportunity (transition untouched) + the
  aggregate FE-threading grep (all 17 forms thread version + useConflictReload).
- **Gates:** tc0 (api+web) · biome 0-error on changed (6 pre-existing warnings on
  untouched lines) · i18n ru+uz (0 new keys — forms reuse conflict_* via
  useConflictReload) · **api Vitest 2688 (+36 version-contract guards)** · **web Vitest
  1432 (0 regress)**.

**Status:** Tier-1 (19 entities total incl. product/variant) optimistic-lock = backend
runtime-verified for the 12 smoked + structurally-verified for the 5; FE conflict dialog
implemented + unit-tested, pixel/interaction browser-smoke still owed (no MCP).
**Tier-2 (32 document/FSM entities) DEFERRED** to a focused Opus design pass (the lock
belongs on the field-edit path, not the posted-state transitions — each class needs a
decision).

---

## Tier-2 ROLLOUT (2026-06-07d, multi-agent) — money-document class (7 entities) + FE browser-smoke

The first Tier-2 class: the **money documents** — `cash-in` · `cash-out` ·
`payment-in` · `payment-out` · `prepayment` · `prepayment-return` ·
`counterparty-adjustment`. These were deferred from the Tier-1 rollout because a
document's `update()` is structurally different from a simple-CRUD `update()` and the
lock placement needs a per-class decision. A recon fan-out (7 Opus agents, one per
entity) mapped each service's `update()` / `transition()` / positions + each FE form;
the design was decided centrally; a wiring fan-out (7 Opus agents) applied it; one Opus
reviewer ran the central gate + runtime + browser smoke.

### The design decision (where the lock goes for a document)

- **Lock the field-edit `update()` ONLY** — never the FSM `transition()` (post / unpost /
  cancel), `clone()`, `delete()` (soft-delete), `massEditApply()`, `markPrinted()`, or
  any balance-posting path (`applyDelta` / `applyPayment`). Those are deliberate
  state/metadata changes, not concurrent edits of the same draft, and they carry no
  client `version` to check. (Same rule as the Tier-1 `opportunity` caveat, now applied
  cohort-wide.) Verified per entity: `version` appears only on the `update()` path.
- `update()` is already **draft-only** on every money doc (`if (existing.applicable)
  throw`), so the lock is only reachable for editable docs — a posted doc is rejected
  before the version check, which is correct.

### Two sub-classes (the recon's key finding)

- **Class A — docs with child operations** (`cash-in`, `cash-out`, `payment-in`,
  `payment-out`): `update()` rewrites the allocation rows via a **standalone**
  `XOperation.deleteMany(...)` followed by a nested `create` on the final `update`. These
  two writes were **NOT** in one transaction. Adding only the version filter would be a
  data-corruption bug: a stale-version save (or a concurrent race) would 409 *after* the
  deleteMany had already committed → the allocations would be **destroyed**. **The fix
  moves the `deleteMany` + the versioned `update` into ONE `this.prisma.client
  .$transaction`**, so a P2025 (version miss) rolls the deleteMany back. The read-only
  `ensureOperations(...)` validation + the `data.operations` build stay before the tx.
- **Class B — single-sum docs, no child rows** (`prepayment`, `prepayment-return`,
  `counterparty-adjustment`): one `update()` write, no `deleteMany`, so no tx needed —
  just the versioned `where` + `version: { increment: 1 }` + P2025→409. Their Update
  schemas are hand-written `.strict()` objects (not `Create.partial()`), so `version`
  was added as a declared required field; `prepayment-return`'s intentional
  currency-omission (a refund stays in the source currency) was preserved.

`Update*Schema`: `Create.partial()` ones gained `.extend({ version: z.number().int()
.nonnegative() })`; `.strict()` ones gained the field directly. Required on Update,
absent on Create. P2025 mapped to `OptimisticLockException(<Model>)` (the Class A
services' `handlePrisma` only mapped P2002, so the `isRecordNotFound` check was added as
the first catch line, before `handlePrisma`). No new i18n keys (forms reuse
`common.conflict_*`).

### FE + a conflict-reload UX fix the browser-smoke caught

Each of the 7 forms: `version: number` on the detail interface, `version: data.version`
threaded into the save payload (from the **loaded query data**, not the editable `form`
state), `onConflict: useConflictReload([...])`, and the optimistic-lock 409 filtered out
of the inline error banner (the dialog owns it).

The browser smoke surfaced a real gap the unit tests could not: the money-doc forms
hydrate a local edit-state object **once** (`if (data && !form) setForm(…)`), so
`useConflictReload`'s query invalidation refreshed `data.version` (lost-update still
prevented) but left the **stale edits on screen** — contradicting the dialog's promise
that unsaved changes are discarded. (The catalog forms don't have this: they
`form.reset(data)` on every `[data]` change.) **Fix:** `useConflictReload` gained an
optional `onReloaded` callback run after the refetch settles; each money-doc form passes
`() => setForm(null)` so the now-fresh `data` re-seeds the form. Browser-verified: after
"reload" the form shows the server's latest value, not the user's stale edit. (Also
fixed: 3 of the 7 forms lacked a `!data` narrowing guard in the save `mutationFn` — a
type error that an earlier typecheck run had masked by piping `tsc` through `tail`, whose
exit code hid the failure; caught + fixed.)

### Verification

**Backend — RUNTIME (Phase-2, live api+db):**
- **Core lock smoke — 40/40 assertions across 6 entities** (cash-in, cash-out,
  payment-in, payment-out, prepayment, counterparty-adjustment): create → version 1 →
  PATCH(v1) → 200/v2 → PATCH(**stale** v1) → **409 `OPTIMISTIC_LOCK`** with the **stale
  write NOT applied** (the GET still shows the v2 value — real lost-update prevention).
- **Concurrency race (5 entities, incl. all 4 Class A):** two parallel PATCH(same
  version) → **exactly one 200 + one 409**, final version incremented once.
- **Class A tx-rollback (adversarial, the KEY caveat) — 6/6:** a payment-in created
  *with* an allocation, then a stale-version PATCH that rewrites operations → **409**,
  and a follow-up GET proves the **allocation survived** (the deleteMany rolled back —
  not the orphan-on-409 corruption the design prevents).
- `prepayment-return` (Class B, FK-complex create) was not in the 6-entity smoke;
  it is structurally identical to the two smoked Class B docs (prepayment,
  counterparty-adjustment) and is verified by typecheck + diff-review + the schema test.

**Browser (Playwright MCP, Phase-2 FE — discharges the long-owed conflict-dialog smoke):**
- **payment-in** (money doc): open form (v1) → a concurrent API edit bumps the DB to v2
  → edit + Save → **409 routed to the localized conflict dialog** (not a raw banner) →
  "reload" → form **re-hydrates to the server's value**, stale edit discarded.
- **product** (catalog, the original owed debt): same flow → conflict dialog → reload
  re-hydrates (the rhf `form.reset` pattern). Both confirm the shared
  `useConflictReload` + `isOptimisticConflict` mechanism end-to-end.

**Gates:** tc0 (api+web, exit code verified directly) · biome 0-error on changed files ·
i18n ru+uz (0 new keys) · **api Vitest 2709 (+21 version-contract guards; fixed 7
pre-existing service/contract tests that parsed Update schemas without version)** · **web
Vitest 1432 (0 regress)**.

**Migration** `20260607200649_optimistic_lock_money_docs`: additive `ADD COLUMN version
INTEGER NOT NULL DEFAULT 1` on 7 tables (cash_in, cash_out, payments_in, payments_out,
prepayments, prepayment_returns, counterparty_adjustments); applied via `migrate deploy`;
client regenerated after a clean api stop (Windows DLL lock).

### Status & residual (honest)

- **Money-doc cohort (7 entities): backend runtime-verified + FE browser-verified.** This
  is the first Tier-2 class done AND the first time the optimistic-lock conflict dialog
  is browser-smoked (the catalog + Tier-1 FE debt is now discharged via two
  representatives across both form patterns).
- **Residual (documented, DEFER): a post-during-edit TOCTOU** — if user A loads a draft
  and user B *posts* it (a transition, which does not bump `version`), A's stale edit can
  still pass the version check (the post didn't change the counter) though A's
  draft-guard read is now out of date. This is **pre-existing** (the lock neither
  introduces nor worsens it) and rare; the clean fix is to bump `version` on **every**
  row write incl. transitions, a cross-cutting change to align with the whole
  optimistic-lock rollout — DEFERRED, not silently shipped.
- **Tier-2 remaining (~25 entities):** sales/purchase position docs (customer-order,
  demand, invoice-out/in, supply, purchase-order, sales/purchase-return, commission-
  report, consignment, factures), stock docs (move, enter, loss, inventory,
  internal-order), production (production, processing, processing-order, bom, work-order,
  process, stage), retail (retail-sale, cashier-session), online-order — each its own
  class; the money-doc Class A tx-wrap pattern is the template for any that rewrite
  positions.

---

## Tier-2 ROLLOUT (2026-06-08, multi-agent) — sales/purchase position-document class (8 entities) + FE browser-smoke

The second Tier-2 class: the **sales/purchase position-documents** —
`customer-order` · `demand` · `invoice-out` · `invoice-in` · `supply` ·
`purchase-order` · `sales-return` · `purchase-return`. Every one carries a
`<Doc>Position` child model and a draft field-edit `update()`; none was versioned.
A recon fan-out (8 Opus agents, one per entity) mapped each service's `update()` /
`transition()` / positions + each FE form; the design was decided centrally; a wiring
fan-out (8 Opus agents) applied it; one Opus reviewer ran the gates + runtime + browser
smoke. (Per project §0 the fan-out agents are **Opus**, not Sonnet.)

### The recon's finding: this class is remarkably homogeneous

All 8 share the **identical** shape — which is the money-doc Class A pattern *plus* a
two-step-totals wrinkle:

- **Draft-only** `update()` (`if (existing.applicable) throw`), except **customer-order**
  which has a *partial* guard (it allows metadata-only edits — description / vat /
  attributes — on a posted doc, by design; ref/store/positions edits are still blocked).
  The version filter goes on `update()` regardless of which guard variant.
- **Standalone `deleteMany`** of the position child rows (NOT in a transaction) — the
  exact data-corruption risk the money-doc rollout documented. For **invoice-in** it was
  even committed *unconditionally* before the `try`, so the tx-wrap fixes a pre-existing
  bug there, not only adds the lock.
- **Two-step totals write** (this is the new wrinkle vs the single-write money docs):
  `update#1` writes header + nested-creates positions (`include: { positions: true }`),
  then a pure `computeTotals(updated.positions, …)` runs, then `update#2` writes only the
  recomputed `{ sumMinor, vatSumMinor[, costSumMinor] }`.
- FSM `transition()` / `clone()` / `massEditApply()` / cascade appliers
  (`applyShipment` / `applyInvoice` / `applyPayment`) are **separate methods** — they
  carry no client `version` and must NOT be locked (same TOCTOU defer as the money docs).
- `Update*Schema` was `Create.partial()` (customer-order) or
  `Create.partial().extend({ positions: …min(1).optional() })` (the other 7); the wiring
  **merged** `version` into the existing `.extend()` (preserving the positions override —
  it did NOT replace the line), so `version` is required on Update, absent on Create.
- FE: all 8 forms were **greenfield** (no conflict wiring) and all hydrate via the
  `if (data && !form) setForm(…)` once-pattern → `onReloaded: () => setForm(null)`.

### The design (where the lock goes, and the tx-wrap)

`update()` for every doc becomes ONE `$transaction`:

```
const saved = await this.prisma.client.$transaction(async (tx) => {
  if (parsed.positions !== undefined) {
    await tx.<doc>Position.deleteMany({ where: { <doc>Id: id, accountId } });
  }
  const updated = await tx.<doc>.update({
    where: { id, accountId, version: parsed.version },
    data: { ...data, version: { increment: 1 } },
    include: { positions: true },
  });
  const totals = this.computeTotals(updated.positions, …);
  return tx.<doc>.update({ where: { id, accountId }, data: totals });
});
// post-commit diff()/logAudit()/webhookFire() unchanged
```

**ONLY `update#1` carries the version filter + increment.** `update#2` (totals) stays
keyed on `{ id, accountId }` with no version — `update#1` already bumped the row to N+1, so
re-filtering on the client's stale version would always miss and false-409. A stale version
on `update#1` → P2025 → the `deleteMany` + both updates roll back → caught as
`OptimisticLockException(<Model>)` (the existing `handlePrisma` only mapped P2002, so
`isRecordNotFound` was added as the first catch line). The read-only
`assertOrgAccountMatchesOrg` + the `data` build stay before the tx.

### Verification

**Backend — RUNTIME (Phase-2, live api+db): 48/48 across all 8 entities.** Per doc:
create → version 1 → PATCH(v1) → 200/v2 → stale PATCH(v1, **also rewriting positions to
2**) → **409 `OPTIMISTIC_LOCK`** with **(a) no-leak** (a follow-up GET shows the stale
description was NOT applied — real lost-update prevention) and **(b) Class A tx-rollback**
(the GET shows the positions count is still 1 — the `deleteMany` rolled back, not the
orphan-on-409 corruption) → **race** (two parallel PATCH(v2) → exactly one 200 + one 409).
The tx-rollback assertion is the load-bearing one: it proves the standalone-deleteMany
corruption risk is closed for all 8.

**Browser (Playwright MCP, Phase-2 FE):** customer-order representative —
open form (v1) → a concurrent API edit bumps the DB to v2 → edit + Save → **409 routed to
the localized conflict dialog** (`role=dialog`, title «Yozuv boshqa foydalanuvchi tomonidan
o'zgartirildi», buttons «Bekor qilish» / «Ma'lumotni yangilash» — NOT a raw banner) →
"reload" → the form **re-hydrates to the server's value** (description shows the concurrent
edit, the stale edits discarded). Discharges the FE conflict-dialog smoke for the
sales/purchase class (the `if(!form)setForm` document-form pattern, same as the money docs).

**Gates:** tc0 (api+web, real exit code verified directly — not piped through `tail`) ·
biome 0-error on all 32 changed files (after `biome check --write` sorted the agent-added
imports) · i18n ru+uz (0 new keys — reuses `common.conflict_*`) · **api Vitest 2726 (+17:
16 version-contract guards across the 8 schema tests + 1 externalCode regression guard)** ·
**web Vitest 1432 (0 regress)**.

**Migration** `20260607230000_optimistic_lock_salespurchase_docs`: additive
`ADD COLUMN version INTEGER NOT NULL DEFAULT 1` on 8 tables (customer_orders, demands,
invoices_out, invoices_in, supplies, purchase_orders, sales_returns, purchase_returns);
applied via `migrate deploy`; client regenerated.

### Bonus bug found by the browser smoke (pre-existing, HIGH) — customer-order edit-save 400

The conflict-dialog smoke first surfaced a **separate, pre-existing** defect: the
customer-order edit-save **400'd** on `{"externalCode": null}` with "Expected string,
received null". The Create schema had `externalCode: z.string().max(50).optional()` — NOT
nullable — so the edit form's `null` (a cleared «Внешний код», the common case) was
rejected before the version check. This is the **catalog BUG1 class** (`.optional()` should
be `.nullish()` for fields the edit form clears) and customer-order was the **one** sales/
purchase doc missed in the prior `.nullish()` sweep (the other 7 already use `.nullish()`
for externalCode). **Fix:** `externalCode: z.string().max(50).nullish()` (column is
`String?`, service guards on `!== undefined` → null-safe). Browser-verified: the same edit
that 400'd now **200s**. Schema regression guard added. This is exactly the kind of
runtime-only defect (tc/lint/unit-invisible) that Phase-2 browser QA exists to catch.

### Status & residual (honest)

- **Sales/purchase position-doc class (8 entities): backend runtime-verified (48/48) + FE
  browser-verified (customer-order representative).** Second Tier-2 class done.
- **Same DEFER as the money docs:** the post-during-edit TOCTOU (a `transition()` does not
  bump `version`, so a draft edit loaded before a concurrent *post* can still pass the
  version check) — pre-existing, rare, the clean fix is a cross-cutting "bump version on
  every write incl. transitions" aligned with the whole rollout.
- **Tier-2 remaining (~17 entities):** stock docs (move, enter, loss, inventory,
  internal-order), production (production, processing, processing-order, bom, work-order,
  process, stage), retail (retail-sale, cashier-session), online-order, plus the
  sales/purchase long-tail (commission-report, consignment, factures). Each its own class;
  the Class A + two-step-totals tx-wrap here is the template for any that rewrite positions.

---

## Reusable verification harness (2026-06-08)

`scripts/verify-optimistic-lock-smoke.mjs` — a **committed, config-driven** live-smoke
harness for the lock on position-documents. Each entity declares `mkCreate` / `mkPositions`;
the engine runs the standard battery against a live api+db (create → v1; PATCH(v1) → 200/v2;
stale PATCH → 409 `OPTIMISTIC_LOCK`; no-leak; Class A tx-rollback positions-survive; race →
one 200 + one 409). Adding a future locked class = a few config lines, not a fresh script.

**Why it is trustworthy (the "serious about testing" bar):**
- **Self-validating per entity:** the battery requires BOTH a 200 on a fresh-version PATCH
  AND a 409 on a stale one, on the same row — a vacuous "always-409" harness fails the 200
  step; an "always-200" one fails the 409 step.
- **Negative control:** while a still-unlocked simple doc existed (`move`, before this
  rollout), the harness asserted it does NOT 409 (last-write-wins) — proving the 409 logic
  fires on staleness, not on every PATCH.
- **Mutation-tested:** flipping the unlocked control to `expectLocked: true` makes the
  harness FAIL (exit 1, "created version != 1") — it genuinely detects a missing lock, it
  is not vacuously green.

Validation runs: 51/51 (8 sales/purchase locked + move unlocked control) and the mutation
test (1 deliberate FAIL). After the stock rollout the config flips move → locked and adds
the other 4 stock docs.

---

## Tier-2 ROLLOUT (2026-06-08, multi-agent) — stock position-document class (5 entities) + harness + browser-smoke

The third Tier-2 class: the **stock documents** — `move` · `enter` · `loss` · `inventory` ·
`internal-order`. Same multi-agent flow (recon 5 Opus → central design + migration + regen →
wiring 5 Opus → central verify), now verified by the reusable harness above.

### The recon's finding: a SIMPLER class than sales/purchase

All 5 fit the Class A tx-wrap, but **none has a two-step totals write** — the `$transaction`
contains exactly the position `deleteMany` + ONE versioned update (which carries both the
version filter and the increment). `sumMinor` is set only at **post** time (in the FSM
transition handlers, which write the stock deltas via `StockService.applyDeltas` inside their
own Serializable transactions — never in `update()`). So the lock scope is purely the draft
field-edit, and the stock-ledger paths are correctly left unlocked. Per-entity nuances:

- **move** — two-store transfer (source/destination), qty-only positions, hand-rolled
  `z.object` Update schema (version added directly).
- **enter / loss / inventory** — single store; `Create.partial().extend({ positions })` (version
  merged into the existing `.extend`). **inventory** is a stocktake — positions are count-lines
  (`actualQty`; expected/variance/cost are post-time), still rewritten via deleteMany+create.
- **internal-order** — an *order* (no stock delta; reporting-only totals folded into the single
  header update). Its `update()` **already** ran inside one `$transaction` with the header
  update#1 first, then deleteMany+createMany — so a P2025 short-circuits before the deleteMany
  naturally. Only the where (`{id}` → `{id, accountId, version}`) + `version:{increment:1}` were
  added, and a try/catch wrapped around the existing tx (there was none). `.strict()` Update
  schema → version added inside.

Consistency fix during central verify: 4 stock schemas initially used `z.coerce.number()` for
version (would accept a string "1"); normalized to plain `z.number().int().nonnegative()` to
match the rest of the rollout (26+ entities) and the version-contract guard tests.

### Verification

- **Backend — RUNTIME via the harness: 78/78** (all 13 locked position-docs — 8 sales/purchase
  + 5 stock — pass the full battery on a live api+db). The 5 stock docs: 409 + no-leak + Class A
  tx-rollback (positions survived a stale PATCH that tried to rewrite them) + race.
- **Browser (Playwright MCP):** `move` representative — open form (v1) → concurrent API edit →
  Save → **409 routed to the localized conflict dialog** (title «Yozuv boshqa foydalanuvchi
  tomonidan o'zgartirildi» + body + «Ma'lumotni yangilash») → reload → form re-hydrates to the
  server value. Discharges the stock FE conflict-dialog smoke (the other 4 forms share the
  identical greenfield wiring + `if(!form)setForm` hydration).

**Gates:** tc0 (api+web, real exit verified) · biome 0-error (changed files; `--write` sorted
agent imports) · i18n ru+uz (0 new keys) · **api Vitest 2736 (+10 version-contract guards across
the 5 stock schema tests)** · **web Vitest 1432 (0 regress)**. Migration
`20260608000000_optimistic_lock_stock_docs` (additive, 5 tables).

### Status & remaining

- **Stock class (5 entities): backend runtime-verified (harness 78/78) + FE browser-verified
  (move representative).** Third Tier-2 class done. Optimistic-lock now covers **39 entities**
  (Tier-1 19 + money 7 + sales/purchase 8 + stock 5).
- Same post-during-edit TOCTOU DEFER as the prior classes.
- **Tier-2 remaining (~12):** production (production, processing, processing-order, bom,
  work-order, process, stage), retail (retail-sale, cashier-session), online-order, sales/purchase
  long-tail (commission-report, consignment, factures). Add each to the harness config as it is
  locked (flip a fresh unlocked one to a negative control first).

---

## Tier-2 ROLLOUT (2026-06-08c, multi-agent) — production class (7 entities)

The fourth Tier-2 class — the **production cohort**: `production` · `processing` ·
`processing-order` · `bom` (BillOfMaterials) · `work-order` · `process` (ProcessingProcess) ·
`stage` (ProcessingStage). The most heterogeneous class so far. Recon (7 Opus) found all 7
fit, in three shapes:

- **Header-only** (production, processing-order, work-order) — no child arrays → a single
  versioned update, no `$transaction` needed.
- **Nested child-array** (processing = materials + products; bom = components) — the child
  writes are NESTED in the update's `data` (`{ deleteMany, create }`), which is ATOMIC with
  the versioned parent update (a stale-version P2025 means the nested writes never run), so
  NO tx restructuring — just add the version filter + increment.
- **Config / already-in-tx** (process = positions+edges via replacePositions; stage =
  performers) — bom/process/stage are config/template entities (no posted state, no draft
  guard); process & stage already wrapped their child rewrites in one `$transaction`, so the
  versioned update went inside it (process's conditional header update was made unconditional
  so the lock always runs). Schemas: production/bom/work-order/process/stage =
  `Create.partial()`; processing/processing-order = `.strict()` (version added inside).
  Several already mapped P2025 — ensured `isRecordNotFound → OptimisticLockException` is the
  FIRST catch line (a post-findById version-miss must 409, not 404). work-order's detail page
  is **transition-only** (no field-edit save form) → no FE conflict-dialog to wire (BE lock
  still protects the PATCH endpoint); the other 6 got the standard FE wiring.

### ⚠️ Incident + recovery (git-stash tangle) — honest record

This run hit a real hazard: the 7 wiring agents edit files in the SAME working tree (not
worktrees), and one agent ran `git stash` mid-flight, sweeping the central schema.prisma
version edits + the generated client + several agents' in-progress edits into a stash; a
partial `git stash pop` then left the tree inconsistent (5 of 7 entities re-applied, schema +
client + bom + work-order missing). Detected via §2 verification (the wiring report flagged it
AND a direct `awk` over schema.prisma showed all 7 models reverted to `version=NO`). Recovered
deterministically: confirmed the tree's shared-5 files were byte-identical to the stash
(`git diff stash@{0} -- <file>` empty), `git checkout -- .` + `git stash pop` restored the
complete snapshot, then verified everything (schema 7/7, services 7/7, FE 6/7). 4 breaking
schema/service tests that the tangle reverted were re-fixed by hand. **Lesson:** for
multi-agent same-tree wiring, commit the central schema FIRST (so a stray stash can't revert
it), or isolate agents in worktrees.

### Verification

- **Backend — RUNTIME via the harness: 120/120** (all 20 locked position-docs — 8 sales/purchase
  + 5 stock + 7 production — pass the battery on a live api+db). Production docs run the CORE
  battery (create→v1; PATCH(v1)→200/v2; stale PATCH→409 + no-leak; race→one 200/one 409); the
  child-array tx-rollback assertion is OMITTED for production (child fields vary —
  components/stages/performers/materials — and are nested-in-update or already-in-tx = atomic,
  structurally identical to the stock/sales-purchase classes where tx-rollback WAS runtime-proven).
  Harness create-prerequisites resolved: bom uses a product with no existing BOM (unique-per-product),
  work-order uses an existing bomId, process uses an inline stage, processing supplies materials+products.
- **Browser (Playwright MCP):** `production` representative — 409 → localized conflict dialog →
  reload → form re-hydrates to the server value.

**Gates:** tc0 (api+web, real exit verified) · biome 0-error · i18n ru+uz (0 new keys) · **api
Vitest 2749 (+13 version-contract guards across the 7 production schema tests)** · **web Vitest
1432 (0 regress)**. Migration `20260608010000_optimistic_lock_production_docs` (7 tables).

### Status & remaining

- **Production class (7 entities): backend runtime-verified (harness 120/120) + FE
  browser-verified (production representative; work-order FE is transition-only = N/A).**
  Fourth Tier-2 class done. **Optimistic-lock now covers 46 entities** (Tier-1 19 + money 7 +
  sales/purchase 8 + stock 5 + production 7).
- **Tier-2 remaining (~5):** retail (retail-sale, cashier-session), online-order, sales/purchase
  long-tail (commission-report, consignment, factures). Same post-during-edit TOCTOU DEFER.

## Tier-2 ROLLOUT (2026-06-08d) — retail-sale (the FINAL field-edit doc) + ROLLOUT COMPLETE

Session: 2026-06-08d (`davom et`, local Opus, ultracode). The closing chapter of the
optimistic-lock rollout. A mid-session **session-limit** (resets 11:50 Asia/Tashkent)
made subagent/Workflow fan-out unavailable after the first batch failed — so this class
was reconned + designed + implemented + runtime-verified **serially in the main loop**,
in commit-safe order (gate-verified core → commit → runtime smoke).

### The recon's key finding: the "~5 remaining" was an entity-count, not a lock surface

The prior hand-off listed ~5 remaining Tier-2 entities. Reconning all 7 (reading each
service's method inventory **and** its controller's HTTP routes) showed only **ONE**
has a draft field-edit `update()` path — the only thing optimistic-lock guards:

| entity | service methods / routes | field-edit `update()`? | verdict |
|---|---|---|---|
| **retail-sale** | `create/update/post/cancel/refund`, `@Patch(':id')` | **YES** | **LOCK** |
| cashier-session | `open/close/drawer-in/drawer-out`, POST-only | no (FSM) | N/A |
| online-order | `create/accept/reject/convertToCustomerOrder`, POST-only | no (FSM) | N/A |
| commission-report | `listOut/findByIdOut/listIn/findByIdIn`, GET-only | no (read-only) | N/A |
| consignment | `list/findById`, GET-only | no (read-only) | N/A |
| facture-in | `list/findById/generate*`, GET + generate-POST | no (derived) | N/A |
| facture-out | `list/findById/generate*`, GET + generate-POST | no (derived) | N/A |

The 6 N/A entities have **no lost-update surface**: there is no PATCH that re-writes
user-edited header/child fields, so there is nothing two concurrent editors could
clobber. FSM transitions (accept/reject/open/close) and derived `generate*` flows are
the same TOCTOU class we DEFER everywhere (transitions don't bump `version`). This is
architectural N/A-by-design, not a skipped TODO — they need no column and no guard.

### retail-sale — Class A, and a pre-existing corruption fixed in passing

- Migration `20260608020000_optimistic_lock_retail_sale`: `ALTER TABLE retail_sales ADD
  COLUMN version INTEGER NOT NULL DEFAULT 1` (additive). `UpdateRetailSaleSchema` gains
  REQUIRED `version: z.number().int().nonnegative()` (hand-rolled `z.object`, not
  `.strict()` — added directly; Create has no version).
- `update()` was **Class A** (rewrites the `positions` child array via deleteMany) but
  the deleteMany + createMany ran **OUTSIDE any transaction** — a pre-existing
  data-corruption risk (a failure between delete and re-create left a receipt with ZERO
  positions). The lock fix folds both into ONE `$transaction`: position `deleteMany` →
  version-guarded header `update` (`where {id,accountId,version}`, `data {…, version:
  {increment:1}}`, nested `positions.create`). A stale-version miss (P2025) rolls the
  deleteMany back → **fixes the lost-update AND the corruption together**. `sumMinor` is
  computed up-front from the new positions, so there is no second totals-only update
  (no supply-style two-step). `isRecordNotFound(e) → OptimisticLockException('RetailSale')`
  is the FIRST catch branch (a post-`findById` miss = 409, not 404).
- **FE = BE-lock-only.** `retail/sales/[id]/page.tsx` is a **read-only POS view** (zero
  PATCH/mutation anywhere in `apps/web` for retail-sales — grep-confirmed). The PATCH
  endpoint is used by POS/e-commerce integrations; the lock protects it regardless. No
  conflict-dialog to wire (same as work-order: integration/transition-only → no FE).

### Verification — runtime smoke 126/126 (whole rollout, no regression)

- The reusable harness (`scripts/verify-optimistic-lock-smoke.mjs`) gained a retail-sale
  entry: it resolves an OPEN cashier session (reuse `GET /cashier-sessions/current`, else
  open one with a cash-desk) and cleans up via `POST /:id/cancel` (RetailSale has no
  DELETE route — POS receipts cancel, not delete). `skipIf` self-skips with a clear
  message if no session can be opened (it could, so it ran).
- **Live api + db smoke: 126 PASS / 0 FAIL** across all 21 locked position-docs
  (8 sales/purchase + 5 stock + 7 production + 1 retail). retail-sale proved the full
  battery: create→v1 · PATCH(v1)→200/v2 · stale PATCH(v1, positions rewritten to 2)→**409
  OPTIMISTIC_LOCK** · no-leak (description preserved) · **Class A tx-rollback (positions
  survived = 1** — the stale rewrite rolled back) · race→exactly one 200 + one 409. The
  126/126 also re-verifies the prior 20 entities (regression guard).
- Gates: api typecheck **0** (real exit code) · biome **0** on the 3 changed source files
  (`--write` re-sorted the new import; the stranded §105 comment was re-anchored to its
  import) · api Vitest **2751 passed** (+2 version-contract tests, was 2749) · web
  untouched (BE-lock-only) so web 1432 unaffected.

### ✅ Status — OPTIMISTIC-LOCK TIER-2 ROLLOUT COMPLETE

- **retail-sale: backend runtime-verified (harness 126/126). FE = BE-lock-only (read-only
  POS view, no conflict-dialog needed).**
- **Optimistic-lock now covers 47 entities** (Tier-1 19 + money 7 + sales/purchase 8 +
  stock 5 + production 7 + retail 1). ~~**Every entity with a field-edit `update()` path is
  now locked.**~~ ⚠️ **SUPERSEDED — this "every / 47 / complete" claim was FALSE; see the
  GAP-SWEEP section below (2026-06-08h): an exhaustive 74-service scan found 7 more
  unlocked field-edits → now 54.** The 6 "remaining" Tier-2 entities cited here are
  N/A-by-design (FSM-only / read-only) — that part holds — but they were NOT the full
  unlocked set.
- **Residual DEFER (unchanged, project-wide):** post-during-edit TOCTOU — FSM transitions
  (post/accept/close/cancel) don't bump `version`, so a draft edit can still race a
  transition. Pre-existing, rare; a clean fix = version-bump on *every* write incl.
  transitions = a separate rollout. Documented, not silently implied.

---

## GAP-SWEEP (2026-06-08h) — the "ROLLOUT COMPLETE / 47 / every field-edit locked" claim was FALSE

**Honest correction.** The section above declared the rollout complete at 47 entities and
asserted "**every** entity with a field-edit `update()` path is now locked." That was
wrong. The 08d claim was anchored on the prior Tier-1/Tier-2 *enumeration*, not on an
exhaustive scan — so parity-clone entities whose edit path was never in that enumeration
slipped through. The 2026-06-08g session already flagged ONE (`price-list`) as a residual.
Treating that as a bug-class ("which class is this an instance of, and where else does it
repeat?"), this sweep scanned **all 74 services with an `async update()`**: 47 were locked,
leaving **28 with an unlocked `update()`**. A recon (one agent per service, ground-truthed
to `file:line`) classified them **9 GAP / 19 N/A**, and I ground-truthed every GAP myself
before locking (CLAUDE.md §1 — confirmed deltas applied by hand, not blindly).

### 7 locked (the 9 GAPs minus the 2 deferred)

Same mechanism as the other 47 (`version Int @default(1)` col · `UpdateXSchema.version`
REQUIRED · versioned `where {id, accountId, version}` + `version:{increment:1}` ·
`isRecordNotFound → OptimisticLockException` 409). Migration
`20260608030000_optimistic_lock_remaining_entities` (additive, 7 cols).

| entity | moysklad | shape | notes |
|---|---|---|---|
| price-list | Прайс-листы | header-only | the 08g residual; `where:{id}`→`{id,accountId,version}` |
| task | CRM Задача | header-only | `version` added to `diff()` skip-list so audit diffs stay clean |
| store | Склады | header-only | pathName cascade runs only after a matched (non-stale) update |
| pipeline | CRM Воронки | nested child-array (tx) | stages rewrite; versioned header update ALWAYS fires (stages-only edit still 409s); P2025 aborts tx → stages rollback |
| payroll | Зарплата | nested child-array (tx) | lines rewrite; **+ latent fix** (see below) |
| organization-account | Счета организации | config-in-tx | demote-default `updateMany` + versioned update in one tx |
| role | RBAC role + matrix | config-in-tx | versioned header update ALWAYS fires so a **permissions-only** edit 409s on a stale matrix; `findOne` DTO now returns `version` (FE needs it) |

**Latent fix (payroll).** `payroll.update()` returned `this.findById()` via the **non-tx**
client from **inside** the `$transaction` → it read the *pre-commit* snapshot, so the save
response carried the stale `version` AND stale lines (the harness caught this: PATCH(v1)
returned 200 but `version` stayed 1). Moved the final read to **after** the tx commits.
This was a pre-existing wrong-read bug the lock surfaced.

### ~~2 deferred — the Employee pair~~ → ✅ RESOLVED 2026-06-08i (see "Employee pair" section below)

`hr-employee.service` (HR «Сотрудники» modal, **PUT**) and `analitika/staff.service`
(«Ходимлар» form, PATCH) both write the **same shared `Employee` model**, which has **5
writers across 3 modules** (auth ×3 incl. `lastLogin` on *every* login · hr-employee ×4 ·
staff ×1) and **two FE surfaces with different verbs**. A correct lock needs a coordinated
design (version-thread on both surfaces) + verification it doesn't false-409 against auth's
frequent `lastLogin` writes — a focused mini-design, not a mechanical lock. Half-locking one
surface would be worse than the current state. **DONE in the focused follow-up of 2026-06-08i —
the design + per-writer decisions + runtime proof are in the dedicated section at the end of
this doc.** Lock count is now **56 entities**.

### 19 N/A-by-design (recon verdicts, all high-confidence, ground-truthed)

Not concurrency-exposed parity-clone field-edits:
- **No web edit form / pure-API:** service-request, call, mxik (read+import only),
  webhook, webhook-stock, hr-bonus-fine-rule, hr-notification-template.
- **Inline-CRUD settings modal (no dedicated detail page, rare admin co-edit):**
  reason-code, hr-role, task-type, currency (per-row rate edit), product-folder (tree-list
  inline), attribute-metadata, state (no PATCH caller at all).
- **Out-of-parity bespoke (moysklad has no equivalent):** print-template (team-built editor,
  flagged ×4 in NEXT.md as "parity klon EMAS"), hr-task-template (already has an
  `expectedUpdatedAt` alt-lock), help (internal KB CMS).
- **Singleton / per-user (no shared lost-update):** variance-config (per-account upsert),
  saved-filter (strict-ownerId personal pills).

### Verification — extended harness **168/168 PASS** (live api+db, 0 regress)

`scripts/verify-optimistic-lock-smoke.mjs` extended from 21 → **28 entities** (added the 7;
header-only battery for the new ones — no `mkPositions` — because their child rewrites are
nested-in / already-inside the same versioned tx = atomic, structurally identical to the
runtime-verified stock/sales-purchase classes). Every new entity proved the full battery:
create→v1 · PATCH(v1)→200/v2 · stale PATCH(v1)→**409 OPTIMISTIC_LOCK** · no-leak · race →
exactly one 200 + one 409. The 168/168 also re-verifies the prior 21 (regression guard).
(`employees?limit=2` resolved for payroll; one transient bom create-409 was a unique-
per-product seed collision from repeated runs, cleared — unrelated to the lock.)

- **+13 version-contract guards** (api Vitest 2771 → **2784**): each new `UpdateXSchema`
  asserts `version` is REQUIRED (a no-version payload is rejected) + a version-only payload
  parses — a regression-lock that the lock can't be silently bypassed. (Existing schema/
  service tests that parsed Update without version were updated to the new contract; the
  payroll "rejects" tests now pass for the RIGHT reason, not because version was missing.)
- **FE (commit `5cf10aab`):** all 7 detail/edit pages thread `version: data.version` into
  the PATCH body + `useConflictReload(<detail queryKey>, <reHydrate>)` (409 → localized
  reload dialog, conflict filtered from the error banner) — §2-verified (queryKey matches
  each detail `useQuery`; auto-rehydrate pages have a genuinely ungated `useEffect([data])`).
  Browser-smoke of the conflict dialog is **OWED** (Phase-2 QA-backlog).

### ✅ Status — OPTIMISTIC-LOCK now **54 entities** (was an overclaimed 47)

54 = Tier-1 19 + money 7 + sales/purchase 8 + stock 5 + production 7 + retail 1 + **gap-sweep
7**. Commits: BE `95ff5415`, FE `5cf10aab`. **Now the "every field-edit `update()` is
locked" claim is true** *except* the deferred Employee pair (documented above) — verified by
an exhaustive 74-service scan, not an enumeration. **Phase-1 + harness-runtime-verified (BE);
FE structural (browser-smoke owed).** **➡️ 2026-06-08i: the Employee pair is now locked too →
56 entities (see below).**

---

## Employee pair (the deferred focused design) — DONE 2026-06-08i

The last deferral from the gap-sweep. ONE physical `Employee` row is editable from **three
field-edit forms**, so all three lost-update surfaces converge on a single `version` column
(migration `20260608040000_optimistic_lock_employee`, additive, default 1):

| Form | Endpoint | Verb | Lock |
|---|---|---|---|
| HR «Сотрудники» modal | `/hr/employees/:id` | **PUT** | **check + increment** (`UpdateHrEmployeeSchema.version` required) |
| Analitika «Ходимлар» | `/analitika/staff/:id` | **PATCH** | **check + increment** (Class A: versioned header update runs FIRST in the tx so a stale version rolls back the `EmployeeRole` rewrite — same structure as `role`) |
| Self-profile «Mening profilim» | `/auth/me` | PATCH | **bump-only** (increments `version`, no version-check) |

### The design hinges on one discriminator: **"is this field shown in an edit form?"**

This is exactly why it was deferred — a mechanical "lock every Employee writer" would have been
**wrong**. The `Employee` row carries **auth bookkeeping** fields written on a hot path:
`lastLoginAt` + `failedLoginAttempts` + `lockedUntil` (login success/failure) and `passwordHash`
(password reset). Those are **NOT edit-form fields**. If the lock bumped them, **every open
admin edit-form would 409 after any login** — a false-409 storm. So:

- **Edit-form-visible fields → bump `version`** (and the two admin forms additionally *check* it).
- **Auth bookkeeping fields → never touch `version`** (left exactly as-is).

### Per-writer decisions (the full inventory, nothing silently skipped)

**Check + increment (the two admin edit forms):**
- `HrEmployeeService.update` — `where: { id, version: input.version }` + `version: { increment: 1 }`;
  `findOne` proves existence first, so a P2025 ⇒ `OptimisticLockException('Employee')`.
- `StaffService.update` — same, but the versioned `tx.employee.update` ALWAYS runs FIRST inside
  the existing `$transaction` (the old `if (Object.keys(data).length)` gate was removed) so a
  roleIds-only edit still bumps+checks; a stale P2025 aborts the tx, rolling back the
  `EmployeeRole` deleteMany/createMany. Mirrors the production-proven `role` config-in-tx shape.

**Bump-only (writers of edit-form-visible fields — keep the admin-form lock sound, no contract change):**
- `AuthController.updateMe` — `fullName`/`phone` are also editable from both admin forms, so a
  self-edit bumps `version` (admin forms 409 on a stale save). NOT version-checked: `/auth/me`
  is a core auth endpoint kept contract-stable and self-profile is single-user / low-conflict.
- `HrEmployeeService.softDelete` / `setArchived` (`archived`) + `setPassword` (`username`) —
  `archived` and `username` ARE staff-form fields, so their discrete writers bump so a stale
  staff-form save 409s instead of silently resurrecting / clobbering. (This is the
  Employee-specific specialization — most entities' archive/delete don't bump because their
  edit form doesn't carry those fields.)

**Unguarded — deliberately (auth bookkeeping, NOT edit-form fields):**
- `AuthService` login-success (`lastLoginAt`/`failedLoginAttempts`/`lockedUntil`), failed-login,
  and `setPassword`/`changePassword` (`passwordHash`) — **zero** version touches. Bumping any of
  these would 409 every open edit-form after a login (the deferral's core hazard).
- `hardDelete` — row is gone; a stale form save P2025s → 409 ("record was deleted"), correct.

### FE (version threaded on all three; conflict → localized reload dialog)

- HR modal (`employee-modal.tsx`): opens off a captured list/detail row, so it carries `version`
  (added to the `/hr/employees` list + findOne selects + `HrEmployeeRow`). On 409 →
  `useConflictReload(['hr-employee', id], reHydrate)` where `reHydrate` refetches `findOne` and
  re-seeds form + version, keeping the modal open on the fresh copy.
- Staff form (`staff-form.tsx` + `xodimlar/[id]/page.tsx`): sends `version`; on 409 →
  `useConflictReload(['analitika','staff-detail', id])`; the parent re-keys `<StaffForm key={data.version}>`
  so the once-seeded local field state remounts + re-hydrates after the reload.
- The conflict is filtered out of each inline error banner (`isOptimisticConflict`), so only the
  localized dialog shows. Browser-smoke of these dialogs is **OWED** (Phase-2 QA-backlog).

### Verification — harness **180/180** + adversarial (live api+db, 0 regress)

`verify-optimistic-lock-smoke.mjs` extended 28 → **30 entities** (`hr-employee` with
`editMethod:'PUT'`; `analitika-staff`; both header-only batteries, each with a permission-probe
`skipIf` so the harness stays green on a base-only seed and exercises the lock when HR/analitika
perms are present — verified live with `seed:hr`). Both proved the full battery: create→v1 ·
edit(v1)→200/v2 · stale→**409 OPTIMISTIC_LOCK** · no-leak · race. (Also hardened a pre-existing
latent harness fragility: `boms?limit=3`→`200` so the unique-per-product `productNoBom` pick is
reliable.) **Adversarial (the crux, runtime-proven):** a fresh **login did NOT bump** the admin's
version (no false-409); a **`/auth/me` self-edit DID bump** (v1→v2); a **stale HR PUT(v1) after
that self-edit → 409** — proving all three forms share one version column and the bump is enforced.

- **+16 guard tests** (api Vitest 2784 → **2800**): `UpdateHrEmployeeSchema` + `UpdateStaffSchema`
  version-contract (version required on update, absent on create) + a source-scan lock
  (`shared/employee-optimistic-lock.test.ts`) pinning BOTH directions — the three locked paths
  increment, **and `auth.service` has ZERO version bumps** (the false-409 regression-lock).

### ✅ Status — OPTIMISTIC-LOCK now **56 entities**

56 = 54 + **Employee pair 2** (hr-employee + analitika-staff; the self-profile `/auth/me` is the
same row, bump-only). Commit `<this>`. **Every field-edit `update()` in the app is now locked —
the rollout is genuinely complete** (the prior "complete" claims were enumeration-anchored; this
one rests on the exhaustive 74-service scan + the now-closed final deferral). **Phase-1 +
harness-runtime-verified + adversarial (BE); FE structural (browser-smoke of the 3 conflict
dialogs owed, Phase-2 QA-backlog).**

### 2026-06-08j — conflict-dialog browser-smoke (partial) + a HIGH design-system bug

Drained part of the owed conflict-dialog browser-smoke (the session-start audit's #1 flagged
standing risk). **`roles` (config, full-page) + `hr-employee` (edit modal) conflict dialogs are
now Phase-2 BROWSER-VERIFIED** (real Chrome via Playwright MCP: 409 → localized dialog → reload →
re-hydrate → 200, full version cycle). The `hr-employee` **modal** surfaced a HIGH *general* bug —
a `ConfirmDialog`/`useConfirm` invoked from inside **any** Radix `Modal` was (1) hidden behind it
(same z-index), (2) unclickable (inherited `body{pointer-events:none}` from Radix's modal lock),
(3) closing the host modal (Radix interact-outside). **Fixed** in the design-system (`--ms-z-confirm`
token + `pointer-events-auto` on the confirm overlay + a Modal `onInteractOutside` guard);
browser-verified end-to-end + non-modal `roles` regression re-checked. Full write-up:
`_PHASE2-confirm-dialog-in-modal.audit.md`. The other 8 lock conflict surfaces are full-page forms
covered by the `roles`/customer-order/payment-in representatives (already browser-verified);
`analitika/staff`'s re-key-remount smoke stays owed (full-page, low-risk).

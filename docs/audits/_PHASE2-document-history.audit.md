# Phase-2 audit — empty document-History bug-class swept (internal-order · processing-order · price-list · bundle components)

**Date:** 2026-06-08g (`davom et`, local Opus, ultracode)
**Status:** ✅ **Phase-2 — runtime-verified live (api + db, 14/14).** Not a pixel pass, but the
History (Tarix) tab is purely a `GET /audit-logs?entity=<Slug>&entityId=…` contract, so the
live API battery IS the ground truth.

## The bug-class

`auditEntity` is declared on 35 detail pages, but cross-referencing the FE props against the BE
audit-writers showed several services that write **zero** `auditLog` rows — their History tab is
permanently, vacuously empty (gate-invisible: tc/biome/unit all pass). This is the same class
already closed for money-docs (2026-06-06, `0ce3ba93`), bom/process/stage (2026-06-06b) and
variant (2026-06-08f, `5a44dc7e`). The remaining instances (services absent from the audit-write
set) were:

| Module | FE `auditEntity` | Page | Before |
|---|---|---|---|
| `internal-order.service` | `InternalOrder` | internal-orders/[id] | 0 audit rows |
| `processing-order.service` | `ProcessingOrder` | processing-orders/[id] | 0 audit rows |
| `price-list.service` | `PriceList` | price-lists/[id] | 0 audit rows |
| `bundle.service` (component list) | `Product` (parent) | bundles/[id] | parent fields logged by ProductService; **component edits silent** |

No schema/migration needed — the `auditLog` table exists and the FE History tabs are already wired.

## Fix (mirror `prepayment.service` document pattern)

For the three documents: threaded `userId` (`user.sub`) through `update / softDelete /
massEditApply / transition` in each controller (create + clone already passed `ownerId`); added a
private `logAudit(accountId, userId, action, entityId, fieldChanges)` writing the **exact
PascalCase slug** (`InternalOrder` / `ProcessingOrder` / `PriceList`). Calls:
- create → `'create'` (clone delegates to create, so it's covered — no double-log)
- update → `'update'` (after the versioned tx/update succeeds, inside the try so an
  optimistic-lock P2025/409 does NOT write a row)
- softDelete → `'delete'` · massEditApply → `'mass-edit'` (with the patch)
- transition → `'transition:posted'` / `'transition:unposted'` / `'transition:cancelled'` with
  `{ from: { before: row.state, after: <new> } }`.

**Non-transactional on purpose:** unlike prepayment (which inlines `tx.auditLog.create` so the
row commits atomically with the counterparty-balance delta), these three documents have **no
balance/stock side effects** — internal-order is a transfer request (stock moves via a separate
Move), processing-order is planning-only (explicit `TODO(v2)` — the Processing op does the stock
cascade), price-list is a publication artifact. So a plain post-update `logAudit` is correct; an
advisory audit row needs no atomic delta. (Documented in each `logAudit` doc-comment.)

For **bundle**: threaded `userId` into `setComponents` / `removeComponent`; logs under
**`entity: 'Product'`** (the bundle detail page's History tab is the *parent Product's* feed —
a bundle IS a Product), `entityId = <bundleId>`, action `'update'`. `setComponents` snapshots the
prior rows before the overwrite tx and logs `components: { before, after }`; `removeComponent`
logs `components: { removed: {…} }`. quantities coerced via `.toString()` (BundleComponent.quantity
is Decimal). This closes the residual DEFER noted in `_PHASE2-variant-history.audit.md`.

## Runtime smoke (live api + db, 14/14)

`scratch/history-audit-smoke.mjs` (gitignored). For each of the 3 documents:
create → `[create]` · field-edit → `[update, create]` · post → `[transition:posted, update,
create]` · unpost + delete → `[delete, transition:unposted, transition:posted, update, create]`
(newest-first, exact order). bundle: create bundle product → setComponents → Product History has a
component `'update'` (before/after) · removeComponent → a `'update'` with the `removed` diff. **14/14.**

## Guard + gate

- New `audit-log/document-history.test.ts` (+4): source-scan lock mirroring
  `catalog-history.test.ts` — each service must contain `entity: '<Slug>'` (casing drift would
  silently re-empty the tab) and call `this.logAudit(` ≥ N× (7/7/7 docs, 2 bundle). The live
  battery above is the behavioural proof; the source-scan is the regression lock.
- Gate: **api tc0 · biome0(changed) · api Vitest 2771 (+4, 0 regress, was 2767)** · web untouched.

## Residual / notes (DEFER, separate)

- `price-list.service.update()` has **no optimistic-lock version filter** (unlike the other two
  docs) — out of scope for this audit-write sweep; a real lost-update gap if price-lists get
  concurrent edits. Flagged for the optimistic-lock backlog, NOT fixed here.
- bundle parent-field edits (name/prices/VAT) are still logged by ProductService (unchanged);
  this audit only added the previously-missing component-list rows.
- FE staleness (History tab not refetching immediately after a component save) is the separate
  `useApiMutation` invalidation class (BUG2, 2026-06-06e) — the tab refetches on mount/nav; the
  rows ARE written (proven live).

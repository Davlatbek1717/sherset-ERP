# Phase-2 audit — variant History (Tarix) tab was always empty (BE audit-write gap)

**Date:** 2026-06-08 (`davom et`, local Opus, ultracode)
**Status:** ✅ **Phase-2 — runtime-verified live (api + db, 14/14).** Not a pixel pass, but
the History tab is purely a `GET /audit-logs?entity=Variant&entityId=…` contract, so the
live API battery IS the ground truth.

## The gap

`variant.service.ts` wrote **zero** `auditLog` rows. The web variant detail page renders
`<DocumentTabs auditEntity="Variant" …>` (variants/[id]/page.tsx:426), whose History (Tarix)
tab fetches `GET /audit-logs?entity=Variant&entityId=<id>` (exact-match on entity). With no
writes, the tab was **always vacuously empty** for every variant. This was a tracked DEFER
in `_PHASE2-catalog-cohort.audit.md` ("variant.service writes no auditLog → variant History
stays empty; mirror product.service logAudit; FE slug 'Variant' is correct"). Same bug-class
as the 2026-06-06 bom/process/stage and money-doc fixes.

## Fix (mirror `product.service`)

- Threaded `userId` (`user.sub`) through `create/update/archive/restore/delete` in
  `variant.controller.ts` (incl. `bulk-delete/archive/restore`) → `variant.service.ts`.
- Private `logAudit(accountId, userId, action, entityId, fieldChanges)` writing
  **`entity: 'Variant'`** (exact PascalCase match to the FE slug).
- Calls: create→`'create'`(null) · update→`'update'`(diff, only when non-empty) ·
  archive→`'archived'` · restore→`'restored'` · delete→`'delete'` (logged before the hard
  delete; the audit row outlives the variant, mirroring moysklad).
- **BigInt-safe diff.** Variant has BigInt columns (`buyPrice`/`minPrice`/`minimumBalanceMinor`)
  and a plain `JSON.stringify` throws on BigInt. `computeDiff` and `logAudit` use a
  `bigint → string` replacer. The diff iterates the **updated** row's own keys, so the
  `product` relation that `existing` carries (from `findById`) never enters the changeset;
  `version`/`createdAt`/`updatedAt` are excluded as infra.

## Runtime smoke (live api + db, 14/14)

create → History `[create]` · field-edit (buyPrice 10000→25000) → `[update, create]` with a
**bigint-safe** changeset `buyPrice {before:"10000", after:"25000"}` · no-op edit (same value)
→ **no** new row (diff-empty guard) · archive → `[archived, update, create]` · restore →
`[restored, …]` · delete → `[delete, …]` (newest-first, exact order) · variant hard-deleted
(GET→404). Test variant cleaned up.

## Guard + gate

- `audit-log/catalog-history.test.ts` (+1): source-scan lock — `variant.service.ts` must
  contain `entity: 'Variant'` (casing drift would silently re-empty the tab) and ≥5
  `this.logAudit(` calls. (DB-mocking unit tests are disallowed here; the live battery above
  is the behavioural proof, the source-scan is the regression lock.)
- Gate: **api tc0 · biome0(changed) · api Vitest 2767 (+1, 0 regress)** · web untouched.

## Residual

- bundle/service component-list edits still aren't field-diff-audited (only parent fields) —
  pre-existing, separate DEFER; not in scope here.

# consignments — LIST parity audit (Cohort L3)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Reference:** NO own moysklad capture → sibling-parity vs the captured supplies list shell only.

## A. Structural / column deltas

- **DEFER (no-capture) — consignment-specific column labels** (batch/«Партия», expiry, terms): no own capture → cannot DOM-ground (§4); not churned, deferred.

## B. Interactive deltas

- **DEFER (real bug, needs BE-enum check) — «Код» column `sortable: true`** while the BE `ConsignmentFilterSchema.sortBy` enum is `['expiryDate', …]` (no `code`). Clicking → unsupported sortBy. Fix: add to BE enum or make non-sortable. BE-schema verification needed → deferred.
- **DEFER (real bug, needs route decision) — row label links to `/consignments/${id}` but there is NO `/consignments/[id]` detail route** (only the list `page.tsx` exists) → clicking a row 404s. Fix: either create the detail route or render the «Партия» label as plain text (remove the dead `href`). Route-design decision → deferred to a focused follow-up, not guessed here.

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ · web Vitest 1306 green (no regress). No code change this page (audit-only; findings deferred).

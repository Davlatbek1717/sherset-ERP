# Phase-2 proof — Money/returns cohort (prepayments · prepayment-returns · counterparty-adjustments)

**Date:** 2026-06-11 (consolidation record) — evidence produced 2026-06-06 and 2026-06-08k.
**Status:** ✅ **Phase-2 — runtime-verified** (live API+DB battery 2026-06-06 + real-browser
adversarial smokes 2026-06-08k). This doc is a **consolidation**, not a new battery run:
the 2026-06-11 session-start audit found the `PHASE2_COHORTS` manifest cited
`_PHASE2-retail-register.audit.md` as this cohort's proof, but that doc only *mentions*
"money-docs P1/P2/P3" in one passing line — the actual evidence lived only in NEXT.md
prose and session memory. This doc makes the cohort's `done=true` falsifiable again by
naming the evidence in one place.

## Cohort

| Page | Phase-1 audit | Phase-2 evidence |
|---|---|---|
| `prepayments/[id]` (+`/new`) | 2026-06-03g (Cohort D) | History battery + P1 (below) |
| `prepayment-returns/[id]` (+`/new`) | 2026-06-03g | History battery + P1/P2/P3 |
| `counterparty-adjustments/[id]` (+`/new`) | 2026-06-03g | History battery |

## Evidence 1 — audit-log write + live History battery, 13/13 (2026-06-06, commit `0ce3ba93`)

All three services previously wrote **zero** `auditLog` rows → the History (Tarix) tab
(`GET /audit-logs?entity=<PascalCase>` exact-match) was permanently empty. Fix threaded
`userId` (user.sub) through update/transition/softDelete/massEditApply (~9 methods +
3 controllers), added per-service `logAudit` (non-tx sites) + inline `tx.auditLog.create`
for FSM transitions (atomic with the counterparty-balance delta).

**Live runtime smoke (real API + real DB), 13/13** for all 3 modules:
- create → History `[create]`
- post → `[transition:posted, create]`
- unpost + delete → `[delete, transition:unposted, transition:posted, create]`
(proves the null-fieldChanges Json write path + the FE↔BE entity-string contract).

**Adversarial money probes, 3/3** (same battery): over-refund cap rejects 4M > 3M
remaining (localized message); refund currency-lock forces source currency (client-sent
UZS ignored when the source advance is USD).

Gate at the time: tc 0 · biome 0 · api Vitest 2616 (+9).

## Evidence 2 — browser + adversarial P1/P2/P3 (2026-06-08k session, commit `3a07c847`)

Run in a real browser (Playwright MCP, live dev stack); no prepayments existed in seed →
the chain was created via API, verified in the browser, and cleaned up:

- **P1 — wholesale save-block fix holds:** editing a wholesale prepayment (no retail
  split) saves **200**; PATCH body sends `cashSumMinor:"0"` (not `null`). Adversarial
  probe proved the fix matters: a `null` split → **400** ("Expected string, received
  null"), `'0'` → 200.
- **P2 — refund currency lock:** prepayment-return currency renders `[disabled] UZS`
  (locked to source); BE `.strict()` rejects a `currency` PATCH → **400**
  ("Unrecognized key 'currency'") — a foreign-currency over-refund cannot be booked.
- **P3 — net remaining:** «Остаток к возврату: **3 000,00 сум**» = NET
  (5 000 source − 2 000 prior posted return), not the full source sum; over-refund POST
  (4 000 > 3 000 remaining) → **400** ("Qaytarish summasi ortib ketdi… qolgan 300000").

## Provenance

- NEXT.md → «Money / returns (3) — 2026-06-03g» QA-backlog section (the prose this doc
  consolidates).
- Session memories: `session-2026-06-06-three-track-flagship.md` (Evidence 1),
  `session-2026-06-08k-retail-register-crash.md` §2 (Evidence 2).
- Commits: `0ce3ba93` (audit-log write + battery), `3a07c847` (08k session; P1/P2/P3
  smokes ran in that session — the commit itself is the retail register fix).

## Residual (documented, outside this cohort's done-bar)

- History-tab Playwright-MCP hard-nav 401 quirk (cookie-persistence artifact of the MCP
  browser context, not a user bug — verified healthy via curl + SPA nav; see NEXT.md note).

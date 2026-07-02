# Phase-2 proof — Production-config cohort (boms · processes · stages · work-orders)

**Date:** 2026-06-11 (consolidation record) — evidence produced 2026-06-06b, 2026-06-08l
and 2026-06-08o.
**Status:** ✅ **Phase-2 — runtime-verified** (live browser + API smokes across three
sessions). This doc is a **consolidation**, not a new battery run: the 2026-06-11b
session-start audit flagged that the `PHASE2_COHORTS` manifest pointed this cohort at
`_PHASE2-history-transition-diff-i18n.audit.md` + `_PHASE2-retail-cash-scale.audit.md`,
which are *lateral* docs (an app-wide i18n fix and a retail fix) that only contain the
production smokes incidentally — the same existence-vs-relevance gap class fixed for
money/returns in `_PHASE2-money-returns-cohort.audit.md`. This doc names the cohort's
evidence in one place so `done=true` is falsifiable again.

## Cohort

| Page | Phase-1 audit | Phase-2 evidence |
|---|---|---|
| `production/boms/[id]` (+`/new`) | 2026-06-03f (Cohort C) | B4 smoke (08o) + History battery (06b) |
| `production/processes/[id]` (+`/new`) | 2026-06-03f | P1 smoke (08o) + History battery (06b) |
| `production/stages/[id]` (+`/new`) | 2026-06-03f | S1/S2 smoke (08o) + History battery (06b) |
| `production/work-orders/[id]` (+`/new`) | 2026-06-03f | W1/W3 smokes (08l) |

## Evidence 1 — audit-log write + live History battery (2026-06-06b Track 4, commit `b853d34b`)

`bom` / `processingstage` / `processingprocess` services wrote **zero** audit rows →
History tab vacuously empty. Fix added `logAudit` (create/update/archive/restore +
bom `setComponents` / process `setStages`), entity slugs exact-matching the FE
`auditEntity` props. **Runtime-verified live:** bom History returned
`[delete, update, create]` after a real mutate cycle. Wiring-lock test (3) added.

## Evidence 2 — work-orders W1/W3 (2026-06-08l session, commit `36dd7911`)

Real browser, live dev stack:

- **W3 — transition History:** transitioning a work-order populates Tarix/History with
  `Создано` + `В работе` + `Выполнено` rows (this smoke is what surfaced the app-wide
  History action-label i18n leak, fixed the same session — see
  `_PHASE2-history-transition-diff-i18n.audit.md`).
- **W1 — start/finish dates:** «Начато»/«Завершено» render as real date+time ru
  (`27.04.2026 07:46`), not raw ISO.

## Evidence 3 — stages/boms/processes S1/S2/B4/P1 (2026-06-08o session, commit `c7609ce3`)

Real browser, live dev stack:

- **S1/S2 — stage refs resolve:** created a stage with a `materialStore` +
  `allPerformers=false` + a named performer; **fresh GET reload** of
  `/production/stages/[id]` → store renders «Asosiy ombor», performer chip
  «Admin User», **0 raw UUIDs on the page** (BE include fix held).
- **B4 — bom outputQty guard:** FE blocks with «Количество должно быть больше 0»
  (no POST fired); adversarial API-direct `outputQty:'0'` → **400**, `'-1'` → **400**.
- **P1 — process validation:** all 3 sub-cases show a visible red banner
  («Название — обязательное поле» / «Выберите этап» / «Добавьте хотя бы один этап»),
  not the misleading «Этапов: 1» label-as-error.

## Provenance

- NEXT.md → «Production-config (4) — 2026-06-03f» QA-backlog section (the prose this
  doc consolidates).
- Session memories: `session-2026-06-06b-four-tracks.md` (Evidence 1),
  `session-2026-06-08m-history-transition-diff-i18n.md` sibling-entry 08l (Evidence 2),
  `session-2026-06-08o-retail-cash-scale.md` (Evidence 3).
- Commits: `b853d34b` (logAudit) · `36dd7911` (08l) · `c7609ce3` (08o).

## Residual (documented, outside this cohort's done-bar — grounding-gated)

- work-orders/new `docDate` = **BE feature-gap** (no doc-date column; needs schema +
  capture to confirm intent — `_PHASE2-100-PLAN.md` §6).
- boms cost-split question · uz title «Tex. zayavkalar» vs ru «Производственные
  задания» (deliberate-terminology question) — both await a production-module capture
  (**no production gold capture exists**; module re-capture is on the GROUNDING
  backlog).

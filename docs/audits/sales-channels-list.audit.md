# sales-channels (ecommerce/channels) — LIST parity audit (Cohort L8 · E-commerce/pricing)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_bcfd35ce-83f`). Premise-phase references/bias/extra-checks; analyze/verify degraded → finding ground-truthed by Opus directly.
**Ground-truth (§4):** the `00-module/saleschannel/dom/00-clean-default.html` capture has `<title>Каналы продаж` but its **body is a customer-order form** (Контрагент / План. дата отгрузки / Адрес доставки / «Канал продаж» as a *field*) — **CONTAMINATED**, not a channels-list grid. → NO capture-grounding; SIBLING-PARITY only (settings-style ListView: active/archived pill + sortable name + cursor pagination + badge columns). Column LABELS were NOT churned.

## A. Structural / column format — date cell (FIXED, dedup + NaN-guard)
- **`lastSyncedAt` rendered via `new Date(row.lastSyncedAt).toLocaleDateString('uz-UZ')`** inside the last-sync Badge (page.tsx:142) — raw, no NaN-guard, dedup violation (cohort date bug-class). Switched to shared `@moysklad/ui` `formatDate` (date+time; a sync moment benefits from the time, and `formatDate` returns `—` on a malformed timestamp instead of `Invalid Date`). The existing `if (!row.lastSyncedAt)` `—` guard is retained; cellText also uses `formatDate`.
- Confirmed-correct: name/kind/external_ref/orders_count column labels all `t()`-routed (no leak); no money/sum/currency column (sales-channels is a settings entity, not a money document) is the correct column set.

## B. Interactive / toolbar chrome — confirmed-correct (refuted as deltas)
- active|archived pill filter + sortable name + cursor pagination + Создать (+ Добавить канал) — correct settings-list shape. No Период filter / no bulk-FSM / no posted-state — CORRECT (not a money document). `KIND_BADGE_TONE` mapping complete; last-sync success/destructive tone wired.

## DEFER / Phase-2
- Pagination liveness not browser-verified. `LIMIT=25` kept (no page-size grounding). Last-sync is an app-specific sync-health column (not in moysklad) → no parity label to ground.

## Gates
typecheck 0 (web) · biome 0 (changed) · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ (L8 date wiring lock) · web Vitest 1352 pass/1 skip (+3, 0 regress).

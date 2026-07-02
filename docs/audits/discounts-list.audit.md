# discounts — LIST parity audit (Cohort L8 · E-commerce/pricing)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_bcfd35ce-83f`). Premise-phase references/bias/extra-checks; analyze/verify degraded → findings ground-truthed by Opus directly.
**Ground-truth (§4):** NO moysklad capture for discounts → SIBLING-PARITY only (settings/tax-rates = ListView + moyskladToolbar + InlineFilterPanel, no bulk, no status pills). No label churn.

## A. Structural / columns + i18n — CLEAN
- Columns name(sortable→detail link)/kind(`t('kind_*')` badge)/active(`tCommon('yes')`/`tCommon('no')`) — all routed through `t()`/`tCommon()`/`tFields()`/`tFilters()`; **no hardcoded Cyrillic or Latin-uz leak**. No money/date cell on this page (no Number()/100 or raw toLocaleDateString risk).
- Confirmed-correct (refuted as deltas): no counterparty/store/sum/currency column, no posted-state — a discount is NOT a money/FSM document.

## B. Interactive / toolbar + filter chrome — CLEAN (+ pagination DEFER)
- `moyskladToolbar` + filter-toggle + InlineFilterPanel (kind dropdown + active/archived state) + click-to-sort is the correct settings-list shape. No bulk-actions / no status pills — correct (settings entity). `SavedFiltersPills` intentionally omitted (not FilterDrawerValues-shaped) — documented in-file.

## DEFER / Phase-2 (BE)
- **Dead pagination (LOW — documented, not fixed).** BE `discount.service.ts:34` is `take: 200` + `:36 total: items.length` (no cursor); FE `page.tsx:110 hasNext={false}`. Same code-smell class as L6 tracking-codes, BUT **discounts is a low-cardinality settings entity** (a business has tens, not hundreds) — the >200 unreachable-rows / wrong-total-if-capped risk is unlikely to bite. The premise phase explicitly recommended weighing this as DEFER/LOW, not HIGH (do not over-escalate). If discounts ever exceed 200, mirror the products `product.repository.ts` cursor+count pattern (as done for tracking-codes in L6). `LIMIT=50` kept.

## Gates
typecheck 0 (web) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · web Vitest 1352 pass/1 skip (0 regress). No code change on this page (audit-only).

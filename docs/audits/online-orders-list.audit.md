# online-orders (ecommerce/orders) — LIST parity audit (Cohort L8 · E-commerce/pricing)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_bcfd35ce-83f`). Premise phase produced the corrected references + bias-immunization + 9 concrete `extra_checks` (file:line); the analyze/verify phase **degraded** (all diff agents + critic failed schema → 0 blind-verified candidates). Per project rule each finding was **ground-truthed by Opus directly** against the code (not applied blind).
**Ground-truth (§4):** NO usable moysklad capture. online-orders has no capture at all; the cohort's other captures (saleschannel, pricelist) are CONTAMINATED (customer-order form body despite the right `<title>`). → SIBLING-PARITY only. customer-orders is feature-source for money/date/state-badge CONVENTIONS only (its heavy doc-toolbar + bulk-FSM + posted/cancelled pills are NOT expected — online orders are inbound, converted into customer-orders). Column LABELS were NOT churned (no grounding).

## A. Structural / column format — money + date (FIXED, data-integrity)
- **Money cell (cohort money bug-class).** `formatSum` was `Number(sumMinor) / 100` + `toLocaleString('uz-UZ')` + currency suffix (page.tsx:44 helper, :157 usage). Two defects: (1) **BigInt-unsafe** — `Number()` on a minor-units string loses precision past 2^53; (2) **wrong separator** — `uz-UZ` renders `64,000.00`, not the moysklad `64 000,00` (thin-space + comma). Deleted the helper; cell now renders `formatMoney(row.sumMinor, row.currency, { displayAs: 'none' })` (BigInt-safe, correct separator, list-cell suffix-less convention). **cellText keeps the suffix** (`formatMoney(row.sumMinor, row.currency)`) for CSV export — mirrors `moves/page.tsx:346` and the L7 opportunities precedent (15 multi-currency sibling cells use `displayAs:'none'`).
- **Date cell (cohort date bug-class).** `receivedAt` rendered via `new Date(row.receivedAt).toLocaleDateString('uz-UZ')` (page.tsx:170) — raw, no NaN-guard, dedup violation. Switched to shared `@moysklad/ui` `formatDate` (DD.MM.YYYY HH:MM, date+time). A received-order moment is a genuine timestamp; date+time matches the L7 «Создано»/sibling-list convention. cellText also uses `formatDate` (mirrors `price-lists/page.tsx:248`).

## B. Interactive / toolbar chrome — confirmed-correct (refuted as deltas)
- No Create button / no doc-toolbar / no bulk-FSM / no print / no mass-edit — CORRECT: online orders are an **inbound** capture list (converted into customer-orders), not an editable money document. State filter `all/pending/accepted/rejected/converted` is the right shape (not a posted/cancelled pill).
- No counterparty/store/sum-aggregate column — channel/customer link + sum cell is the correct column set. `STATE_TONE` badge mapping covers every state value; click-to-sort (sum, received_at) + cursor pagination wired.

## DEFER / Phase-2
- Pagination liveness (cursor/total) not browser-verified. `LIMIT=25` kept (no moysklad page-size grounding). `header: '#'` literal for the external-order-id column left as-is (no capture to ground «№» vs «#»).

## Gates
typecheck 0 (web) · biome 0 (changed) · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ (L8 money/date wiring lock, NO GROUNDING entry — captures contaminated) · web Vitest 1352 pass/1 skip (+3, 0 regress).

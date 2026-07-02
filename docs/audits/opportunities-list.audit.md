# opportunities — LIST parity audit (Cohort L7 · CRM)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_e11d6251-8c3`, 25 agents, 15 confirmed).
**Ground-truth (§4):** NO moysklad capture for opportunities (deal list) → SIBLING-PARITY only. counterparties (master-data chrome) + customer-orders (deal column pattern) are feature-source siblings; column LABELS were NOT churned (no grounding) per §4. Findings are intrinsic format/chrome drift the sibling-diff alone cannot catch.

## A. Structural / column format + money + empty-state — FIXED (low/medium)
- **Date format dedup:** page defined a **local `formatDateOnly`** (`toLocaleDateString('ru-RU', …)`), a byte-dup of the shared `@moysklad/ui` `formatDateOnly` (cohort convention, ~80 pages). Deleted the local; imported shared `formatDate` + `formatDateOnly` (adds the shared NaN-guard).
- **«Создано» (createdAt) dropped the time component** — all 8 sibling lists render createdAt as **date+time** via shared `formatDate`. Switched createdAt → `formatDate` (DD.MM.YYYY HH:MM); `expectedCloseDate` (planned date) stays date-only via `formatDateOnly` (work-orders' createdAt=time / planned=date-only split).
- **Money cell suffix:** `amount` cell rendered `formatMoney(BigInt(o.amount), o.currency)` **with** the «сум» suffix — the lone list-cell offender. Every multi-currency sibling cell (cash-in/moves/demands/…, incl. multi-currency-no-«Валюта» ones) uses `{ displayAs: 'none' }`. Fixed: cell → `displayAs:'none'`; **cellText keeps the suffix** for CSV export (mirrors `moves/page.tsx:343-346`).
- **Empty-state:** `pages.opportunities.empty_rich_*` keys existed but no `richEmpty` prop → dead keys + no onboarding CTA. Wired `richEmpty={{ heading, cta:{label:create_button, href:'/opportunities/new'} }}`. Descriptive `empty_rich_helper` left available (ListView `richEmpty.helper` is link-only).

## B. Interactive / toolbar chrome — FIXED (low-medium cohort drift)
- Added `onRefresh={() => refetch()}` (↻ control), `selectionCount={bulk.selectedIds.size}` (☑N counter; bulk already wired), `createPosition="start"` (Create button pinned after title). Present only on counterparties across the cohort, but the dominant convention (30-40 sibling pages; prior boms/bundles/services audits fixed the same `createPosition` drift).
- Confirmed-correct: rich filter panel (period/pipeline/stage/counterparty/status/owner/updated/archived), click-to-sort, stage/status badge mapping — all legitimate.

## DEFER / refuted
- amount uses `formatMoney(BigInt(...), o.currency)` (BigInt-safe, multi-currency) — NOT a `Number()/100` precision bug. Pagination liveness (cursor/total) not browser-verified — Phase-2. `LIMIT=25` kept (no moysklad page-size grounding).

## Gates
typecheck 0 (web) · biome 0 (changed) · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ (L7 date-helper + displayAs + chrome + richEmpty lock) · web Vitest 1349 pass/1 skip (0 regress).

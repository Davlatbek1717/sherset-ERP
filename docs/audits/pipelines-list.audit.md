# pipelines — LIST parity audit (Cohort L7 · CRM)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_e11d6251-8c3`, 25 agents, 15 confirmed).
**Ground-truth (§4):** NO moysklad capture; Pipeline is a CRM-config entity → SIBLING-PARITY chrome only. It legitimately lacks bulk-actions (no `useBulkDocumentActions`), money columns, counterparty filter, and import/print toolbar — those absences were NOT flagged.

## A. Structural / columns — no delta (confirmed mirrors)
- Column set (name · isDefault · stages · opportunity_count · state) + archived filter legitimate for a CRM-config list. No money column, no bulk bar, no counterparty filter — all correct (config entity). Date: N/A (no date column). `LIMIT=25` kept. **richEmpty NOT added** — pipelines has no `empty_rich_*` keys (correctly no orphan).

## B. Interactive / toolbar chrome — FIXED (low cohort drift)
- Added `onRefresh={() => refetch()}` (↻ control; refetch in scope) and `createPosition="start"` (Create button after title) — present only on counterparties across the cohort; the dominant convention (35 pages use createPosition='start' incl. settings/config lists; 40 wire onRefresh).
- **`selectionCount` deliberately NOT added** — pipelines has no `useBulkDocumentActions` (no row selection), so no counter affordance applies (matches non-bulk config lists). Click-to-sort + archived filter confirmed-correct.

## DEFER / refuted
- Absence of bulk / money / counterparty-filter / import-print NOT flagged (config-list legitimate). Pagination liveness not browser-verified — Phase-2.

## Gates
typecheck 0 (web) · biome 0 (changed) · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ (L7 chrome lock: onRefresh + createPosition='start') · web Vitest 1349 pass/1 skip (0 regress).

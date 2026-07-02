# tax-rates — LIST parity audit (Cohort L11 · Settings-finance)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_4725376c-9cd`) — 8 candidates → 5 confirmed / 3 refuted / 0 uncertain. The 5 "confirmed" are the SAME single defect reported by 5 agents (scrambled page attribution); the critic vetted every other page CLEAN. Each delta Opus ground-truthed against code + BE + `ListView` source.
**Ground-truth (§4):** NO moysklad capture for tax-rates (only API docs `_taxrate.md`) → sibling-parity ONLY, no label churn, no GROUNDING entry. Sibling = `settings/expense-items` (same `moyskladToolbar` + `InlineFilterPanel`; expense-items is the CORRECTLY-wired template).
**DEDUP:** detail/labels covered in cohort K (2026-06-04). This pass = LIST axis only.

## A. Structural / columns + i18n — CLEAN
- Columns rate(link→detail)/comment/state(badge); headers + empty-state via `t()`/`tCommon()`/`tFields()`/`tFilters()` — no hardcoded Cyrillic/Latin-uz leak.
- `Number(row.rate).toFixed(2)+'%'` is a PERCENT, not money-minor → `formatMoney` correctly N/A (refuted as a money-cell delta). Default sort `rate`/asc.

## B. Interactive chrome — 🔴 FIX (dead/inert search box, full-stack; L10-sessions bug-class)
- **FE was inert:** `page.tsx` passed `search=""` + `onSearchChange={() => undefined}` while supplying `searchPlaceholder={t('search_placeholder')}` («По ставке…»). `ListView.tsx:440` renders the search `<Input>` whenever `onSearchChange` is truthy → the box rendered but the value was pinned to `""`, the handler was a no-op, and `search` was never threaded into params/queryKey.
- **BE ALSO dropped it:** `TaxRateFilterSchema` declares `search` (schema.ts:24) and the controller forwards the full query, but `TaxRateService.list()` built `where` from `accountId`+`archived` ONLY — it never applied `filter.search` (the sibling `expense-item.service.ts:38` does). So even a wired FE returned unfiltered.
- **Fix (wired end-to-end, mirrors expense-items):**
  - FE: `searchInput` state + `useDebounce(300)` + `...(search ? { search } : {})` in params + `search` in queryKey + `onSearchChange={(v) => setSearchInput(v)}` + `emptyTitle={search ? tCommon('no_results') : t('empty_title')}` + `hasActiveFilter={!!search || …}`.
  - BE: `where.OR = [{ comment: { contains: search, mode:'insensitive' } }, …(numeric ? [{ rate: num }] : [])]`. **`rate` is `Decimal` (not `contains`-searchable); `comment` is the only free-text column** → match the rate exactly when the query parses as a number, else comment-contains.
  - **Placeholder «По ставке…» KEPT (no label churn, §4-clean):** rate-OR-comment search makes it truthful — typing `12` finds the 12 % rate.
- **Tests:** api `tax-rate.schema.test.ts` +2 (accepts `search`; source-scan locks `list()` applies it as comment-contains OR `rate`); web `label-grounding.test.ts` +1 (FE threads search, no-op handler cannot return).
- **CLEAN otherwise:** `InlineFilterPanel` (Фильтр + Статус) is the moysklad-parity filter chrome; no bulk-action/status-pill/counterparty-filter (legitimate settings absences, refuted).

## DEFER / Phase-2
- Pagination: BE `take:200` + `total:items.length`, FE `hasNext={false}` — dead pagination, but **low-cardinality** (default rates 0/12/15) → L8-discounts DEFER class, not escalated.
- Browser-smoke: type a rate / comment fragment → list filters (currently runtime-unverified).

## Gates
typecheck 0 (web+api) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding 93 · web Vitest 1361 (+1, 0 regress) · api Vitest 2605 (+2, 0 regress).

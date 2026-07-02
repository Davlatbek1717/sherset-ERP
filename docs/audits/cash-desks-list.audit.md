# cash-desks — LIST parity audit (Cohort L11 · Settings-finance)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_4725376c-9cd`). Critic-vetted CLEAN; ground-truthed by Opus.
**Ground-truth (§4):** NO moysklad capture → sibling-parity ONLY, no label churn. Sibling = `settings/bank-accounts` (symmetric org-account settings `ListView`). Entity = `/admin/cash-desks`.
**DEDUP:** detail/labels covered in cohort K. This pass = LIST axis only.

## A. Structural / columns + money — CLEAN
- Columns name(link)/currency(badge)/balance/state(badge); headers via `t()`/`tCommon()`/`tFields('state')` — no hardcoded leak.
- **Money correct:** balance cell uses BigInt-safe `formatMoney(BigInt(row.balanceMinor), row.currency)` — not `Number(minor)/100`+suffix.

## B. Interactive chrome — CLEAN
- Search WIRED (`searchInput` + `useDebounce(300)` + threaded param + queryKey). **Real cursor pagination** `hasNext={!!data?.nextCursor}` + BE `total`. Active/Archived filter, sortable name column, createHref.

## DEFER / Phase-2
- `balance` `cellText` returns raw `balanceMinor` for CSV, but NO `ExportButton` rendered → unreachable dead code (not user-visible). Browser-smoke = Phase-2.

## Gates
typecheck 0 (web) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · web Vitest 1361 (0 regress). No code change on this page (audit-only).

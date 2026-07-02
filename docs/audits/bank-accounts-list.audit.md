# bank-accounts — LIST parity audit (Cohort L11 · Settings-finance)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_4725376c-9cd`). Critic-vetted CLEAN; ground-truthed by Opus.
**Ground-truth (§4):** NO moysklad capture → sibling-parity ONLY, no label churn. Sibling = `settings/cash-desks` (symmetric org-account settings `ListView`). Entity = `/admin/organization-accounts`.
**DEDUP:** detail/labels covered in cohort K. This pass = LIST axis only.

## A. Structural / columns + money — CLEAN
- Columns name(link)/organization(link)/currency(badge)/is_default(badge)/balance/bank_name/account_number/state(badge); all headers via `t()`/`tCommon()`/`tFields('state')` — no hardcoded leak.
- **Money correct:** balance cell uses BigInt-safe `formatMoney(BigInt(row.balanceMinor), row.currency)` — NOT the `Number(minor)/100`+suffix anti-pattern. (Do-not-flag per direction fact.)

## B. Interactive chrome — CLEAN
- Search WIRED (`searchInput` + `useDebounce(300)` + threaded param + queryKey). **Real cursor pagination** `hasNext={!!data?.nextCursor}` + `total` from BE (NOT the L6/L8 dead-pagination class). Active/Archived filter, sortable name column, createHref.

## DEFER / Phase-2
- `balance` `cellText` returns the raw `balanceMinor` for CSV, but NO `ExportButton` is rendered on this page → unreachable dead code (not user-visible); if export is later added, format it. Browser-smoke = Phase-2.

## Gates
typecheck 0 (web) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · web Vitest 1361 (0 regress). No code change on this page (audit-only).

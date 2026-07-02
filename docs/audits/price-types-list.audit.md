# price-types — LIST parity audit (Cohort L8 · E-commerce/pricing)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_bcfd35ce-83f`). Premise-phase references/bias/extra-checks; analyze/verify degraded → ground-truthed by Opus directly.
**Ground-truth (§4):** the `04-module/pricetype` capture is CONTAMINATED (`<title>Заказы покупателей` — wrong page). → NO capture-grounding, NO new GROUNDING guard entry. price-types is a **settings inline-CRUD** page (PageHeader + custom `<table>` + draft/edit/delete row state, NOT a ListView) → sibling = `settings/currencies` / `settings/expense-items`.

## A. Structural / columns + i18n — CLEAN
- Columns name/currency/default(badge) + inline +Добавить / edit / delete; all strings routed through `t()`/`tCommon()` (col_name/col_currency/col_default/mark_default/add_title/default_badge + common.save/cancel/edit/delete/delete_confirm/loading/actions) — **no hardcoded Cyrillic or Latin-uz leak**. No money/date cell (price-type rows carry no minor-units / timestamp display) → no Number()/100 or raw toLocaleDateString risk.
- Confirmed-correct (refuted as deltas): the root `price-types/page.tsx` (314 L) is the cohort target, NOT `settings/price-types/page.tsx` (151 L leaner variant).

## B. Interactive / inline-CRUD chrome — CLEAN (no silent failure)
- Destructive delete goes through the shared `useDestructiveMutation` (`runDestructive`) with a localized confirm; `createMut`/`updateMut`/`deleteMut` all have `onError → setError` (no silent failure). Default price type is delete-guarded (`!pt.isDefault`).
- Confirmed-correct (refuted as deltas): NO ListView/moyskladToolbar/search/pagination/bulk-actions/status-pill/InlineFilterPanel/sortable-columns/row-click-route — all CORRECT for a settings inline-CRUD page (matches the settings/currencies sibling shape).

## DEFER / Phase-2
- Currency field is a free-text 3-char uppercase input (no validation against a known ISO/currency set) — consistent with the settings/currencies sibling; not churned. Browser-smoke of create/edit/delete round-trip = Phase-2.

## Gates
typecheck 0 (web) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · web Vitest 1352 pass/1 skip (0 regress). No code change on this page (audit-only).

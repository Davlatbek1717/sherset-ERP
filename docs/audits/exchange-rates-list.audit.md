# exchange-rates — LIST parity audit (Cohort L11 · Settings-finance)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_4725376c-9cd`). Critic-vetted CLEAN; ground-truthed by Opus.
**Ground-truth (§4):** NO moysklad capture → sibling-parity ONLY, no label churn. Sibling = `settings/currencies` (other bespoke-table finance page).
**Shape:** BESPOKE `<table>` (NOT `ListView`), **READ-ONLY** — rows are CBU-synced rates surfaced via a «Синхронизировать» button. NO Create / inline edit / archive / bulk / row→detail / search — all legitimate read-only absences (refuted as deltas).

## A. Structural / columns + values — CLEAN
- Columns currency/nominal/rate/date/source; all headers via `t('pages.exchange_rates.*')` — no hardcoded leak.
- **`rate`/`nominal` are EXCHANGE RATES (decimal / integer), NOT money-minor** → raw display correct; `formatMoney` legitimately N/A (refuted). `date` is a pre-formatted server string (not a `toLocaleDateString` hand-roll).

## B. Interactive chrome — CLEAN (no silent failure)
- `syncMut` surfaces BOTH a success message (`sync_success` with count/date) AND an error (`sync_error` with the real reason) — no silent failure. Proper loading + empty-state branches.

## DEFER / Phase-2
- Sync round-trip + empty/error states browser-smoke = Phase-2.

## Gates
typecheck 0 (web) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · web Vitest 1361 (0 regress). No code change on this page (audit-only).

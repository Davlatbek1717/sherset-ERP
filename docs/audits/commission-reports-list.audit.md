# commission-reports — LIST parity audit (Cohort L3)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Reference:** NO own moysklad capture → sibling-parity vs the captured purchase lists (supply/invoicein) for the shared ListView/toolbar shell only.

## A. Structural / column deltas

- Counterparty column already «Контрагент» (`tFields('agent')`) — confirmed_mirror, no change.
- **DEFER (no-capture) — commission-specific column labels** («Комиссия»/reward, report-period): no own capture → cannot DOM-ground (§4); not churned, deferred until a commission-report capture exists.

## B. Interactive deltas

- **DEFER (real bug, needs BE-enum check) — «Контрагент» column `sortable: true` but the BE `CommissionReportFilterSchema.sortBy` enum may not include `agent`.** Clicking the header would send an unsupported sortBy → 400 / no-op. Fix is either (a) add `agent` to the BE sortBy enum, or (b) make the column non-sortable. Needs BE-schema verification → deferred to a focused FE+BE follow-up, not guessed here.

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ · web Vitest 1306 green (no regress). No code change this page (audit-only; findings deferred).

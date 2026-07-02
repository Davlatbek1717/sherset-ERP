# hr/payroll — LIST parity audit (Cohort L9 · HR)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_7d22c330-542`). Critic declared the page "unusually clean"; diff = 1 LOW (date) + critic = 1 LOW (fmtMinor). Date finding adversarially **REFUTED ×2 (high)**; the snapshot/silent-failure wiring bug below was the engine's **blind spot** — found by my own §1 ground-truth pass.
**Ground-truth (§4):** hr/payroll is a **BESPOKE 6-tab dashboard** (Umumiy/KPI/Bonus-Jarima/Komissiya/Sozlama/Yakuniy — a KPI/commission/salary engine). There is **NO moysklad reference page** → no column/filter/bulk/toolbar parity baseline; only money/date/i18n + intrinsic wiring checks apply. No GROUNDING capture entry.

## A. Structural / money + date + i18n
- **Money — fmtMinor `-0` fix (LOW, real edge-case).** `fmtMinor()` is a BigInt-safe string digit-walk (no `Number(minor)/100`), but for a negative sub-1-som value (e.g. `'-50'` = −0.50 som, reachable when fines slightly exceed salary → `finalSalaryMinor`) it dropped tiyin to som='0' yet still prepended the sign → rendered **`"-0"`**. Fixed: drop the sign once truncation collapses the magnitude to zero (`page.tsx:43-45`, `negative && grouped !== '0'`). Engine verdict was *uncertain* but confirmed the code analysis is FACTUALLY CORRECT and the negative path is reachable.
- **Date — ISO vs DD.MM.YYYY: DEFER (adversarially refuted ×2, high).** KPI/Bonus/Detail cells use `formatInTimeZone(...,'Asia/Tashkent','yyyy-MM-dd[ HH:mm]')` (date-fns-tz) instead of the app-wide `formatDate`/`formatDateOnly` (`DD.MM.YYYY`, browser-TZ). Two independent verifiers refuted a fix: payroll is bespoke (no parity mandate) AND its explicit Asia/Tashkent TZ is *safer* than the shared helper's implicit browser TZ for a salary/attendance context. Any future normalization must FIRST introduce a TZ-aware shared helper (`formatDateTz`) — not a naive migration that would lose the TZ. → **not churned.**
- **i18n — CLEAN.** All 6 tabs + inline modals (ManualBonusModal/PayrollDetailModal) route through `t('pages.hrPayroll.*')` (62 keys) / `tCommon`. No hardcoded Cyrillic or Latin-uz leak (both gate-blind axes verified by hand). Money aggregates use BigInt reduce (`:276,:339-340,:832-835`).

## B. Interactive / mutation wiring — snapshot refresh + silent-failure fixes
- **🔴 snapshot-today was a dead-feedback button (MED, engine blind spot).** `qc` (queryClient) was threaded into ConfigTab/FinalTab/BonusTab but **NOT into KpiTab** → `snapMut` could not invalidate, so clicking «Snapshot today» upserted today's `HrKpiDailyLog` server-side but the KPI table never refetched (today IS within the displayed `monthRange` for the current month — verified BE `hr-kpi.service.ts:51-114` upserts on `(accountId,employeeId,date)`). Fixed: thread `qc` into KpiTab + `snapMut.onSuccess → invalidateQueries(['hr-kpi-daily'])` (`page.tsx:483-496`, call-site `:108`).
- **Silent-failure hardening (LOW).** `snapMut` (KpiTab), `computeMut` (FinalTab «Recompute all»), `removeMut` (BonusTab bonus-delete) had **no `onError`** — a server error left the user with no feedback (while the two modal `saveMut`s already had `onError`). Added `onError → toast.error(tCommon('action_failed'), { description })` to all three, mirroring the `hr/employees` sibling pattern (no new i18n keys; `common.action_failed` exists ru+uz). Page now imports `useToast`.
- **Confirmed-correct (refuted as deltas):** NO Create/doc-toolbar/row-selection-bulk/status-filter/search/import-export/sortable-columns/column-parity — all CORRECT for a tabbed dashboard (rejected per premise NO-REFERENCE-FABRICATION bias). Each tab renders a t()-keyed EmptyState. Config save + ManualBonus save already had `onError → setError` banners.

## Guard
`label-grounding.test.ts` +3 L9 REGRESSION-LOCK (no GROUNDING — bespoke, no capture): fmtMinor `-0` guard · KpiTab-receives-qc + snapshot-invalidates-hr-kpi-daily · ≥3 action-mutation onError toasts. (84→87)

## DEFER / Phase-2
- TZ-aware shared date helper then normalize payroll date cells to `DD.MM.YYYY` (see §A — needs a `formatDateTz` util, not a naive swap).
- Browser-smoke: snapshot-today refreshes the KPI table; recompute/bonus-delete error → toast appears; negative-final-salary row shows «0» not «-0».

## Gates
typecheck 0 (web) · biome 0 (changed) · i18n key-existence ru+uz ✓ (0 new keys) · no-hardcoded ✓ · label-grounding 87 (+3) · web Vitest 1355 pass/1 skip (+3 guard, 0 regress).

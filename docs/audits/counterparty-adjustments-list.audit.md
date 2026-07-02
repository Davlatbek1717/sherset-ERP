# counterparty-adjustments — LIST parity audit (Cohort L1)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Reference:** its OWN capture `07-module/counterpartyadjustment/screenshots/00-clean-default` (columns №/Время/Организация/Контрагент/Сумма коррект./Комментарий/Когда изменил/Кто изменил) + sibling money-doc list shell.
**Premise (refuted false-deltas):** legitimately lacks Касса/Назначение платежа/cashDesk columns + has no separate state column (direction folded into the signed «Сумма коррект.») — these absences are NOT bugs.

## A. Structural / column deltas

- **FIXED — date column «Дата» → «Время»** (`tFields('moment')` → `tFields('time')`, page.tsx:234).
- **VERIFIED (no change) — sum column** is `tFields('sum')`=«Сумма»; the capture grid grounds it as «Сумма» (the source comment's «Сумма коррект.» was the in-doc field label, not the list-column header). Engine self-corrected an inverted claim; current value is correct.
- Counterparty column already «Контрагент» (correct). Signed sum by direction is the intended encoding (confirmed_mirror).

## B. Interactive deltas

- **FIXED (HIGH, gate-blind) — local hardcoded Latin-uz `editMenuItems`/`printMenuItems`** → shared i18n-clean `useDocEditMenuItems` + `tPrintMenu('document_blank')`; stale "intentionally limited" comment replaced.
- **FIXED (MED) — dead bulk-archive stub** (multi-line, permanently-disabled, empty `onSelect`) removed.
- **FIXED — mass-edit now reachable** via the shared hook.
- `useConfirm` page-binding removed (handled inside the shared hook).

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ · web Vitest 1306 green (no regress).

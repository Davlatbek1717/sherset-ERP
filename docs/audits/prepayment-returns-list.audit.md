# prepayment-returns — LIST parity audit (Cohort L1)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Reference:** structural twin prepayments (mirror its columns/filters) + capture `07-module/prepaymentreturn`.

## A. Structural / column deltas

- **FIXED — date column «Дата» → «Время»** (`tFields('moment')` → `tFields('time')`, page.tsx:168).
- Signed-sum prefix (`+${formatMoney}`) + the «Предоплата» source-advance link column are correct domain columns (confirmed_mirrors).
- **DEFER — filter panel is leaner than its twin** (5 inline filters vs prepayments' richer panel). Mirroring the full panel is a structural addition (feature-parity) → deferred to Phase-2 (verify against the prepayment-return capture which filters moysklad actually shows before adding).

## B. Interactive deltas

- **FIXED (HIGH, gate-blind) — local hardcoded Latin-uz `editMenuItems`/`printMenuItems`** → shared i18n-clean `useDocEditMenuItems` + `tPrintMenu('document_blank')`.
- **FIXED (MED) — dead bulk-archive stub** removed.
- **FIXED — mass-edit now reachable** via the shared hook (`onMassEdit: openMassEdit`).
- `useConfirm` page-binding removed (handled inside the shared hook).

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ · web Vitest 1306 green (no regress).
